/**
 * Nome do cookie que guarda o estado da barra lateral (recolhida/expandida).
 *
 * Vive num módulo sem `'use client'` de propósito: os layouts (Server
 * Components) lêem-no com `cookies()`, e tudo o que se exporta de um ficheiro
 * `'use client'` chega ao servidor como referência de cliente, não como valor
 * — foi assim que `.get(COOKIE)` devolveu `undefined` com o cookie presente.
 *
 * Sem «:» no nome — é um separador em RFC 6265 e há leitores que o rejeitam.
 */
export const COOKIE_BARRA_LATERAL = 'gespro-barra-lateral';
export const VALOR_RECOLHIDA = 'recolhida';

/**
 * O único item do menu que fica activo para `pathname`: o de maior prefixo, por
 * segmento inteiro (#203). Sem isto o «Dashboard» de um grupo, que aponta para a
 * raiz do módulo (`/contabilidade`), ficava activo ao lado do ecrã actual.
 * `/` conta como `/dashboard`. `null` quando nenhum item corresponde.
 */
export function hrefActivo(pathname: string, hrefs: readonly string[]): string | null {
  const caminho = pathname === '/' ? '/dashboard' : pathname;
  let melhor: string | null = null;
  for (const href of hrefs) {
    const casa = caminho === href || caminho.startsWith(href + '/');
    if (casa && (!melhor || href.length > melhor.length)) melhor = href;
  }
  return melhor;
}
