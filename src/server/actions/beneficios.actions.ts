'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  BeneficioSchema,
  UpdateBeneficioSchema,
  AtribuirBeneficioSchema,
  TerminarBeneficioSchema,
  SuspenderBeneficioSchema,
  FilterBeneficioSchema,
  FilterAtribuicaoSchema,
} from '@/lib/validations/beneficios';
import { z } from 'zod';
import {
  BeneficioService,
  BeneficioColaboradorService,
} from '@/server/services/pessoas-projetos/beneficios.service';

// ─────────────────────────────────────────────────────────────────────────────
// Benefício — catálogo
// ─────────────────────────────────────────────────────────────────────────────

export const criarBeneficioAction = createSafeAction({
  schema: BeneficioSchema,
  permission: 'rh:beneficios:create',
  revalidate: { tags: ['rh:beneficios'] },
  handler: (input, ctx) => BeneficioService.criar(input, ctx),
});

export const actualizarBeneficioAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateBeneficioSchema }),
  permission: 'rh:beneficios:update',
  revalidate: { tags: ['rh:beneficios'] },
  handler: ({ id, data }, ctx) => BeneficioService.actualizar(id, data, ctx),
});

export const arquivarBeneficioAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'rh:beneficios:delete',
  revalidate: { tags: ['rh:beneficios'] },
  handler: ({ id }, ctx) => BeneficioService.arquivar(id, ctx),
});

export const listarBeneficiosAction = createSafeAction({
  schema: FilterBeneficioSchema,
  permission: 'rh:beneficios:read',
  handler: (filter, ctx) => BeneficioService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Atribuições
// ─────────────────────────────────────────────────────────────────────────────

export const atribuirBeneficioAction = createSafeAction({
  schema: AtribuirBeneficioSchema,
  permission: 'rh:beneficios:atribuir',
  revalidate: { tags: ['rh:beneficios', 'rh:colaboradores'] },
  handler: (input, ctx) => BeneficioColaboradorService.atribuir(input, ctx),
});

export const terminarBeneficioAction = createSafeAction({
  schema: TerminarBeneficioSchema,
  permission: 'rh:beneficios:atribuir',
  revalidate: { tags: ['rh:beneficios', 'rh:colaboradores'] },
  handler: (input, ctx) => BeneficioColaboradorService.terminar(input, ctx),
});

export const suspenderBeneficioAction = createSafeAction({
  schema: SuspenderBeneficioSchema,
  permission: 'rh:beneficios:atribuir',
  revalidate: { tags: ['rh:beneficios', 'rh:colaboradores'] },
  handler: (input, ctx) => BeneficioColaboradorService.suspender(input, ctx),
});

export const reactivarBeneficioAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'rh:beneficios:atribuir',
  revalidate: { tags: ['rh:beneficios', 'rh:colaboradores'] },
  handler: ({ id }, ctx) => BeneficioColaboradorService.reactivar(id, ctx),
});

export const listarAtribuicoesAction = createSafeAction({
  schema: FilterAtribuicaoSchema,
  permission: 'rh:beneficios:read',
  handler: (filter, ctx) => BeneficioColaboradorService.listar(filter, ctx),
});
