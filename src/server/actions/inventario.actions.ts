'use server';
// Actions de Inventário (WS A — Wave 2)
// Mutações via createSafeAction; revalidate declarado por recurso.
import { prisma } from '@/server/db/client';
import { createSafeAction } from '@/server/safe-action';
import {
  AtivoCreateSchema,
  AtivoUpdateSchema,
  CategoriaAtivoCreateSchema,
  CategoriaAtivoUpdateSchema,
  DocumentoAtivoCreateSchema,
  GerarPlanoAmortizacaoSchema,
  InventarioFisicoCreateSchema,
  InventarioFisicoUpdateSchema,
  JustificarDiscrepanciaSchema,
  ManutencaoAtivoCreateSchema,
  ManutencaoAtivoUpdateSchema,
  MovimentacaoAtivoCreateSchema,
  RegistarContagemSchema,
  TransicaoInventarioFisicoSchema,
  TransicaoManutencaoAtivoSchema,
} from '@/lib/validations/inventario-ativos';
import {
  BaixaStockSchema,
  EntradaStockSchema,
  LocalizacaoCreateSchema,
  LocalizacaoUpdateSchema,
  ReservaStockSchema,
  TransferenciaStockSchema,
} from '@/lib/validations/stock';
import {
  CategoriaProdutoCreateSchema,
  CategoriaProdutoUpdateSchema,
  ProdutoCreateSchema,
  ProdutoUpdateSchema,
  VarianteProdutoCreateSchema,
  VarianteProdutoUpdateSchema,
} from '@/lib/validations/produtos';
import { z } from 'zod';
import { amortizacaoService } from '@/server/services/inventario/amortizacao.service';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { inventarioFisicoService } from '@/server/services/inventario/inventario-fisico.service';
import { manutencaoService } from '@/server/services/inventario/manutencao.service';
import { stockService } from '@/server/services/inventario/stock.service';

// ─── Catálogo de Produtos ─────────────────────────────────────────────────────

export const criarCategoriaProdutoAction = createSafeAction({
  schema: CategoriaProdutoCreateSchema,
  permission: 'produtos:write',
  revalidate: { tags: ['categorias-produto'] },
  handler: (data, ctx) => catalogoProdutoService.criarCategoria(data, ctx),
});

export const actualizarCategoriaProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: CategoriaProdutoUpdateSchema }),
  permission: 'produtos:write',
  revalidate: { tags: ['categorias-produto'] },
  handler: ({ id, data }, ctx) => catalogoProdutoService.actualizarCategoria(id, data, ctx),
});

export const arquivarCategoriaProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'produtos:write',
  revalidate: { tags: ['categorias-produto'] },
  handler: ({ id }, ctx) => catalogoProdutoService.arquivarCategoria(id, ctx),
});

export const criarProdutoAction = createSafeAction({
  schema: ProdutoCreateSchema,
  permission: 'produtos:write',
  revalidate: { tags: ['produtos'] },
  handler: (data, ctx) => catalogoProdutoService.criarProduto(data, ctx),
});

export const actualizarProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: ProdutoUpdateSchema }),
  permission: 'produtos:write',
  revalidate: { tags: ['produtos'] },
  handler: ({ id, data }, ctx) => catalogoProdutoService.actualizarProduto(id, data, ctx),
});

export const arquivarProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'produtos:write',
  revalidate: { tags: ['produtos'] },
  handler: ({ id }, ctx) => catalogoProdutoService.arquivarProduto(id, ctx),
});

export const criarVarianteProdutoAction = createSafeAction({
  schema: VarianteProdutoCreateSchema,
  permission: 'produtos:write',
  revalidate: { tags: ['produtos'] },
  handler: (data, ctx) => catalogoProdutoService.criarVariante(data, ctx),
});

export const actualizarVarianteProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: VarianteProdutoUpdateSchema }),
  permission: 'produtos:write',
  revalidate: { tags: ['produtos'] },
  handler: ({ id, data }, ctx) => catalogoProdutoService.actualizarVariante(id, data, ctx),
});

export const removerVarianteProdutoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'produtos:write',
  revalidate: { tags: ['produtos'] },
  handler: ({ id }, ctx) => catalogoProdutoService.removerVariante(id, ctx),
});

