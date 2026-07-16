// Validações Zod — Catálogo de Produtos (WS A)
// Partilhado cliente/servidor. Nunca importar lógica server-only aqui.

import { z } from 'zod';

// ─── Categoria de Produto ─────────────────────────────────────────────────────

export const CategoriaProdutoCreateSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser um código hexadecimal válido')
    .default('#6366f1'),
  icone: z.string().max(50).optional(),
  ativo: z.boolean().default(true),
});

export const CategoriaProdutoUpdateSchema = CategoriaProdutoCreateSchema.partial();

export const CategoriaProdutoFilterSchema = z.object({
  search: z.string().optional(),
  ativo: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type CategoriaProdutoCreate = z.infer<typeof CategoriaProdutoCreateSchema>;
export type CategoriaProdutoUpdate = z.infer<typeof CategoriaProdutoUpdateSchema>;
export type CategoriaProdutoFilter = z.infer<typeof CategoriaProdutoFilterSchema>;

// ─── Produto ──────────────────────────────────────────────────────────────────

const IVA_RATES = [0, 0.16] as const;

export const ProdutoCreateSchema = z.object({
  sku: z.string().min(1, 'SKU é obrigatório').max(50),
  codigoBarras: z.string().max(50).optional(),
  nome: z.string().min(1, 'Nome é obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  categoriaId: z.string().cuid('ID de categoria inválido'),
  marca: z.string().max(100).optional(),
  unidadeMedida: z.string().min(1, 'Unidade de medida é obrigatória').max(20),
  precoVenda: z.coerce.number().nonnegative('Preço de venda deve ser positivo'),
  precoCompra: z.coerce.number().nonnegative('Preço de compra deve ser positivo'),
  taxaIva: z.coerce
    .number()
    .refine(
      (v) => IVA_RATES.includes(v as 0 | 0.16),
      'Taxa de IVA deve ser 0 (isento) ou 0.16 (16%)',
    )
    .default(0.16),
  stockMinimo: z.coerce.number().nonnegative().default(0),
  stockMaximo: z.coerce.number().positive().optional(),
  dataValidade: z.coerce.date().optional(),
  imagens: z.array(z.string().url()).default([]),
  ativo: z.boolean().default(true),
});

export const ProdutoUpdateSchema = ProdutoCreateSchema.partial().omit({ sku: true });

export const ProdutoFilterSchema = z.object({
  search: z.string().optional(),
  categoriaId: z.string().optional(),
  ativo: z.boolean().optional(),
  stockBaixo: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  orderBy: z
    .enum(['nome', 'sku', 'createdAt', 'precoVenda', 'stockMinimo'])
    .default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ProdutoCreate = z.infer<typeof ProdutoCreateSchema>;
export type ProdutoUpdate = z.infer<typeof ProdutoUpdateSchema>;
export type ProdutoFilter = z.infer<typeof ProdutoFilterSchema>;

// ─── Variante de Produto ──────────────────────────────────────────────────────

export const VarianteProdutoCreateSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  nome: z.string().min(1).max(100),
  valor: z.string().min(1).max(100),
  precoAdicional: z.coerce.number().default(0),
});

export const VarianteProdutoUpdateSchema = VarianteProdutoCreateSchema.partial().omit({
  produtoId: true,
});

export type VarianteProdutoCreate = z.infer<typeof VarianteProdutoCreateSchema>;
export type VarianteProdutoUpdate = z.infer<typeof VarianteProdutoUpdateSchema>;
