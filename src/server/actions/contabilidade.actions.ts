'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  CriarContaPGCSchema,
  AtualizarContaPGCSchema,
  FiltroContaPGCSchema,
  CriarDiarioSchema,
  AtualizarDiarioSchema,
  CriarCentroCustoSchema,
  AtualizarCentroCustoSchema,
  FiltroCentroCustoSchema,
  CriarLancamentoSchema,
  EstornarLancamentoSchema,
  FiltroLancamentoSchema,
  CriarContaBancariaSchema,
  AtualizarContaBancariaSchema,
  IniciarReconciliacaoSchema,
  MarcarItemReconciliadoSchema,
  FiltroBalanceteSchema,
  FiltroRazaoSchema,
  FiltroDRESchema,
} from '@/lib/validations/contabilidade';
import * as contabilidade from '@/server/services/financas/contabilidade.service';
import { z } from 'zod';

// --- Plano de contas ---

export const criarContaPGC = createSafeAction({
  schema: CriarContaPGCSchema,
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.criarConta(input, ctx),
});

export const atualizarContaPGC = createSafeAction({
  schema: AtualizarContaPGCSchema,
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.atualizarConta(input, ctx),
});

export const desativarContaPGC = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.desativarConta(input.id, ctx),
});

export const listarContasPGC = createSafeAction({
  schema: FiltroContaPGCSchema,
  permission: 'financas:leitura',
  handler: (input, ctx) => contabilidade.listarContas(input, ctx),
});

export const arvoreContasPGC = createSafeAction({
  permission: 'financas:leitura',
  handler: (_, ctx) => contabilidade.arvoreContas(ctx),
});

// --- Diários ---

export const criarDiario = createSafeAction({
  schema: CriarDiarioSchema,
  permission: 'financas:diarios:escrita',
  revalidate: { tags: ['contabilidade', 'diarios'] },
  handler: (input, ctx) => contabilidade.criarDiario(input, ctx),
});

export const atualizarDiario = createSafeAction({
  schema: AtualizarDiarioSchema,
  permission: 'financas:diarios:escrita',
  revalidate: { tags: ['contabilidade', 'diarios'] },
  handler: (input, ctx) => contabilidade.atualizarDiario(input, ctx),
});

export const listarDiarios = createSafeAction({
  permission: 'financas:leitura',
  handler: (_, ctx) => contabilidade.listarDiarios(ctx),
});

// --- Centros de custo ---

export const criarCentroCusto = createSafeAction({
  schema: CriarCentroCustoSchema,
  permission: 'financas:centros-custo:escrita',
  revalidate: { tags: ['contabilidade', 'centros-custo'] },
  handler: (input, ctx) => contabilidade.criarCentroCusto(input, ctx),
});

export const atualizarCentroCusto = createSafeAction({
  schema: AtualizarCentroCustoSchema,
  permission: 'financas:centros-custo:escrita',
  revalidate: { tags: ['contabilidade', 'centros-custo'] },
  handler: (input, ctx) => contabilidade.atualizarCentroCusto(input, ctx),
});

export const listarCentrosCusto = createSafeAction({
  schema: FiltroCentroCustoSchema,
  permission: 'financas:leitura',
  handler: (input, ctx) => contabilidade.listarCentrosCusto(input, ctx),
});

// --- Lançamentos ---

export const criarLancamento = createSafeAction({
  schema: CriarLancamentoSchema,
  permission: 'financas:lancamentos:escrita',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.criarLancamento(input, ctx),
});

export const confirmarLancamento = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'financas:lancamentos:confirmar',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.confirmarLancamento(input.id, ctx),
});

export const estornarLancamento = createSafeAction({
  schema: EstornarLancamentoSchema,
  permission: 'financas:lancamentos:estornar',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.estornarLancamento(input, ctx),
});

export const listarLancamentos = createSafeAction({
  schema: FiltroLancamentoSchema,
  permission: 'financas:leitura',
  handler: (input, ctx) => contabilidade.listarLancamentos(input, ctx),
});

// --- Relatórios ---

export const gerarBalancete = createSafeAction({
  schema: FiltroBalanceteSchema,
  permission: 'financas:relatorios:leitura',
  handler: (input, ctx) => contabilidade.gerarBalancete(input, ctx),
});

export const razaoConta = createSafeAction({
  schema: FiltroRazaoSchema,
  permission: 'financas:relatorios:leitura',
  handler: (input, ctx) => contabilidade.razaoConta(input, ctx),
});

export const gerarDRE = createSafeAction({
  schema: FiltroDRESchema,
  permission: 'financas:relatorios:leitura',
  handler: (input, ctx) => contabilidade.gerarDRE(input, ctx),
});

// --- Banca ---

export const criarContaBancaria = createSafeAction({
  schema: CriarContaBancariaSchema,
  permission: 'financas:banca:escrita',
  revalidate: { tags: ['contabilidade', 'contas-bancarias'] },
  handler: (input, ctx) => contabilidade.criarContaBancaria(input, ctx),
});

export const atualizarContaBancaria = createSafeAction({
  schema: AtualizarContaBancariaSchema,
  permission: 'financas:banca:escrita',
  revalidate: { tags: ['contabilidade', 'contas-bancarias'] },
  handler: (input, ctx) => contabilidade.atualizarContaBancaria(input, ctx),
});

export const listarContasBancarias = createSafeAction({
  permission: 'financas:leitura',
  handler: (_, ctx) => contabilidade.listarContasBancarias(ctx),
});

export const iniciarReconciliacao = createSafeAction({
  schema: IniciarReconciliacaoSchema,
  permission: 'financas:banca:reconciliacao',
  revalidate: { tags: ['contabilidade', 'reconciliacao'] },
  handler: (input, ctx) => contabilidade.iniciarReconciliacao(input, ctx),
});

export const marcarItemReconciliado = createSafeAction({
  schema: MarcarItemReconciliadoSchema,
  permission: 'financas:banca:reconciliacao',
  revalidate: { tags: ['contabilidade', 'reconciliacao'] },
  handler: (input, ctx) => contabilidade.marcarItemReconciliado(input, ctx),
});

export const concluirReconciliacao = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'financas:banca:reconciliacao',
  revalidate: { tags: ['contabilidade', 'reconciliacao'] },
  handler: (input, ctx) => contabilidade.concluirReconciliacao(input.id, ctx),
});