// ─── Localizações ─────────────────────────────────────────────────────────────

export const criarLocalizacaoAction = createSafeAction({
  schema: LocalizacaoCreateSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['localizacoes'] },
  handler: (data, ctx) => stockService.criarLocalizacao(data, ctx),
});

export const actualizarLocalizacaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: LocalizacaoUpdateSchema }),
  permission: 'inventario:write',
  revalidate: { tags: ['localizacoes'] },
  handler: ({ id, data }, ctx) => stockService.actualizarLocalizacao(id, data, ctx),
});

export const desactivarLocalizacaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'inventario:write',
  revalidate: { tags: ['localizacoes'] },
  handler: ({ id }, ctx) => stockService.desactivarLocalizacao(id, ctx),
});

// ─── Stock (directo da UI — apenas cases não-transaccionais) ──────────────────
// Os contratos transaccionais (entradaStock, baixarStock, reservarStock, confirmarConsumo,
// libertarStock) são chamados pelos WS B/C/E dentro das suas $transaction, não da UI.
// Esta action de entrada directa é para operações ad-hoc (ex.: ajuste manual de stock).

export const registarEntradaStockAction = createSafeAction({
  schema: EntradaStockSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['stock'] },
  handler: (data, ctx) =>
    prisma.$transaction((_tx) => stockService.entradaStock(_tx as never, data, ctx)),
});

export const registarBaixaStockAction = createSafeAction({
  schema: BaixaStockSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['stock'] },
  handler: (data, ctx) =>
    prisma.$transaction((_tx) => stockService.baixarStock(_tx as never, data, ctx)),
});

export const registarTransferenciaStockAction = createSafeAction({
  schema: TransferenciaStockSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['stock'] },
  handler: (data, ctx) => stockService.registarTransferencia(data, ctx),
});

// ─── Ativos ───────────────────────────────────────────────────────────────────

export const criarCategoriaAtivoAction = createSafeAction({
  schema: CategoriaAtivoCreateSchema,
  permission: 'ativos:write',
  revalidate: { tags: ['categorias-ativo'] },
  handler: (data, ctx) => ativosService.criarCategoria(data, ctx),
});

export const actualizarCategoriaAtivoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: CategoriaAtivoUpdateSchema }),
  permission: 'ativos:write',
  revalidate: { tags: ['categorias-ativo'] },
  handler: ({ id, data }, ctx) => ativosService.actualizarCategoria(id, data, ctx),
});

export const criarAtivoAction = createSafeAction({
  schema: AtivoCreateSchema,
  permission: 'ativos:write',
  revalidate: { tags: ['ativos'] },
  handler: (data, ctx) => ativosService.criarAtivo(data, ctx),
});

export const actualizarAtivoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: AtivoUpdateSchema }),
  permission: 'ativos:write',
  revalidate: { tags: ['ativos'] },
  handler: ({ id, data }, ctx) => ativosService.actualizarAtivo(id, data, ctx),
});

export const transitarEstadoAtivoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    novoEstado: z.string(),
    observacoes: z.string().optional(),
  }),
  permission: 'ativos:write',
  revalidate: { tags: ['ativos'] },
  handler: ({ id, novoEstado, observacoes }, ctx) =>
    ativosService.transitarEstado(id, novoEstado, ctx, { observacoes }),
});

export const arquivarAtivoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'ativos:write',
  revalidate: { tags: ['ativos'] },
  handler: ({ id }, ctx) => ativosService.arquivarAtivo(id, ctx),
});

export const adicionarDocumentoAtivoAction = createSafeAction({
  schema: DocumentoAtivoCreateSchema,
  permission: 'ativos:write',
  revalidate: { tags: ['ativos'] },
  handler: (data, ctx) => ativosService.adicionarDocumento(data, ctx),
});

export const removerDocumentoAtivoAction = createSafeAction({
  schema: z.object({ documentoId: z.string().cuid() }),
  permission: 'ativos:write',
  revalidate: { tags: ['ativos'] },
  handler: ({ documentoId }, ctx) => ativosService.removerDocumento(documentoId, ctx),
});

