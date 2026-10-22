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

  // `//host` e `/\host` são de protocolo relativo para o browser; vale também
  // depois de descodificar, para `/%2F%2Fhost` não passar por caminho. Um `%`
  // solto (`?q=100%`) não descodifica: salta-se só essa verificação.
  const candidatos = [cb];
  try {
    candidatos.push(decodeURIComponent(cb));
  } catch {
    // sem forma descodificada — as outras verificações decidem
  }
  for (const c of candidatos) {
    if (!c.startsWith('/') || c.startsWith('//') || c.startsWith('/\\')) return OMISSAO;
  }

  // O parser de URL ignora tabs/quebras, trata `\` como `/` e resolve `.`/`..`
  // (também `%2e`): `/..//host` vira o pathname `//host`, que o router lê como
  // protocolo relativo. A origem e o pathname resolvidos apanham o resto.
  const base = origem ?? (typeof window !== 'undefined' ? window.location.origin : ORIGEM_NEUTRA);
  try {
    const u = new URL(cb, base);
    if (u.origin !== new URL(base).origin || u.pathname.startsWith('//')) return OMISSAO;
  } catch {
    return OMISSAO;
  }
  return cb;
}
