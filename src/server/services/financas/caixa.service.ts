import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type {
  AbrirSessaoCaixaInput,
  FecharSessaoCaixaInput,
  SangriaInput,
  ReforcoInput,
  FiltroSessaoCaixaInput,
  FiltroMovimentoCaixaInput,
} from '@/lib/validations/caixa';
import {
  TRANSICOES_SESSAO_CAIXA,
  type StatusSessaoCaixa,
  type SessaoCaixa,
  type MovimentoCaixa,
  type SessaoCaixaComMovimentos,
  type ResumoSessaoCaixa,
  type PaginacaoCaixa,
  type RegistarMovimentoCaixaInput,
  type Ctx,
} from './caixa.interface';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function assertSessaoAberta(sessao: { status: string }, operacao: string): void {
  if (sessao.status !== 'ABERTA') {
    throw new BusinessRuleError(
      'SESSAO_CAIXA_FECHADA',
      `Operação "${operacao}" requer sessão de caixa ABERTA (actual: ${sessao.status})`,
    );
  }
}

function transitarEstado(atual: StatusSessaoCaixa, alvo: StatusSessaoCaixa): void {
  const permitidas = TRANSICOES_SESSAO_CAIXA[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida: ${atual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: numeração atómica via SerieDocumento (W7)
// Espelha proximoNumeroSerie de faturacao.service sem importar aquele ficheiro.
// ---------------------------------------------------------------------------

async function proximoNumeroSerieLocal(
  tx: Prisma.TransactionClient,
  tipo: string,
  tenantId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<
    Array<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>
  >`
    UPDATE "SerieDocumento"
    SET "proximoNumero" = "proximoNumero" + 1
    WHERE id = (
      SELECT id FROM "SerieDocumento"
      WHERE "tenantId" = ${tenantId}
        AND tipo::text = ${tipo}
        AND ativo = true
      ORDER BY ano DESC, "createdAt" DESC
      LIMIT 1
      FOR UPDATE
    )
    RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"
  `;
  if (!rows.length) {
    throw new BusinessRuleError(
      'SERIE_NAO_ENCONTRADA',
      `Série activa para "${tipo}" não encontrada. Crie uma série SESSAO_CAIXA primeiro.`,
    );
  }
  const { numero, prefixo, ano, formatoNumero } = rows[0];
  return formatoNumero
    .replace('{prefixo}', prefixo)
    .replace('{ano}', String(ano))
    .replace(/\{numero(?::(\d+))?\}/, (_, w) => String(numero).padStart(w ? parseInt(w, 10) : 1, '0'));
}

// ---------------------------------------------------------------------------
// Abertura de sessão
// ---------------------------------------------------------------------------

export async function abrirSessao(
  input: AbrirSessaoCaixaInput,
  ctx: Ctx,
): Promise<SessaoCaixa> {
  return prismaBase.$transaction(async (tx) => {
    // Verificar se já existe sessão aberta para este responsável
    const existente = await tx.sessaoCaixa.findFirst({
      where: { tenantId: ctx.tenantId, responsavelId: ctx.userId, status: 'ABERTA' },
    });
    if (existente) {
      throw new BusinessRuleError(
        'SESSAO_JA_ABERTA',
        `Já existe uma sessão de caixa aberta (${existente.numero})`,
      );
    }

    // W7: numeração atómica via SerieDocumento SESSAO_CAIXA (UPDATE...RETURNING FOR UPDATE)
    const numero = await proximoNumeroSerieLocal(tx, 'SESSAO_CAIXA', ctx.tenantId);

    const sessao = await tx.sessaoCaixa.create({
      data: {
        tenantId: ctx.tenantId,
        responsavelId: ctx.userId,
        numero,
        fundoInicial: new Prisma.Decimal(String(input.fundoInicial)),
        status: 'ABERTA',
        observacoes: input.observacoes,
      },
    });

    // Registar movimento de abertura
    await tx.movimentoCaixa.create({
      data: {
        tenantId: ctx.tenantId,
        sessaoCaixaId: sessao.id,
        tipo: 'ABERTURA',
        valor: new Prisma.Decimal(String(input.fundoInicial)),
        descricao: `Abertura de caixa — fundo inicial ${Number(input.fundoInicial).toFixed(2)} MZN`,
        responsavelId: ctx.userId,
      },
    });

    return sessao as SessaoCaixa;
  });
}

// ---------------------------------------------------------------------------
// Fecho de sessão
// ---------------------------------------------------------------------------

export async function fecharSessao(
  input: FecharSessaoCaixaInput,
  ctx: Ctx,
): Promise<SessaoCaixa> {
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { id: input.sessaoCaixaId, tenantId: ctx.tenantId },
  });
  if (!sessao) throw new NotFoundError('Sessão de caixa não encontrada');

  transitarEstado(sessao.status as StatusSessaoCaixa, 'FECHADA');

  // Calcular totais por tipo de movimento
  const movimentos = await prisma.movimentoCaixa.findMany({
    where: { sessaoCaixaId: sessao.id, tenantId: ctx.tenantId },
  });

  const totalEntradas = movimentos
    .filter((m) => ['VENDA', 'RECEBIMENTO', 'REFORCO', 'ABERTURA'].includes(m.tipo))
    .reduce((acc, m) => acc.plus(m.valor), new Prisma.Decimal(0));

  const totalSaidas = movimentos
    .filter((m) => ['SANGRIA', 'DEVOLUCAO'].includes(m.tipo))
    .reduce((acc, m) => acc.plus(m.valor), new Prisma.Decimal(0));

  const fundoFinal = new Prisma.Decimal(String(input.fundoFinal));
  const saldoEsperado = sessao.fundoInicial.plus(totalEntradas).minus(totalSaidas);
  const diferenca = fundoFinal.minus(saldoEsperado);

  const sessaoFechada = await prisma.sessaoCaixa.update({
    where: { id: sessao.id },
    data: {
      status: 'FECHADA',
      dataFechamento: new Date(),
      fundoFinal,
      totalEntradas,
      totalSaidas,
      diferenca,
      observacoes: input.observacoes ?? sessao.observacoes,
    },
  });

  // Registar movimento de fechamento
  await prisma.movimentoCaixa.create({
    data: {
      tenantId: ctx.tenantId,
      sessaoCaixaId: sessao.id,
      tipo: 'FECHAMENTO',
      valor: fundoFinal,
      descricao: `Fecho de caixa — fundo final ${fundoFinal.toFixed(2)} MZN`,
      responsavelId: ctx.userId,
    },
  });

  return sessaoFechada as SessaoCaixa;
}

// ---------------------------------------------------------------------------
// Cancelar sessão
// ---------------------------------------------------------------------------

export async function cancelarSessao(
  sessaoCaixaId: string,
  motivo: string,
  ctx: Ctx,
): Promise<SessaoCaixa> {
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { id: sessaoCaixaId, tenantId: ctx.tenantId },
  });
  if (!sessao) throw new NotFoundError('Sessão de caixa não encontrada');

  transitarEstado(sessao.status as StatusSessaoCaixa, 'CANCELADA');

  // Verificar se há movimentos (além da abertura)
  const movimentos = await prisma.movimentoCaixa.count({
    where: {
      sessaoCaixaId,
      tenantId: ctx.tenantId,
      tipo: { not: 'ABERTURA' },
    },
  });
  if (movimentos > 0) {
    throw new BusinessRuleError(
      'CAIXA_COM_PENDENCIAS',
      'Sessão não pode ser cancelada com movimentos registados. Use o fecho.',
    );
  }

  return prisma.sessaoCaixa.update({
    where: { id: sessaoCaixaId },
    data: {
      status: 'CANCELADA',
      dataFechamento: new Date(),
      observacoes: motivo,
    },
  }) as unknown as SessaoCaixa;
}

