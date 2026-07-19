// Serviço de Contagem e Reconciliação de Stock (WS A — Spec 05)
// Distinto do inventário físico de ativos (inventario-fisico.service.ts).
// Consome os contratos: entradaStock/baixarStock (WS A) e
// registarLancamentoContabilistico/proximoNumeroSerie (WS D — opcional).
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type {
  AbrirContagemInput,
  FilterContagem,
  JustificarItemInput,
  RegistarItemInput,
} from '@/lib/validations/inventario-contagem';
import type { Ctx, PaginatedResult, TxClient } from '@/server/services/types';
import { entradaStock, baixarStock } from './stock.service';
import { proximoNumeroSerie } from '@/server/services/financas';
import { registarLancamentoContabilistico } from '@/server/services/financas/contabilidade.service';
import {
  TRANSICOES_CONTAGEM,
  type ContagemDetalhe,
  type ContagemStockDto,
  type IContagemStockService,
  type ItemContagemStockDto,
  type ReconciliacaoResultado,
} from './contagem-stock.interface';
import { transitar } from './state-machine';

// ─── Mapeadores ───────────────────────────────────────────────────────────────

const CONTAGEM_SEL = {
  id: true, tenantId: true, numero: true, localizacaoId: true, categoriaId: true,
  cega: true, status: true, responsavelId: true, aprovadoPorId: true,
  dataAbertura: true, dataConclusao: true, observacoes: true,
  createdAt: true, updatedAt: true,
} as const;

const ITEM_SEL = {
  id: true, tenantId: true, contagemId: true, produtoId: true, localizacaoId: true,
  saldoSistema: true, quantidadeContada: true, diferenca: true, status: true,
  justificativa: true, movimentoStockId: true, createdAt: true, updatedAt: true,
} as const;

type ContagemRow = {
  id: string; tenantId: string; numero: string; localizacaoId: string | null;
  categoriaId: string | null; cega: boolean; status: string; responsavelId: string;
  aprovadoPorId: string | null; dataAbertura: Date; dataConclusao: Date | null;
  observacoes: string | null; createdAt: Date; updatedAt: Date;
};

type ItemRow = {
  id: string; tenantId: string; contagemId: string; produtoId: string;
  localizacaoId: string; saldoSistema: { toString(): string };
  quantidadeContada: { toString(): string } | null;
  diferenca: { toString(): string } | null;
  status: string; justificativa: string | null; movimentoStockId: string | null;
  createdAt: Date; updatedAt: Date;
};

