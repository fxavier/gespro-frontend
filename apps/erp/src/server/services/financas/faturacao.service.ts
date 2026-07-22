import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { IFaturacaoService } from './faturacao.interface';
import { registarLancamentoContabilistico } from './contabilidade.service';
import type { RegistarLancamentoContabilisticoInput } from './contabilidade.interface';
import type {
  CriarSerieDocumentoInput,
  EmitirFaturaInput,
  RegistarPagamentoFaturaInput,
  FiltroFaturaInput,
  EmitirNotaCreditoInput,
  FiltroNotaCreditoInput,
  EmitirNotaDebitoInput,
  FiltroNotaDebitoInput,
  CriarProformaInput,
  FiltroProformaInput,
  CriarCotacaoComercialInput,
  FiltroCotacaoComercialInput,
} from '@/lib/validations/faturacao';
import {
  TRANSICOES_FATURA,
  TRANSICOES_NOTA_CREDITO,
  TRANSICOES_NOTA_DEBITO,
  TRANSICOES_PROFORMA,
  TRANSICOES_COTACAO_COMERCIAL,
  type StatusFatura,
  type StatusNotaCredito,
  type StatusNotaDebito,
  type StatusProforma,
  type StatusCotacaoComercial,
  type TipoSerieDocumento,
  type SerieDocumento,
  type Fatura,
  type FaturaCompleta,
  type NotaCredito,
  type NotaCreditoCompleta,
  type NotaDebito,
  type NotaDebitoCompleta,
  type Proforma,
  type ProformaCompleta,
  type CotacaoComercial,
  type CotacaoComercialCompleta,
  type PaginacaoFaturacao,
  type Ctx,
} from './faturacao.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function transitarFatura(atual: StatusFatura, alvo: StatusFatura): void {
  const permitidas = TRANSICOES_FATURA[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Fatura: transição inválida ${atual} → ${alvo}`);
  }
}

function transitarNC(atual: StatusNotaCredito, alvo: StatusNotaCredito): void {
  const permitidas = TRANSICOES_NOTA_CREDITO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `NotaCredito: transição inválida ${atual} → ${alvo}`);
  }
}

function transitarND(atual: StatusNotaDebito, alvo: StatusNotaDebito): void {
  const permitidas = TRANSICOES_NOTA_DEBITO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `NotaDebito: transição inválida ${atual} → ${alvo}`);
  }
}

function transitarProforma(atual: StatusProforma, alvo: StatusProforma): void {
  const permitidas = TRANSICOES_PROFORMA[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Proforma: transição inválida ${atual} → ${alvo}`);
  }
}

function transitarCotacao(atual: StatusCotacaoComercial, alvo: StatusCotacaoComercial): void {
  const permitidas = TRANSICOES_COTACAO_COMERCIAL[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `CotacaoComercial: transição inválida ${atual} → ${alvo}`);
  }
}

/** Substitui o template de numeração: {prefixo}/{ano}/{numero:06} */
function formatarNumero(template: string, vars: { prefixo: string; ano: number; numero: number }): string {
  return template
    .replace('{prefixo}', vars.prefixo)
    .replace('{ano}', String(vars.ano))
    .replace(/\{numero(?::(\d+))?\}/, (_, w) => String(vars.numero).padStart(w ? parseInt(w, 10) : 1, '0'));
}

/** Calcula subtotais de linhas (input já transformado pelo Zod) */
function calcularTotaisLinhas(linhas: EmitirFaturaInput['linhas']) {
  let subtotal = new Prisma.Decimal(0);
  let ivaTotal = new Prisma.Decimal(0);

  for (const l of linhas) {
    subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
    ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
  }

  return {
    subtotal,
    descontoTotal: new Prisma.Decimal(0), // ponytail: descontos já absorvidos no subtotal por linha
    baseIva: subtotal,
    ivaTotal,
    total: subtotal.plus(ivaTotal),
  };
}

// ---------------------------------------------------------------------------
// Wave 3 — integração fatura → contabilidade
//
// Códigos PGC-NIRF de fallback (Decreto 70/2009).
// Quando ConfiguracaoContabil.contasPadrao existir, estes são substituídos.
// ---------------------------------------------------------------------------