// ---------------------------------------------------------------------------
// Consultas de sessão
// ---------------------------------------------------------------------------

export async function obterSessaoAtual(ctx: Ctx): Promise<SessaoCaixa | null> {
  return prisma.sessaoCaixa.findFirst({
    where: { tenantId: ctx.tenantId, responsavelId: ctx.userId, status: 'ABERTA' },
  }) as unknown as SessaoCaixa | null;
}

export async function obterSessao(id: string, ctx: Ctx): Promise<SessaoCaixaComMovimentos | null> {
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { movimentos: { orderBy: { dataMovimento: 'asc' } } },
  });
  return sessao as unknown as SessaoCaixaComMovimentos | null;
}

export async function listarSessoes(
  filtro: FiltroSessaoCaixaInput,
  ctx: Ctx,
): Promise<PaginacaoCaixa<SessaoCaixa>> {
  return paginate(
    (a) =>
      prisma.sessaoCaixa.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.status ? { status: filtro.status } : {}),
          ...(filtro.responsavelId ? { responsavelId: filtro.responsavelId } : {}),
          ...(filtro.dataInicio || filtro.dataFim
            ? {
                dataAbertura: {
                  ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}),
                  ...(filtro.dataFim ? { lte: filtro.dataFim } : {}),
                },
              }
            : {}),
        },
        orderBy: { dataAbertura: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoCaixa<SessaoCaixa>>;
}

// ---------------------------------------------------------------------------
// Sangria e reforço
// ---------------------------------------------------------------------------

export async function registarSangria(input: SangriaInput, ctx: Ctx): Promise<MovimentoCaixa> {
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { id: input.sessaoCaixaId, tenantId: ctx.tenantId },
  });
  if (!sessao) throw new NotFoundError('Sessão de caixa não encontrada');
  assertSessaoAberta(sessao, 'sangria');

  const valor = new Prisma.Decimal(String(input.valor));
  const mov = await prisma.movimentoCaixa.create({
    data: {
      tenantId: ctx.tenantId,
      sessaoCaixaId: input.sessaoCaixaId,
      tipo: 'SANGRIA',
      valor,
      descricao: `Sangria: ${input.motivo}`,
      responsavelId: ctx.userId,
    },
  });

  return mov as unknown as MovimentoCaixa;
}

