// Serviço de Stock — movimentos imutáveis + saldo + contratos inter-WS (WS A — Wave 2)
// Contratos: entradaStock, baixarStock, reservarStock, confirmarConsumoStock, libertarStock
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type {
  BaixaStockInput,
  EntradaStockInput,
  LocalizacaoCreate,
  LocalizacaoFilter,
  LocalizacaoUpdate,
  MovimentoStockFilter,
  ReservaStockInput,
  SaldoStockFilter,
  TransferenciaStockInput,
} from '@/lib/validations/stock';
import type { Ctx, PaginatedResult, TxClient } from '@/server/services/types';
import {
  TRANSICOES_RESERVA_STOCK,
  type IStockService,
  type LocalizacaoDto,
  type MovimentoStockDto,
  type ReservaStockDto,
  type ReservaStockResult,
  type SaldoStockDto,
} from './stock.interface';
import { transitar } from './state-machine';

// ─── Chave de unicidade SaldoStock ───────────────────────────────────────────

/** Sentinela: produtos sem variante usam "" como varianteProdutoId (ADR-0003 A4). */
const VARIANTE_SEM = '';

function saldoKey(produtoId: string, varianteProdutoId: string | undefined, localizacaoId: string) {
  return {
    tenantId_produtoId_varianteProdutoId_localizacaoId: {
      tenantId: '__placeholder__', // injectado pelo contexto, não aqui
      produtoId,
      varianteProdutoId: varianteProdutoId ?? VARIANTE_SEM,
      localizacaoId,
    },
  };
}

// ─── Localizações ─────────────────────────────────────────────────────────────

const LOC_SELECT = {
  id: true, tenantId: true, codigo: true, nome: true, tipo: true,
  endereco: true, descricao: true, capacidade: true, responsavelId: true,
  ativa: true, localizacaoPaiId: true, createdAt: true,
} as const;

function mapLoc(l: {
  id: string; tenantId: string; codigo: string; nome: string; tipo: string;
  endereco: string | null; descricao: string | null;
  capacidade: { toString(): string } | null; responsavelId: string | null;
  ativa: boolean; localizacaoPaiId: string | null; createdAt: Date;
}): LocalizacaoDto {
  return {
    id: l.id, tenantId: l.tenantId, codigo: l.codigo, nome: l.nome, tipo: l.tipo,
    endereco: l.endereco, descricao: l.descricao, capacidade: l.capacidade?.toString() ?? null,
    responsavelId: l.responsavelId, ativa: l.ativa, localizacaoPaiId: l.localizacaoPaiId,
    createdAt: l.createdAt,
  };
}

export async function listarLocalizacoes(
  filter: LocalizacaoFilter,
  ctx: Ctx,
): Promise<PaginatedResult<LocalizacaoDto>> {
  const page = await paginate(
    (args) =>
      prisma.localizacao.findMany({
        ...args,
        where: {
          ...(filter.search ? { OR: [{ nome: { contains: filter.search, mode: 'insensitive' } }, { codigo: { contains: filter.search, mode: 'insensitive' } }] } : {}),
          ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
          ...(filter.ativa !== undefined ? { ativa: filter.ativa } : {}),
          ...(filter.localizacaoPaiId !== undefined ? { localizacaoPaiId: filter.localizacaoPaiId } : {}),
          deletedAt: null,
        },
        select: LOC_SELECT,
        orderBy: { nome: 'asc' },
      }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapLoc), nextCursor: page.nextCursor };
}

export async function obterLocalizacao(id: string, ctx: Ctx): Promise<LocalizacaoDto> {
  const l = await prisma.localizacao.findFirst({ where: { id, deletedAt: null }, select: LOC_SELECT });
  if (!l) throw new NotFoundError('Localização não encontrada');
  return mapLoc(l);
}

export async function criarLocalizacao(data: LocalizacaoCreate, ctx: Ctx): Promise<LocalizacaoDto> {
  const l = await prisma.localizacao.create({
    data: { ...data, tenantId: ctx.tenantId, tipo: data.tipo as never },
    select: LOC_SELECT,
  });
  return mapLoc(l);
}