/** Códigos PGC padrão para lançamentos automáticos de faturação */
export const PGC_FATURACAO = {
  /** 4.1.1 — Clientes c/c (natureza devedora) */
  CLIENTES_CC: '411',
  /** 7.1.1 — Vendas - Mercadorias (natureza credora em contas de rendimento) */
  RECEITA_VENDAS: '711',
  /** 4.4.3.3.1 — IVA liquidado - Operações gerais */
  IVA_LIQUIDADO: '44331',
} as const;

/**
 * Constrói o input de lançamento contabilístico para uma fatura emitida.
 * Pure function — testável sem DB.
 * Invariante: sum(débitos) = sum(créditos) = fatura.total
 */
export function construirLancamentoFatura(fatura: {
  id: string;
  numero: string;
  total: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  dataEmissao: Date;
}): RegistarLancamentoContabilisticoInput {
  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_FATURACAO.CLIENTES_CC,
      tipo: 'DEBITO',
      valor: fatura.total.toFixed(2),
      historico: `Fatura ${fatura.numero} — clientes a receber`,
    },
    {
      contaCodigo: PGC_FATURACAO.RECEITA_VENDAS,
      tipo: 'CREDITO',
      valor: fatura.subtotal.toFixed(2),
      historico: `Fatura ${fatura.numero} — receita de vendas`,
    },
  ];

  if (fatura.ivaTotal.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_FATURACAO.IVA_LIQUIDADO,
      tipo: 'CREDITO',
      valor: fatura.ivaTotal.toFixed(2),
      historico: `Fatura ${fatura.numero} — IVA liquidado`,
    });
  }

  return {
    data: fatura.dataEmissao,
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: fatura.id,
    documentoOrigemTipo: 'Fatura',
    historico: `Fatura ${fatura.numero}`,
    partidas,
  };
}

/**
 * Constrói o input de lançamento de estorno para uma nota de crédito.
 * Pure function — partidas inversas à fatura original.
 */
export function construirLancamentoNotaCredito(nc: {
  id: string;
  numero: string;
  total: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  dataEmissao: Date;
}): RegistarLancamentoContabilisticoInput {
  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_FATURACAO.RECEITA_VENDAS,
      tipo: 'DEBITO',
      valor: nc.subtotal.toFixed(2),
      historico: `NC ${nc.numero} — estorno receita`,
    },
    {
      contaCodigo: PGC_FATURACAO.CLIENTES_CC,
      tipo: 'CREDITO',
      valor: nc.total.toFixed(2),
      historico: `NC ${nc.numero} — redução clientes`,
    },
  ];

  if (nc.ivaTotal.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_FATURACAO.IVA_LIQUIDADO,
      tipo: 'DEBITO',
      valor: nc.ivaTotal.toFixed(2),
      historico: `NC ${nc.numero} — estorno IVA`,
    });
  }

  return {
    data: nc.dataEmissao,
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: nc.id,
    documentoOrigemTipo: 'NotaCredito',
    historico: `Nota de crédito ${nc.numero}`,
    partidas,
  };
}

// ---------------------------------------------------------------------------
// proximoNumeroSerie — UPDATE...RETURNING atómico (sem lacunas)
// Chamado por todos os WS via $transaction.
// ---------------------------------------------------------------------------