function mapContagem(c: ContagemRow): ContagemStockDto {
  return {
    id: c.id, tenantId: c.tenantId, numero: c.numero,
    localizacaoId: c.localizacaoId, categoriaId: c.categoriaId,
    cega: c.cega, status: c.status, responsavelId: c.responsavelId,
    aprovadoPorId: c.aprovadoPorId, dataAbertura: c.dataAbertura,
    dataConclusao: c.dataConclusao, observacoes: c.observacoes,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

function mapItem(i: ItemRow): ItemContagemStockDto {
  return {
    id: i.id, tenantId: i.tenantId, contagemId: i.contagemId,
    produtoId: i.produtoId, localizacaoId: i.localizacaoId,
    saldoSistema: i.saldoSistema.toString(),
    quantidadeContada: i.quantidadeContada?.toString() ?? null,
    diferenca: i.diferenca?.toString() ?? null,
    status: i.status, justificativa: i.justificativa,
    movimentoStockId: i.movimentoStockId,
    createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}

// ─── Funções auxiliares ───────────────────────────────────────────────────────

async function _obterContagem(id: string, tenantId: string) {
  const c = await prisma.contagemStock.findFirst({
    where: { id, tenantId },
    select: CONTAGEM_SEL,
  });
  if (!c) throw new NotFoundError('Contagem de stock não encontrada');
  return c;
}

// ─── abrirContagem ────────────────────────────────────────────────────────────

export async function abrirContagem(
  input: AbrirContagemInput,
  ctx: Ctx,
): Promise<{ id: string; numero: string }> {
  // Verifica se já existe contagem EM_CONTAGEM na mesma localização
  if (input.localizacaoId) {
    const existente = await prisma.contagemStock.findFirst({
      where: {
        tenantId: ctx.tenantId,
        localizacaoId: input.localizacaoId,
        status: 'EM_CONTAGEM',
      },
      select: { id: true, numero: true },
    });
    if (existente) {
      throw new BusinessRuleError(
        'CONTAGEM_EM_ABERTO',
        `Já existe uma contagem em aberto (${existente.numero}) para esta localização.`,
        { contagemId: existente.id },
      );
    }
  }

  // Obtém snapshot dos saldos no âmbito
  const saldosWhere: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (input.localizacaoId) {
    saldosWhere.localizacaoId = input.localizacaoId;
  }

  // Obtém saldos da localização, filtrando por categoria se especificada
  let saldos: Array<{ produtoId: string; localizacaoId: string; saldo: { toString(): string }; produto: { categoriaId: string } }>;

  if (input.categoriaId) {
    saldos = await prisma.saldoStock.findMany({
      where: {
        ...saldosWhere,
        produto: { categoriaId: input.categoriaId },
      },
      select: {
        produtoId: true,
        localizacaoId: true,
        saldo: true,
        produto: { select: { categoriaId: true } },
      },
    });
  } else {
    const rawSaldos = await prisma.saldoStock.findMany({
      where: saldosWhere,
      select: {
        produtoId: true,
        localizacaoId: true,
        saldo: true,
        produto: { select: { categoriaId: true } },
      },
    });
    saldos = rawSaldos;
  }

  // Cria a contagem + itens dentro de $transaction (prismaBase = raw client)
  const resultado = await prismaBase.$transaction(async (tx) => {
    const numero = await proximoNumeroSerie(tx, 'CONTAGEM_STOCK', ctx);

    const contagem = await tx.contagemStock.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        localizacaoId: input.localizacaoId ?? null,
        categoriaId: input.categoriaId ?? null,
        cega: input.cega,
        status: 'EM_CONTAGEM',
        responsavelId: input.responsavelId,
        observacoes: input.observacoes ?? null,
      },
      select: { id: true, numero: true },
    });

    // Cria ItemContagemStock para cada saldo no âmbito com snapshot
    if (saldos.length > 0) {
      await tx.itemContagemStock.createMany({
        data: saldos.map((s) => ({
          tenantId: ctx.tenantId,
          contagemId: contagem.id,
          produtoId: s.produtoId,
          localizacaoId: s.localizacaoId,
          saldoSistema: new Prisma.Decimal(s.saldo.toString()),
          status: 'PENDENTE',
        })),
        skipDuplicates: true,
      });
    }

    return { id: contagem.id, numero: contagem.numero };
  });

  return resultado;
}

// ─── registarContagemItem ─────────────────────────────────────────────────────

export async function registarContagemItem(
  input: RegistarItemInput,
  ctx: Ctx,
): Promise<void> {
  const contagem = await _obterContagem(input.contagemId, ctx.tenantId);

  if (contagem.status !== 'EM_CONTAGEM') {
    throw new BusinessRuleError(
      'CONTAGEM_NAO_ABERTA',
      `Contagem "${contagem.numero}" não está em estado EM_CONTAGEM.`,
    );
  }

  const item = await prisma.itemContagemStock.findFirst({
    where: { id: input.itemId, contagemId: input.contagemId, tenantId: ctx.tenantId },
    select: { id: true, saldoSistema: true, status: true },
  });
  if (!item) throw new NotFoundError('Item de contagem não encontrado');

  if (item.status === 'AJUSTADO') {
    throw new BusinessRuleError(
      'ITEM_JA_AJUSTADO',
      'Este item já foi ajustado na reconciliação.',
    );
  }

  const qtdContada = new Prisma.Decimal(input.quantidadeContada);
  const saldoSist = new Prisma.Decimal(item.saldoSistema.toString());
  const diferenca = qtdContada.minus(saldoSist);

  await prisma.itemContagemStock.update({
    where: { id: input.itemId },
    data: {
      quantidadeContada: qtdContada,
      diferenca,
      status: 'CONTADO',
    },
  });
}

