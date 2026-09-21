/**
 * Validações Zod do módulo de Tesouraria (spec 22 · WS-1 · ADR-0036).
 *
 * Ficheiro NOVO e próprio — não estende `validations/contabilidade.ts`, que é
 * ponto de conflito com o spec 04 (ver design §3 e handoff §Mapa de conflitos).
 *
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 * Ids sempre por `idEntidade()` — nunca `z.string().cuid()`: o tenant-bootstrap
 * atribui uuid às contas PGC e um `.cuid()` rejeita todas as contas reais.
 * Datas vindas de `searchParams` levam `z.coerce.date()` (defeito D2, ADR-0018 §6).
 */

import { z } from 'zod';
import { idEntidade } from '@/lib/validations/common';

// ---------------------------------------------------------------------------
// Enums (espelham prisma/schema/financas.prisma e o ADR-0036 §5-6)
// ---------------------------------------------------------------------------

export const TipoCompromissoEnum = z.enum(['ENTRADA', 'SAIDA']);
export const RecorrenciaCompromissoEnum = z.enum([
  'UNICA',
  'MENSAL',
  'TRIMESTRAL',
  'ANUAL',
]);
export const GranularidadeEnum = z.enum(['DIARIA', 'SEMANAL', 'MENSAL']);
export const CenarioEnum = z.enum(['OTIMISTA', 'BASE', 'PESSIMISTA']);

export type TipoCompromisso = z.infer<typeof TipoCompromissoEnum>;
export type RecorrenciaCompromisso = z.infer<typeof RecorrenciaCompromissoEnum>;
export type Granularidade = z.infer<typeof GranularidadeEnum>;
export type Cenario = z.infer<typeof CenarioEnum>;

// ---------------------------------------------------------------------------
// Projecção — filtros de searchParams
// ---------------------------------------------------------------------------

/**
 * Tecto de horizonte por granularidade (ADR-0036 §5).
 * Combinação fora destes limites → ValidationError, nunca truncamento silencioso (R4.1).
 */
export const TECTO_HORIZONTE_DIAS: Record<Granularidade, number> = {
  DIARIA: 90,
  SEMANAL: 180,
  MENSAL: 365,
};

export const FiltroProjecaoSchema = z
  .object({
    horizonteDias: z.coerce.number().int().min(0).max(365).default(90),
    granularidade: GranularidadeEnum.default('SEMANAL'),
    cenario: CenarioEnum.default('BASE'),
  })
  .superRefine((v, ctx) => {
    const tecto = TECTO_HORIZONTE_DIAS[v.granularidade];
    if (v.horizonteDias > tecto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['horizonteDias'],
        message: `Granularidade ${v.granularidade} admite no máximo ${tecto} dias.`,
      });
    }
  });

export type FiltroProjecaoInput = z.infer<typeof FiltroProjecaoSchema>;

// ---------------------------------------------------------------------------
// CompromissoTesouraria — Criar / Atualizar / Filtro
// ---------------------------------------------------------------------------

/**
 * R3.4: `dataFimRecorrencia` anterior a `dataPrevista` → ValidationError.
 * Só é verificável no Zod quando ambas as datas estão presentes; no Atualizar
 * parcial (uma das datas omitida) a regra é reimposta pelo serviço contra o
 * registo existente (nó L5).
 */
const regraFimRecorrencia = (
  v: { dataPrevista?: Date; dataFimRecorrencia?: Date },
  ctx: z.RefinementCtx,
): void => {
  if (
    v.dataPrevista instanceof Date &&
    v.dataFimRecorrencia instanceof Date &&
    v.dataFimRecorrencia.getTime() < v.dataPrevista.getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFimRecorrencia'],
      message: 'Data de fim da recorrência não pode ser anterior à data prevista.',
    });
  }
};

const CompromissoCamposSchema = z.object({
  descricao: z.string().min(1, 'Descrição obrigatória').max(255),
  tipo: TipoCompromissoEnum,
  valor: z
    .number({ required_error: 'Valor obrigatório' })
    .positive('Valor deve ser positivo')
    .multipleOf(0.01, 'Máximo 2 casas decimais'),
  dataPrevista: z.coerce.date({
    required_error: 'Data prevista obrigatória',
    invalid_type_error: 'Data prevista inválida',
  }),
  recorrencia: RecorrenciaCompromissoEnum.default('UNICA'),
  dataFimRecorrencia: z.coerce
    .date({ invalid_type_error: 'Data de fim de recorrência inválida' })
    .optional(),
  rubricaId: idEntidade('ID de rubrica inválido').optional(),
  contaContabilId: idEntidade('ID de conta contabilística inválido').optional(),
  observacoes: z.string().max(500).optional(),
});

export const CriarCompromissoSchema =
  CompromissoCamposSchema.superRefine(regraFimRecorrencia);

export type CriarCompromissoInput = z.infer<typeof CriarCompromissoSchema>;

export const AtualizarCompromissoSchema = CompromissoCamposSchema.partial()
  .extend({
    id: idEntidade('ID de compromisso inválido'),
    ativo: z.boolean().optional(),
  })
  .superRefine(regraFimRecorrencia);

export type AtualizarCompromissoInput = z.infer<typeof AtualizarCompromissoSchema>;

/**
 * Booleano vindo de searchParams: `z.coerce.boolean()` transformaria a string
 * "false" em `true` (qualquer string não vazia é truthy) — este union aceita o
 * boolean nativo (formulários) e as strings "true"/"false" (URL).
 */
const booleanoDeSearchParam = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((v) => v === 'true'),
]);

export const FiltroCompromissoSchema = z.object({
  tipo: TipoCompromissoEnum.optional(),
  recorrencia: RecorrenciaCompromissoEnum.optional(),
  ativo: booleanoDeSearchParam.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  pesquisa: z.string().max(255).optional(),
  cursor: idEntidade('Cursor inválido').optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type FiltroCompromissoInput = z.infer<typeof FiltroCompromissoSchema>;

// ---------------------------------------------------------------------------
// Eliminação (soft delete) — AlertDialog confirma, a action valida o id
// ---------------------------------------------------------------------------

export const EliminarCompromissoSchema = z.object({
  id: idEntidade('ID de compromisso inválido'),
});

export type EliminarCompromissoInput = z.infer<typeof EliminarCompromissoSchema>;
