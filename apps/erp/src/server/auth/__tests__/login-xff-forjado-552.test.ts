/**
 * #552 — o limite de falhas de início de sessão por IP (ADR-0029 §4) não se
 * contorna forjando o `X-Forwarded-For`.
 *
 * Exercita o `authorize` REAL de `@/lib/auth` (capturado da configuração dada
 * ao `NextAuth`) com o limitador REAL em memória. Cada tentativa usa um
 * identificador diferente — só a chave do IP pode travar — e um primeiro valor
 * de XFF diferente, como faria quem ataca; o proxy de confiança acrescenta
 * sempre o mesmo endereço real à direita.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.RATE_LIMIT_DRIVER = 'memory';
  delete process.env.TRUSTED_PROXY_HOPS;
});

const capturado = vi.hoisted(() => ({ config: null as any }));
const autenticar = vi.hoisted(() => vi.fn());

vi.mock('next-auth', () => {
  class CredentialsSignin extends Error {
    code = 'credentials';
  }
  return {
    default: (config: unknown) => {
      capturado.config = typeof config === 'function' ? (config as () => unknown)() : config;
      return { handlers: {}, auth: async () => null, signIn: async () => {}, signOut: async () => {} };
    },
    CredentialsSignin,
  };
});
vi.mock('next-auth/providers/credentials', () => ({ default: (c: unknown) => c }));
vi.mock('@/server/db/client', () => ({ prismaBase: {} }));
vi.mock('@/server/auth/direct-grant', () => ({
  autenticarPorPalavraPasse: autenticar,
  emailVerificadoDoToken: () => true,
  plataformaAdminDoToken: () => false,
}));

await import('@/lib/auth');

async function tentar(i: number, xff: string): Promise<void> {
  const provider = capturado.config.providers[0];
  const req = new Request('http://localhost/api/auth/callback/credentials', {
    headers: { 'x-forwarded-for': xff },
  });
  await provider
    .authorize({ identificador: `alvo-${i}-${Math.random()}@exemplo.mz`, palavraPasse: 'errada' }, req)
    .catch(() => undefined);
}

beforeEach(() => {
  autenticar.mockReset();
  autenticar.mockResolvedValue({ ok: false, motivo: 'credenciais' });
});

describe('#552 — limite de login por IP com XFF forjado', () => {
  it('11 falhas da mesma ligação, com primeiro XFF sempre diferente: a 11.ª já não chega ao Keycloak', async () => {
    for (let i = 0; i < 11; i++) await tentar(i, `203.0.113.${i + 1}, 41.220.55.2`);
    expect(autenticar).toHaveBeenCalledTimes(10);
  });

  it('outro cliente real (outro valor à direita) não é afectado', async () => {
    await tentar(99, '203.0.113.1, 41.220.55.3');
    expect(autenticar).toHaveBeenCalledTimes(1);
  });
});
