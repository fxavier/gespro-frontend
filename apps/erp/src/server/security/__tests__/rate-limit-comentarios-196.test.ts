/**
 * ORÁCULO da issue #196 — os comentários de limites dizem o que o código faz.
 * Escrito pelo verificador ANTES da correcção; o autor não o altera.
 *
 * Apurado em leitura de código (issue #196):
 *  - as rotas de payroll (recibo, mapas INSS e IRPS) dizem «20 exportações por
 *    utilizador por hora», mas o limitador que usam é por MINUTO (exportLimiter);
 *  - o limitador de login diz «5/15 min por identificador», mas há um só
 *    `loginLimiter` (max 10) para as duas chaves, IP e identificador.
 *
 * O oráculo não fixa a redacção nova — só recusa as afirmações que o código
 * desmente, e confirma que o comentário do login bate com o `max` configurado.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '../../../..');
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

const ROTAS_PAYROLL = [
  'src/app/api/rh/payroll/[id]/recibo/route.ts',
  'src/app/api/rh/payroll/mapas/inss/route.ts',
  'src/app/api/rh/payroll/mapas/irps/route.ts',
];

describe('#196 — comentários de limites certos', () => {
  for (const rel of ROTAS_PAYROLL) {
    it(`${rel}: não diz que o limite é por hora (o limitador é por minuto)`, () => {
      const fonte = ler(rel);
      expect(fonte).not.toMatch(/20 exporta[çc][õo]es por utilizador por hora/i);
      const comentariosLimite = fonte
        .split('\n')
        .filter((l) => /^\s*(\/\/|\*)/.test(l) && /rate.?limit|limit/i.test(l));
      for (const linha of comentariosLimite) {
        expect(linha, `comentário de limite errado: «${linha.trim()}»`).not.toMatch(/por hora|\/h\b/i);
      }
    });
  }

  it('rate-limiter.ts: o login não anuncia 5/15 min por identificador quando o limitador é um só', () => {
    const fonte = ler('src/server/security/rate-limiter.ts');
    const inicio = fonte.indexOf('export const loginLimiter');
    expect(inicio).toBeGreaterThan(0);
    const config = fonte.slice(inicio, fonte.indexOf('});', inicio));
    const max = Number(/max:\s*(\d+)/.exec(config)?.[1]);
    expect(Number.isFinite(max)).toBe(true);

    // Só há um limitador de login, logo o comentário não pode prometer um
    // limite por identificador diferente do `max` configurado.
    expect(fonte).not.toMatch(/5\s*\/\s*15\s*min por identificador/i);
    const docLogin = fonte.slice(fonte.lastIndexOf('/**', inicio), inicio);
    const prometidos = [...docLogin.matchAll(/(\d+)\s*(?:tentativas)?\s*\/\s*15\s*min/gi)].map((m) =>
      Number(m[1]),
    );
    expect(prometidos.length).toBeGreaterThan(0);
    for (const n of prometidos) expect(n, `comentário promete ${n}/15 min, o código tem max ${max}`).toBe(max);
  });
});
