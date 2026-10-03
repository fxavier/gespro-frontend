/**
 * ORÁCULO S2 (#297) — `hrefRazaoPeriodos` em `src/lib/balancete-params.ts`.
 *
 * A função não existe ainda: este ficheiro fica VERMELHO até à implementação.
 * NUNCA `vitest -u`; um agente de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (S2, issue #297):
 *   `hrefRazaoPeriodos(contaId, exercicioCodigo, intervalo): string`
 *   → `/contabilidade/razao-geral?contaId=<id>&exercicio=<código>&de=<n>&ate=<n>`
 *      mais `&p13=1` APENAS quando `intervalo.incluir13 === true`.
 *   Parâmetros numéricos serializam como string sem zeros à esquerda («3», não «03»).
 */
import { describe, expect, it } from 'vitest';

// Import dinâmico: compila mesmo antes de a função existir; cria uma prova vermelha
// limpa («hrefRazaoPeriodos is not a function» e não um erro de tipo).
const modulo = () => import('../balancete-params');

const RAZAO = '/contabilidade/razao-geral';

describe('hrefRazaoPeriodos', () => {
  it('gera URL base com contaId, código de exercício e intervalo de períodos', async () => {
    const { hrefRazaoPeriodos } = await modulo();
    const href = hrefRazaoPeriodos('conta-abc', '2026', { periodoInicial: 3, periodoFinal: 5, incluir13: false });
    const u = new URL(href, 'http://localhost');
    expect(u.pathname, 'caminho').toBe(RAZAO);
    const p = Object.fromEntries(u.searchParams);
    expect(p, 'parâmetros completos sem extras').toEqual({
      contaId: 'conta-abc',
      exercicio: '2026',
      de: '3',
      ate: '5',
    });
  });

  it('inclui p13=1 quando incluir13 é true', async () => {
    const { hrefRazaoPeriodos } = await modulo();
    const href = hrefRazaoPeriodos('conta-xyz', '2026', {
      periodoInicial: 12,
      periodoFinal: 13,
      incluir13: true,
    });
    const u = new URL(href, 'http://localhost');
    const p = Object.fromEntries(u.searchParams);
    expect(p, 'parâmetros com p13').toEqual({
      contaId: 'conta-xyz',
      exercicio: '2026',
      de: '12',
      ate: '13',
      p13: '1',
    });
  });

  it('não inclui p13 quando incluir13 é false', async () => {
    const { hrefRazaoPeriodos } = await modulo();
    const href = hrefRazaoPeriodos('c1', '2025', {
      periodoInicial: 1,
      periodoFinal: 12,
      incluir13: false,
    });
    const u = new URL(href, 'http://localhost');
    expect(u.searchParams.has('p13'), 'sem p13').toBe(false);
    expect(u.searchParams.get('de'), 'de=1').toBe('1');
    expect(u.searchParams.get('ate'), 'ate=12').toBe('12');
    expect(u.searchParams.get('exercicio'), 'exercicio=2025').toBe('2025');
  });

  it('serializa períodos como string numérica sem zeros à esquerda', async () => {
    const { hrefRazaoPeriodos } = await modulo();
    // período 1 deve aparecer como '1', não '01'
    const href = hrefRazaoPeriodos('c2', '2026', {
      periodoInicial: 1,
      periodoFinal: 6,
      incluir13: false,
    });
    const u = new URL(href, 'http://localhost');
    expect(u.searchParams.get('de'), 'sem zero à esquerda').toBe('1');
    expect(u.searchParams.get('ate'), 'sem zero à esquerda').toBe('6');
  });

  it('periodoInicial = periodoFinal: URL válido com de=ate', async () => {
    const { hrefRazaoPeriodos } = await modulo();
    const href = hrefRazaoPeriodos('c3', '2026', {
      periodoInicial: 6,
      periodoFinal: 6,
      incluir13: false,
    });
    const u = new URL(href, 'http://localhost');
    expect(u.searchParams.get('de'), 'de=6').toBe('6');
    expect(u.searchParams.get('ate'), 'ate=6').toBe('6');
  });

  it('exercício como string (não converte para número)', async () => {
    const { hrefRazaoPeriodos } = await modulo();
    const href = hrefRazaoPeriodos('c4', '2027', {
      periodoInicial: 2,
      periodoFinal: 8,
      incluir13: false,
    });
    const u = new URL(href, 'http://localhost');
    expect(u.searchParams.get('exercicio'), 'exercicio=2027').toBe('2027');
  });
});
