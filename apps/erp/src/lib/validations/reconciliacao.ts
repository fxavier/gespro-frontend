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