export async function actualizarLocalizacao(id: string, data: LocalizacaoUpdate, ctx: Ctx): Promise<LocalizacaoDto> {
  await obterLocalizacao(id, ctx);
  const l = await prisma.localizacao.update({ where: { id }, data: { ...data, ...(data.tipo ? { tipo: data.tipo as never } : {}) }, select: LOC_SELECT });
  return mapLoc(l);
}

export async function desactivarLocalizacao(id: string, ctx: Ctx): Promise<void> {
  await obterLocalizacao(id, ctx);
  await prisma.localizacao.update({ where: { id }, data: { ativa: false } });
}

// ─── Saldo ────────────────────────────────────────────────────────────────────

function mapSaldo(s: {
  id: string; tenantId: string; produtoId: string; varianteProdutoId: string;
  localizacaoId: string; saldo: { toString(): string }; saldoReservado: { toString(): string }; updatedAt: Date;
}): SaldoStockDto {
  const saldo = new Prisma.Decimal(s.saldo.toString());
  const res = new Prisma.Decimal(s.saldoReservado.toString());
  return {
    id: s.id, tenantId: s.tenantId, produtoId: s.produtoId,
    varianteProdutoId: s.varianteProdutoId,
    localizacaoId: s.localizacaoId,
    saldo: saldo.toString(),
    saldoReservado: res.toString(),
    saldoDisponivel: saldo.minus(res).toString(),
    updatedAt: s.updatedAt,
  };
}

const SALDO_SELECT = {
  id: true, tenantId: true, produtoId: true, varianteProdutoId: true,
  localizacaoId: true, saldo: true, saldoReservado: true, updatedAt: true,
} as const;

export async function listarSaldos(
  filter: SaldoStockFilter,
  ctx: Ctx,
): Promise<PaginatedResult<SaldoStockDto>> {
  const page = await paginate(
    (args) =>
      prisma.saldoStock.findMany({
        ...args,
        where: {
          ...(filter.produtoId ? { produtoId: filter.produtoId } : {}),
          ...(filter.localizacaoId ? { localizacaoId: filter.localizacaoId } : {}),
        },
        select: SALDO_SELECT,
        orderBy: { updatedAt: 'desc' },
      }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapSaldo), nextCursor: page.nextCursor };
}

export async function obterSaldo(
  produtoId: string,
  localizacaoId: string,
  ctx: Ctx,
  varianteProdutoId?: string,
): Promise<SaldoStockDto> {
  const s = await prisma.saldoStock.findUnique({
    where: {
      tenantId_produtoId_varianteProdutoId_localizacaoId: {
        tenantId: ctx.tenantId,
        produtoId,
        varianteProdutoId: varianteProdutoId ?? VARIANTE_SEM,
        localizacaoId,
      },
    },
    select: SALDO_SELECT,
  });
  if (!s) {
    // Retornar saldo zero sem erro — produto pode nunca ter tido movimento
    return {
      id: '', tenantId: ctx.tenantId, produtoId, varianteProdutoId: varianteProdutoId ?? VARIANTE_SEM,
      localizacaoId, saldo: '0', saldoReservado: '0', saldoDisponivel: '0', updatedAt: new Date(),
    };
  }
  return mapSaldo(s);
}

export async function obterSaldoTotal(
  produtoId: string,
  ctx: Ctx,
  varianteProdutoId?: string,
): Promise<SaldoStockDto> {
  const agg = await prisma.saldoStock.aggregate({
    where: { produtoId, varianteProdutoId: varianteProdutoId ?? VARIANTE_SEM, tenantId: ctx.tenantId },
    _sum: { saldo: true, saldoReservado: true },
  });
  const s = agg._sum.saldo ?? new Prisma.Decimal(0);
  const r = agg._sum.saldoReservado ?? new Prisma.Decimal(0);
  return {
    id: '', tenantId: ctx.tenantId, produtoId,
    varianteProdutoId: varianteProdutoId ?? VARIANTE_SEM,
    localizacaoId: '__total__',
    saldo: s.toString(),
    saldoReservado: r.toString(),
    saldoDisponivel: s.minus(r).toString(),
    updatedAt: new Date(),
  };
}

