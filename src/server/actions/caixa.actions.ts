'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  AbrirSessaoCaixaSchema,
  FecharSessaoCaixaSchema,
  SangriaSchema,
  ReforcoSchema,
  FiltroSessaoCaixaSchema,
  FiltroMovimentoCaixaSchema,
} from '@/lib/validations/caixa';
import * as caixa from '@/server/services/financas/caixa.service';
import { z } from 'zod';

export const abrirSessaoCaixa = createSafeAction({
  schema: AbrirSessaoCaixaSchema,
  permission: 'caixa:abertura',
  revalidate: { tags: ['caixa'] },
  handler: (input, ctx) => caixa.abrirSessao(input, ctx),
});

export const fecharSessaoCaixa = createSafeAction({
  schema: FecharSessaoCaixaSchema,
  permission: 'caixa:fecho',
  revalidate: { tags: ['caixa'] },
  handler: (input, ctx) => caixa.fecharSessao(input, ctx),
});

export const cancelarSessaoCaixa = createSafeAction({
  schema: z.object({ sessaoCaixaId: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'caixa:cancelar',
  revalidate: { tags: ['caixa'] },
  handler: (input, ctx) => caixa.cancelarSessao(input.sessaoCaixaId, input.motivo, ctx),
});

export const registarSangria = createSafeAction({
  schema: SangriaSchema,
  permission: 'caixa:sangria',
  revalidate: { tags: ['caixa'] },
  handler: (input, ctx) => caixa.registarSangria(input, ctx),
});

export const registarReforco = createSafeAction({
  schema: ReforcoSchema,
  permission: 'caixa:reforco',
  revalidate: { tags: ['caixa'] },
  handler: (input, ctx) => caixa.registarReforco(input, ctx),
});

export const obterSessaoAtual = createSafeAction({
  permission: 'caixa:leitura',
  handler: (_, ctx) => caixa.obterSessaoAtual(ctx),
});

export const obterSessaoCaixa = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'caixa:leitura',
  handler: (input, ctx) => caixa.obterSessao(input.id, ctx),
});

export const listarSessoesCaixa = createSafeAction({
  schema: FiltroSessaoCaixaSchema,
  permission: 'caixa:leitura',
  handler: (input, ctx) => caixa.listarSessoes(input, ctx),
});

export const listarMovimentosCaixa = createSafeAction({
  schema: FiltroMovimentoCaixaSchema,
  permission: 'caixa:leitura',
  handler: (input, ctx) => caixa.listarMovimentos(input, ctx),
});

export const obterResumoCaixa = createSafeAction({
  schema: z.object({ sessaoCaixaId: z.string().cuid() }),
  permission: 'caixa:leitura',
  handler: (input, ctx) => caixa.resumoSessao(input.sessaoCaixaId, ctx),
});
