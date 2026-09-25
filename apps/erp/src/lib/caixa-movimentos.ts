/**
 * Constantes client-safe para classificação de movimentos de caixa.
 * Espelha a lógica de caixa.service.ts — alterações aqui afectam
 * fecharSessao, resumoSessao, analytics e a tabela de movimentos na UI.
 */

export const MOVIMENTOS_SAIDA = ['SANGRIA', 'DEVOLUCAO', 'PAGAMENTO'] as const;
export const MOVIMENTOS_ENTRADA = ['VENDA', 'RECEBIMENTO', 'REFORCO', 'ABERTURA'] as const;
