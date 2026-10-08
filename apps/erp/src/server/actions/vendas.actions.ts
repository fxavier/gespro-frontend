'use server';
/**
 * Server Actions — Vendas + POS + Encomendas + Devoluções + Trocas + Vendedores (WS C + WS-10)
 */
import { createSafeAction } from '@/server/safe-action';
import { BusinessRuleError } from '@/lib/errors';
import {
  vendaService,
  sessaoPOSService,
  encomendaService,
  devolucaoService,
  trocaService,
  vendedorService,
} from '@/server/services/comercial/index';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import {
  CreateVendaSchema,
  UpdateVendaSchema,
  TransitarVendaSchema,
  AnularVendaSchema,
  AbrirSessaoPOSSchema,
  FecharSessaoPOSSchema,
  CreateEncomendaSchema,
  UpdateEncomendaSchema,
  TransitarEncomendaSchema,
  ConfirmarEncomendaSchema,
  ConverterEncomendaEmVendaSchema,
  CreateDevolucaoSchema,
  CreateTrocaSchema,
  CreateVendedorSchema,
  UpdateVendedorSchema,
} from '@/lib/validations/vendas';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

export const criarVenda = createSafeAction({
  schema: CreateVendaSchema,
  permission: 'vendas:criar',
  revalidate: {
    paths: ['/vendas'],
    tags: ['vendas'],
  },
  handler: async (input, ctx) => {
    return vendaService.criar(input, ctx);
  },
});

export const atualizarVenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateVendaSchema,
  }),
  permission: 'vendas:editar',
  revalidate: {
    tags: ['vendas'],
  },
  handler: async ({ id, data }, ctx) => {
    return vendaService.atualizar(id, data, ctx);
  },
});

export const transitarVendaAction = createSafeAction({
  schema: TransitarVendaSchema,
  permission: 'vendas:editar',
  revalidate: {
    tags: ['vendas'],
  },
  handler: async (input, ctx) => {
    return vendaService.transitar(input, ctx);
  },
});

export const cancelarVenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    motivo: z.string().max(500).optional(),
  }),
  permission: 'vendas:cancelar',
  revalidate: {
    paths: ['/vendas'],
    tags: ['vendas'],
  },
  handler: async ({ id, motivo }, ctx) => {
    return vendaService.transitar({ vendaId: id, paraStatus: 'CANCELADA', motivo }, ctx);
  },
});

/**
 * Anular uma venda POS paga por nota de crédito (ADR-0041 §8). A permissão é a de cancelar
 * vendas; a devolução mexe em caixa/banca, por isso exige ainda as mesmas permissões que a
 * liquidação da NC por devolução (`liquidarNotaCredito`): `caixa:operar` para a parte em
 * dinheiro e `financas:banca:escrita` para a parte bancária.
 */
export const anularVenda = createSafeAction({
  schema: AnularVendaSchema,
  permission: 'vendas:cancelar',
  revalidate: {
    paths: ['/vendas', '/vendas/notas-credito'],
    tags: ['vendas', 'faturacao'],
  },
  handler: async ({ vendaId, motivo }, ctx) => {
    const venda = await vendaService.buscarPorId(vendaId, ctx);
    const meios = new Set((venda.pagamentos ?? []).map((p) => p.tipo));
    if (meios.has('DINHEIRO') && !ctx.permissions.has('caixa:operar')) {
      throw new BusinessRuleError(
        'MEIO_PAGAMENTO_SEM_PERMISSAO',
        'Não tem permissão para operar o caixa: a devolução em dinheiro não é possível.',
      );
    }
    const bancarios = [...meios].some((m) => m !== 'DINHEIRO' && m !== 'CREDITO');
    if (bancarios && !ctx.permissions.has('financas:banca:escrita')) {
      throw new BusinessRuleError(
        'MEIO_PAGAMENTO_SEM_PERMISSAO',
        'Não tem permissão para movimentar contas bancárias: a devolução por cartão ou carteira móvel não é possível.',
      );
    }
    return vendaService.anular(vendaId, { motivo }, { tenantId: ctx.tenantId, userId: ctx.userId });
  },
});

// ---------------------------------------------------------------------------
// POS
// ---------------------------------------------------------------------------

export const abrirSessaoPOS = createSafeAction({
  schema: AbrirSessaoPOSSchema,
  permission: 'pos:operar',
  revalidate: {
    tags: ['sessao-pos'],
  },
  handler: async (input, ctx) => {
    return sessaoPOSService.abrir(input, ctx);
  },
});

