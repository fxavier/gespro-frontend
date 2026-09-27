/**
 * Rótulos e rotas das regras de sugestão (issue #140). Módulo neutro — nem
 * `'use client'` nem `server-only` — para servir as páginas e os formulários.
 */
import type { NaturezaRegraSugestao } from '@/lib/validations/reconciliacao';

export const ROTA_REGRAS = '/contabilidade/reconciliacao/regras';

/** Do ponto de vista do extracto: CREDITO = saída da conta, DEBITO = entrada. */
export const ROTULO_NATUREZA_REGRA: Record<NaturezaRegraSugestao, string> = {
  CREDITO: 'Saída',
  DEBITO: 'Entrada',
};

/** Valor do Combobox para «todas as contas» (`contaBancariaId = null`). */
export const TODAS_AS_CONTAS = '__todas__';
