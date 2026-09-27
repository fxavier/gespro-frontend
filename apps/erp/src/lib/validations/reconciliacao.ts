import { z } from 'zod';
import { idEntidade } from './common';

// ADR-0038 — reconciliação bancária automática. Partilhado cliente/servidor.

/** Dia de um `<input type="date">`, no formato aaaa-mm-dd. */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
/** Montante com até 2 casas decimais, como texto (vira Decimal no servidor). */
const montante = z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/, 'Valor inválido (use ponto decimal e até 2 casas)');
/** A justificação é para outra pessoa ler: frase curta, não um carácter. */
const justificacao = z.string().trim().min(10, 'Escreva uma justificação (mínimo 10 caracteres)').max(1000);

export const ContaBancariaIdSchema = z.object({ contaBancariaId: idEntidade() });
export const PeriodoIdSchema = z.object({ periodoId: idEntidade() });
export const MovimentoBancarioIdSchema = z.object({ movimentoBancarioId: idEntidade() });

export const AbrirPeriodoSchema = z
  .object({
    contaBancariaId: idEntidade(),
    dataInicio: dia,
    dataFim: dia,
    saldoInicialBanco: montante,
    saldoFinalBanco: montante,
  })
  .refine((d) => d.dataInicio <= d.dataFim, { path: ['dataFim'], message: 'A data de fim tem de ser igual ou posterior à de início' });
export type AbrirPeriodoFormInput = z.infer<typeof AbrirPeriodoSchema>;

export const FecharPeriodoSchema = z.object({
  periodoId: idEntidade(),
  /** Obrigatória só quando a diferença residual não é zero — o servidor decide. */
  justificacao: justificacao.optional(),
});

export const ConfirmarCorrespondenciasSchema = z.object({
  ids: z.array(idEntidade()).min(1).max(500),
  /** Obrigatória para confirmar sugestões com diferença de valor acima da tolerância. */
  justificacao: justificacao.optional(),
});

/** RF §13 / CA07: justificação obrigatória. */
export const ReconciliarManualmenteSchema = z.object({
  movimentosBancariosIds: z.array(idEntidade()).min(1).max(50),
  movimentosContabilisticosIds: z.array(idEntidade()).min(1).max(50),
  justificacao,
});

export const ReverterCorrespondenciaSchema = z.object({ id: idEntidade() });

export const DefinirIgnoradoSchema = z.object({
  lado: z.enum(['BANCO', 'CONTABILIDADE']),
  id: idEntidade(),
  ignorado: z.boolean(),
});

export const ImportarExtractoSchema = z.object({
  contaBancariaId: idEntidade(),
  ficheiro: z.instanceof(File, { message: 'Escolha um ficheiro' }).refine((f) => f.size > 0, 'O ficheiro está vazio'),
});

// ---------------------------------------------------------------------------
// Regras de sugestão de lançamento (issue #140)
// ---------------------------------------------------------------------------

/**
 * Natureza do movimento no extracto, do ponto de vista do banco:
 * `CREDITO` = saída da conta (o banco credita-nos a dívida), `DEBITO` = entrada.
 */
export const NaturezaRegraSugestaoEnum = z.enum(['DEBITO', 'CREDITO']);
export type NaturezaRegraSugestao = z.infer<typeof NaturezaRegraSugestaoEnum>;

export const RegraSugestaoSchema = z.object({
  /** `null` = a regra vale para todas as contas bancárias do tenant. */
  contaBancariaId: idEntidade().nullable(),
  /** Palavras separadas por «|»; basta uma aparecer na descrição do movimento. */
  padrao: z
    .string()
    .trim()
    .min(1, 'Indique pelo menos uma palavra')
    .max(200, 'Máximo 200 caracteres')
    .refine((p) => p.split('|').some((s) => s.trim().length > 0), 'Indique pelo menos uma palavra entre «|»'),
  natureza: NaturezaRegraSugestaoEnum,
  contaContrapartidaId: idEntidade('Escolha a conta de contrapartida'),
  descricao: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  prioridade: z.coerce
    .number({ invalid_type_error: 'Indique a prioridade' })
    .int('Use um número inteiro')
    .min(1, 'Mínimo 1')
    .max(999, 'Máximo 999'),
});
export type RegraSugestaoInput = z.infer<typeof RegraSugestaoSchema>;

export const EditarRegraSugestaoSchema = RegraSugestaoSchema.extend({ id: idEntidade() });
export type EditarRegraSugestaoInput = z.infer<typeof EditarRegraSugestaoSchema>;

export const RegraSugestaoIdSchema = z.object({ id: idEntidade() });

/** Pesquisa de contas PGC folha para a contrapartida (código ou nome). */
export const ProcurarContrapartidaSchema = z.object({
  q: z.string().trim().max(100).default(''),
});
