/**
 * Server Actions de Transporte & Logística — WS F (Wave 2)
 * Mutações de Viatura, Motorista, Atividade, Rota, Entrega e Abastecimento.
 *
 * Padrão: createSafeAction({ schema, permission, revalidate, handler })
 * tenantId NUNCA vem do input — vem do ctx (session).
 */
'use server';

import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { atividadeService } from '@/server/services/operacoes/atividade.service';
import { rotaService } from '@/server/services/operacoes/rota.service';
import { entregaService } from '@/server/services/operacoes/entrega.service';
import { abastecimentoService } from '@/server/services/operacoes/abastecimento.service';
import {
  CriarViaturaSchema,
  AtualizarViaturaSchema,
  TransitarViaturaSchema,
  FiltrarViaturasSchema,
  CriarDocumentoViaturaSchema,
  CriarManutencaoViaturaSchema,
  CriarChecklistSchema,
  CriarMotoristaSchema,
  AtualizarMotoristaSchema,
  AtualizarDisponibilidadeMotoristaSchema,
  CriarDocumentoMotoristaSchema,
  FiltrarMotoristasSchema,
  CriarAtividadeSchema,
  AtualizarAtividadeSchema,
  TransitarAtividadeSchema,
  FiltrarAtividadesSchema,
  CriarRotaSchema,
  AtualizarRotaSchema,
  TransitarRotaSchema,
  FiltrarRotasSchema,
  CriarEntregaSchema,
  AtualizarEntregaSchema,
  TransitarEntregaSchema,
  RegistarProvaEntregaSchema,
  FiltrarEntregasSchema,
  RegistarAbastecimentoSchema,
  FiltrarAbastecimentosSchema,
} from '@/lib/validations/transporte';

// ============================================================
// Viatura
// ============================================================

export const criarViaturaAction = createSafeAction({
  schema: CriarViaturaSchema,
  permission: 'transporte:viatura:criar',
  revalidate: { paths: ['/transporte/viaturas'], tags: ['transporte:viaturas'] },
  handler: async (input, ctx) => viaturaService.criarViatura(input, ctx),
});

export const atualizarViaturaAction = createSafeAction({
  schema: AtualizarViaturaSchema.extend({ id: z.string().cuid() }),
  permission: 'transporte:viatura:editar',
  revalidate: { tags: ['transporte:viaturas'] },
  handler: async ({ id, ...input }, ctx) => viaturaService.atualizarViatura(id, input, ctx),
});

export const transitarViaturaAction = createSafeAction({
  schema: TransitarViaturaSchema,
  permission: 'transporte:viatura:transitar',
  revalidate: { tags: ['transporte:viaturas'] },
  handler: async ({ viaturaId, estadoAlvo, motivo }, ctx) =>
    viaturaService.transitarViatura(viaturaId, estadoAlvo, ctx, motivo),
});

export const adicionarDocumentoViaturaAction = createSafeAction({
  schema: CriarDocumentoViaturaSchema,
  permission: 'transporte:viatura:documentos',
  revalidate: { tags: ['transporte:viaturas'] },
  handler: async (input, ctx) => viaturaService.adicionarDocumentoViatura(input, ctx),
});

export const registarManutencaoViaturaAction = createSafeAction({
  schema: CriarManutencaoViaturaSchema,
  permission: 'transporte:viatura:manutencao',
  revalidate: { tags: ['transporte:viaturas', 'transporte:manutencoes'] },
  handler: async (input, ctx) => viaturaService.registarManutencao(input, ctx),
});

export const registarChecklistAction = createSafeAction({
  schema: CriarChecklistSchema,
  permission: 'transporte:viatura:checklist',
  revalidate: { tags: ['transporte:viaturas'] },
  handler: async (input, ctx) => viaturaService.registarChecklist(input, ctx),
});

