/**
 * Oráculo da issue #146 — rotas dedicadas para sangria, reforço e cancelamento da sessão de caixa
 * (nó C:caixa-sangria-reforco-146; escrito pelo VERIFICADOR — alterá-lo do lado de quem
 * implementa é BLOCKER).
 *
 * Contrato estrutural (regras da casa: sem modais, page.tsx é Server Component, AlertDialog só
 * para CONFIRMAR uma acção destrutiva — o motivo é um campo de texto, logo vive na rota):
 * - `caixa/[id]/sangria/page.tsx`, `caixa/[id]/reforco/page.tsx`, `caixa/[id]/cancelar/page.tsx`
 *   existem e nenhuma é `'use client'`;
 * - cada rota chega à Server Action que já existe (`registarSangria`, `registarReforco`,
 *   `cancelarSessaoCaixa` de `@/server/actions/caixa.actions`) — nenhuma action nem endpoint novo;
 * - a rota de cancelamento confirma com `AlertDialog`;
 * - o detalhe `caixa/[id]/page.tsx` decide os botões pela função única `acoesSessaoCaixa`
 *   (`@/lib/caixa-acoes`) e liga às três rotas.
 * O comportamento visível é provado pelo E2E `e2e/46-caixa-sangria-reforco-146.spec.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const CAIXA = path.resolve(__dirname, '..');
const DETALHE = path.join(CAIXA, '[id]');

/** Todo o código-fonte (.ts/.tsx) de um directório, recursivo; vazio se não existir. */
function fonte(dir: string): string {
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? '' : fonte(p);
      return /\.tsx?$/.test(e.name) ? fs.readFileSync(p, 'utf8') : '';
    })
    .join('\n');
}

/** Fonte da rota + componentes partilhados de `caixa/_components` e `caixa/[id]/_components`. */
function fonteDaRota(segmento: string): string {
  return [fonte(path.join(DETALHE, segmento)), fonte(path.join(DETALHE, '_components')), fonte(path.join(CAIXA, '_components'))].join('\n');
}

const ROTAS = [
  { segmento: 'sangria', action: 'registarSangria' },
  { segmento: 'reforco', action: 'registarReforco' },
  { segmento: 'cancelar', action: 'cancelarSessaoCaixa' },
] as const;

describe('#146 — rotas da sessão de caixa', () => {
  it.each(ROTAS)('caixa/[id]/$segmento/page.tsx existe e é Server Component', ({ segmento }) => {
    const pagina = path.join(DETALHE, segmento, 'page.tsx');
    expect(fs.existsSync(pagina), `${path.relative(CAIXA, pagina)} existe`).toBe(true);
    const codigo = fs.readFileSync(pagina, 'utf8');
    expect(codigo, 'page.tsx não é Client Component').not.toMatch(/^\s*['"]use client['"]/m);
  });

  it.each(ROTAS)('caixa/[id]/$segmento chega à Server Action existente $action', ({ segmento, action }) => {
    const codigo = fonteDaRota(segmento);
    const importa = new RegExp(
      `import\\s*\\{[^}]*\\b${action}\\b[^}]*\\}\\s*from\\s*['"]@/server/actions/caixa\\.actions['"]`,
    );
    expect(codigo, `a rota ${segmento} (ou um componente dela) importa ${action} de caixa.actions`).toMatch(importa);
  });

  it('a rota de cancelamento confirma com AlertDialog (e não com Dialog)', () => {
    const codigo = fonte(path.join(DETALHE, 'cancelar')) + '\n' + fonte(path.join(DETALHE, '_components'));
    expect(codigo).toMatch(/\bAlertDialog\b/);
    expect(codigo).not.toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
  });

  it('o detalhe decide os botões por acoesSessaoCaixa e liga às três rotas', () => {
    const pagina = path.join(DETALHE, 'page.tsx');
    const codigo = fs.readFileSync(pagina, 'utf8');
    expect(codigo).toMatch(/\bacoesSessaoCaixa\b/);
    expect(codigo).toMatch(/from\s+['"]@\/lib\/caixa-acoes['"]/);
    for (const { segmento } of ROTAS) {
      expect(codigo, `o detalhe liga a /caixa/[id]/${segmento}`).toMatch(new RegExp(`/${segmento}\\b`));
    }
  });
});
