// Serviço de Catálogo de Produtos (WS A — Wave 2)
import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type {
  CategoriaProdutoCreate,
  CategoriaProdutoFilter,
  CategoriaProdutoUpdate,
  ProdutoCreate,
  ProdutoFilter,
  ProdutoUpdate,
  VarianteProdutoCreate,
  VarianteProdutoUpdate,
} from '@/lib/validations/produtos';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CategoriaProdutoDto,
  ICatalogoProdutoService,
  ProdutoDto,
  VarianteProdutoDto,
} from './catalogo.interface';

// ─── Helpers de mapeamento ────────────────────────────────────────────────────

function mapCategoria(c: {
  id: string; tenantId: string; nome: string; descricao: string | null;
  cor: string; icone: string | null; ativo: boolean; createdAt: Date; updatedAt: Date;
}): CategoriaProdutoDto {
  return { id: c.id, tenantId: c.tenantId, nome: c.nome, descricao: c.descricao, cor: c.cor, icone: c.icone, ativo: c.ativo, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

function mapVariante(v: {
  id: string; produtoId: string; nome: string; valor: string;
  precoAdicional: { toString(): string }; createdAt: Date;
}): VarianteProdutoDto {
  return { id: v.id, produtoId: v.produtoId, nome: v.nome, valor: v.valor, precoAdicional: v.precoAdicional.toString(), createdAt: v.createdAt };
}

function mapProduto(p: {
  id: string; tenantId: string; sku: string; codigoBarras: string | null; nome: string;
  descricao: string | null; categoriaId: string; marca: string | null; unidadeMedida: string;
  precoVenda: { toString(): string }; precoCompra: { toString(): string };
  margemLucro: { toString(): string }; taxaIva: { toString(): string };
  stockMinimo: { toString(): string }; stockMaximo: { toString(): string } | null;
  dataValidade: Date | null; imagens: string[]; ativo: boolean; createdAt: Date; updatedAt: Date;
  categoria?: { id: string; nome: string; cor: string } | null;
  variantes?: Array<{ id: string; produtoId: string; nome: string; valor: string; precoAdicional: { toString(): string }; createdAt: Date }>;
}): ProdutoDto {
  return {
    id: p.id, tenantId: p.tenantId, sku: p.sku, codigoBarras: p.codigoBarras,
    nome: p.nome, descricao: p.descricao, categoriaId: p.categoriaId,
    categoria: p.categoria ?? null, marca: p.marca, unidadeMedida: p.unidadeMedida,
    precoVenda: p.precoVenda.toString(), precoCompra: p.precoCompra.toString(),
    margemLucro: p.margemLucro.toString(), taxaIva: p.taxaIva.toString(),
    stockMinimo: p.stockMinimo.toString(), stockMaximo: p.stockMaximo?.toString() ?? null,
    dataValidade: p.dataValidade, imagens: p.imagens, ativo: p.ativo,
    variantes: (p.variantes ?? []).map(mapVariante),
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

// ─── Categorias de Produto ────────────────────────────────────────────────────

const CATEGORIA_SELECT = {
  id: true, tenantId: true, nome: true, descricao: true,
  cor: true, icone: true, ativo: true, createdAt: true, updatedAt: true,
} as const;

export async function listarCategorias(
  filter: CategoriaProdutoFilter,
  ctx: Ctx,
): Promise<PaginatedResult<CategoriaProdutoDto>> {
  const page = await paginate(
    (args) =>
      prisma.categoriaProduto.findMany({
        ...args,
        where: {
          ...(filter.search ? { nome: { contains: filter.search, mode: 'insensitive' } } : {}),
          ...(filter.ativo !== undefined ? { ativo: filter.ativo } : {}),
        },
        select: CATEGORIA_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapCategoria), nextCursor: page.nextCursor };
}

export async function obterCategoria(id: string, ctx: Ctx): Promise<CategoriaProdutoDto> {
  const c = await prisma.categoriaProduto.findFirst({
    where: { id, deletedAt: null },
    select: CATEGORIA_SELECT,
  });
  if (!c) throw new NotFoundError('Categoria de produto não encontrada');
  return mapCategoria(c);
}

export async function criarCategoria(
  data: CategoriaProdutoCreate,
  ctx: Ctx,
): Promise<CategoriaProdutoDto> {
  const existente = await prisma.categoriaProduto.findFirst({
    where: { nome: data.nome, deletedAt: null },
  });
  if (existente) {
    throw new BusinessRuleError('CATEGORIA_DUPLICADA', `Já existe uma categoria com o nome "${data.nome}".`);
  }
  const c = await prisma.categoriaProduto.create({
    data: { ...data, tenantId: ctx.tenantId },
    select: CATEGORIA_SELECT,
  });
  return mapCategoria(c);
}

export async function actualizarCategoria(
  id: string,
  data: CategoriaProdutoUpdate,
  ctx: Ctx,
): Promise<CategoriaProdutoDto> {
  await obterCategoria(id, ctx); // valida existência e tenant
  const c = await prisma.categoriaProduto.update({
    where: { id },
    data,
    select: CATEGORIA_SELECT,
  });
  return mapCategoria(c);
}

export async function arquivarCategoria(id: string, ctx: Ctx): Promise<void> {
  await obterCategoria(id, ctx);
  await prisma.categoriaProduto.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

const PRODUTO_SELECT = {
  id: true, tenantId: true, sku: true, codigoBarras: true, nome: true, descricao: true,
  categoriaId: true, marca: true, unidadeMedida: true, precoVenda: true, precoCompra: true,
  margemLucro: true, taxaIva: true, stockMinimo: true, stockMaximo: true,
  dataValidade: true, imagens: true, ativo: true, createdAt: true, updatedAt: true,
  categoria: { select: { id: true, nome: true, cor: true } },
  variantes: { select: { id: true, produtoId: true, nome: true, valor: true, precoAdicional: true, createdAt: true } },
} as const;

export async function listarProdutos(
  filter: ProdutoFilter,
  ctx: Ctx,
): Promise<PaginatedResult<ProdutoDto>> {
  const orderField = filter.orderBy ?? 'createdAt';
  const orderDir = filter.orderDir ?? 'desc';

  const page = await paginate(
    (args) =>
      prisma.produto.findMany({
        ...args,
        where: {
          ...(filter.search
            ? {
                OR: [
                  { nome: { contains: filter.search, mode: 'insensitive' } },
                  { sku: { contains: filter.search, mode: 'insensitive' } },
                  { codigoBarras: { contains: filter.search, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(filter.categoriaId ? { categoriaId: filter.categoriaId } : {}),
          ...(filter.ativo !== undefined ? { ativo: filter.ativo } : {}),
          deletedAt: null,
        },
        select: PRODUTO_SELECT,
        orderBy: { [orderField]: orderDir },
      }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapProduto), nextCursor: page.nextCursor };
}

export async function obterProduto(id: string, ctx: Ctx): Promise<ProdutoDto> {
  const p = await prisma.produto.findFirst({
    where: { id, deletedAt: null },
    select: PRODUTO_SELECT,
  });
  if (!p) throw new NotFoundError('Produto não encontrado');
  return mapProduto(p);
}

export async function obterProdutoPorSku(sku: string, ctx: Ctx): Promise<ProdutoDto> {
  const p = await prisma.produto.findFirst({
    where: { sku, deletedAt: null },
    select: PRODUTO_SELECT,
  });
  if (!p) throw new NotFoundError(`Produto com SKU "${sku}" não encontrado`);
  return mapProduto(p);
}

export async function criarProduto(data: ProdutoCreate, ctx: Ctx): Promise<ProdutoDto> {
  const existente = await prisma.produto.findFirst({ where: { sku: data.sku, deletedAt: null } });
  if (existente) {
    throw new BusinessRuleError('SKU_DUPLICADO', `Já existe um produto com o SKU "${data.sku}".`);
  }
  // calcular margem automaticamente
  const margem = data.precoCompra > 0
    ? (data.precoVenda - data.precoCompra) / data.precoCompra
    : 0;
  const p = await prisma.produto.create({
    data: {
      tenantId: ctx.tenantId,
      sku: data.sku,
      codigoBarras: data.codigoBarras,
      nome: data.nome,
      descricao: data.descricao,
      categoriaId: data.categoriaId,
      marca: data.marca,
      unidadeMedida: data.unidadeMedida,
      precoVenda: data.precoVenda,
      precoCompra: data.precoCompra,
      margemLucro: margem,
      taxaIva: data.taxaIva,
      stockMinimo: data.stockMinimo,
      stockMaximo: data.stockMaximo ?? null,
      dataValidade: data.dataValidade ?? null,
      imagens: data.imagens,
      ativo: data.ativo,
    },
    select: PRODUTO_SELECT,
  });
  return mapProduto(p);
}

export async function actualizarProduto(
  id: string,
  data: ProdutoUpdate,
  ctx: Ctx,
): Promise<ProdutoDto> {
  await obterProduto(id, ctx);
  // recalcular margem se preços mudaram
  const current = await prisma.produto.findFirst({ where: { id }, select: { precoVenda: true, precoCompra: true } });
  const pv = data.precoVenda ?? Number(current!.precoVenda);
  const pc = data.precoCompra ?? Number(current!.precoCompra);
  const margem = pc > 0 ? (pv - pc) / pc : 0;

  const p = await prisma.produto.update({
    where: { id },
    data: {
      ...data,
      ...(data.precoVenda !== undefined || data.precoCompra !== undefined ? { margemLucro: margem } : {}),
    },
    select: PRODUTO_SELECT,
  });
  return mapProduto(p);
}

export async function arquivarProduto(id: string, ctx: Ctx): Promise<void> {
  await obterProduto(id, ctx);
  await prisma.produto.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ─── Variantes de Produto ─────────────────────────────────────────────────────

export async function listarVariantes(produtoId: string, ctx: Ctx): Promise<VarianteProdutoDto[]> {
  await obterProduto(produtoId, ctx);
  const vs = await prisma.varianteProduto.findMany({
    where: { produtoId },
    select: { id: true, produtoId: true, nome: true, valor: true, precoAdicional: true, createdAt: true },
    orderBy: { nome: 'asc' },
  });
  return vs.map(mapVariante);
}

export async function criarVariante(
  data: VarianteProdutoCreate,
  ctx: Ctx,
): Promise<VarianteProdutoDto> {
  await obterProduto(data.produtoId, ctx);
  const v = await prisma.varianteProduto.create({
    data: { ...data, tenantId: ctx.tenantId },
    select: { id: true, produtoId: true, nome: true, valor: true, precoAdicional: true, createdAt: true },
  });
  return mapVariante(v);
}

export async function actualizarVariante(
  id: string,
  data: VarianteProdutoUpdate,
  ctx: Ctx,
): Promise<VarianteProdutoDto> {
  const v = await prisma.varianteProduto.findFirst({ where: { id }, select: { id: true, produtoId: true, tenantId: true, nome: true, valor: true, precoAdicional: true, createdAt: true } });
  if (!v || v.tenantId !== ctx.tenantId) throw new NotFoundError('Variante não encontrada');
  const updated = await prisma.varianteProduto.update({
    where: { id },
    data,
    select: { id: true, produtoId: true, nome: true, valor: true, precoAdicional: true, createdAt: true },
  });
  return mapVariante(updated);
}

export async function removerVariante(id: string, ctx: Ctx): Promise<void> {
  const v = await prisma.varianteProduto.findFirst({ where: { id }, select: { tenantId: true } });
  if (!v || v.tenantId !== ctx.tenantId) throw new NotFoundError('Variante não encontrada');
  await prisma.varianteProduto.delete({ where: { id } });
}

// ─── Exportar como objecto de serviço ────────────────────────────────────────

export const catalogoProdutoService: ICatalogoProdutoService = {
  listarCategorias,
  obterCategoria,
  criarCategoria,
  actualizarCategoria,
  arquivarCategoria,
  listarProdutos,
  obterProduto,
  obterProdutoPorSku,
  criarProduto,
  actualizarProduto,
  arquivarProduto,
  listarVariantes,
  criarVariante,
  actualizarVariante,
  removerVariante,
};
