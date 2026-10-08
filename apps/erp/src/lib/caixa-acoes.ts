/**
 * Que acções o detalhe de uma sessão de caixa oferece (#146) — client-safe, sem imports.
 *
 * A ÚNICA decisão: o detalhe `/caixa/[id]` e as rotas `sangria`/`reforco`/`cancelar` usam-na.
 * Espelha o servidor, que continua a decidir:
 * - só uma sessão ABERTA aceita movimentos ou cancelamento (`assertSessaoAberta`, `TRANSICOES_SESSAO_CAIXA`);
 * - cada acção exige a permissão da Server Action que a executa (`caixa.actions.ts`);
 * - cancelar só com a ABERTURA como único movimento (`cancelarSessao` recusa com CAIXA_COM_PENDENCIAS).
 */

export interface AcoesSessaoCaixa {
  sangria: boolean;
  reforco: boolean;
  cancelar: boolean;
}

export function acoesSessaoCaixa(entrada: {
  status: string;
  movimentos: ReadonlyArray<{ tipo: string }>;
  permissoes: ReadonlyArray<string>;
}): AcoesSessaoCaixa {
  const aberta = entrada.status === 'ABERTA';
  const pode = (p: string) => aberta && entrada.permissoes.includes(p);
  return {
    sangria: pode('caixa:sangria'),
    reforco: pode('caixa:reforco'),
    cancelar: pode('caixa:cancelar') && entrada.movimentos.every((m) => m.tipo === 'ABERTURA'),
  };
}
