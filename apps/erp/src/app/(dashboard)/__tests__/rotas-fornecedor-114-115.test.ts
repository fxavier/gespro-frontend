/**
 * Oráculo estático — issue #114: ligações das listas de compras e serviços para páginas
 * inexistentes (404).
 *
 * Varre o CÓDIGO (não precisa de servidor nem de dados): em `src/app/(dashboard)/{servicos,
 * compras,procurement,fornecedores}` e em `src/components`, cada literal de rota que comece por
 * `/servicos`, `/compras`, `/procurement` ou `/fornecedores` (href, rowHref, router.push,
 * redirect, breadcrumbs…) tem de resolver para um `page.tsx` (ou `route.ts`) real do App Router.
 * Uma interpolação `${…}` num segmento só casa com um segmento dinâmico `[param]`.
 *
 * Contrato (critério de aceitação da #114: «Criar as rotas ou retirar as ligações»):
 *   1. Nenhuma ligação nessas áreas aponta para uma rota inexistente.
 *   2. Para cada uma das rotas citadas na issue, ou a página existe, ou nenhuma ligação lhe
 *      aponta. (O orquestrador prefere criar as rotas no molde golden standard; o oráculo
 *      aceita as duas saídas que a issue admite.)
 *   3. Partida: `/compras/cotacoes/[id]`, `/compras/pedidos/[id]` e os redireccionamentos de
 *      `/procurement/{cotacoes,pedidos}/[id]` já resolvem (ondas 2b) — guarda contra regressão.
 *
 * ESTADO ESPERADO antes da implementação: RED em 1 e 2 — `/servicos/lista/[id]/editar`,
 * `/servicos/agendamentos/[id]`, `/servicos/contratos/[id]` e `/servicos/categorias/[id]/editar`
 * são ligadas e não existem.
 *
 * Escrito pelo verificador do nó B:rotas-fornecedor-114-115; um agente de implementação que o
 * altere é BLOCKER.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../..'); // apps/erp/src
const APP = path.join(SRC, 'app');
const DASH = path.join(APP, '(dashboard)');

const AREAS = ['servicos', 'compras', 'procurement', 'fornecedores'];
const RAIZES_VARRIDAS = [...AREAS.map((a) => path.join(DASH, a)), path.join(SRC, 'components')];

const DIN = '\u0000din'; // marcador de segmento interpolado

function ficheiros(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      out.push(...ficheiros(p));
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

interface Ligacao {
  ficheiro: string;
  linha: number;
  rota: string;
}

const RE_LITERAL = new RegExp(
  String.raw`[\`'"](\/(?:${AREAS.join('|')})(?:\/(?:\$\{[^}]*\}|[^\`'"\s?#$/])*)*)(?=[\`'"?#])`,
  'g',
);

function ligacoes(): Ligacao[] {
  const out: Ligacao[] = [];
  for (const raiz of RAIZES_VARRIDAS) {
    for (const f of ficheiros(raiz)) {
      const linhas = fs.readFileSync(f, 'utf8').split('\n');
      linhas.forEach((texto, i) => {
        for (const m of texto.matchAll(RE_LITERAL)) {
          out.push({ ficheiro: path.relative(SRC, f), linha: i + 1, rota: m[1].replace(/\/+$/, '') });
        }
      });
    }
  }
  return out;
}

function segmentos(rota: string): string[] {
  return rota
    .split('/')
    .filter(Boolean)
    .map((s) => (s.includes('${') ? DIN : s));
}

const eGrupo = (n: string) => /^\([^.)][^)]*\)$/.test(n); // (dashboard), não (.)x
const eDinamico = (n: string) => /^\[[^.[\]]+\]$/.test(n); // [id]
const eCatchAll = (n: string) => /^\[\[?\.\.\.[^\]]+\]\]?$/.test(n);

function temPagina(dir: string): boolean {
  return ['page.tsx', 'page.ts', 'page.jsx', 'route.ts', 'route.tsx'].some((f) =>
    fs.existsSync(path.join(dir, f)),
  );
}

function filhos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('@'))
    .map((e) => e.name);
}

function resolve(segs: string[], dir: string): boolean {
  if (segs.length === 0) {
    if (temPagina(dir)) return true;
    return filhos(dir).some((c) => (eGrupo(c) && resolve([], path.join(dir, c))) || (c.startsWith('[[...') && temPagina(path.join(dir, c))));
  }
  const [s, ...resto] = segs;
  for (const c of filhos(dir)) {
    const p = path.join(dir, c);
    if (eGrupo(c) && resolve(segs, p)) return true;
    if (s !== DIN && c === s && resolve(resto, p)) return true;
    if (eDinamico(c) && resolve(resto, p)) return true;
    if (eCatchAll(c) && temPagina(p)) return true;
  }
  return false;
}

const existe = (rota: string) => resolve(segmentos(rota), APP);

/** Rotas citadas na #114, em forma de padrão (`${id}` = segmento dinâmico). */
const CITADAS_SERVICOS = [
  '/servicos/lista/${id}/editar',
  '/servicos/agendamentos/${id}',
  '/servicos/contratos/${id}',
  '/servicos/categorias/${id}/editar',
];

function mesmaForma(a: string, b: string): boolean {
  const sa = segmentos(a);
  const sb = segmentos(b);
  return sa.length === sb.length && sa.every((s, i) => s === sb[i]);
}

describe('#114 — ligações de compras e serviços resolvem para páginas reais', () => {
  const todas = ligacoes();

  it('o varrimento encontra ligações (sanidade do extractor)', () => {
    expect(todas.length).toBeGreaterThan(20);
    expect(todas.some((l) => l.rota === '/servicos/lista')).toBe(true);
    expect(todas.some((l) => mesmaForma(l.rota, '/compras/pedidos/${id}'))).toBe(true);
  });

  it('partida: o resolvedor reconhece rotas existentes e recusa as inventadas', () => {
    expect(existe('/compras/cotacoes/${id}')).toBe(true);
    expect(existe('/compras/pedidos/${id}')).toBe(true);
    expect(existe('/procurement/cotacoes/${id}')).toBe(true);
    expect(existe('/procurement/pedidos/${id}')).toBe(true);
    expect(existe('/compras/requisicoes/${id}/editar')).toBe(true);
    expect(existe('/servicos/lista/${id}')).toBe(true);
    expect(existe('/servicos/rota-que-nao-existe-114')).toBe(false);
  });

  it('nenhuma ligação em servicos/compras/procurement/fornecedores aponta para uma rota inexistente', () => {
    const partidas = todas.filter((l) => !existe(l.rota));
    expect(
      partidas.map((l) => `${l.ficheiro}:${l.linha} → ${l.rota}`),
      'ligações para páginas inexistentes (criar a rota ou retirar a ligação)',
    ).toEqual([]);
  });

  it.each(CITADAS_SERVICOS)('rota citada na #114 %s: ou existe, ou ninguém lhe liga', (padrao) => {
    if (existe(padrao)) return;
    const quemLiga = todas.filter((l) => mesmaForma(l.rota, padrao));
    expect(
      quemLiga.map((l) => `${l.ficheiro}:${l.linha}`),
      `${padrao} não existe e continua ligada`,
    ).toEqual([]);
  });
});
