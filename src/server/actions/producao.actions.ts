'use server';
import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import { prismaBase } from '@/server/db/client';
import {
  reservarStock,
  confirmarConsumoStock,
  libertarStock,
  entradaStock,
} from '@/server/services/inventario/stock.service';
import type { StockContratoA } from '@/server/services/pessoas-projetos/producao.interface';
import {
  CreateCentroTrabalhoSchema,
  UpdateCentroTrabalhoSchema,
  CreateEstruturaProdutoSchema,
  UpdateEstruturaProdutoSchema,
  FilterEstruturaProdutoSchema,
  CreateComponenteBOMSchema,
  CreateRoteiroSchema,
  UpdateRoteiroSchema,
  FilterRoteiroSchema,
  CreateOrdemProducaoSchema,
  UpdateOrdemProducaoSchema,
  FilterOrdemProducaoSchema,
  RegistarConsumoSchema,
  ExplodirBOMSchema,
} from '@/lib/validations/producao';
import {
  CentroTrabalhoService,
  EstruturaProdutoService,
  RoteiroService,
  OrdemProducaoService,
} from '@/server/services/pessoas-projetos/producao.service';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato real de stock — WS A (Wave 3)
// ─────────────────────────────────────────────────────────────────────────────

const stockService: StockContratoA = {
  reservarStock,
  confirmarConsumoStock,
  libertarStock,
  entradaStock,
};

// ─────────────────────────────────────────────────────────────────────────────
// Centro de Trabalho
// ─────────────────────────────────────────────────────────────────────────────

export const criarCentroTrabalhoAction = createSafeAction({
  schema: CreateCentroTrabalhoSchema,
  permission: 'producao:centros:create',
  revalidate: { tags: ['producao:centros'] },
  handler: (input, ctx) => CentroTrabalhoService.criar(input, ctx),
});

export const actualizarCentroTrabalhoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateCentroTrabalhoSchema }),
  permission: 'producao:centros:update',
  revalidate: { tags: ['producao:centros'] },
  handler: ({ id, data }, ctx) => CentroTrabalhoService.actualizar(id, data, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura de Produto (BOM)
// ─────────────────────────────────────────────────────────────────────────────

export const criarEstruturaProdutoAction = createSafeAction({
  schema: CreateEstruturaProdutoSchema,
  permission: 'producao:bom:create',
  revalidate: { tags: ['producao:bom'] },
  handler: (input, ctx) => EstruturaProdutoService.criar(input, ctx),
});

export const actualizarEstruturaProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateEstruturaProdutoSchema }),
  permission: 'producao:bom:update',
  revalidate: { tags: ['producao:bom'] },
  handler: ({ id, data }, ctx) => EstruturaProdutoService.actualizar(id, data, ctx),
});

export const adicionarComponenteBOMAction = createSafeAction({
  schema: z.object({ estruturaId: z.string().cuid(), componente: CreateComponenteBOMSchema }),
  permission: 'producao:bom:update',
  revalidate: { tags: ['producao:bom'] },
  handler: ({ estruturaId, componente }, ctx) =>
    EstruturaProdutoService.adicionarComponente(estruturaId, componente, ctx),
});

export const removerComponenteBOMAction = createSafeAction({
  schema: z.object({ componenteId: z.string().cuid() }),
  permission: 'producao:bom:update',
  revalidate: { tags: ['producao:bom'] },
  handler: ({ componenteId }, ctx) => EstruturaProdutoService.removerComponente(componenteId, ctx),
});

export const transitarStatusBOMAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'producao:bom:update',
  revalidate: { tags: ['producao:bom'] },
  handler: ({ id, novoStatus }, ctx) => EstruturaProdutoService.transitarStatus(id, novoStatus, ctx),
});

export const listarEstruturasProdutoAction = createSafeAction({
  schema: FilterEstruturaProdutoSchema,
  permission: 'producao:bom:read',
  handler: (filter, ctx) => EstruturaProdutoService.listar(filter, ctx),
});

export const explodirBOMAction = createSafeAction({
  schema: ExplodirBOMSchema,
  permission: 'producao:bom:read',
  handler: (input, ctx) => EstruturaProdutoService.explodir(input, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Roteiro
// ─────────────────────────────────────────────────────────────────────────────

export const criarRoteiroAction = createSafeAction({
  schema: CreateRoteiroSchema,
  permission: 'producao:roteiros:create',
  revalidate: { tags: ['producao:roteiros'] },
  handler: (input, ctx) => RoteiroService.criar(input, ctx),
});

export const actualizarRoteiroAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateRoteiroSchema }),
  permission: 'producao:roteiros:update',
  revalidate: { tags: ['producao:roteiros'] },
  handler: ({ id, data }, ctx) => RoteiroService.actualizar(id, data, ctx),
});

export const transitarStatusRoteiroAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'producao:roteiros:update',
  revalidate: { tags: ['producao:roteiros'] },
  handler: ({ id, novoStatus }, ctx) => RoteiroService.transitarStatus(id, novoStatus, ctx),
});

export const listarRoteirosAction = createSafeAction({
  schema: FilterRoteiroSchema,
  permission: 'producao:roteiros:read',
  handler: (filter, ctx) => RoteiroService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Ordem de Produção
// ─────────────────────────────────────────────────────────────────────────────

export const criarOrdemProducaoAction = createSafeAction({
  schema: CreateOrdemProducaoSchema,
  permission: 'producao:ordens:create',
  revalidate: { tags: ['producao:ordens'] },
  handler: (input, ctx) =>
    prismaBase.$transaction((tx) => OrdemProducaoService.criar(tx, input, ctx)),
});

export const actualizarOrdemProducaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateOrdemProducaoSchema }),
  permission: 'producao:ordens:update',
  revalidate: { tags: ['producao:ordens'] },
  handler: ({ id, data }, ctx) => OrdemProducaoService.actualizar(id, data, ctx),
});

export const transitarStatusOrdemProducaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'producao:ordens:update',
  revalidate: { tags: ['producao:ordens'] },
  handler: ({ id, novoStatus }, ctx) =>
    prismaBase.$transaction((tx) =>
      OrdemProducaoService.transitarStatus(tx, id, novoStatus, stockService, ctx),
    ),
});

export const registarConsumoOrdemAction = createSafeAction({
  schema: RegistarConsumoSchema,
  permission: 'producao:ordens:update',
  revalidate: { tags: ['producao:ordens'] },
  handler: (input, ctx) => OrdemProducaoService.registarConsumo(input, ctx),
});

export const transitarOperacaoOrdemAction = createSafeAction({
  schema: z.object({
    operacaoId: z.string().cuid(),
    novoStatus: z.string(),
    tempoRealizado: z.number().int().nonnegative(),
  }),
  permission: 'producao:ordens:update',
  revalidate: { tags: ['producao:ordens'] },
  handler: ({ operacaoId, novoStatus, tempoRealizado }, ctx) =>
    OrdemProducaoService.transitarOperacao(operacaoId, novoStatus, tempoRealizado, ctx),
});

export const listarOrdensProducaoAction = createSafeAction({
  schema: FilterOrdemProducaoSchema,
  permission: 'producao:ordens:read',
  handler: (filter, ctx) => OrdemProducaoService.listar(filter, ctx),
});
