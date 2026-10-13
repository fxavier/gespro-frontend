/**
 * Oráculo #373 — excepção de TESTE ao limite do registo público, lida pela porta de rate-limit.
 *
 * O E2E 36 (ciclo do exercício) regista um tenant novo por `/registo` em cada corrida; o
 * `registoLimiter` (3/h por IP e por e-mail, ADR-0014 §3) só o deixa correr três vezes por hora
 * contra o mesmo servidor. Contrato:
 *
 *   - `RATE_LIMIT_REGISTO_DESLIGADO=1` desliga o limite do REGISTO — e só dele — fora de produção
 *     (`NODE_ENV` ≠ `production`: o `pnpm dev` dos jobs e2e/a11y da CI corre com `development`).
 *   - Em `NODE_ENV=production` a variável é IGNORADA: o limite aplica-se como sempre. Nunca há
 *     registo ilimitado em produção, nem por engano de configuração.
 *   - Só o valor exacto `1` liga a excepção (`0`, vazio ⇒ limite normal).
 *   - A excepção vive na PORTA (`rate-limiter.ts`), não num adaptador: com o driver `valkey` e a
 *     bandeira ligada, o registo passa sem tocar no Valkey.
 *   - Os outros limitadores públicos (recuperação de palavra-passe) não são afectados.
 *
 * O `playwright.config.ts` liga a bandeira no `pnpm dev` que o próprio Playwright arranca.
 *
 * Os limitadores são constantes de módulo criadas no import: cada caso faz `vi.resetModules()`,
 * fixa o ambiente e importa a porta de novo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Porta = typeof import('../rate-limiter');

const BANDEIRA = 'RATE_LIMIT_REGISTO_DESLIGADO';

async function portaCom(env: Record<string, string | undefined>): Promise<Porta> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import('../rate-limiter');
}

/** Consome `n` vezes a mesma chave e devolve quantas vezes o limitador recusou. */
async function recusasEm(
  limiter: { consume(k: string): Promise<{ limited: boolean }> },
  chave: string,
  n: number,
): Promise<number> {
  let recusas = 0;
  for (let i = 0; i < n; i++) {
    if ((await limiter.consume(chave)).limited) recusas++;
  }
  return recusas;
}

beforeEach(() => {
  vi.stubEnv('RATE_LIMIT_DRIVER', 'memory');
  vi.stubEnv(BANDEIRA, undefined as unknown as string);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('#373 — excepção de teste ao limite do registo (RATE_LIMIT_REGISTO_DESLIGADO)', () => {
  it('sem a bandeira, em development: o 4.º registo do mesmo IP é recusado (limite de 3/h intacto)', async () => {
    const { registoLimiter } = await portaCom({ NODE_ENV: 'development' });
    expect(await recusasEm(registoLimiter, '10.0.0.1::registo', 4)).toBe(1);
  });

  it.each(['development', 'test'])(
    'com a bandeira =1 e NODE_ENV=%s: dez registos seguidos do mesmo IP e e-mail passam todos',
    async (nodeEnv) => {
      const { registoLimiter } = await portaCom({ NODE_ENV: nodeEnv, [BANDEIRA]: '1' });
      expect(await recusasEm(registoLimiter, '10.0.0.2::registo', 10)).toBe(0);
      expect(await recusasEm(registoLimiter, 'e2e@exemplo.mz::registo', 10)).toBe(0);
      expect((await registoLimiter.check('10.0.0.2::registo')).limited).toBe(false);
    },
  );

  it('com a bandeira =1 mas NODE_ENV=production: a bandeira é IGNORADA e o 4.º registo é recusado', async () => {
    const { registoLimiter } = await portaCom({ NODE_ENV: 'production', [BANDEIRA]: '1' });
    expect(await recusasEm(registoLimiter, '10.0.0.3::registo', 4)).toBe(1);
  });

  it.each(['0', '', 'sim'])('a bandeira com o valor «%s» não desliga nada', async (valor) => {
    const { registoLimiter } = await portaCom({ NODE_ENV: 'development', [BANDEIRA]: valor });
    expect(await recusasEm(registoLimiter, '10.0.0.4::registo', 4)).toBe(1);
  });

  it('a bandeira só toca no registo: a recuperação de palavra-passe continua limitada (5/h por e-mail)', async () => {
    const { recuperacaoEmailLimiter, registoLimiter } = await portaCom({
      NODE_ENV: 'development',
      [BANDEIRA]: '1',
    });
    // Pré-condição: a bandeira está mesmo activa nesta instância (senão o caso não prova nada).
    expect(await recusasEm(registoLimiter, '10.0.0.5::registo', 4)).toBe(0);
    expect(await recusasEm(recuperacaoEmailLimiter, 'x@exemplo.mz::recuperacao', 6)).toBe(1);
  });

  it('a excepção vive na porta: com RATE_LIMIT_DRIVER=valkey (sem Valkey) e a bandeira, o registo passa', async () => {
    // Sem a bandeira, o registo é FALHA FECHADA com o Valkey em baixa (failClosed: true) —
    // recusaria. Com a bandeira, a porta nem chega ao adaptador.
    const { registoLimiter } = await portaCom({
      NODE_ENV: 'development',
      RATE_LIMIT_DRIVER: 'valkey',
      VALKEY_URL: undefined,
      [BANDEIRA]: '1',
    });
    expect(await recusasEm(registoLimiter, '10.0.0.6::registo', 4)).toBe(0);
  });
});

describe('#373 — o Playwright liga a bandeira no servidor que arranca', () => {
  it('playwright.config.ts passa RATE_LIMIT_REGISTO_DESLIGADO=1 ao webServer', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../../../../playwright.config.ts'), 'utf8');
    const webServer = fonte.slice(fonte.indexOf('webServer'));
    expect(webServer).toMatch(/RATE_LIMIT_REGISTO_DESLIGADO:\s*process\.env\.RATE_LIMIT_REGISTO_DESLIGADO\s*\?\?\s*'1'/);
  });
});