// ─── justificar ───────────────────────────────────────────────────────────────

export async function justificar(
  input: JustificarItemInput,
  ctx: Ctx,
): Promise<void> {
  const contagem = await _obterContagem(input.contagemId, ctx.tenantId);

  if (contagem.status !== 'EM_CONTAGEM') {
    throw new BusinessRuleError(
      'CONTAGEM_NAO_ABERTA',
      `Contagem "${contagem.numero}" não está em estado EM_CONTAGEM.`,
    );
  }

  const item = await prisma.itemContagemStock.findFirst({
    where: { id: input.itemId, contagemId: input.contagemId, tenantId: ctx.tenantId },
    select: { id: true, status: true },
  });
  if (!item) throw new NotFoundError('Item de contagem não encontrado');

  if (item.status === 'AJUSTADO') {
    throw new BusinessRuleError(
      'ITEM_JA_AJUSTADO',
      'Este item já foi ajustado e não pode ser justificado.',
    );
  }

  await prisma.itemContagemStock.update({
    where: { id: input.itemId },
    data: {
      justificativa: input.justificativa,
      status: 'JUSTIFICADO',
    },
  });
}

// ─── reconciliar ─────────────────────────────────────────────────────────────

export async function reconciliar(
  contagemId: string,
  opcoes: {
    aprovadoPorId?: string;
    limiarDiscrepanciaPct?: number;
    gerarLancamentoContabilistico?: boolean;
    contaExistenciasCodigo?: string;
    contaVariacaoCodigo?: string;
  },
  ctx: Ctx,
): Promise<ReconciliacaoResultado> {
  const limiar = opcoes.limiarDiscrepanciaPct ?? 5;

  const contagem = await _obterContagem(contagemId, ctx.tenantId);
  transitar(TRANSICOES_CONTAGEM as never, contagem.status as never, 'RECONCILIADA' as never, 'ContagemStock');

  // Carrega todos os itens contados com diferença ≠ 0
  const itens = await prisma.itemContagemStock.findMany({
    where: { contagemId, tenantId: ctx.tenantId },
    select: ITEM_SEL,
  });

  // Valida: não pode haver PENDENTE sem justificativa
  const itensPendentesSemJustif = itens.filter(
    (i) => i.status === 'PENDENTE' && !i.justificativa,
  );
  if (itensPendentesSemJustif.length > 0) {
    throw new BusinessRuleError(
      'ITENS_PENDENTES',
      `Existem ${itensPendentesSemJustif.length} item(s) PENDENTE(s) sem justificativa. Registe contagem ou justifique antes de reconciliar.`,
      { count: itensPendentesSemJustif.length },
    );
  }

  // Itens que precisam ajuste: têm diferença ≠ 0 e não estão já AJUSTADOS
  const itensParaAjuste = itens.filter(
    (i) =>
      i.diferenca !== null &&
      !new Prisma.Decimal(i.diferenca.toString()).isZero() &&
      i.status !== 'AJUSTADO',
  );

  // Valida limiar de discrepância (exige aprovação se acima do limiar)
  if (limiar < 100 && itensParaAjuste.length > 0) {
    for (const item of itensParaAjuste) {
      const saldo = new Prisma.Decimal(item.saldoSistema.toString());
      const dif = new Prisma.Decimal(item.diferenca!.toString());
      if (!saldo.isZero()) {
        const pct = dif.abs().div(saldo).times(100);
        if (pct.greaterThan(limiar) && !opcoes.aprovadoPorId) {
          throw new BusinessRuleError(
            'DISCREPANCIA_SEM_APROVACAO',
            `Item ${item.produtoId}: discrepância de ${pct.toFixed(2)}% excede o limiar de ${limiar}%. Aprovação obrigatória.`,
            { produtoId: item.produtoId, pct: pct.toFixed(2), limiar },
          );
        }
      }
    }
  }

  const itensJaAjustados = itens.filter((i) => i.status === 'AJUSTADO').length;

  let ajustesGerados = 0;
  let totalEntradas = new Prisma.Decimal(0);
  let totalSaidas = new Prisma.Decimal(0);

  // Execução transaccional atómica
  await prismaBase.$transaction(async (tx: TxClient) => {
    for (const item of itensParaAjuste) {
      const dif = new Prisma.Decimal(item.diferenca!.toString());
      const qtdAbs = dif.abs().toNumber();

      let movId: string;
      if (dif.greaterThan(0)) {
        // Diferença positiva: entrada de stock
        const mov = await entradaStock(
          tx,
          {
            produtoId: item.produtoId,
            localizacaoDestinoId: item.localizacaoId,
            quantidade: qtdAbs,
            documentoReferenciaTipo: 'AjusteInventario',
            documentoReferenciaId: contagemId,
            motivo: `Ajuste de contagem ${contagem.numero}`,
          },
          ctx,
        );
        movId = mov.id;
        totalEntradas = totalEntradas.plus(dif);
      } else {
        // Diferença negativa: baixa de stock
        const mov = await baixarStock(
          tx,
          {
            produtoId: item.produtoId,
            localizacaoOrigemId: item.localizacaoId,
            quantidade: qtdAbs,
            documentoReferenciaTipo: 'AjusteInventario',
            documentoReferenciaId: contagemId,
            motivo: `Ajuste de contagem ${contagem.numero}`,
          },
          ctx,
        );
        movId = mov.id;
        totalSaidas = totalSaidas.plus(dif.abs());
      }

      // Grava movimentoStockId e passa item para AJUSTADO
      await tx.itemContagemStock.update({
        where: { id: item.id },
        data: {
          movimentoStockId: movId,
          status: 'AJUSTADO',
        },
      });

      ajustesGerados++;
    }

    // Lançamento contabilístico opcional de regularização de existências (classe 3)
    if (opcoes.gerarLancamentoContabilistico && opcoes.contaExistenciasCodigo && opcoes.contaVariacaoCodigo) {
      const valorTotal = totalEntradas.minus(totalSaidas);
      if (!valorTotal.isZero()) {
        // Débito: conta de existências (classe 3) se entrada líquida, senão contrapartida
        const isEntrada = valorTotal.greaterThan(0);
        await registarLancamentoContabilistico(
          tx,
          {
            data: new Date(),
            diarioTipo: 'OPERACOES',
            origem: 'AJUSTE',
            documentoOrigemId: contagemId,
            documentoOrigemTipo: 'ContagemStock',
            historico: `Regularização de existências — contagem ${contagem.numero}`,
            partidas: [
              {
                contaCodigo: isEntrada ? opcoes.contaExistenciasCodigo : opcoes.contaVariacaoCodigo,
                tipo: 'DEBITO',
                valor: valorTotal.abs().toString(),
                historico: `Ajuste contagem ${contagem.numero}`,
              },
              {
                contaCodigo: isEntrada ? opcoes.contaVariacaoCodigo : opcoes.contaExistenciasCodigo,
                tipo: 'CREDITO',
                valor: valorTotal.abs().toString(),
                historico: `Ajuste contagem ${contagem.numero}`,
              },
            ],
          },
          ctx,
        );
      }
    }

    // Actualiza status da contagem e aprovadoPorId
    await tx.contagemStock.update({
      where: { id: contagemId },
      data: {
        status: 'RECONCILIADA',
        aprovadoPorId: opcoes.aprovadoPorId ?? null,
      },
    });
  });

  return {
    contagemId,
    ajustesGerados,
    itensIgnorados: itensJaAjustados,
    totalEntradas: totalEntradas.toString(),
    totalSaidas: totalSaidas.toString(),
  };
}