export async function verificarDisponibilidade(
  produtoId: string,
  quantidade: number,
  localizacaoId: string,
  ctx: Ctx,
  varianteProdutoId?: string,
): Promise<{ disponivel: boolean; saldoDisponivel: string }> {
  const s = await obterSaldo(produtoId, localizacaoId, ctx, varianteProdutoId);
  const disp = new Prisma.Decimal(s.saldoDisponivel);
  return {
    disponivel: disp.greaterThanOrEqualTo(quantidade),
    saldoDisponivel: s.saldoDisponivel,
  };
}

export async function obterAlertasStockMinimo(ctx: Ctx): Promise<SaldoStockDto[]> {
  // Produtos com saldo total < stockMinimo
  const produtos = await prisma.produto.findMany({
    where: { deletedAt: null },
    select: { id: true, stockMinimo: true },
  });
  const resultados: SaldoStockDto[] = [];
  for (const p of produtos) {
    const total = await obterSaldoTotal(p.id, ctx);
    if (new Prisma.Decimal(total.saldo).lessThan(p.stockMinimo)) {
      resultados.push(total);
    }
  }
  return resultados;
}

// ─── Movimentos ───────────────────────────────────────────────────────────────

const MOV_SELECT = {
  id: true, tenantId: true, produtoId: true, varianteProdutoId: true, tipo: true,
  quantidade: true, localizacaoOrigemId: true, localizacaoDestinoId: true,
  transferenciaRefId: true, documentoReferenciaId: true, documentoReferenciaTipo: true,
  motivo: true, observacoes: true, criadoPor: true, createdAt: true,
} as const;

function mapMov(m: {
  id: string; tenantId: string; produtoId: string; varianteProdutoId: string | null;
  tipo: string; quantidade: { toString(): string }; localizacaoOrigemId: string | null;
  localizacaoDestinoId: string | null; transferenciaRefId: string | null;
  documentoReferenciaId: string | null; documentoReferenciaTipo: string | null;
  motivo: string | null; observacoes: string | null; criadoPor: string; createdAt: Date;
}): MovimentoStockDto {
  return {
    id: m.id, tenantId: m.tenantId, produtoId: m.produtoId,
    varianteProdutoId: m.varianteProdutoId, tipo: m.tipo,
    quantidade: m.quantidade.toString(),
    localizacaoOrigemId: m.localizacaoOrigemId, localizacaoDestinoId: m.localizacaoDestinoId,
    transferenciaRefId: m.transferenciaRefId,
    documentoReferenciaId: m.documentoReferenciaId, documentoReferenciaTipo: m.documentoReferenciaTipo,
    motivo: m.motivo, observacoes: m.observacoes, criadoPor: m.criadoPor, createdAt: m.createdAt,
  };
}

