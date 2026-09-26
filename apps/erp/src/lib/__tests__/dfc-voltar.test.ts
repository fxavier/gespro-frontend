// ---------------------------------------------------------------------------
// ORÁCULO do `?voltar=` das rotas de configuração da DFC (nó `config`, grafo
// dfc). Escrito pelo autor do nó e ADOPTADO pelo verificador-fluxo-caixa em
// 2026-09-26: a partir daqui é FICHEIRO PROTEGIDO — um agente feat-* que o
// altere é BLOCKER (doutrina 00 §2). Casos acrescentados pelo verificador: os
// pontos codificados que o revisor encontrou (`%2e%2e`, `%2E%2E`, `..%2f`).
//
// Regra: `voltarSeguro` só devolve caminhos internos da contabilidade — nunca
// um redireccionamento aberto nem uma travessia para fora de /contabilidade/.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { voltarSeguro } from '@/lib/validations/fluxo-caixa';

const ORIGEM = 'https://gespro.invalid';

/** Descodifica percent-encoding até estabilizar (duplo encoding incluído). */
function descodificado(v: string): string {
  let actual = v;
  for (let i = 0; i < 5; i++) {
    let seguinte: string;
    try {
      seguinte = decodeURIComponent(actual);
    } catch {
      return actual;
    }
    if (seguinte === actual) return actual;
    actual = seguinte;
  }
  return actual;
}

/**
 * Onde um browser (e o router do Next) vai parar com este destino — tanto pela
 * string tal como sai, como depois de descodificada (um servidor ou proxy que
 * descodifique antes de resolver os segmentos).
 */
function ficaDentroDaContabilidade(destino: string): boolean {
  for (const forma of [destino, descodificado(destino)]) {
    if (forma.includes('\\')) return false;
    let url: URL;
    try {
      url = new URL(forma, ORIGEM);
    } catch {
      return false;
    }
    if (url.origin !== ORIGEM) return false;
    if (!url.pathname.startsWith('/contabilidade/')) return false;
    // Um segmento de ponto, literal ou codificado, que a resolução não comeu.
    if (/(^|\/)(\.|%2e){2}(\/|%2f|$)/i.test(url.pathname)) return false;
  }
  return true;
}

describe('voltarSeguro', () => {
  it.each([
    '/contabilidade/dfc',
    '/contabilidade/dfc?dataInicio=2026-01-01&dataFim=2026-09-30',
    '/contabilidade/fluxo-caixa/rubricas',
  ])('aceita %s', (v) => {
    expect(voltarSeguro(v)).toBe(v);
  });

  it.each([
    undefined,
    null,
    '',
    '/',
    '/vendas',
    '/contabilidade',
    '//evil.example/contabilidade/',
    'https://evil.example/contabilidade/dfc',
    '/contabilidade/../../vendas',
    '/contabilidade/\\evil.example',
    '/contabilidade/dfc?x=https://evil.example',
    '/contabilidade/dfc\nSet-Cookie: x',
    'javascript:alert(1)',
  ])('recusa %j', (v) => {
    expect(voltarSeguro(v)).toBeNull();
  });

  // Pontos codificados (achado do revisor, 2026-09-26). O browser resolve
  // `%2e%2e` como `..` (WHATWG URL, sem distinção de caixa): um destino que
  // começa por /contabilidade/ e sai dela. Aceita-se recusar (null) OU devolver
  // um destino normalizado que, resolvido e descodificado, fica em /contabilidade/.
  it.each([
    '/contabilidade/%2e%2e/vendas',
    '/contabilidade/%2e%2e/%2e%2e//evil.example/x',
    '/contabilidade/%2E%2E/vendas',
    '/contabilidade/%2E%2E/%2E%2E//evil.example/x',
    '/contabilidade/%2e%2E/vendas',
    '/contabilidade/..%2f..%2fvendas',
    '/contabilidade/%2e%2e%2f%2e%2e%2fvendas',
    '/contabilidade/.%2e/vendas',
    '/contabilidade/%252e%252e/vendas',
  ])('pontos codificados: recusa ou normaliza para dentro de /contabilidade/ — %j', (v) => {
    const r = voltarSeguro(v);
    if (r === null) return;
    expect(
      ficaDentroDaContabilidade(r),
      `voltarSeguro(${JSON.stringify(v)}) devolveu ${JSON.stringify(r)}: resolvido dá ` +
        `${new URL(r, ORIGEM).href}; descodificado e resolvido dá ` +
        `${new URL(descodificado(r), ORIGEM).href} — pelo menos um sai de /contabilidade/ ou guarda um segmento de pontos`,
    ).toBe(true);
  });

  // Autoteste do predicado acima: sem isto, um `ficaDentroDaContabilidade` que
  // devolvesse sempre true deixaria o bloco anterior verde para sempre.
  it.each([
    ['/contabilidade/dfc', true],
    ['/contabilidade/fluxo-caixa/rubricas?x=1', true],
    ['/contabilidade/%2e%2e/vendas', false],
    ['/contabilidade/%2E%2E/%2E%2E//evil.example/x', false],
    ['/contabilidade/..%2f..%2fvendas', false],
    ['/contabilidade/%252e%252e/vendas', false],
    ['//evil.example/contabilidade/x', false],
    ['/vendas', false],
  ] as const)('predicado ficaDentroDaContabilidade(%j) === %s', (v, esperado) => {
    expect(ficaDentroDaContabilidade(v)).toBe(esperado);
  });
});
