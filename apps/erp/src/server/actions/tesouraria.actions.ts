'use server';
/**
 * Server Actions do módulo de Tesouraria (spec 22 · WS-1 · task 6.2).
 *
 * Todas via `createSafeAction` — o retorno é sempre `ActionResult<T>` já
 * serializado (`Prisma.Decimal` → string); nunca se lança para o cliente.
 *
 * As três consultas declaram `permiteEmLeitura: true` (ADR-0032): em modo de
 * Leitura o cliente continua a ver a projecção e os compromissos que são
 * dele. As três mutações declaram `revalidate` com os caminhos CONCRETOS
 * (`/tesouraria`, `/tesouraria/compromissos`) mais a tag
 * `financas:tesouraria` (task 7.0, arbitrada): o `createSafeAction` chama
 * `revalidatePath(p)` sem `type` e o Next só casa segmento dinâmico com
 * `type: 'page'` — um literal `[id]` nunca revalidaria nada (issue #68).
 * A página de detalhe re-renderiza por ser Server Component sem `use cache`.
 */
import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import { idEntidade } from '@/lib/validations/common';
import {
  AtualizarCompromissoSchema,
  CriarCompromissoSchema,
  EliminarCompromissoSchema,
  FiltroCompromissoSchema,
  FiltroProjecaoSchema,
} from '@/lib/validations/tesouraria';
import * as projecao from '@/server/services/financas/projecao.service';

const ObterCompromissoSchema = z.object({
  id: idEntidade('ID de compromisso inválido'),
});

// ---------------------------------------------------------------------------
// Consultas — passam em modo de Leitura
// ---------------------------------------------------------------------------

export const projetarTesourariaAction = createSafeAction({
  schema: FiltroProjecaoSchema,
  permission: 'financas:tesouraria:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => projecao.projetarTesouraria(input, ctx),
});

export const listarCompromissosAction = createSafeAction({
  schema: FiltroCompromissoSchema,
  permission: 'financas:tesouraria:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => projecao.listarCompromissos(input, ctx),
});

export const obterCompromissoAction = createSafeAction({
  schema: ObterCompromissoSchema,
  permission: 'financas:tesouraria:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => projecao.obterCompromisso(input.id, ctx),
});

// ---------------------------------------------------------------------------
// Mutações — recusadas em modo de Leitura (omissão do permiteEmLeitura)
// ---------------------------------------------------------------------------

export const criarCompromissoAction = createSafeAction({
  schema: CriarCompromissoSchema,
  permission: 'financas:tesouraria:escrita',
  revalidate: {
    paths: ['/tesouraria', '/tesouraria/compromissos'],
    tags: ['financas:tesouraria'],
  },
  handler: (input, ctx) => projecao.criarCompromisso(input, ctx),
});

export const atualizarCompromissoAction = createSafeAction({
  schema: AtualizarCompromissoSchema,
  permission: 'financas:tesouraria:escrita',
  revalidate: {
    paths: ['/tesouraria', '/tesouraria/compromissos'],
    tags: ['financas:tesouraria'],
  },
  handler: (input, ctx) => projecao.atualizarCompromisso(input, ctx),
});

export const eliminarCompromissoAction = createSafeAction({
  schema: EliminarCompromissoSchema,
  permission: 'financas:tesouraria:escrita',
  revalidate: {
    paths: ['/tesouraria', '/tesouraria/compromissos'],
    tags: ['financas:tesouraria'],
  },
  handler: (input, ctx) => projecao.eliminarCompromisso(input.id, ctx),
});
