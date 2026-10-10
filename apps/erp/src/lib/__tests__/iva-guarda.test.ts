/**
 * Oráculo da issue #77 — T3: guarda estática contra o padrão que gravou 0% como 16%.
 *
 * `Number(l.taxaIva) || 0.16` — o 0 é falsy. O mesmo padrão aparecia em 13
 * sítios de 5 formulários, mais `|| 0` nos totais e `z.coerce.number()` nos
 * schemas locais (que converte '' em 0 sem ninguém pedir). Esta guarda varre
 * `src/` e falha com ficheiro:linha se algum voltar.
 *
 *   (a) um `||` logo a seguir a uma taxa:  /taxa\w*\)?\s*\|\|/i
 *   (b) `taxaIva` definido com `z.coerce.number()` (mesmo partido em várias linhas)
 *   (c) #207: `taxaIva` definido com `z.number()` cru (aceita 0.17) — a taxa sai sempre de
 *       `taxaIvaSchema()` de `@/lib/iva`, a mesma da faturação
 *
 * Excepção explícita — decisão D4 da issue #77: `validations/plataforma.ts` fica fora de
 * âmbito (o `taxaIvaDefault` do tenant continua a aceitar 0..1); não é varrido aqui.
 * `validations/vendas.ts` e `validations/servicos.ts` deixaram de ser excepção com a #207.
 * Tudo o resto tem de estar limpo.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ_SRC = path.resolve(__dirname, '../..'); // apps/erp/src

/** D4 (issue #77): fora de âmbito — continua a aceitar 0..1. Vendas e serviços saíram com a #207. */
const EXCEPCOES_D4 = new Set(['lib/validations/plataforma.ts'].map((p) => path.join(RAIZ_SRC, p)));

const PADRAO_OU = /taxa\w*\)?\s*\|\|/i;
const PADRAO_COERCE = /taxaIva\s*:\s*z\s*\.\s*coerce\s*\.\s*number\b/g;
/** #207: `taxaIva: z.number()` (também partido em várias linhas); `taxaIvaDefault` não casa. */
const PADRAO_NUMBER_CRU = /\btaxaIva\s*:\s*z\s*\.\s*number\b/g;

function listarFicheiros(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__' || entrada.name === 'node_modules') continue;
      saida.push(...listarFicheiros(completo));
    } else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      saida.push(completo);
    }
  }
  return saida;
}

function linhaDoIndice(texto: string, indice: number): number {
  return texto.slice(0, indice).split('\n').length;
}

function varrer(ficheiros: string[]) {
  const ou: string[] = [];
  const coerce: string[] = [];
  const cru: string[] = [];
  for (const f of ficheiros) {
    const texto = fs.readFileSync(f, 'utf8');
    const rel = path.relative(RAIZ_SRC, f);
    texto.split('\n').forEach((linha, i) => {
      if (PADRAO_OU.test(linha)) ou.push(`${rel}:${i + 1}: ${linha.trim()}`);
    });
    for (const m of texto.matchAll(PADRAO_COERCE)) {
      coerce.push(`${rel}:${linhaDoIndice(texto, m.index ?? 0)}: ${m[0].replace(/\s+/g, ' ')}`);
    }
    for (const m of texto.matchAll(PADRAO_NUMBER_CRU)) {
      cru.push(`${rel}:${linhaDoIndice(texto, m.index ?? 0)}: ${m[0].replace(/\s+/g, ' ')}`);
    }
  }
  return { ou, coerce, cru };
}

describe('guarda estática da taxa de IVA', () => {
  it('os padrões detectam as formas conhecidas do defeito (auto-teste)', () => {
    expect(PADRAO_OU.test('const taxa = Number(l.taxaIva) || 0.16;')).toBe(true);
    expect(PADRAO_OU.test('const taxa = Number(itens[i]?.taxaIva) || 0;')).toBe(true);
    expect(PADRAO_OU.test('taxaIva: Number(it.taxaIva) || 0.16,')).toBe(true);
    expect(PADRAO_OU.test('const t = lerTaxaIva(l.taxaIva);')).toBe(false);
    expect('taxaIva: z.coerce.number().default(0.16),'.match(PADRAO_COERCE)).not.toBeNull();
    expect('taxaIva: z.coerce\n    .number()\n    .refine(x)'.match(PADRAO_COERCE)).not.toBeNull();
    expect('taxaIva: taxaIvaSchema(),'.match(PADRAO_COERCE)).toBeNull();
    expect('taxaIva: z.number().min(0).max(1).default(0.16),'.match(PADRAO_NUMBER_CRU)).not.toBeNull();
    expect('taxaIva: z\n    .number()\n    .min(0)'.match(PADRAO_NUMBER_CRU)).not.toBeNull();
    expect('taxaIvaDefault: z.number().min(0).max(1),'.match(PADRAO_NUMBER_CRU)).toBeNull();
    expect('taxaIva: taxaIvaSchema(),'.match(PADRAO_NUMBER_CRU)).toBeNull();
  });

  it('vendas.ts e servicos.ts já não são excepção (#207)', () => {
    for (const p of ['lib/validations/vendas.ts', 'lib/validations/servicos.ts']) {
      expect(EXCEPCOES_D4.has(path.join(RAIZ_SRC, p)), p).toBe(false);
    }
  });

  it('as excepções D4 existem (se uma for renomeada, a excepção deixa de ter efeito)', () => {
    for (const f of EXCEPCOES_D4) expect(fs.existsSync(f), f).toBe(true);
  });

  const ficheiros = listarFicheiros(RAIZ_SRC).filter((f) => !EXCEPCOES_D4.has(f));
  const { ou, coerce, cru } = varrer(ficheiros);

  it('varre um número plausível de ficheiros', () => {
    expect(ficheiros.length).toBeGreaterThan(200);
  });

  it('(a) nenhum `||` a seguir a uma taxa em src/ (fora das excepções D4)', () => {
    expect(ou, `\n${ou.join('\n')}\n`).toEqual([]);
  });

  it('(b) nenhum `taxaIva: z.coerce.number()` em src/ (fora das excepções D4)', () => {
    expect(coerce, `\n${coerce.join('\n')}\n`).toEqual([]);
  });

  it('(c) nenhum `taxaIva: z.number()` cru em src/ (#207 — só taxaIvaSchema)', () => {
    expect(cru, `\n${cru.join('\n')}\n`).toEqual([]);
  });
});
