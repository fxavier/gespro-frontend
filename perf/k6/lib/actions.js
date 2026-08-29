/**
 * Invocação de Server Actions do Next.js a partir do k6.
 *
 * Uma Server Action é um endpoint HTTP: POST à rota da página que a usa, com
 * o cabeçalho `Next-Action: <id>` e o corpo `[input]` em JSON. Os IDs são
 * hashes por build — o script perf/scripts/discover-actions.mjs extrai-os do
 * build (`.next/server`) para perf/.generated/actions.json antes da campanha.
 */
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './util.js';

/**
 * @param acoes mapa nome→{id,paginas} (actions.json)
 * @param nome  nome exportado da action (ex.: 'criarVenda')
 * @param paginaFallback rota a usar se o manifesto não indicar páginas
 * @param input objecto de input (validado por Zod no servidor)
 */
export function chamarAction(acoes, nome, paginaFallback, input, tags, headersSessao) {
  const entrada = acoes[nome];
  if (!entrada || !entrada.id) {
    throw new Error(`Action "${nome}" ausente de actions.json — corre discover-actions.mjs`);
  }
  const id = entrada.id;
  const pagina = (entrada.paginas && entrada.paginas[0]) || paginaFallback;

  const res = http.post(`${BASE_URL}${pagina}`, JSON.stringify([input]), {
    headers: Object.assign(
      {
        'Next-Action': id,
        'Content-Type': 'text/plain;charset=UTF-8',
        Accept: 'text/x-component',
        Origin: BASE_URL,
      },
      headersSessao || {},
    ),
    tags,
  });

  // ActionResult do createSafeAction: {"ok":true,...} embutido no flight stream.
  const ok =
    res.status === 200 &&
    typeof res.body === 'string' &&
    res.body.indexOf('"ok":true') !== -1;

  check(res, {
    [`${nome} 200`]: (r) => r.status === 200,
    [`${nome} ok`]: () => ok,
  });
  return { res, ok };
}