export async function proximoNumeroSerie(
  tx: Prisma.TransactionClient,
  tipo: TipoSerieDocumento,
  ctx: Ctx,
): Promise<string> {
  // Incrementa atomicamente e devolve o número anterior (que irá usar o documento).
  // FOR UPDATE na subquery garante serialização sem lacunas mesmo com transacções concorrentes.
  const rows = await tx.$queryRaw<
    Array<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>
  >`
    UPDATE "SerieDocumento"
    SET "proximoNumero" = "proximoNumero" + 1
    WHERE id = (
      SELECT id FROM "SerieDocumento"
      WHERE "tenantId" = ${ctx.tenantId}
        AND tipo::text = ${tipo as string}
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
      `Série activa para tipo "${tipo}" não encontrada. Crie uma série primeiro.`,
    );
  }

  const { numero, prefixo, ano, formatoNumero } = rows[0];
  return formatarNumero(formatoNumero, { prefixo, ano, numero });
}

// ---------------------------------------------------------------------------
// Séries de documento
// ---------------------------------------------------------------------------

export async function criarSerie(input: CriarSerieDocumentoInput, ctx: Ctx): Promise<SerieDocumento> {
  // TipoSerieDocumentoEnum (Zod) é subconjunto do enum Prisma — cast seguro
  return prisma.serieDocumento.create({
    data: {
      tenantId: ctx.tenantId,
      tipo: input.tipo as unknown as Parameters<typeof prisma.serieDocumento.create>[0]['data']['tipo'],
      prefixo: input.prefixo.toUpperCase(),
      ano: input.ano,
      formatoNumero: input.formatoNumero ?? '{prefixo}/{ano}/{numero:06}',
    },
  }) as unknown as SerieDocumento;
}

export async function listarSeries(ctx: Ctx): Promise<SerieDocumento[]> {
  return prisma.serieDocumento.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ tipo: 'asc' }, { ano: 'desc' }],
  }) as unknown as SerieDocumento[];
}

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

export async function emitirFatura(input: EmitirFaturaInput, ctx: Ctx): Promise<FaturaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const serie = await tx.serieDocumento.findFirst({
      where: { id: input.serieDocumentoId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de documento não encontrada ou inactiva');

    // W9: validar FKs cross-domínio contra tenant
    const cliente = await tx.cliente.findFirst({
      where: { id: input.clienteId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    if (input.vendaId) {
      const venda = await tx.venda.findFirst({
        where: { id: input.vendaId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!venda) throw new NotFoundError('Venda não encontrada');
    }

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);
    const totais = calcularTotaisLinhas(input.linhas);

    const fatura = await tx.fatura.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId: input.serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        vendaId: input.vendaId ?? null,
        moeda: input.moeda ?? 'MZN',
        ...totais,
        totalPago: new Prisma.Decimal(0),
        status: 'EMITIDA',
        dataEmissao: input.dataEmissao,
        dataVencimento: input.dataVencimento,
        observacoes: input.observacoes ?? null,
        emitidoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaFatura.create({
          data: {
            tenantId: ctx.tenantId,
            faturaId: fatura.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    // Wave 3: lançamento contabilístico automático na MESMA transacção
    await registarLancamentoContabilistico(
      tx,
      construirLancamentoFatura({
        id: fatura.id,
        numero: fatura.numero,
        total: totais.total,
        subtotal: totais.subtotal,
        ivaTotal: totais.ivaTotal,
        dataEmissao: input.dataEmissao,
      }),
      ctx,
    );

    return tx.fatura.findFirst({
      where: { id: fatura.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
      },
    }) as unknown as FaturaCompleta;
  });
}

export async function obterFatura(id: string, ctx: Ctx): Promise<FaturaCompleta | null> {
  return prisma.fatura.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
    },
  }) as unknown as FaturaCompleta | null;
}

export async function listarFaturas(filtro: FiltroFaturaInput, ctx: Ctx): Promise<PaginacaoFaturacao<FaturaCompleta>> {
  return paginate(
    (a) =>
      prisma.fatura.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
          ...(filtro.dataEmissaoInicio || filtro.dataEmissaoFim
            ? { dataEmissao: { ...(filtro.dataEmissaoInicio ? { gte: filtro.dataEmissaoInicio } : {}), ...(filtro.dataEmissaoFim ? { lte: filtro.dataEmissaoFim } : {}) } }
            : {}),
          ...(filtro.search ? { OR: [{ numero: { contains: filtro.search } }] } : {}),
        },
        include: {
          linhas: { orderBy: { ordemLinha: 'asc' } },
          serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
        },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<FaturaCompleta>>;
}

export async function registarPagamento(input: RegistarPagamentoFaturaInput, ctx: Ctx): Promise<FaturaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const fatura = await tx.fatura.findFirst({
      where: { id: input.faturaId, tenantId: ctx.tenantId },
    });
    if (!fatura) throw new NotFoundError('Factura não encontrada');
    if (!['EMITIDA', 'PARCIALMENTE_PAGA', 'VENCIDA'].includes(fatura.status)) {
      throw new BusinessRuleError('FATURA_NAO_PAGAVEL', `Factura no estado ${fatura.status} não pode ser paga`);
    }

    const valorPagamento = new Prisma.Decimal(input.valor.toFixed(2));
    const novoTotalPago = fatura.totalPago.plus(valorPagamento);
    const pendente = fatura.total.minus(novoTotalPago);

    let novoStatus: StatusFatura;
    if (pendente.lessThanOrEqualTo(0)) novoStatus = 'PAGA';
    else novoStatus = 'PARCIALMENTE_PAGA';

    transitarFatura(fatura.status as StatusFatura, novoStatus);

    await tx.fatura.update({
      where: { id: fatura.id },
      data: {
        totalPago: novoTotalPago,
        status: novoStatus,
        dataPagamento: novoStatus === 'PAGA' ? input.dataPagamento : null,
      },
    });

    return tx.fatura.findFirst({
      where: { id: fatura.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
      },
    }) as unknown as FaturaCompleta;
  });
}

export async function marcarVencida(faturaId: string, ctx: Ctx): Promise<Fatura> {
  const fatura = await prisma.fatura.findFirst({ where: { id: faturaId, tenantId: ctx.tenantId } });
  if (!fatura) throw new NotFoundError('Factura não encontrada');
  transitarFatura(fatura.status as StatusFatura, 'VENCIDA');
  return prisma.fatura.update({ where: { id: faturaId }, data: { status: 'VENCIDA' } }) as unknown as Fatura;
}

// ---------------------------------------------------------------------------
// Notas de crédito
// ---------------------------------------------------------------------------

export async function emitirNotaCredito(input: EmitirNotaCreditoInput, ctx: Ctx): Promise<NotaCreditoCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const faturaOriginal = await tx.fatura.findFirst({
      where: { id: input.faturaOriginalId, tenantId: ctx.tenantId },
    });
    if (!faturaOriginal) throw new NotFoundError('Factura original não encontrada');
    if (faturaOriginal.status === 'CANCELADA') {
      throw new BusinessRuleError('FATURA_CANCELADA', 'Não é possível emitir NC para factura cancelada');
    }

    const serie = await tx.serieDocumento.findFirst({
      where: { id: input.serieDocumentoId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de NC não encontrada');

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const nc = await tx.notaCredito.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId: input.serieDocumentoId,
        numero,
        faturaOriginalId: input.faturaOriginalId,
        motivo: input.motivo,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'EMITIDA',
        dataEmissao: input.dataEmissao,
        observacoes: input.observacoes ?? null,
        emitidoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaNotaCredito.create({
          data: {
            tenantId: ctx.tenantId,
            notaCreditoId: nc.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    // Wave 3: lançamento de estorno contabilístico na MESMA transacção
    await registarLancamentoContabilistico(
      tx,
      construirLancamentoNotaCredito({
        id: nc.id,
        numero,
        total: subtotal.plus(ivaTotal),
        subtotal,
        ivaTotal,
        dataEmissao: input.dataEmissao,
      }),
      ctx,
    );

    return tx.notaCredito.findFirst({
      where: { id: nc.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        faturaOriginal: { select: { id: true, numero: true, total: true } },
      },
    }) as unknown as NotaCreditoCompleta;
  });
}

export async function obterNotaCredito(id: string, ctx: Ctx): Promise<NotaCreditoCompleta | null> {
  return prisma.notaCredito.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      faturaOriginal: { select: { id: true, numero: true, total: true } },
    },
  }) as unknown as NotaCreditoCompleta | null;
}

export async function listarNotasCredito(filtro: FiltroNotaCreditoInput, ctx: Ctx): Promise<PaginacaoFaturacao<NotaCreditoCompleta>> {
  return paginate(
    (a) =>
      prisma.notaCredito.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.faturaOriginalId ? { faturaOriginalId: filtro.faturaOriginalId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
          ...(filtro.dataInicio || filtro.dataFim
            ? { dataEmissao: { ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}), ...(filtro.dataFim ? { lte: filtro.dataFim } : {}) } }
            : {}),
        },
        include: {
          linhas: { orderBy: { ordemLinha: 'asc' } },
          faturaOriginal: { select: { id: true, numero: true, total: true } },
        },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<NotaCreditoCompleta>>;
}

export async function liquidarNotaCredito(id: string, ctx: Ctx): Promise<NotaCredito> {
  const nc = await prisma.notaCredito.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!nc) throw new NotFoundError('Nota de crédito não encontrada');
  transitarNC(nc.status as StatusNotaCredito, 'LIQUIDADA');
  return prisma.notaCredito.update({ where: { id }, data: { status: 'LIQUIDADA' } }) as unknown as NotaCredito;
}

export async function cancelarNotaCredito(id: string, motivo: string, ctx: Ctx): Promise<NotaCredito> {
  const nc = await prisma.notaCredito.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!nc) throw new NotFoundError('Nota de crédito não encontrada');
  transitarNC(nc.status as StatusNotaCredito, 'CANCELADA');
  return prisma.notaCredito.update({ where: { id }, data: { status: 'CANCELADA', observacoes: motivo } }) as unknown as NotaCredito;
}

// ---------------------------------------------------------------------------
// Notas de débito
// ---------------------------------------------------------------------------

export async function emitirNotaDebito(input: EmitirNotaDebitoInput, ctx: Ctx): Promise<NotaDebitoCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const serie = await tx.serieDocumento.findFirst({
      where: { id: input.serieDocumentoId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de ND não encontrada');

    // W9: validar clienteId pertence ao tenant
    const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const nd = await tx.notaDebito.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId: input.serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        faturaReferenciaId: input.faturaReferenciaId ?? null,
        motivo: input.motivo,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'EMITIDA',
        dataEmissao: input.dataEmissao,
        observacoes: input.observacoes ?? null,
        emitidoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaNotaDebito.create({
          data: {
            tenantId: ctx.tenantId,
            notaDebitoId: nd.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    return tx.notaDebito.findFirst({
      where: { id: nd.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        faturaReferencia: { select: { id: true, numero: true, total: true } },
      },
    }) as unknown as NotaDebitoCompleta;
  });
}

export async function obterNotaDebito(id: string, ctx: Ctx): Promise<NotaDebitoCompleta | null> {
  return prisma.notaDebito.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      faturaReferencia: { select: { id: true, numero: true, total: true } },
    },
  }) as unknown as NotaDebitoCompleta | null;
}

export async function listarNotasDebito(filtro: FiltroNotaDebitoInput, ctx: Ctx): Promise<PaginacaoFaturacao<NotaDebitoCompleta>> {
  return paginate(
    (a) =>
      prisma.notaDebito.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
        include: {
          linhas: { orderBy: { ordemLinha: 'asc' } },
          faturaReferencia: { select: { id: true, numero: true, total: true } },
        },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<NotaDebitoCompleta>>;
}

export async function liquidarNotaDebito(id: string, ctx: Ctx): Promise<NotaDebito> {
  const nd = await prisma.notaDebito.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!nd) throw new NotFoundError('Nota de débito não encontrada');
  transitarND(nd.status as StatusNotaDebito, 'LIQUIDADA');
  return prisma.notaDebito.update({ where: { id }, data: { status: 'LIQUIDADA' } }) as unknown as NotaDebito;
}

export async function cancelarNotaDebito(id: string, motivo: string, ctx: Ctx): Promise<NotaDebito> {
  const nd = await prisma.notaDebito.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!nd) throw new NotFoundError('Nota de débito não encontrada');
  transitarND(nd.status as StatusNotaDebito, 'CANCELADA');
  return prisma.notaDebito.update({ where: { id }, data: { status: 'CANCELADA', observacoes: motivo } }) as unknown as NotaDebito;
}

// ---------------------------------------------------------------------------
// Proformas
// ---------------------------------------------------------------------------

export async function criarProforma(input: CriarProformaInput, ctx: Ctx): Promise<ProformaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const serie = await tx.serieDocumento.findFirst({
      where: { id: input.serieDocumentoId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de Proforma não encontrada');

    // W9: validar clienteId pertence ao tenant
    const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const proforma = await tx.proforma.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId: input.serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'RASCUNHO',
        dataEmissao: input.dataEmissao,
        dataValidade: input.dataValidade,
        observacoes: input.observacoes ?? null,
        criadoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaProforma.create({
          data: {
            tenantId: ctx.tenantId,
            proformaId: proforma.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    return tx.proforma.findFirst({
      where: { id: proforma.id },
      include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
    }) as unknown as ProformaCompleta;
  });
}

export async function enviarProforma(id: string, ctx: Ctx): Promise<Proforma> {
  const p = await prisma.proforma.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!p) throw new NotFoundError('Proforma não encontrada');
  transitarProforma(p.status as StatusProforma, 'ENVIADA');
  return prisma.proforma.update({ where: { id }, data: { status: 'ENVIADA' } }) as unknown as Proforma;
}

export async function aceitarProforma(id: string, ctx: Ctx): Promise<Proforma> {
  const p = await prisma.proforma.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!p) throw new NotFoundError('Proforma não encontrada');
  transitarProforma(p.status as StatusProforma, 'ACEITE');
  return prisma.proforma.update({ where: { id }, data: { status: 'ACEITE' } }) as unknown as Proforma;
}

export async function converterProformaEmFatura(
  id: string,
  serieDocumentoId: string,
  ctx: Ctx,
): Promise<FaturaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const proforma = await tx.proforma.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { linhas: true },
    });
    if (!proforma) throw new NotFoundError('Proforma não encontrada');
    transitarProforma(proforma.status as StatusProforma, 'CONVERTIDA');

    const serie = await tx.serieDocumento.findFirst({
      where: { id: serieDocumentoId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de factura não encontrada');

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);

    const fatura = await tx.fatura.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId,
        numero,
        clienteId: proforma.clienteId,
        moeda: proforma.moeda,
        subtotal: proforma.subtotal,
        descontoTotal: proforma.descontoTotal,
        baseIva: proforma.subtotal,
        ivaTotal: proforma.ivaTotal,
        total: proforma.total,
        totalPago: new Prisma.Decimal(0),
        status: 'EMITIDA',
        dataEmissao: new Date(),
        dataVencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
        emitidoPorId: ctx.userId,
      },
    });

    await Promise.all(
      proforma.linhas.map((l) =>
        tx.linhaFatura.create({
          data: {
            tenantId: ctx.tenantId,
            faturaId: fatura.id,
            produtoId: l.produtoId,
            descricao: l.descricao,
            quantidade: l.quantidade,
            precoUnitario: l.precoUnitario,
            desconto: l.desconto,
            taxaIva: l.taxaIva,
            subtotal: l.subtotal,
            ivaItem: l.ivaItem,
            total: l.total,
            ordemLinha: l.ordemLinha,
          },
        }),
      ),
    );

    await tx.proforma.update({
      where: { id },
      data: { status: 'CONVERTIDA', faturaId: fatura.id },
    });

    return tx.fatura.findFirst({
      where: { id: fatura.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
      },
    }) as unknown as FaturaCompleta;
  });
}

export async function cancelarProforma(id: string, motivo: string, ctx: Ctx): Promise<Proforma> {
  const p = await prisma.proforma.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!p) throw new NotFoundError('Proforma não encontrada');
  transitarProforma(p.status as StatusProforma, 'CANCELADA');
  return prisma.proforma.update({ where: { id }, data: { status: 'CANCELADA', observacoes: motivo } }) as unknown as Proforma;
}

export async function listarProformas(filtro: FiltroProformaInput, ctx: Ctx): Promise<PaginacaoFaturacao<ProformaCompleta>> {
  return paginate(
    (a) =>
      prisma.proforma.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
        include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<ProformaCompleta>>;
}

// ---------------------------------------------------------------------------
// Cotações comerciais
// ---------------------------------------------------------------------------

export async function criarCotacaoComercial(input: CriarCotacaoComercialInput, ctx: Ctx): Promise<CotacaoComercialCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const serie = await tx.serieDocumento.findFirst({
      where: { id: input.serieDocumentoId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de cotação não encontrada');

    // W9: validar clienteId pertence ao tenant
    const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const cotacao = await tx.cotacaoComercial.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId: input.serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'RASCUNHO',
        dataEmissao: input.dataEmissao,
        dataValidade: input.dataValidade,
        condicoesComerciais: input.condicoesComerciais ?? null,
        observacoes: input.observacoes ?? null,
        criadoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaCotacaoComercial.create({
          data: {
            tenantId: ctx.tenantId,
            cotacaoComercialId: cotacao.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    return tx.cotacaoComercial.findFirst({
      where: { id: cotacao.id },
      include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
    }) as unknown as CotacaoComercialCompleta;
  });
}

export async function enviarCotacaoComercial(id: string, ctx: Ctx): Promise<CotacaoComercial> {
  const c = await prisma.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new NotFoundError('Cotação não encontrada');
  transitarCotacao(c.status as StatusCotacaoComercial, 'ENVIADA');
  return prisma.cotacaoComercial.update({ where: { id }, data: { status: 'ENVIADA' } }) as unknown as CotacaoComercial;
}

export async function aceitarCotacaoComercial(id: string, ctx: Ctx): Promise<CotacaoComercial> {
  const c = await prisma.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new NotFoundError('Cotação não encontrada');
  transitarCotacao(c.status as StatusCotacaoComercial, 'ACEITE');
  return prisma.cotacaoComercial.update({ where: { id }, data: { status: 'ACEITE' } }) as unknown as CotacaoComercial;
}

export async function rejeitarCotacaoComercial(id: string, motivo: string, ctx: Ctx): Promise<CotacaoComercial> {
  const c = await prisma.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new NotFoundError('Cotação não encontrada');
  transitarCotacao(c.status as StatusCotacaoComercial, 'REJEITADA');
  return prisma.cotacaoComercial.update({ where: { id }, data: { status: 'REJEITADA', observacoes: motivo } }) as unknown as CotacaoComercial;
}

export async function converterCotacaoEmProforma(
  id: string,
  serieProformaId: string,
  ctx: Ctx,
): Promise<ProformaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const cotacao = await tx.cotacaoComercial.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { linhas: true },
    });
    if (!cotacao) throw new NotFoundError('Cotação não encontrada');
    transitarCotacao(cotacao.status as StatusCotacaoComercial, 'CONVERTIDA');

    const serie = await tx.serieDocumento.findFirst({
      where: { id: serieProformaId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!serie) throw new NotFoundError('Série de proforma não encontrada');

    const numero = await proximoNumeroSerie(tx, serie.tipo as TipoSerieDocumento, ctx);

    const proforma = await tx.proforma.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId: serieProformaId,
        numero,
        clienteId: cotacao.clienteId,
        moeda: cotacao.moeda,
        subtotal: cotacao.subtotal,
        descontoTotal: cotacao.descontoTotal,
        ivaTotal: cotacao.ivaTotal,
        total: cotacao.total,
        status: 'RASCUNHO',
        dataEmissao: new Date(),
        dataValidade: cotacao.dataValidade,
        criadoPorId: ctx.userId,
      },
    });

    await Promise.all(
      cotacao.linhas.map((l) =>
        tx.linhaProforma.create({
          data: {
            tenantId: ctx.tenantId,
            proformaId: proforma.id,
            produtoId: l.produtoId,
            descricao: l.descricao,
            quantidade: l.quantidade,
            precoUnitario: l.precoUnitario,
            desconto: l.desconto,
            taxaIva: l.taxaIva,
            subtotal: l.subtotal,
            ivaItem: l.ivaItem,
            total: l.total,
            ordemLinha: l.ordemLinha,
          },
        }),
      ),
    );

    await tx.cotacaoComercial.update({
      where: { id },
      data: { status: 'CONVERTIDA', proformaId: proforma.id },
    });

    return tx.proforma.findFirst({
      where: { id: proforma.id },
      include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
    }) as unknown as ProformaCompleta;
  });
}

export async function listarCotacoesComerciais(filtro: FiltroCotacaoComercialInput, ctx: Ctx): Promise<PaginacaoFaturacao<CotacaoComercialCompleta>> {
  return paginate(
    (a) =>
      prisma.cotacaoComercial.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
        include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<CotacaoComercialCompleta>>;
}

// ---------------------------------------------------------------------------
// Export tipado
// ---------------------------------------------------------------------------

export const faturacaoService = {
  criarSerie,
  listarSeries,
  proximoNumeroSerie,
  emitirFatura,
  obterFatura,
  listarFaturas,
  registarPagamento,
  marcarVencida,
  emitirNotaCredito,
  obterNotaCredito,
  listarNotasCredito,
  liquidarNotaCredito,
  cancelarNotaCredito,
  emitirNotaDebito,
  obterNotaDebito,
  listarNotasDebito,
  liquidarNotaDebito,
  cancelarNotaDebito,
  criarProforma,
  enviarProforma,
  aceitarProforma,
  converterProformaEmFatura,
  cancelarProforma,
  listarProformas,
  criarCotacaoComercial,
  enviarCotacaoComercial,
  aceitarCotacaoComercial,
  rejeitarCotacaoComercial,
  converterCotacaoEmProforma,
  listarCotacoesComerciais,
} satisfies IFaturacaoService;
