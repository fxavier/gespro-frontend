/**
 * Meios de pagamento — fonte única, client-safe.
 *
 * Usada pelo Zod schema (CreatePagamentoSchema), pelo resolvedor de conta
 * (meio-pagamento.service.ts) e pelo formulário de pagamento.
 * Sem 'server-only': pode ser importada em Client Components.
 */

export type FormaPagamento =
  | 'TRANSFERENCIA_BANCARIA'
  | 'CHEQUE'
  | 'M-PESA'
  | 'E-MOLA'
  | 'NUMERARIO';

/** Valores e rótulos em pt-PT para o formulário. */
export const FORMAS_PAGAMENTO: ReadonlyArray<{ value: FormaPagamento; label: string }> = [
  { value: 'TRANSFERENCIA_BANCARIA', label: 'Transferência bancária' },
  { value: 'CHEQUE',                 label: 'Cheque' },
  { value: 'M-PESA',                 label: 'M-Pesa' },
  { value: 'E-MOLA',                 label: 'e-Mola' },
  { value: 'NUMERARIO',              label: 'Numerário' },
] as const;

/** Tipos de ContaBancaria aceites por cada forma de pagamento.
 *  NUMERARIO → nenhum (usa sempre a conta 111 Caixa da sessão aberta).
 *  Demais formas → ver abaixo.
 */
export const TIPOS_CONTA_POR_FORMA: Record<FormaPagamento, ReadonlyArray<string>> = {
  TRANSFERENCIA_BANCARIA: ['CORRENTE', 'POUPANCA', 'DEPOSITO_PRAZO'],
  CHEQUE:                 ['CORRENTE', 'POUPANCA', 'DEPOSITO_PRAZO'],
  'M-PESA':               ['CARTEIRA_MOVEL'],
  'E-MOLA':               ['CARTEIRA_MOVEL'],
  NUMERARIO:              [],
};