export async function listarMovimentos(
  filter: MovimentoStockFilter,
  ctx: Ctx,
): Promise<PaginatedResult<MovimentoStockDto>> {
  const page = await paginate(
    (args) =>
      prisma.movimentoStock.findMany({
        ...args,
        where: {
          ...(filter.produtoId ? { produtoId: filter.produtoId } : {}),
          ...(filter.localizacaoId ? { OR: [{ localizacaoOrigemId: filter.localizacaoId }, { localizacaoDestinoId: filter.localizacaoId }] } : {}),
          ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
          ...(filter.dataInicio || filter.dataFim ? {
            createdAt: {
              ...(filter.dataInicio ? { gte: filter.dataInicio } : {}),
              ...(filter.dataFim ? { lte: filter.dataFim } : {}),
            },
          } : {}),
        },
        select: MOV_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapMov), nextCursor: page.nextCursor };
}

export async function registarTransferencia(
  data: TransferenciaStockInput,
  ctx: Ctx,
): Promise<{ movimentoSaida: MovimentoStockDto; movimentoEntrada: MovimentoStockDto }> {
  return prisma.$transaction(async (_tx) => {
    const tx = _tx as unknown as TxClient;
    const refId = `transf-${Date.now()}`;
    const [saida, entrada] = await Promise.all([
      _baixarStockInternal(tx, {
        produtoId: data.produtoId,
        varianteProdutoId: data.varianteProdutoId,
        localizacaoOrigemId: data.localizacaoOrigemId,
        quantidade: data.quantidade,
        motivo: data.motivo,
        observacoes: data.observacoes,
        transferenciaRefId: refId,
        tipo: 'TRANSFERENCIA_SAIDA',
      }, ctx),
      _entradaStockInternal(tx, {
        produtoId: data.produtoId,
        varianteProdutoId: data.varianteProdutoId,
        localizacaoDestinoId: data.localizacaoDestinoId,
        quantidade: data.quantidade,
        motivo: data.motivo,
        observacoes: data.observacoes,
        transferenciaRefId: refId,
        tipo: 'TRANSFERENCIA_ENTRADA',
      }, ctx),
    ]);
    return { movimentoSaida: saida, movimentoEntrada: entrada };
  });
}

// ─── Helpers internos para movimentos ────────────────────────────────────────

async function _upsertSaldo(
  tx: TxClient,
  ctx: Ctx,
  produtoId: string,
  varianteProdutoId: string | undefined,
  localizacaoId: string,
  deltaSaldo: Prisma.Decimal,
  deltaReservado: Prisma.Decimal,
): Promise<void> {
  const vid = varianteProdutoId ?? VARIANTE_SEM;
  await tx.saldoStock.upsert({
    where: {
      tenantId_produtoId_varianteProdutoId_localizacaoId: {
        tenantId: ctx.tenantId, produtoId, varianteProdutoId: vid, localizacaoId,
      },
    },
    create: {
      tenantId: ctx.tenantId, produtoId, varianteProdutoId: vid, localizacaoId,
      saldo: deltaSaldo.isPositive() ? deltaSaldo : new Prisma.Decimal(0),
      saldoReservado: deltaReservado.isPositive() ? deltaReservado : new Prisma.Decimal(0),
    },
    update: {
      saldo: { increment: deltaSaldo },
      saldoReservado: { increment: deltaReservado },
    },
  });
}

// ─── Operações atómicas de saldo ─────────────────────────────────────────────
// Substituem o padrão check-then-act (findUnique → update) que sofre de
// race condition sob READ COMMITTED com transações concorrentes.
// PostgreSQL avalia a condição WHERE no momento do UPDATE (row-level lock),
// garantindo que apenas uma tx ganha quando o saldo é insuficiente.

/**
 * Decrementa `saldo` de forma atómica apenas se `saldo >= quantidade`.
 * Garante invariante "saldo nunca negativo" mesmo com transações concorrentes.
 * Lança STOCK_INSUFICIENTE se a condição não se verificar.
 */
async function _baixarSaldoAtomico(
  tx: TxClient,
  ctx: Ctx,
  produtoId: string,
  varianteProdutoId: string | undefined,
  localizacaoId: string,
  quantidade: Prisma.Decimal,
): Promise<void> {
  const vid = varianteProdutoId ?? VARIANTE_SEM;
  // updateMany com WHERE saldo >= quantidade é reavaliado NO MOMENTO DO UPDATE.
  // Se duas baixas concorrentes chegarem com saldo=10, qtd=10:
  //   TX A: WHERE 10>=10 → true, saldo→0 (count=1)
  //   TX B: WHERE 0>=10  → false (count=0) → lança STOCK_INSUFICIENTE ✓
  const result = await tx.saldoStock.updateMany({
    where: {
      tenantId: ctx.tenantId,
      produtoId,
      varianteProdutoId: vid,
      localizacaoId,
      saldo: { gte: quantidade },
    },
    data: { saldo: { decrement: quantidade } },
  });
  if (result.count === 0) {
    const row = await tx.saldoStock.findUnique({
      where: {
        tenantId_produtoId_varianteProdutoId_localizacaoId: {
          tenantId: ctx.tenantId, produtoId, varianteProdutoId: vid, localizacaoId,
        },
      },
      select: { saldo: true, saldoReservado: true },
    });
    const saldo = new Prisma.Decimal(row?.saldo?.toString() ?? '0');
    const reservado = new Prisma.Decimal(row?.saldoReservado?.toString() ?? '0');
    const disponivel = saldo.minus(reservado);
    throw new BusinessRuleError(
      'STOCK_INSUFICIENTE',
      `Stock insuficiente. Disponível: ${disponivel}, solicitado: ${quantidade}.`,
      { disponivel: disponivel.toString(), solicitado: quantidade.toString(), produtoId, localizacaoId },
    );
  }
}

/**
 * Incrementa `saldoReservado` de forma atómica apenas se `saldo - saldoReservado >= quantidade`.
 * Usa $executeRaw porque Prisma WHERE não suporta comparação entre campos.
 * Mesmo princípio de row-lock: PostgreSQL avalia a condição no momento do UPDATE.
 */
async function _reservarSaldoAtomico(
  tx: TxClient,
  ctx: Ctx,
  produtoId: string,
  varianteProdutoId: string | undefined,
  localizacaoId: string,
  quantidade: Prisma.Decimal,
): Promise<void> {
  const vid = varianteProdutoId ?? VARIANTE_SEM;
  const count = await tx.$executeRaw`
    UPDATE "SaldoStock"
    SET "saldoReservado" = "saldoReservado" + ${quantidade}
    WHERE "tenantId" = ${ctx.tenantId}
      AND "produtoId" = ${produtoId}
      AND "varianteProdutoId" = ${vid}
      AND "localizacaoId" = ${localizacaoId}
      AND "saldo" - "saldoReservado" >= ${quantidade}
  `;
  if (count === 0) {
    const row = await tx.saldoStock.findUnique({
      where: {
        tenantId_produtoId_varianteProdutoId_localizacaoId: {
          tenantId: ctx.tenantId, produtoId, varianteProdutoId: vid, localizacaoId,
        },
      },
      select: { saldo: true, saldoReservado: true },
    });
    const saldo = new Prisma.Decimal(row?.saldo?.toString() ?? '0');
    const reservado = new Prisma.Decimal(row?.saldoReservado?.toString() ?? '0');
    const disponivel = saldo.minus(reservado);
    throw new BusinessRuleError(
      'STOCK_INSUFICIENTE',
      `Stock disponível insuficiente. Disponível: ${disponivel}, solicitado: ${quantidade}.`,
      { disponivel: disponivel.toString(), solicitado: quantidade.toString(), produtoId, localizacaoId },
    );
  }
}

/**
 * Decrementa `saldo` E `saldoReservado` num único UPDATE atómico.
 * Usado por confirmarConsumoStock — a reserva prévia garante que saldoReservado >= quantidade,
 * mas tornamos o UPDATE condicional para detectar inconsistências.
 */
async function _confirmarConsumoAtomico(
  tx: TxClient,
  ctx: Ctx,
  produtoId: string,
  varianteProdutoId: string | null,
  localizacaoId: string,
  quantidade: Prisma.Decimal,
): Promise<void> {
  const vid = varianteProdutoId ?? VARIANTE_SEM;
  const count = await tx.$executeRaw`
    UPDATE "SaldoStock"
    SET "saldo" = "saldo" - ${quantidade},
        "saldoReservado" = "saldoReservado" - ${quantidade}
    WHERE "tenantId" = ${ctx.tenantId}
      AND "produtoId" = ${produtoId}
      AND "varianteProdutoId" = ${vid}
      AND "localizacaoId" = ${localizacaoId}
      AND "saldoReservado" >= ${quantidade}
  `;
  if (count === 0) {
    throw new BusinessRuleError(
      'ESTADO_INCONSISTENTE',
      'Saldo ou reserva inconsistente ao confirmar consumo.',
      { produtoId, localizacaoId },
    );
  }
}

type EntradaInternal = {
  produtoId: string; varianteProdutoId?: string;
  localizacaoDestinoId: string; quantidade: number;
  documentoReferenciaId?: string; documentoReferenciaTipo?: string;
  motivo?: string; observacoes?: string; transferenciaRefId?: string;
  tipo?: string;
};

async function _entradaStockInternal(
  tx: TxClient,
  data: EntradaInternal,
  ctx: Ctx,
): Promise<MovimentoStockDto> {
  const qtd = new Prisma.Decimal(data.quantidade);
  const mov = await tx.movimentoStock.create({
    data: {
      tenantId: ctx.tenantId,
      produtoId: data.produtoId,
      varianteProdutoId: data.varianteProdutoId ?? null,
      tipo: (data.tipo ?? 'ENTRADA') as never,
      quantidade: qtd,
      localizacaoDestinoId: data.localizacaoDestinoId,
      transferenciaRefId: data.transferenciaRefId ?? null,
      documentoReferenciaId: data.documentoReferenciaId ?? null,
      documentoReferenciaTipo: data.documentoReferenciaTipo ?? null,
      motivo: data.motivo ?? null,
      observacoes: data.observacoes ?? null,
      criadoPor: ctx.userId,
    },
    select: MOV_SELECT,
  });
  await _upsertSaldo(tx, ctx, data.produtoId, data.varianteProdutoId, data.localizacaoDestinoId, qtd, new Prisma.Decimal(0));
  return mapMov(mov);
}

type BaixaInternal = {
  produtoId: string; varianteProdutoId?: string;
  localizacaoOrigemId: string; quantidade: number;
  documentoReferenciaId?: string; documentoReferenciaTipo?: string;
  motivo?: string; observacoes?: string; transferenciaRefId?: string;
  tipo?: string;
};

async function _baixarStockInternal(
  tx: TxClient,
  data: BaixaInternal,
  ctx: Ctx,
): Promise<MovimentoStockDto> {
  const qtd = new Prisma.Decimal(data.quantidade);
  // Atómico: decrementa saldo OU falha com STOCK_INSUFICIENTE (sem race condition).
  await _baixarSaldoAtomico(tx, ctx, data.produtoId, data.varianteProdutoId, data.localizacaoOrigemId, qtd);
  const mov = await tx.movimentoStock.create({
    data: {
      tenantId: ctx.tenantId,
      produtoId: data.produtoId,
      varianteProdutoId: data.varianteProdutoId ?? null,
      tipo: (data.tipo ?? 'SAIDA') as never,
      quantidade: qtd,
      localizacaoOrigemId: data.localizacaoOrigemId,
      transferenciaRefId: data.transferenciaRefId ?? null,
      documentoReferenciaId: data.documentoReferenciaId ?? null,
      documentoReferenciaTipo: data.documentoReferenciaTipo ?? null,
      motivo: data.motivo ?? null,
      observacoes: data.observacoes ?? null,
      criadoPor: ctx.userId,
    },
    select: MOV_SELECT,
  });
  return mapMov(mov);
}

// ─── Contratos expostos a B, C, E ────────────────────────────────────────────

export async function entradaStock(
  tx: TxClient,
  data: EntradaStockInput,
  ctx: Ctx,
): Promise<MovimentoStockDto> {
  return _entradaStockInternal(tx, {
    produtoId: data.produtoId,
    varianteProdutoId: data.varianteProdutoId,
    localizacaoDestinoId: data.localizacaoDestinoId,
    quantidade: data.quantidade,
    documentoReferenciaId: data.documentoReferenciaId,
    documentoReferenciaTipo: data.documentoReferenciaTipo,
    motivo: data.motivo,
    observacoes: data.observacoes,
  }, ctx);
}

export async function baixarStock(
  tx: TxClient,
  data: BaixaStockInput,
  ctx: Ctx,
): Promise<MovimentoStockDto> {
  return _baixarStockInternal(tx, {
    produtoId: data.produtoId,
    varianteProdutoId: data.varianteProdutoId,
    localizacaoOrigemId: data.localizacaoOrigemId,
    quantidade: data.quantidade,
    documentoReferenciaId: data.documentoReferenciaId,
    documentoReferenciaTipo: data.documentoReferenciaTipo,
    motivo: data.motivo,
    observacoes: data.observacoes,
  }, ctx);
}

export async function reservarStock(
  tx: TxClient,
  data: ReservaStockInput,
  ctx: Ctx,
): Promise<ReservaStockResult> {
  const qtd = new Prisma.Decimal(data.quantidade);

  // Atómico: incrementa saldoReservado apenas se saldo - saldoReservado >= quantidade.
  // $executeRaw permite comparar dois campos no WHERE — impossível com API tipada do Prisma.
  await _reservarSaldoAtomico(tx, ctx, data.produtoId, data.varianteProdutoId, data.localizacaoId, qtd);

  const reserva = await tx.reservaStock.create({
    data: {
      tenantId: ctx.tenantId,
      produtoId: data.produtoId,
      varianteProdutoId: data.varianteProdutoId ?? null,
      localizacaoId: data.localizacaoId,
      quantidade: qtd,
      status: 'ATIVA',
      documentoReferenciaId: data.documentoReferenciaId ?? null,
      documentoReferenciaTipo: data.documentoReferenciaTipo ?? null,
      expiradoEm: data.expiradoEm ?? null,
    },
    select: { id: true },
  });

  return { reservaId: reserva.id };
}

export async function confirmarConsumoStock(
  tx: TxClient,
  reservaId: string,
  ctx: Ctx,
): Promise<MovimentoStockDto> {
  const reserva = await tx.reservaStock.findFirst({
    where: { id: reservaId, tenantId: ctx.tenantId },
    select: { id: true, status: true, produtoId: true, varianteProdutoId: true, localizacaoId: true, quantidade: true, documentoReferenciaId: true, documentoReferenciaTipo: true },
  });
  if (!reserva) throw new NotFoundError('Reserva de stock não encontrada');
  transitar(TRANSICOES_RESERVA_STOCK as never, reserva.status as never, 'CONSUMIDA' as never, 'ReservaStock');

  const qtd = new Prisma.Decimal(reserva.quantidade.toString());

  // 1. Muda status da reserva
  await tx.reservaStock.update({ where: { id: reservaId }, data: { status: 'CONSUMIDA' } });

  // 2. Cria movimento de saída
  const mov = await tx.movimentoStock.create({
    data: {
      tenantId: ctx.tenantId,
      produtoId: reserva.produtoId,
      varianteProdutoId: reserva.varianteProdutoId ?? null,
      tipo: 'SAIDA' as never,
      quantidade: qtd,
      localizacaoOrigemId: reserva.localizacaoId,
      documentoReferenciaId: reserva.documentoReferenciaId ?? null,
      documentoReferenciaTipo: reserva.documentoReferenciaTipo ?? null,
      motivo: `Consumo de reserva ${reservaId}`,
      criadoPor: ctx.userId,
    },
    select: MOV_SELECT,
  });

  // 3. Decrementa saldo E saldoReservado — atómico (condição: saldoReservado >= qtd)
  await _confirmarConsumoAtomico(tx, ctx, reserva.produtoId, reserva.varianteProdutoId, reserva.localizacaoId, qtd);

  return mapMov(mov);
}

export async function libertarStock(
  tx: TxClient,
  reservaId: string,
  ctx: Ctx,
): Promise<void> {
  const reserva = await tx.reservaStock.findFirst({
    where: { id: reservaId, tenantId: ctx.tenantId },
    select: { id: true, status: true, produtoId: true, varianteProdutoId: true, localizacaoId: true, quantidade: true },
  });
  if (!reserva) throw new NotFoundError('Reserva de stock não encontrada');
  transitar(TRANSICOES_RESERVA_STOCK as never, reserva.status as never, 'LIBERADA' as never, 'ReservaStock');

  const qtd = new Prisma.Decimal(reserva.quantidade.toString());

  await tx.reservaStock.update({ where: { id: reservaId }, data: { status: 'LIBERADA' } });

  // Atómico: decrementa saldoReservado apenas se saldoReservado >= qtd.
  // A reserva anterior garante isso; condição serve para detectar inconsistências.
  const vid = reserva.varianteProdutoId ?? VARIANTE_SEM;
  const libResult = await tx.saldoStock.updateMany({
    where: {
      tenantId: ctx.tenantId,
      produtoId: reserva.produtoId,
      varianteProdutoId: vid,
      localizacaoId: reserva.localizacaoId,
      saldoReservado: { gte: qtd },
    },
    data: { saldoReservado: { decrement: qtd } },
  });
  if (libResult.count === 0) {
    throw new BusinessRuleError(
      'ESTADO_INCONSISTENTE',
      'Saldos inconsistentes ao libertar reserva.',
      { reservaId },
    );
  }
}

// ─── Exportar como objecto de serviço ────────────────────────────────────────

export const stockService: IStockService = {
  listarLocalizacoes,
  obterLocalizacao,
  criarLocalizacao,
  actualizarLocalizacao,
  desactivarLocalizacao,
  listarSaldos,
  obterSaldo,
  obterSaldoTotal,
  verificarDisponibilidade,
  obterAlertasStockMinimo,
  listarMovimentos,
  registarTransferencia,
  entradaStock,
  baixarStock,
  reservarStock,
  confirmarConsumoStock,
  libertarStock,
};
