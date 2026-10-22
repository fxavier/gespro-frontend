/**
 * Destino depois do login (#551): só um caminho relativo da mesma origem.
 *
 * O `callbackUrl` vem da query string e é escrito por quem fizer o link. Sem
 * isto, `/auth/login?callbackUrl=https://atacante…` levava a vítima, já
 * autenticada no ecrã verdadeiro, para uma página falsa. Client-safe: usado
 * pelo formulário de login e pelo proxy.
 */

const OMISSAO = '/dashboard';

/** Origem fictícia quando não há `window` — só serve para comparar origens. */
const ORIGEM_NEUTRA = 'http://destino-seguro.local';

export function destinoSeguro(cb: string | null | undefined, origem?: string): string {
  if (!cb) return OMISSAO;

  let descodificado: string;
  try {
    descodificado = decodeURIComponent(cb);
  } catch {
    return OMISSAO;
  }

  // `//host` e `/\host` são de protocolo relativo para o browser; vale também
  // depois de descodificar, para `/%2F%2Fhost` não passar por caminho.
  for (const c of [cb, descodificado]) {
    if (!c.startsWith('/') || c.startsWith('//') || c.startsWith('/\\')) return OMISSAO;
  }

  // O parser de URL ignora tabs/quebras e trata `\` como `/`: a comparação de
  // origens apanha o que as regras de texto deixarem passar.
  const base = origem ?? (typeof window !== 'undefined' ? window.location.origin : ORIGEM_NEUTRA);
  try {
    if (new URL(cb, base).origin !== new URL(base).origin) return OMISSAO;
  } catch {
    return OMISSAO;
  }
  return cb;
}