export const listarViaturasAction = createSafeAction({
  schema: FiltrarViaturasSchema,
  permission: 'transporte:viatura:listar',
  handler: async (input, ctx) => viaturaService.listarViaturas(input, ctx),
});

// ============================================================
// Motorista
// ============================================================

export const criarMotoristaAction = createSafeAction({
  schema: CriarMotoristaSchema,
  permission: 'transporte:motorista:criar',
  revalidate: { paths: ['/transporte/motoristas'], tags: ['transporte:motoristas'] },
  handler: async (input, ctx) => motoristaService.criarMotorista(input, ctx),
});

export const atualizarMotoristaAction = createSafeAction({
  schema: AtualizarMotoristaSchema.extend({ id: z.string().cuid() }),
  permission: 'transporte:motorista:editar',
  revalidate: { tags: ['transporte:motoristas'] },
  handler: async ({ id, ...input }, ctx) => motoristaService.atualizarMotorista(id, input, ctx),
});

export const atualizarDisponibilidadeAction = createSafeAction({
  schema: AtualizarDisponibilidadeMotoristaSchema,
  permission: 'transporte:motorista:disponibilidade',
  revalidate: { tags: ['transporte:motoristas'] },
  handler: async (input, ctx) => motoristaService.atualizarDisponibilidade(input, ctx),
});

export const adicionarDocumentoMotoristaAction = createSafeAction({
  schema: CriarDocumentoMotoristaSchema,
  permission: 'transporte:motorista:documentos',
  revalidate: { tags: ['transporte:motoristas'] },
  handler: async (input, ctx) => motoristaService.adicionarDocumentoMotorista(input, ctx),
});

export const listarMotoristasAction = createSafeAction({
  schema: FiltrarMotoristasSchema,
  permission: 'transporte:motorista:listar',
  handler: async (input, ctx) => motoristaService.listarMotoristas(input, ctx),
});

// ============================================================
// Atividade
// ============================================================

export const criarAtividadeAction = createSafeAction({
  schema: CriarAtividadeSchema,
  permission: 'transporte:atividade:criar',
  revalidate: { paths: ['/transporte/atividades'], tags: ['transporte:atividades'] },
  handler: async (input, ctx) => atividadeService.criarAtividade(input, ctx),
});

export const atualizarAtividadeAction = createSafeAction({
  schema: AtualizarAtividadeSchema.extend({ id: z.string().cuid() }),
  permission: 'transporte:atividade:editar',
  revalidate: { tags: ['transporte:atividades'] },
  handler: async ({ id, ...input }, ctx) => atividadeService.atualizarAtividade(id, input, ctx),
});

export const transitarAtividadeAction = createSafeAction({
  schema: TransitarAtividadeSchema,
  permission: 'transporte:atividade:transitar',
  revalidate: { tags: ['transporte:atividades'] },
  handler: async ({ atividadeId, estadoAlvo, descricao }, ctx) =>
    atividadeService.transitarAtividade(atividadeId, estadoAlvo, descricao, ctx),
});

export const listarAtividadesAction = createSafeAction({
  schema: FiltrarAtividadesSchema,
  permission: 'transporte:atividade:listar',
  handler: async (input, ctx) => atividadeService.listarAtividades(input, ctx),
});

// ============================================================
// Rota
// ============================================================

export const criarRotaAction = createSafeAction({
  schema: CriarRotaSchema,
  permission: 'transporte:rota:criar',
  revalidate: { paths: ['/transporte/rotas'], tags: ['transporte:rotas'] },
  handler: async (input, ctx) => rotaService.criarRota(input, ctx),
});

export const atualizarRotaAction = createSafeAction({
  schema: AtualizarRotaSchema.extend({ id: z.string().cuid() }),
  permission: 'transporte:rota:editar',
  revalidate: { tags: ['transporte:rotas'] },
  handler: async ({ id, ...input }, ctx) => rotaService.atualizarRota(id, input, ctx),
});

