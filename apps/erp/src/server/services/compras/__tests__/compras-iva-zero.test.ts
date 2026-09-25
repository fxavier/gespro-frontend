/**
 * Oráculo da issue #77 — T4 (compras).
 *
 * - criarPedido com item a 0%: verde já hoje (o serviço usa `?? 0.16`, que
 *   preserva o 0) — não discriminante.
 * - converterRequisicaoEmPedido: DISCRIMINANTE. Hoje cria todos os itens com
 *   `taxaIva: 0.16` fixo, ignorando o produto. Decisão: item com produtoId →
 *   Produto.taxaIva lido COM tenantId; sem produtoId → 0.16; um produto de outro
 *   tenant nunca fornece a taxa.
 *
 * O duplo do prisma tem estado e filtra por `where` (id / id.in / tenantId) —
 * NÃO emula a tenant-extension: a especificação pede o tenantId explícito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/server/services/inventario/stock.service', () => ({
  entradaStock: vi.fn(),
}));
vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: vi.fn().mockResolvedValue('PC/2026/000077'),
}));
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn().mockResolvedValue({ id: 'lan-77' }),
}));
vi.mock('@/server/db/client', () => {
  // Proxy: `prisma.x` resolve sempre para o duplo corrente (recriado em cada teste).
  const prisma = new Proxy({}, { get: (_t, k) => h.db?.[k as string] });
  return { prisma, prismaBase: prisma };
});

import { comprasService } from '../compras.service';

const ctx = { tenantId: 'tenant-77', userId: 'user-77' };

const PRODUTOS = [
  { id: 'prod-isento', tenantId: 'tenant-77', nome: 'Livro escolar', taxaIva: new Prisma.Decimal('0') },
  { id: 'prod-normal', tenantId: 'tenant-77', nome: 'Toner', taxaIva: new Prisma.Decimal('0.16') },
  { id: 'prod-alheio', tenantId: 'outro-tenant', nome: 'Isento alheio', taxaIva: new Prisma.Decimal('0') },
];

function correspondeId(cond: unknown, id: string) {
  if (cond === undefined) return true;
  if (typeof cond === 'string') return cond === id;
  if (cond && typeof cond === 'object' && Array.isArray((cond as any).in)) return (cond as any).in.includes(id);
  if (cond && typeof cond === 'object' && 'equals' in (cond as any)) return (cond as any).equals === id;
  return false;
}

function filtrarProdutos(where: any = {}) {
  return PRODUTOS.filter(
    (p) => correspondeId(where.id, p.id) && (where.tenantId === undefined || where.tenantId === p.tenantId),
  );
}

function criarDb(requisicao: any) {
  const criados: Record<string, any[]> = {};
  const db: any = {
    criados,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    requisicaoCompra: {
      findUnique: vi.fn(async () => requisicao),
      findFirst: vi.fn(async () => requisicao),
      update: vi.fn(async ({ data }: any) => ({ ...requisicao, ...data })),
    },
    cotacao: {
      findUnique: vi.fn(async () => ({
        id: 'cot-77',
        tenantId: ctx.tenantId,
        status: 'ADJUDICADA',
        vencedorFornecedorId: 'forn-77',
        fornecedores: [{ fornecedorId: 'forn-77', condicoesPagamento: '30 dias', prazoEntregaDias: 30 }],
        itens: [],
      })),
    },
    produto: {
      findMany: vi.fn(async ({ where }: any = {}) => filtrarProdutos(where)),
      findFirst: vi.fn(async ({ where }: any = {}) => filtrarProdutos(where)[0] ?? null),
      findUnique: vi.fn(async ({ where }: any = {}) => filtrarProdutos(where)[0] ?? null),
    },
    pedidoCompra: {
      create: vi.fn(async ({ data }: any) => {
        const itens = (data.itens?.create ?? []).map((i: any, n: number) => ({ id: `ip-${n}`, ...i }));
        const reg = { id: 'pc-77', createdAt: new Date(), status: 'RASCUNHO', ...data, itens };
        (criados.pedidoCompra ??= []).push(reg);
        return reg;
      }),
    },
  };
  return db;
}

const itemRequisicao = (over: Record<string, unknown>) => ({
  id: `ir-${String(over.descricao)}`,
  tenantId: ctx.tenantId,
  descricao: 'item',
  quantidade: new Prisma.Decimal('2'),
  unidadeMedida: 'un',
  precoEstimado: new Prisma.Decimal('500'),
  produtoId: null,
  ...over,
});

function requisicaoCom(itens: any[]) {
  return { id: 'req-77', tenantId: ctx.tenantId, status: 'APROVADA', itens };
}

function taxaDoItem(pedido: any, descricao: string) {
  const it = pedido.itens.find((i: any) => i.descricao === descricao);
  expect(it, `item ${descricao} não foi criado`).toBeDefined();
  return Number(String(it.taxaIva));
}

beforeEach(() => {
  h.db = criarDb(requisicaoCom([]));
});

describe('criarPedido com item a 0% — verde já hoje (não discriminante)', () => {
  it('ItemPedidoCompra.taxaIva = 0 e valorIva do pedido = 0', async () => {
    await comprasService.criarPedido(
      {
        fornecedorId: 'cjld2cjxh0000qzrmn831i7rn',
        data: new Date('2026-09-25'),
        condicoesPagamento: '30 dias',
        prazoEntregaDias: 30,
        dataEntregaPrevista: new Date('2026-10-25'),
        enderecoEntrega: 'Maputo',
        itens: [
          { descricao: 'Isento', quantidade: 1, unidadeMedida: 'un', precoUnitario: 1000, desconto: 0, taxaIva: 0 },
        ],
      } as any,
      ctx,
    );
    const [pedido] = h.db.criados.pedidoCompra;
    expect(taxaDoItem(pedido, 'Isento')).toBe(0);
    expect(new Prisma.Decimal(String(pedido.valorIva)).isZero()).toBe(true);
  });
});

describe('converterRequisicaoEmPedido — a taxa vem do produto (DISCRIMINANTE)', () => {
  it('item cujo produto (do mesmo tenant) é isento → item do pedido a 0%', async () => {
    h.db = criarDb(requisicaoCom([itemRequisicao({ descricao: 'Livro', produtoId: 'prod-isento' })]));
    await comprasService.converterRequisicaoEmPedido('req-77', 'cot-77', ctx);
    const [pedido] = h.db.criados.pedidoCompra;
    expect(taxaDoItem(pedido, 'Livro')).toBe(0);
    expect(new Prisma.Decimal(String(pedido.valorIva)).isZero()).toBe(true);
  });

  it('mistura: isento → 0, produto normal → 0.16, sem produtoId → 0.16', async () => {
    h.db = criarDb(
      requisicaoCom([
        itemRequisicao({ descricao: 'Livro', produtoId: 'prod-isento' }),
        itemRequisicao({ descricao: 'Toner', produtoId: 'prod-normal' }),
        itemRequisicao({ descricao: 'Avulso', produtoId: null }),
      ]),
    );
    await comprasService.converterRequisicaoEmPedido('req-77', 'cot-77', ctx);
    const [pedido] = h.db.criados.pedidoCompra;
    expect(taxaDoItem(pedido, 'Livro')).toBe(0);
    expect(taxaDoItem(pedido, 'Toner')).toBe(0.16);
    expect(taxaDoItem(pedido, 'Avulso')).toBe(0.16);
    // 2×500 a 16% duas vezes = 160 + 160; o livro não conta.
    expect(new Prisma.Decimal(String(pedido.valorIva)).equals(new Prisma.Decimal('320'))).toBe(true);
  });

  it('item sem produtoId → 0.16 (verde já hoje)', async () => {
    h.db = criarDb(requisicaoCom([itemRequisicao({ descricao: 'Avulso', produtoId: null })]));
    await comprasService.converterRequisicaoEmPedido('req-77', 'cot-77', ctx);
    expect(taxaDoItem(h.db.criados.pedidoCompra[0], 'Avulso')).toBe(0.16);
  });

  it('produto de OUTRO tenant não fornece a taxa (fica 0.16 ou recusa) — verde já hoje', async () => {
    h.db = criarDb(requisicaoCom([itemRequisicao({ descricao: 'Alheio', produtoId: 'prod-alheio' })]));
    let pedido: any = null;
    try {
      await comprasService.converterRequisicaoEmPedido('req-77', 'cot-77', ctx);
      pedido = h.db.criados.pedidoCompra?.[0];
    } catch {
      // Recusar é aceitável; o que não é aceitável é usar a taxa do produto alheio.
      return;
    }
    expect(taxaDoItem(pedido, 'Alheio')).not.toBe(0);
  });
});
