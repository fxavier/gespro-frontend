'use server';
import { createSafeAction } from '@/server/safe-action';
import { z } from 'zod';
import {
  VagaSchema,
  UpdateVagaSchema,
  FilterVagaSchema,
  CandidatoSchema,
  UpdateCandidatoSchema,
  FilterCandidatoSchema,
  CandidaturaSchema,
  MoverEtapaSchema,
  MoverPosicaoKanbanSchema,
  EntrevistaSchema,
  AdmitirSchema,
  TransitarStatusVagaSchema,
} from '@/lib/validations/recrutamento';
import {
  VagaService,
  CandidatoService,
  CandidaturaService,
} from '@/server/services/pessoas-projetos/recrutamento.service';

// ─────────────────────────────────────────────────────────────────────────────
// Vagas
// ─────────────────────────────────────────────────────────────────────────────

export const criarVagaAction = createSafeAction({
  schema: VagaSchema,
  permission: 'rh:recrutamento:vagas:create',
  revalidate: { tags: ['rh:recrutamento:vagas'] },
  handler: (input, ctx) => VagaService.criar(input, ctx),
});

const ActualizarVagaSchema = z.object({ id: z.string().cuid(), data: UpdateVagaSchema });

export const actualizarVagaAction = createSafeAction({
  schema: ActualizarVagaSchema,
  permission: 'rh:recrutamento:vagas:update',
  revalidate: { tags: ['rh:recrutamento:vagas'] },
  handler: (input, ctx) => VagaService.actualizar(input.id, input.data, ctx),
});

export const transitarStatusVagaAction = createSafeAction({
  schema: TransitarStatusVagaSchema,
  permission: 'rh:recrutamento:vagas:update',
  revalidate: { tags: ['rh:recrutamento:vagas'] },
  handler: (input, ctx) => VagaService.transitarStatus(input, ctx),
});

export const listarVagasAction = createSafeAction({
  schema: FilterVagaSchema,
  permission: 'rh:recrutamento:read',
  handler: (filter, ctx) => VagaService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidatos
// ─────────────────────────────────────────────────────────────────────────────

export const criarCandidatoAction = createSafeAction({
  schema: CandidatoSchema,
  permission: 'rh:recrutamento:candidatos:create',
  revalidate: { tags: ['rh:recrutamento:candidatos'] },
  handler: (input, ctx) => CandidatoService.criar(input, ctx),
});

const ActualizarCandidatoSchema = z.object({ id: z.string().cuid(), data: UpdateCandidatoSchema });

export const actualizarCandidatoAction = createSafeAction({
  schema: ActualizarCandidatoSchema,
  permission: 'rh:recrutamento:candidatos:update',
  revalidate: { tags: ['rh:recrutamento:candidatos'] },
  handler: (input, ctx) => CandidatoService.actualizar(input.id, input.data, ctx),
});

export const listarCandidatosAction = createSafeAction({
  schema: FilterCandidatoSchema,
  permission: 'rh:recrutamento:read',
  handler: (filter, ctx) => CandidatoService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidaturas
// ─────────────────────────────────────────────────────────────────────────────

export const candidatarAction = createSafeAction({
  schema: CandidaturaSchema,
  permission: 'rh:recrutamento:candidaturas:create',
  revalidate: { tags: ['rh:recrutamento:candidaturas'] },
  handler: (input, ctx) => CandidaturaService.candidatar(input, ctx),
});

export const moverEtapaAction = createSafeAction({
  schema: MoverEtapaSchema,
  permission: 'rh:recrutamento:candidaturas:update',
  revalidate: { tags: ['rh:recrutamento:candidaturas'] },
  handler: (input, ctx) => CandidaturaService.moverEtapa(input, ctx),
});

export const moverPosicaoKanbanAction = createSafeAction({
  schema: MoverPosicaoKanbanSchema,
  permission: 'rh:recrutamento:candidaturas:update',
  revalidate: { tags: ['rh:recrutamento:candidaturas'] },
  handler: (input, ctx) => CandidaturaService.moverPosicaoKanban(input, ctx),
});

export const registarEntrevistaAction = createSafeAction({
  schema: EntrevistaSchema,
  permission: 'rh:recrutamento:entrevistas:create',
  revalidate: { tags: ['rh:recrutamento:candidaturas'] },
  handler: (input, ctx) => CandidaturaService.registarEntrevista(input, ctx),
});

export const admitirAction = createSafeAction({
  schema: AdmitirSchema,
  permission: 'rh:recrutamento:admitir',
  revalidate: {
    tags: ['rh:recrutamento:candidaturas', 'rh:colaboradores'],
    paths: ['/rh/colaboradores'],
  },
  handler: (input, ctx) => CandidaturaService.admitir(input, ctx),
});