export const fecharSessaoPOS = createSafeAction({
  schema: FecharSessaoPOSSchema,
  permission: 'pos:operar',
  revalidate: {
    paths: ['/pos'],
    tags: ['sessao-pos'],
  },
  handler: async (input, ctx) => {
    return sessaoPOSService.fechar(input, ctx);
  },
});

export const suspenderSessaoPOS = createSafeAction({
  schema: z.object({ sessaoPOSId: z.string().cuid() }),
  permission: 'pos:operar',
  revalidate: {
    tags: ['sessao-pos'],
  },
  handler: async ({ sessaoPOSId }, ctx) => {
    return sessaoPOSService.suspender(sessaoPOSId, ctx);
  },
});

export const retomarSessaoPOS = createSafeAction({
  schema: z.object({ sessaoPOSId: z.string().cuid() }),
  permission: 'pos:operar',
  revalidate: {
    tags: ['sessao-pos'],
  },
  handler: async ({ sessaoPOSId }, ctx) => {
    return sessaoPOSService.retomar(sessaoPOSId, ctx);
  },
});

// ---------------------------------------------------------------------------
// Encomendas (WS-10)
// ---------------------------------------------------------------------------

/**
 * Pesquisas para as caixas de selecção dos formulários de venda.
 *
 * São leituras, mas passam pelo pipeline de action porque quem as chama é um
 * Client Component — o termo vem do que o utilizador escreve. Devolvem poucos
 * campos de propósito: é o que a caixa mostra, nada mais.
 */
export const procurarVendedores = createSafeAction({
  schema: z.object({ q: z.string().max(200).optional() }),
  permission: 'vendas:vendedores:ver',
  permiteEmLeitura: true,
  handler: async ({ q }, ctx) => {
    const pagina = await vendedorService.listar(
      { q, status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' },
      ctx,
    );
    return pagina.items.map((v) => ({ id: v.id, nome: v.nome }));
  },
});

export const procurarProdutos = createSafeAction({
  schema: z.object({ q: z.string().max(200).optional() }),
  permission: 'produtos:ver',
  permiteEmLeitura: true,
  handler: async ({ q }, ctx) => {
    const pagina = await listarProdutos(
      { search: q, ativo: true, take: 20, orderBy: 'nome', orderDir: 'asc' },
      ctx,
    );
    // `precoVenda` já vem serializado em string pelo serviço (ADR A9).
    return pagina.items.map((p) => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      precoVenda: p.precoVenda,
      taxaIva: p.taxaIva,
    }));
  },
});

export const criarEncomenda = createSafeAction({
  schema: CreateEncomendaSchema,
  permission: 'vendas:encomendas:criar',
  revalidate: {
    paths: ['/vendas/pedidos'],
    tags: ['encomendas'],
  },
  handler: async (input, ctx) => {
    return encomendaService.criar(input, ctx);
  },
});

export const atualizarEncomenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateEncomendaSchema,
  }),
  permission: 'vendas:encomendas:editar',
  revalidate: {
    tags: ['encomendas'],
    paths: ['/vendas/pedidos'],
  },
  handler: async ({ id, data }, ctx) => {
    return encomendaService.atualizar(id, data, ctx);
  },
});

export const transitarEncomenda = createSafeAction({
  schema: TransitarEncomendaSchema,
  permission: 'vendas:encomendas:confirmar',
  revalidate: {
    tags: ['encomendas'],
  },
  handler: async (input, ctx) => {
    return encomendaService.transitar(input, ctx);
  },
});

/** RASCUNHO → CONFIRMADA, reservando o stock na localização escolhida (#129). */
export const confirmarEncomenda = createSafeAction({
  schema: ConfirmarEncomendaSchema,
  permission: 'vendas:encomendas:confirmar',
  revalidate: {
    paths: ['/vendas/pedidos'],
    tags: ['encomendas'],
  },
  handler: async ({ encomendaId, localizacaoId }, ctx) => {
    return encomendaService.transitar({ encomendaId, paraStatus: 'CONFIRMADA', localizacaoId }, ctx);
  },
});

/**
 * Converter a partir do detalhe (#129): um pagamento a CRÉDITO pelo total da encomenda, sem
 * sessão de caixa — bate com o D 411 que o serviço lança sempre. O total lê-se no servidor.
 */
export const converterEncomendaEmVendaACredito = createSafeAction({
  schema: z.object({ encomendaId: z.string().cuid('ID de encomenda inválido') }),
  permission: 'vendas:encomendas:converter',
  revalidate: {
    paths: ['/vendas/pedidos', '/vendas'],
    tags: ['encomendas', 'vendas'],
  },
  handler: async ({ encomendaId }, ctx) => {
    const encomenda = await encomendaService.obter(encomendaId, ctx);
    return encomendaService.converterEmVenda(
      encomendaId,
      [{ tipo: 'CREDITO', valor: Number(encomenda.total) }],
      ctx,
    );
  },
});