export const registarMovimentacaoAtivoAction = createSafeAction({
  schema: MovimentacaoAtivoCreateSchema,
  permission: 'ativos:write',
  revalidate: { tags: ['ativos', 'movimentacoes-ativo'] },
  handler: (data, ctx) => ativosService.registarMovimentacao(data, ctx),
});

export const confirmarMovimentacaoAtivoAction = createSafeAction({
  schema: z.object({ movimentacaoId: z.string().cuid(), confirmadaPor: z.string() }),
  permission: 'ativos:write',
  revalidate: { tags: ['movimentacoes-ativo'] },
  handler: ({ movimentacaoId, confirmadaPor }, ctx) =>
    ativosService.confirmarMovimentacao(movimentacaoId, confirmadaPor, ctx),
});

// ─── Manutenção ───────────────────────────────────────────────────────────────

export const criarManutencaoAction = createSafeAction({
  schema: ManutencaoAtivoCreateSchema,
  permission: 'ativos:write',
  revalidate: { tags: ['manutencoes'] },
  handler: (data, ctx) => manutencaoService.criarManutencao(data, ctx),
});

export const actualizarManutencaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: ManutencaoAtivoUpdateSchema }),
  permission: 'ativos:write',
  revalidate: { tags: ['manutencoes'] },
  handler: ({ id, data }, ctx) => manutencaoService.actualizarManutencao(id, data, ctx),
});

export const transitarStatusManutencaoAction = createSafeAction({
  schema: TransicaoManutencaoAtivoSchema,
  permission: 'ativos:write',
  revalidate: { tags: ['manutencoes', 'ativos'] },
  handler: (data, ctx) => manutencaoService.transitarStatus(data, ctx),
});

// ─── Amortização ──────────────────────────────────────────────────────────────

export const calcularPlanoAmortizacaoAction = createSafeAction({
  schema: GerarPlanoAmortizacaoSchema,
  permission: 'ativos:read',
  handler: (data, ctx) => amortizacaoService.calcularPlano(data, ctx),
});

export const processarAmortizacaoMensalAction = createSafeAction({
  schema: z.object({ ativoId: z.string().cuid(), ano: z.number().int(), mes: z.number().int().min(1).max(12) }),
  permission: 'ativos:admin',
  revalidate: { tags: ['amortizacoes'] },
  handler: ({ ativoId, ano, mes }, ctx) =>
    amortizacaoService.processarAmortizacaoMensal(ativoId, ano, mes, ctx),
});

export const processarAmortizacaoTenantAction = createSafeAction({
  schema: z.object({ ano: z.number().int(), mes: z.number().int().min(1).max(12) }),
  permission: 'ativos:admin',
  revalidate: { tags: ['amortizacoes'] },
  handler: ({ ano, mes }, ctx) => amortizacaoService.processarAmortizacaoTenant(ano, mes, ctx),
});

export const registarAbateAtivoAction = createSafeAction({
  schema: z.object({
    ativoId: z.string().cuid(),
    motivo: z.string().min(1),
    valorRealizado: z.number().nonnegative().optional(),
  }),
  permission: 'ativos:admin',
  revalidate: { tags: ['ativos', 'amortizacoes'] },
  handler: ({ ativoId, motivo, valorRealizado }, ctx) =>
    amortizacaoService.registarAbate(ativoId, { motivo, valorRealizado }, ctx),
});

// ─── Inventário Físico ────────────────────────────────────────────────────────

export const criarInventarioFisicoAction = createSafeAction({
  schema: InventarioFisicoCreateSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['inventarios-fisicos'] },
  handler: (data, ctx) => inventarioFisicoService.criarInventario(data, ctx),
});

export const actualizarInventarioFisicoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: InventarioFisicoUpdateSchema }),
  permission: 'inventario:write',
  revalidate: { tags: ['inventarios-fisicos'] },
  handler: ({ id, data }, ctx) => inventarioFisicoService.actualizarInventario(id, data, ctx),
});

export const transitarStatusInventarioFisicoAction = createSafeAction({
  schema: TransicaoInventarioFisicoSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['inventarios-fisicos'] },
  handler: (data, ctx) => inventarioFisicoService.transitarStatus(data, ctx),
});