export const transitarRotaAction = createSafeAction({
  schema: TransitarRotaSchema,
  permission: 'transporte:rota:transitar',
  revalidate: { tags: ['transporte:rotas'] },
  handler: async ({ rotaId, estadoAlvo, motivo }, ctx) =>
    rotaService.transitarRota(rotaId, estadoAlvo, ctx, motivo),
});

export const atribuirRecursosRotaAction = createSafeAction({
  schema: z.object({
    rotaId: z.string().cuid(),
    viaturaId: z.string().cuid().nullable(),
    motoristaId: z.string().cuid().nullable(),
  }),
  permission: 'transporte:rota:editar',
  revalidate: { tags: ['transporte:rotas'] },
  handler: async ({ rotaId, viaturaId, motoristaId }, ctx) =>
    rotaService.atribuirRecursos(rotaId, viaturaId, motoristaId, ctx),
});

export const listarRotasAction = createSafeAction({
  schema: FiltrarRotasSchema,
  permission: 'transporte:rota:listar',
  handler: async (input, ctx) => rotaService.listarRotas(input, ctx),
});

// ============================================================
// Entrega
// ============================================================

export const criarEntregaAction = createSafeAction({
  schema: CriarEntregaSchema,
  permission: 'transporte:entrega:criar',
  revalidate: { paths: ['/transporte/entregas'], tags: ['transporte:entregas'] },
  handler: async (input, ctx) => entregaService.criarEntrega(input, ctx),
});

export const atualizarEntregaAction = createSafeAction({
  schema: AtualizarEntregaSchema.extend({ id: z.string().cuid() }),
  permission: 'transporte:entrega:editar',
  revalidate: { tags: ['transporte:entregas'] },
  handler: async ({ id, ...input }, ctx) => entregaService.atualizarEntrega(id, input, ctx),
});

export const transitarEntregaAction = createSafeAction({
  schema: TransitarEntregaSchema,
  permission: 'transporte:entrega:transitar',
  revalidate: { tags: ['transporte:entregas'] },
  handler: async (input, ctx) => entregaService.transitarEntrega(input, ctx),
});

export const registarProvaEntregaAction = createSafeAction({
  schema: RegistarProvaEntregaSchema,
  permission: 'transporte:entrega:comprovante',
  revalidate: { tags: ['transporte:entregas'] },
  handler: async (input, ctx) => entregaService.registarProvaEntrega(input, ctx),
});

export const atribuirRecursosEntregaAction = createSafeAction({
  schema: z.object({
    entregaId: z.string().cuid(),
    viaturaId: z.string().cuid().nullable(),
    motoristaId: z.string().cuid().nullable(),
    rotaId: z.string().cuid().nullable(),
  }),
  permission: 'transporte:entrega:editar',
  revalidate: { tags: ['transporte:entregas'] },
  handler: async ({ entregaId, viaturaId, motoristaId, rotaId }, ctx) =>
    entregaService.atribuirRecursos(entregaId, viaturaId, motoristaId, rotaId, ctx),
});

export const listarEntregasAction = createSafeAction({
  schema: FiltrarEntregasSchema,
  permission: 'transporte:entrega:listar',
  handler: async (input, ctx) => entregaService.listarEntregas(input, ctx),
});

// ============================================================
// Abastecimento
// ============================================================

export const registarAbastecimentoAction = createSafeAction({
  schema: RegistarAbastecimentoSchema,
  permission: 'transporte:abastecimento:criar',
  revalidate: { paths: ['/transporte/combustivel'], tags: ['transporte:abastecimentos'] },
  handler: async (input, ctx) => abastecimentoService.registarAbastecimento(input, ctx),
});

export const listarAbastecimentosAction = createSafeAction({
  schema: FiltrarAbastecimentosSchema,
  permission: 'transporte:abastecimento:listar',
  handler: async (input, ctx) => abastecimentoService.listarAbastecimentos(input, ctx),
});
