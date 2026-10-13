/**
 * Acções que o menu ⋯ das listas de cotações e proformas oferece (#154/#259) — CLIENT-SAFE.
 * Cada acção = transição permitida a partir do estado E a permissão da Server Action que a executa
 * (`faturacao.actions.ts`). Estado desconhecido ⇒ nenhuma acção.
 */

import { TRANSICOES_COTACAO_COMERCIAL, TRANSICOES_PROFORMA } from '@/lib/state-machines';

interface Entrada {
  status: string;
  permissoes: ReadonlyArray<string>;
}

const pode = (mapa: Record<string, string[]>, { status, permissoes }: Entrada, alvo: string, permissao: string) =>
  (Object.hasOwn(mapa, status) ? mapa[status] : []).includes(alvo) && permissoes.includes(permissao);

export function acoesMenuCotacao(e: Entrada): { converter: boolean; rejeitar: boolean; cancelar: boolean } {
  return {
    converter: pode(TRANSICOES_COTACAO_COMERCIAL, e, 'CONVERTIDA', 'faturacao:cotacao:converter'),
    rejeitar: pode(TRANSICOES_COTACAO_COMERCIAL, e, 'REJEITADA', 'faturacao:cotacao:gerir'),
    cancelar: pode(TRANSICOES_COTACAO_COMERCIAL, e, 'CANCELADA', 'faturacao:cotacao:gerir'),
  };
}

export function acoesMenuProforma(e: Entrada): { converter: boolean; cancelar: boolean } {
  return {
    converter: pode(TRANSICOES_PROFORMA, e, 'CONVERTIDA', 'faturacao:proforma:converter'),
    cancelar: pode(TRANSICOES_PROFORMA, e, 'CANCELADA', 'faturacao:proforma:cancelar'),
  };
}