// ─── concluir ─────────────────────────────────────────────────────────────────

export async function concluir(
  contagemId: string,
  observacoes: string | undefined,
  ctx: Ctx,
): Promise<void> {
  const contagem = await _obterContagem(contagemId, ctx.tenantId);
  transitar(TRANSICOES_CONTAGEM as never, contagem.status as never, 'CONCLUIDA' as never, 'ContagemStock');

  await prisma.contagemStock.update({
    where: { id: contagemId },
    data: {
      status: 'CONCLUIDA',
      dataConclusao: new Date(),
      ...(observacoes ? { observacoes } : {}),
    },
  });
}

// ─── cancelar ─────────────────────────────────────────────────────────────────

export async function cancelar(
  contagemId: string,
  motivo: string,
  ctx: Ctx,
): Promise<void> {
  const contagem = await _obterContagem(contagemId, ctx.tenantId);
  transitar(TRANSICOES_CONTAGEM as never, contagem.status as never, 'CANCELADA' as never, 'ContagemStock');

  await prisma.contagemStock.update({
    where: { id: contagemId },
    data: {
      status: 'CANCELADA',
      observacoes: motivo,
    },
  });
}

// ─── listar ───────────────────────────────────────────────────────────────────

export async function listar(
  filter: FilterContagem,
  ctx: Ctx,
): Promise<PaginatedResult<ContagemStockDto>> {
  const page = await paginate(
    (args) =>
      prisma.contagemStock.findMany({
        ...args,
        where: {
          ...(filter.search
            ? { numero: { contains: filter.search, mode: 'insensitive' } }
            : {}),
          ...(filter.status ? { status: filter.status as never } : {}),
          ...(filter.localizacaoId ? { localizacaoId: filter.localizacaoId } : {}),
          ...(filter.responsavelId ? { responsavelId: filter.responsavelId } : {}),
          ...(filter.dataInicio ? { dataAbertura: { gte: filter.dataInicio } } : {}),
          ...(filter.dataFim ? { dataAbertura: { lte: filter.dataFim } } : {}),
        },
        select: CONTAGEM_SEL,
        orderBy: { dataAbertura: 'desc' },
      }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapContagem), nextCursor: page.nextCursor };
}