export const adicionarMembroInventarioAction = createSafeAction({
  schema: z.object({
    inventarioId: z.string().cuid(),
    userId: z.string(),
    localizacoesAtribuidas: z.array(z.string()).default([]),
  }),
  permission: 'inventario:write',
  revalidate: { tags: ['inventarios-fisicos'] },
  handler: ({ inventarioId, userId, localizacoesAtribuidas }, ctx) =>
    inventarioFisicoService.adicionarMembro(inventarioId, userId, localizacoesAtribuidas, ctx),
});

export const registarContagemAction = createSafeAction({
  schema: RegistarContagemSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['inventarios-fisicos'] },
  handler: (data, ctx) => inventarioFisicoService.registarContagem(data, ctx),
});

export const justificarDiscrepanciaAction = createSafeAction({
  schema: JustificarDiscrepanciaSchema,
  permission: 'inventario:write',
  revalidate: { tags: ['inventarios-fisicos'] },
  handler: (data, ctx) => inventarioFisicoService.justificarDiscrepancia(data, ctx),
});

export const reconciliarInventarioAction = createSafeAction({
  schema: z.object({ inventarioId: z.string().cuid() }),
  permission: 'inventario:admin',
  revalidate: { tags: ['inventarios-fisicos', 'ativos'] },
  handler: ({ inventarioId }, ctx) => inventarioFisicoService.reconciliar(inventarioId, ctx),
});

// ─── Contagem de Stock (Spec 05) ──────────────────────────────────────────────

import { contagemStockService } from '@/server/services/inventario/contagem-stock.service';
import {
  AbrirContagemSchema,
  CancelarContagemSchema,
  ConcluirContagemSchema,
  JustificarItemSchema,
  ReconciliarSchema,
  RegistarItemSchema,
} from '@/lib/validations/inventario-contagem';

export const abrirContagemAction = createSafeAction({
  schema: AbrirContagemSchema,
  permission: 'inventario:contagens:abrir',
  revalidate: { tags: ['contagens-stock'], paths: ['/inventario/contagens'] },
  handler: (data, ctx) => contagemStockService.abrirContagem(data, ctx),
});

export const registarContagemItemAction = createSafeAction({
  schema: RegistarItemSchema,
  permission: 'inventario:contagens:registar',
  revalidate: { tags: ['contagens-stock'] },
  handler: (data, ctx) => contagemStockService.registarContagemItem(data, ctx),
});

export const justificarItemContagemAction = createSafeAction({
  schema: JustificarItemSchema,
  permission: 'inventario:contagens:justificar',
  revalidate: { tags: ['contagens-stock'] },
  handler: (data, ctx) => contagemStockService.justificar(data, ctx),
});

export const reconciliarContagemAction = createSafeAction({
  schema: ReconciliarSchema,
  permission: 'inventario:contagens:reconciliar',
  revalidate: { tags: ['contagens-stock', 'movimentos-stock'], paths: ['/inventario/contagens'] },
  handler: ({ contagemId, aprovadoPorId, limiarDiscrepanciaPct, gerarLancamentoContabilistico, contaExistenciasCodigo, contaVariacaoCodigo }, ctx) =>
    contagemStockService.reconciliar(
      contagemId,
      { aprovadoPorId, limiarDiscrepanciaPct, gerarLancamentoContabilistico, contaExistenciasCodigo, contaVariacaoCodigo },
      ctx,
    ),
});

export const concluirContagemAction = createSafeAction({
  schema: ConcluirContagemSchema,
  permission: 'inventario:contagens:concluir',
  revalidate: { tags: ['contagens-stock'], paths: ['/inventario/contagens'] },
  handler: ({ contagemId, observacoes }, ctx) =>
    contagemStockService.concluir(contagemId, observacoes, ctx),
});

export const cancelarContagemAction = createSafeAction({
  schema: CancelarContagemSchema,
  permission: 'inventario:contagens:cancelar',
  revalidate: { tags: ['contagens-stock'], paths: ['/inventario/contagens'] },
  handler: ({ contagemId, motivo }, ctx) =>
    contagemStockService.cancelar(contagemId, motivo, ctx),
});
