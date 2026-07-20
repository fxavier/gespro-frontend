// Interface do serviço de Catálogo de Produtos (WS A — Wave 1 contrato)
import 'server-only';

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
import type { Ctx, PaginatedResult } from './types';

// ─── Tipos de retorno (placeholders até Prisma generate) ─────────────────────

export interface CategoriaProdutoDto {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string | null;
  cor: string;
  icone: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VarianteProdutoDto {
  id: string;
  produtoId: string;
  nome: string;
  valor: string;
  precoAdicional: string; // Decimal serializado
  createdAt: Date;
}

export interface ProdutoDto {
  id: string;
  tenantId: string;
  sku: string;
  codigoBarras: string | null;
  nome: string;
  descricao: string | null;
  categoriaId: string;
  categoria: Pick<CategoriaProdutoDto, 'id' | 'nome' | 'cor'> | null;
  marca: string | null;
  unidadeMedida: string;
  precoVenda: string;    // Decimal serializado
  precoCompra: string;   // Decimal serializado
  margemLucro: string;   // Decimal serializado
  taxaIva: string;       // Decimal serializado
  stockMinimo: string;   // Decimal serializado
  stockMaximo: string | null;
  dataValidade: Date | null;
  imagens: string[];
  ativo: boolean;
  variantes: VarianteProdutoDto[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface ICatalogoProdutoService {
  // Categorias
  listarCategorias(
    filter: CategoriaProdutoFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<CategoriaProdutoDto>>;

  obterCategoria(id: string, ctx: Ctx): Promise<CategoriaProdutoDto>;

  criarCategoria(data: CategoriaProdutoCreate, ctx: Ctx): Promise<CategoriaProdutoDto>;

  actualizarCategoria(
    id: string,
    data: CategoriaProdutoUpdate,
    ctx: Ctx,
  ): Promise<CategoriaProdutoDto>;

  arquivarCategoria(id: string, ctx: Ctx): Promise<void>;

  // Produtos
  listarProdutos(
    filter: ProdutoFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<ProdutoDto>>;

  obterProduto(id: string, ctx: Ctx): Promise<ProdutoDto>;

  obterProdutoPorSku(sku: string, ctx: Ctx): Promise<ProdutoDto>;

  criarProduto(data: ProdutoCreate, ctx: Ctx): Promise<ProdutoDto>;

  actualizarProduto(id: string, data: ProdutoUpdate, ctx: Ctx): Promise<ProdutoDto>;

  arquivarProduto(id: string, ctx: Ctx): Promise<void>;

  // Variantes
  listarVariantes(produtoId: string, ctx: Ctx): Promise<VarianteProdutoDto[]>;

  criarVariante(data: VarianteProdutoCreate, ctx: Ctx): Promise<VarianteProdutoDto>;

  actualizarVariante(
    id: string,
    data: VarianteProdutoUpdate,
    ctx: Ctx,
  ): Promise<VarianteProdutoDto>;

  removerVariante(id: string, ctx: Ctx): Promise<void>;
}
