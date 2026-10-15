/**
 * Validação do catálogo de planos (ADR-0049 §1–§4, #526) — o MESMO schema serve o formulário
 * de `/plataforma/planos` (zodResolver), as Server Actions e o `plano-admin.service`.
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 */
import { z } from 'zod';
import { codigoPlano } from './common';

export const MAX_FUNCIONALIDADES = 30;
export const MAX_CARACTERES_FUNCIONALIDADE = 120;
/** -1 = ilimitado (ADR-0027 §3). */
export const LIMITE_ILIMITADO = -1;

/** Preço de exibição em USD: >= 0, até duas casas decimais (Decimal(12,2)). */
const precoUsd = (rotulo: string) =>
  z
    .string({ invalid_type_error: `${rotulo} obrigatório` })
    .trim()
    .min(1, `${rotulo} obrigatório`)
    .regex(/^\d{1,10}(\.\d{1,2})?$/, `${rotulo} inválido: valor igual ou superior a 0, com até duas casas decimais (ex.: 29.90)`);

/** Limite inteiro >= -1; -1 = ilimitado. */
const limite = (rotulo: string) =>
  z
    .number({ invalid_type_error: `${rotulo} obrigatório` })
    .int(`${rotulo}: número inteiro`)
    .min(LIMITE_ILIMITADO, `${rotulo}: use -1 para ilimitado ou um número igual ou superior a 0`)
    .max(1_000_000, `${rotulo} demasiado alto`);

/** Price ID do Stripe: vazio / só espaços grava-se como `null` (recorre à env, ADR-0049 §4). */
const priceId = z
  .string()
  .trim()
  .max(255, 'Price ID demasiado longo')
  .nullish()
  .transform((v) => (v ? v : null));

const funcionalidades = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Funcionalidade vazia: preencha ou remova a linha')
      .max(MAX_CARACTERES_FUNCIONALIDADE, `Funcionalidade com mais de ${MAX_CARACTERES_FUNCIONALIDADE} caracteres`),
  )
  .max(MAX_FUNCIONALIDADES, `No máximo ${MAX_FUNCIONALIDADES} funcionalidades`)
  .superRefine((lista, ctx) => {
    const vistas = new Set<string>();
    lista.forEach((f, i) => {
      if (vistas.has(f)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: `Funcionalidade repetida: «${f}»` });
      }
      vistas.add(f);
    });
  });

/** Os campos editáveis de um plano (tudo menos o código, que é imutável). */
export const PlanoCamposSchema = z.object({
  nome: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome demasiado longo'),
  descricao: z.string().trim().min(1, 'Descrição obrigatória').max(500, 'Descrição demasiado longa'),
  precoMensalUsd: precoUsd('Preço mensal'),
  precoAnualUsd: precoUsd('Preço anual'),
  stripePriceIdMensal: priceId,
  stripePriceIdAnual: priceId,
  limiteUtilizadores: limite('Limite de utilizadores'),
  limiteArmazens: limite('Limite de armazéns'),
  suporte: z.string().trim().min(1, 'Suporte obrigatório').max(120, 'Suporte demasiado longo'),
  funcionalidades,
  ordem: z
    .number({ invalid_type_error: 'Ordem obrigatória' })
    .int('Ordem: número inteiro')
    .min(0, 'Ordem: igual ou superior a 0')
    .max(1_000_000, 'Ordem demasiado alta'),
  destaque: z.boolean(),
});

/** Criar: os campos + o código (só aqui). */
export const PlanoCriarSchema = PlanoCamposSchema.extend({ codigo: codigoPlano() });

/** Id de um `Plano` — o serviço responde 404 se não existir. */
const idPlano = z.string().trim().min(1, 'Plano obrigatório').max(64, 'Plano inválido');

/**
 * Actualizar: os campos + o id. O código pode vir (o serviço recusa mudá-lo com
 * `PLANO_CODIGO_IMUTAVEL`), mas não é editável.
 */
export const PlanoActualizarSchema = PlanoCamposSchema.extend({
  id: idPlano,
  codigo: z.string().trim().optional(),
});

export const PlanoIdSchema = z.object({ id: idPlano });

export type PlanoCamposInput = z.input<typeof PlanoCamposSchema>;
export type PlanoCampos = z.output<typeof PlanoCamposSchema>;
export type PlanoCriarInput = z.input<typeof PlanoCriarSchema>;
export type PlanoActualizarInput = z.input<typeof PlanoActualizarSchema>;