export async function registarReforco(input: ReforcoInput, ctx: Ctx): Promise<MovimentoCaixa> {
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { id: input.sessaoCaixaId, tenantId: ctx.tenantId },
  });
  if (!sessao) throw new NotFoundError('Sessão de caixa não encontrada');
  assertSessaoAberta(sessao, 'reforço');

  const valor = new Prisma.Decimal(String(input.valor));
  const mov = await prisma.movimentoCaixa.create({
    data: {
      tenantId: ctx.tenantId,
      sessaoCaixaId: input.sessaoCaixaId,
      tipo: 'REFORCO',
      valor,
      descricao: `Reforço: ${input.motivo}`,
      responsavelId: ctx.userId,
    },
  });

  return mov as unknown as MovimentoCaixa;
}

export async function listarMovimentos(
  filtro: FiltroMovimentoCaixaInput,
  ctx: Ctx,
): Promise<PaginacaoCaixa<MovimentoCaixa>> {
  return paginate(
    (a) =>
      prisma.movimentoCaixa.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.sessaoCaixaId ? { sessaoCaixaId: filtro.sessaoCaixaId } : {}),
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.dataInicio || filtro.dataFim
            ? {
                dataMovimento: {
                  ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}),
                  ...(filtro.dataFim ? { lte: filtro.dataFim } : {}),
                },
              }
            : {}),
        },
        orderBy: { dataMovimento: 'asc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoCaixa<MovimentoCaixa>>;
}

export async function resumoSessao(sessaoCaixaId: string, ctx: Ctx): Promise<ResumoSessaoCaixa> {
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { id: sessaoCaixaId, tenantId: ctx.tenantId },
    include: { movimentos: true },
  });
  if (!sessao) throw new NotFoundError('Sessão não encontrada');

  const totalEntradas = sessao.movimentos
    .filter((m) => ['VENDA', 'RECEBIMENTO', 'REFORCO', 'ABERTURA'].includes(m.tipo))
    .reduce((acc, m) => acc.plus(m.valor), new Prisma.Decimal(0));

  const totalSaidas = sessao.movimentos
    .filter((m) => ['SANGRIA', 'DEVOLUCAO'].includes(m.tipo))
    .reduce((acc, m) => acc.plus(m.valor), new Prisma.Decimal(0));

  const saldoEsperado = sessao.fundoInicial.plus(totalEntradas).minus(totalSaidas);

  return {
    sessaoCaixaId,
    fundoInicial: sessao.fundoInicial,
    totalEntradas,
    totalSaidas,
    saldoEsperado,
    fundoFinal: sessao.fundoFinal,
    diferenca: sessao.diferenca,
  };
}

// ---------------------------------------------------------------------------
// Contrato cross-domínio: registarMovimentoCaixa
// Chamado por WS C (vendas POS) dentro de $transaction.
// tx é o cliente da transacção; tenantId vem de ctx.
// ---------------------------------------------------------------------------

export async function registarMovimentoCaixa(
  tx: Prisma.TransactionClient,
  input: RegistarMovimentoCaixaInput,
  ctx: Ctx,
): Promise<MovimentoCaixa> {
  // Verificar sessão aberta
  const sessao = await tx.sessaoCaixa.findFirst({
    where: { id: input.sessaoCaixaId, tenantId: ctx.tenantId, status: 'ABERTA' },
  });
  if (!sessao) {
    throw new BusinessRuleError(
      'SESSAO_CAIXA_FECHADA',
      `Sessão de caixa ${input.sessaoCaixaId} não está aberta`,
    );
  }

  const valor = new Prisma.Decimal(String(input.valor));

  const mov = await tx.movimentoCaixa.create({
    data: {
      tenantId: ctx.tenantId,
      sessaoCaixaId: input.sessaoCaixaId,
      tipo: input.tipo,
      valor,
      descricao: input.descricao,
      documentoOrigemId: input.documentoOrigemId ?? null,
      documentoOrigemTipo: input.documentoOrigemTipo ?? null,
      responsavelId: ctx.userId,
      observacoes: input.observacoes ?? null,
    },
  });

  return mov as unknown as MovimentoCaixa;
}

// ---------------------------------------------------------------------------
// Verificação de conformidade com ICaixaService (NIT)
// ---------------------------------------------------------------------------

import type { ICaixaService } from './caixa.interface';

export const caixaService = {
  abrirSessao,
  fecharSessao,
  cancelarSessao,
  obterSessaoAtual,
  obterSessao,
  listarSessoes,
  registarSangria,
  registarReforco,
  listarMovimentos,
  resumoSessao,
  registarMovimentoCaixa,
} satisfies ICaixaService;