// ─── obter ────────────────────────────────────────────────────────────────────

export async function obter(id: string, ctx: Ctx): Promise<ContagemDetalhe> {
  const contagem = await prisma.contagemStock.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...CONTAGEM_SEL,
      itens: { select: ITEM_SEL, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!contagem) throw new NotFoundError('Contagem de stock não encontrada');

  const itens = contagem.itens.map(mapItem);
  const totalItens = itens.length;
  const itensPendentes = itens.filter((i) => i.status === 'PENDENTE').length;
  const itensContados = itens.filter((i) => ['CONTADO', 'JUSTIFICADO', 'AJUSTADO'].includes(i.status)).length;
  const itensComDiferenca = itens.filter(
    (i) => i.diferenca !== null && i.diferenca !== '0' && new Prisma.Decimal(i.diferenca).abs().greaterThan(0),
  ).length;

  return {
    ...mapContagem(contagem),
    itens,
    totalItens,
    itensPendentes,
    itensContados,
    itensComDiferenca,
  };
}

// ─── Objecto de serviço (IContagemStockService) ───────────────────────────────

export const contagemStockService: IContagemStockService = {
  abrirContagem,
  registarContagemItem,
  justificar,
  reconciliar,
  concluir,
  cancelar,
  listar,
  obter,
};