export const converterEncomendaEmVenda = createSafeAction({
  schema: ConverterEncomendaEmVendaSchema,
  permission: 'vendas:encomendas:converter',
  revalidate: {
    paths: ['/vendas/pedidos', '/vendas'],
    tags: ['encomendas', 'vendas'],
  },
  handler: async ({ encomendaId, pagamentos, sessaoCaixaId, localizacaoId }, ctx) => {
    return encomendaService.converterEmVenda(
      encomendaId,
      pagamentos,
      ctx,
      { sessaoCaixaId, localizacaoId },
    );
  },
});

export const cancelarEncomenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    localizacaoId: z.string().cuid().optional(),
  }),
  permission: 'vendas:encomendas:cancelar',
  revalidate: {
    paths: ['/vendas/pedidos'],
    tags: ['encomendas'],
  },
  handler: async ({ id, localizacaoId }, ctx) => {
    return encomendaService.transitar(
      { encomendaId: id, paraStatus: 'CANCELADA', localizacaoId },
      ctx,
    );
  },
});

// ---------------------------------------------------------------------------
// Devoluções (WS-10)
// ---------------------------------------------------------------------------

export const criarDevolucao = createSafeAction({
  schema: CreateDevolucaoSchema,
  permission: 'vendas:devolucoes:criar',
  revalidate: {
    paths: ['/vendas/devolucoes'],
    tags: ['devolucoes'],
  },
  handler: async (input, ctx) => {
    return devolucaoService.criar(input, ctx);
  },
});

export const aprovarDevolucao = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID inválido') }),
  permission: 'vendas:devolucoes:aprovar',
  revalidate: {
    tags: ['devolucoes'],
  },
  handler: async ({ id }, ctx) => {
    return devolucaoService.aprovar(id, ctx);
  },
});

export const processarDevolucao = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    localizacaoId: z.string().cuid().optional(),
    sessaoCaixaId: z.string().cuid().optional(),
    serieNotaCreditoId: z.string().cuid().optional(),
  }),
  permission: 'vendas:devolucoes:processar',
  revalidate: {
    paths: ['/vendas/devolucoes'],
    tags: ['devolucoes'],
  },
  handler: async ({ id, localizacaoId, sessaoCaixaId, serieNotaCreditoId }, ctx) => {
    return devolucaoService.processar(id, ctx, {
      localizacaoId,
      sessaoCaixaId,
      serieNotaCreditoId,
    });
  },
});

export const rejeitarDevolucao = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID inválido') }),
  permission: 'vendas:devolucoes:rejeitar',
  revalidate: {
    tags: ['devolucoes'],
  },
  handler: async ({ id }, ctx) => {
    return devolucaoService.rejeitar(id, ctx);
  },
});

// ---------------------------------------------------------------------------
// Trocas (WS-10)
// ---------------------------------------------------------------------------

export const criarTroca = createSafeAction({
  schema: CreateTrocaSchema,
  permission: 'vendas:trocas:criar',
  revalidate: {
    paths: ['/vendas/trocas', '/vendas/devolucoes'],
    tags: ['trocas', 'devolucoes'],
  },
  handler: async (input, ctx) => {
    return trocaService.criar(input, ctx);
  },
});

// ---------------------------------------------------------------------------
// Vendedores (WS-10)
// ---------------------------------------------------------------------------

export const criarVendedor = createSafeAction({
  schema: CreateVendedorSchema,
  permission: 'vendas:vendedores:criar',
  revalidate: {
    paths: ['/vendas/vendedores'],
    tags: ['vendedores'],
  },
  handler: async (input, ctx) => {
    return vendedorService.criar(input, ctx);
  },
});

export const atualizarVendedor = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateVendedorSchema,
  }),
  permission: 'vendas:vendedores:editar',
  revalidate: {
    tags: ['vendedores'],
  },
  handler: async ({ id, data }, ctx) => {
    return vendedorService.atualizar(id, data, ctx);
  },
});

export const excluirVendedor = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID inválido') }),
  permission: 'vendas:vendedores:excluir',
  revalidate: {
    paths: ['/vendas/vendedores'],
    tags: ['vendedores'],
  },
  handler: async ({ id }, ctx) => {
    return vendedorService.excluir(id, ctx);
  },
});
