/**
 * A excepção de CSP do Turnstile é DA ROTA `/registo`, não do ERP
 * (ADR-0031 §Consequências, Requisito 2.5).
 *
 * A política de `/registo` é, por força do protocolo (um cabeçalho CSP
 * substitui-se, não se acrescenta), uma cópia da política geral com duas
 * directivas alteradas. Estes testes são a guarda dessa cópia, nos dois
 * sentidos:
 *
 *   · alguém alarga a política geral para acomodar o widget → acende;
 *   · alguém alarga a de `/registo` para além do widget → acende;
 *   · alguém muda a política geral e esquece a cópia → acende.
 *
 * Como confirmar que valem: acrescentar `https://challenges.cloudflare.com` ao
 * `script-src` de `buildCspPolicy`, ou pôr `connect-src 'self' https:` em
 * `cspRegisto`. Qualquer dos dois parte um teste daqui.
 */
import { describe, it, expect } from 'vitest';
import { buildCspPolicy } from '@/lib/security/headers';
import { cspRegisto, TURNSTILE_ORIGEM } from '@/app/registo/csp';

const NONCE = 'bm9uY2UtZGUtdGVzdGU=';

function directivas(politica: string): Map<string, string> {
  return new Map(
    politica.split(';').map((parte) => {
      const [nome, ...resto] = parte.trim().split(/\s+/);
      return [nome, resto.join(' ')] as const;
    }),
  );
}

describe('CSP de /registo', () => {
  const registo = directivas(cspRegisto(NONCE, false));
  const geral = directivas(buildCspPolicy(NONCE, false));

  it('permite o script do Turnstile', () => {
    expect(registo.get('script-src')).toContain(TURNSTILE_ORIGEM);
  });

  it('permite o iframe do desafio (a política geral tem frame-src none)', () => {
    expect(registo.get('frame-src')).toBe(TURNSTILE_ORIGEM);
    expect(geral.get('frame-src')).toBe("'none'");
  });

  it('NÃO alarga as rotas autenticadas — a Cloudflare não entra na política geral', () => {
    expect(buildCspPolicy(NONCE, false)).not.toContain('challenges.cloudflare.com');
    expect(buildCspPolicy(NONCE, true)).not.toContain('challenges.cloudflare.com');
  });

  it('não alarga mais nada: fora de script-src/frame-src é idêntica à geral', () => {
    // É este o teste que apanha a deriva silenciosa entre as duas políticas.
    const excepcoes = new Set(['script-src', 'frame-src']);

    expect([...registo.keys()]).toEqual([...geral.keys()]);

    for (const [nome, valor] of geral) {
      if (excepcoes.has(nome)) continue;
      expect(registo.get(nome), `directiva ${nome}`).toBe(valor);
    }
  });

  it('o script-src difere da geral SÓ pelo Turnstile — o nonce mantém-se', () => {
    const daRota = new Set(registo.get('script-src')?.split(/\s+/));
    const daGeral = new Set(geral.get('script-src')?.split(/\s+/));

    // O nonce por pedido NÃO se perde: é por isso que `cspRegisto` o recebe.
    expect(daRota.has(`'nonce-${NONCE}'`)).toBe(true);

    daRota.delete(TURNSTILE_ORIGEM);
    expect([...daRota].sort()).toEqual([...daGeral].sort());
  });

  it('em desenvolvimento acompanha a geral — HMR continua a funcionar', () => {
    const devRegisto = directivas(cspRegisto(NONCE, true));
    const devGeral = directivas(buildCspPolicy(NONCE, true));

    expect(devRegisto.get('connect-src')).toBe(devGeral.get('connect-src'));
    expect(devRegisto.get('script-src')).toContain("'unsafe-eval'");
  });

  it('nem o widget escapa às proibições de base', () => {
    expect(registo.get('object-src')).toBe("'none'");
    expect(registo.get('frame-ancestors')).toBe("'none'");
    expect(registo.get('base-uri')).toBe("'self'");
    expect(registo.get('form-action')).toBe("'self'");
  });
});
