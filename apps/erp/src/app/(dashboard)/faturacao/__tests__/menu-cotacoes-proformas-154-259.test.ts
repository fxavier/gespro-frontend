/**
 * Oráculo estrutural das issues #154 e #259 — os menus ⋯ das listas de cotações e proformas só
 * oferecem as acções que o estado e a permissão permitem (nó C:menu-cotacoes-proformas-154-259;
 * escrito pelo VERIFICADOR — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * A regra em si está provada em `src/lib/__tests__/menu-cotacoes-proformas-154-259.test.ts`.
 * Aqui prova-se a ligação:
 * - `cotacoes/page.tsx` e `proforma/page.tsx` (Server Components) decidem por linha com a função
 *   única de `@/lib/faturacao-acoes` (`acoesMenuCotacao` / `acoesMenuProforma`);
 * - as tabelas (`'use client'`) recebem `podeConverter`/`podeRejeitar` no resumo e cada `Link` para
 *   `/converter` e `/rejeitar` está condicionado a essa flag (como já acontecia com `/cancelar`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const FATURACAO = path.resolve(__dirname, '..');
const ler = (rel: string) => fs.readFileSync(path.join(FATURACAO, rel), 'utf8');

/**
 * Todas as ocorrências de `/<lista>/${row.id}/<segmento>` no código têm a flag `row.<flag>` nos
 * 400 caracteres anteriores (o `{row.flag && (` que embrulha o item do menu).
 */
function ligacoesCondicionadas(codigo: string, lista: string, segmento: string, flag: string) {
  const alvo = `/faturacao/${lista}/\${row.id}/${segmento}`;
  const posicoes: number[] = [];
  for (let i = codigo.indexOf(alvo); i !== -1; i = codigo.indexOf(alvo, i + 1)) posicoes.push(i);
  return posicoes.map((i) => ({ i, condicionada: codigo.slice(Math.max(0, i - 400), i).includes(`row.${flag}`) }));
}

describe('#154/#259 — menu da lista de cotações', () => {
  const tabela = () => ler('cotacoes/_components/cotacoes-table.tsx');

  it('CotacaoResumo traz podeConverter e podeRejeitar (decididos no servidor)', () => {
    const codigo = tabela();
    const iface = codigo.slice(codigo.indexOf('interface CotacaoResumo'), codigo.indexOf('}', codigo.indexOf('interface CotacaoResumo')));
    expect(iface).toMatch(/\bpodeConverter\s*:\s*boolean/);
    expect(iface).toMatch(/\bpodeRejeitar\s*:\s*boolean/);
  });

  it.each([
    ['converter', 'podeConverter'],
    ['rejeitar', 'podeRejeitar'],
    ['cancelar', 'podeCancelar'],
  ])('o item /%s só aparece com row.%s', (segmento, flag) => {
    const ligacoes = ligacoesCondicionadas(tabela(), 'cotacoes', segmento, flag);
    expect(ligacoes.length, `a tabela ainda liga a /${segmento}`).toBeGreaterThan(0);
    for (const l of ligacoes) expect(l.condicionada, `ligação a /${segmento} sem row.${flag}`).toBe(true);
  });

  it('cotacoes/page.tsx decide por acoesMenuCotacao de @/lib/faturacao-acoes', () => {
    const codigo = ler('cotacoes/page.tsx');
    expect(codigo).not.toMatch(/^\s*['"]use client['"]/m);
    expect(codigo).toMatch(/import\s*\{[^}]*\bacoesMenuCotacao\b[^}]*\}\s*from\s*['"]@\/lib\/faturacao-acoes['"]/);
    expect(codigo).toMatch(/\bacoesMenuCotacao\s*\(/);
    expect(codigo).toMatch(/\bpodeConverter\b/);
    expect(codigo).toMatch(/\bpodeRejeitar\b/);
  });
});

describe('#259 — menu da lista de proformas', () => {
  const tabela = () => ler('proforma/_components/proformas-table.tsx');

  it('ProformaResumo traz podeConverter (decidido no servidor)', () => {
    const codigo = tabela();
    const iface = codigo.slice(codigo.indexOf('interface ProformaResumo'), codigo.indexOf('}', codigo.indexOf('interface ProformaResumo')));
    expect(iface).toMatch(/\bpodeConverter\s*:\s*boolean/);
  });

  it.each([
    ['converter', 'podeConverter'],
    ['cancelar', 'podeCancelar'],
  ])('o item /%s só aparece com row.%s', (segmento, flag) => {
    const ligacoes = ligacoesCondicionadas(tabela(), 'proforma', segmento, flag);
    expect(ligacoes.length, `a tabela ainda liga a /${segmento}`).toBeGreaterThan(0);
    for (const l of ligacoes) expect(l.condicionada, `ligação a /${segmento} sem row.${flag}`).toBe(true);
  });

  it('proforma/page.tsx decide por acoesMenuProforma de @/lib/faturacao-acoes', () => {
    const codigo = ler('proforma/page.tsx');
    expect(codigo).not.toMatch(/^\s*['"]use client['"]/m);
    expect(codigo).toMatch(/import\s*\{[^}]*\bacoesMenuProforma\b[^}]*\}\s*from\s*['"]@\/lib\/faturacao-acoes['"]/);
    expect(codigo).toMatch(/\bacoesMenuProforma\s*\(/);
    expect(codigo).toMatch(/\bpodeConverter\b/);
  });
});
