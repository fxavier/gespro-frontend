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
