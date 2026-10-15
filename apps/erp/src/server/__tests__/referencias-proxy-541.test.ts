/**
 * ORÁCULO — issue #541 (nó G:site-proxy-refs): referências restantes a
 * `middleware.ts` depois do proxy do Next 16 (#533/#540).
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *   1. Referências VIVAS — `.claude/agents/*.md` e o comentário de
 *      `apps/erp/e2e/50-recuperar-palavra-passe-178.spec.ts` — deixam de nomear
 *      `middleware.ts` como ficheiro e nomeiam `src/proxy.ts` (agentes) / o
 *      «proxy» (comentário do E2E).
 *   2. Documentos HISTÓRICOS — `docs/status.md` (linha da spec 17),
 *      `docs/prompt-wave5-claude-code.md`, `docs/prompt-wave6-claude-code.md` —
 *      NÃO são reescritos: continuam a nomear `middleware.ts`, e cada menção
 *      leva logo a seguir «(hoje `src/proxy.ts`)».
 *   3. O site deixa de ter `apps/site/src/middleware.ts` (coberto em
 *      `apps/site/src/__tests__/proxy-next16-541.test.ts`).
 *
 * ESTADO ESPERADO antes da implementação: RED.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ERP = resolve(__dirname, '../../..');
const RAIZ = resolve(ERP, '../..');
const AGENTES = resolve(RAIZ, '.claude/agents');

function ler(p: string): string {
  expect(existsSync(p), `${p} não existe`).toBe(true);
  return readFileSync(p, 'utf-8');
}

describe('#541 — referências vivas nomeiam src/proxy.ts, não middleware.ts', () => {
  it('nenhum .claude/agents/*.md nomeia middleware.ts', () => {
    const ficheiros = readdirSync(AGENTES).filter((f) => f.endsWith('.md'));
    expect(ficheiros.length).toBeGreaterThan(0);
    const ofensores = ficheiros.filter((f) => /middleware\.ts/.test(readFileSync(join(AGENTES, f), 'utf-8')));
    expect(ofensores).toEqual([]);
  });

  it.each(['feat-seguranca.md', 'feat-observabilidade.md', 'w8-identidade.md', 'w8-orchestrator.md'])(
    '.claude/agents/%s nomeia src/proxy.ts',
    (f) => {
      expect(ler(join(AGENTES, f))).toMatch(/src\/proxy\.ts/);
    },
  );

  it('o comentário de e2e/50-recuperar-palavra-passe-178.spec.ts fala do proxy, não do middleware', () => {
    const texto = ler(resolve(ERP, 'e2e/50-recuperar-palavra-passe-178.spec.ts'));
    expect(texto).not.toMatch(/middleware/i);
    expect(texto).toMatch(/proxy/);
  });
});

describe('#541 — documentos históricos ficam, com «(hoje `src/proxy.ts`)»', () => {
  // Uma menção a `middleware.ts` NÃO seguida (espaço/quebra de linha permitidos) da anotação.
  const SEM_ANOTACAO = /middleware\.ts(?!`?\s*\(hoje `?src\/proxy\.ts`?\))/;

  it.each(['docs/status.md', 'docs/prompt-wave5-claude-code.md', 'docs/prompt-wave6-claude-code.md'])(
    '%s continua a nomear middleware.ts, sempre anotado com (hoje `src/proxy.ts`)',
    (rel) => {
      const texto = ler(resolve(RAIZ, rel));
      expect(texto, `${rel}: a história foi reescrita (middleware.ts desapareceu)`).toMatch(/middleware\.ts/);
      const m = SEM_ANOTACAO.exec(texto);
      const contexto = m ? texto.slice(Math.max(0, m.index - 60), m.index + 80) : null;
      expect(contexto, `${rel}: menção a middleware.ts sem «(hoje \`src/proxy.ts\`)»`).toBeNull();
    },
  );

  it('docs/status.md: a linha da spec 17 mantém middleware.ts e acrescenta (hoje `src/proxy.ts`)', () => {
    const linha = ler(resolve(RAIZ, 'docs/status.md'))
      .split('\n')
      .find((l) => /^\|\s*17 segurança/.test(l));
    expect(linha, 'linha da spec 17 não encontrada').toBeDefined();
    expect(linha).toMatch(/middleware\.ts`?\s*\(hoje `?src\/proxy\.ts`?\)/);
  });
});
