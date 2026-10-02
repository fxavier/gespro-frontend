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

// ---------------------------------------------------------------------------
// Meios de pagamento do POS (ADR-0041 §4) — enum `MetodoPagamentoTipo`.
// ---------------------------------------------------------------------------

/** Meios do POS cuja conta a débito é configurável por tenant (`ContaMeioPagamentoPOS`).
 *  DINHEIRO debita sempre 111 e CREDITO 411; os restantes, sem configuração, 121. */
export const METODOS_POS_CONFIGURAVEIS = ['CARTAO', 'TRANSFERENCIA', 'MPESA', 'EMOLA'] as const;
export type MetodoPOSConfiguravel = (typeof METODOS_POS_CONFIGURAVEIS)[number];

export const ROTULO_METODO_POS: Record<MetodoPOSConfiguravel, string> = {
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência',
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
};

/** Tipos de ContaBancaria aceites por cada meio configurável — o mesmo critério de
 *  `TIPOS_CONTA_POR_FORMA` (carteiras móveis só para M-Pesa/e-Mola). */
export const TIPOS_CONTA_POR_METODO_POS: Record<MetodoPOSConfiguravel, ReadonlyArray<string>> = {
  CARTAO: TIPOS_CONTA_POR_FORMA.TRANSFERENCIA_BANCARIA,
  TRANSFERENCIA: TIPOS_CONTA_POR_FORMA.TRANSFERENCIA_BANCARIA,
  MPESA: TIPOS_CONTA_POR_FORMA['M-PESA'],
  EMOLA: TIPOS_CONTA_POR_FORMA['E-MOLA'],
};

export function eMetodoPOSConfiguravel(metodo: string): metodo is MetodoPOSConfiguravel {
  return (METODOS_POS_CONFIGURAVEIS as ReadonlyArray<string>).includes(metodo);
}
