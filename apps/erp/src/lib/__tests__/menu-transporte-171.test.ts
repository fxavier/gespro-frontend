/**
 * Issue #171 — Entregas e documentos de transporte no menu; detalhe de manutenção
 * ligado a partir da lista (ORÁCULO, escrito pelo verificador; outro agente implementa).
 *
 * Contrato (decisão do orquestrador; opção conservadora onde ficou em aberto):
 *  - O grupo «Transporte & Logística» de `src/components/layout/AppSidebar.tsx` passa a
 *    ter entradas para as três páginas que já existem e não tinham ligação:
 *      `/transporte/entregas`, `/transporte/veiculos/documentos`,
 *      `/transporte/motoristas/documentos` — cada uma uma só vez em toda a barra, com
 *    título e um ícone do `lucide-react` importado no ficheiro. As entradas que já lá
 *    estavam (Dashboard, Viaturas, Motoristas, Rotas, Combustível) mantêm-se.
 *  - Mapa rota → permissão (`src/lib/permissoes-rotas.ts`, #76): as três herdam o
 *    `/transporte` → `transporte:ver` (a guarda que já protege as páginas). Opção
 *    conservadora: nenhuma permissão nova, nenhuma chave nova obrigatória (uma chave
 *    nova exigiria `layout.tsx` próprio pelo teste do #76); se o implementador
 *    acrescentar chaves, têm de resolver para `transporte:ver` na mesma.
 *  - A lista `/transporte/manutencao` liga cada linha ao detalhe
 *    `/transporte/manutencao/{id}` (o `rowHref` do `DataTable`, como as listas vizinhas
 *    de entregas, viaturas, motoristas e rotas).
 *
 * O módulo é importado por caminho dinâmico e lido por `any`: cada caso falha pelo
 * comportamento em falta, não o ficheiro.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const SRC = path.join(RAIZ, 'src');
const DASHBOARD = path.join(SRC, 'app', '(dashboard)');
const SIDEBAR = path.join(SRC, 'components', 'layout', 'AppSidebar.tsx');
const TABELA_MANUTENCAO = path.join(
  DASHBOARD,
  'transporte',
  'manutencao',
  '_components',
  'manutencao-table.tsx',
);

const ENTREGAS = '/transporte/entregas';
const DOC_VIATURAS = '/transporte/veiculos/documentos';
const DOC_MOTORISTAS = '/transporte/motoristas/documentos';
const NOVAS = [ENTREGAS, DOC_VIATURAS, DOC_MOTORISTAS] as const;
const JA_EXISTENTES = [
  '/transporte',
  '/transporte/veiculos',
  '/transporte/motoristas',
  '/transporte/rotas',
  '/transporte/combustivel',
] as const;

type Mod = any;
async function modulo(): Promise<Mod> {
  const caminho = '@/lib/permissoes-rotas';
  try {
    return await import(/* @vite-ignore */ caminho);
  } catch {
    return {};
  }
}

const CATALOGO = new Set(PERMISSIONS.map((p) => p.code));
const perms = (papel: string): string[] =>
  SYSTEM_ROLES.find((r) => r.nome === papel)?.permissionCodes ?? [];

/** Fonte do grupo «Transporte & Logística» (do título até ao fim do grupo). */
function grupoTransporte(): string {
  const fonte = readFileSync(SIDEBAR, 'utf8');
  const inicio = fonte.indexOf("title: 'Transporte & Logística'");
  if (inicio < 0) return '';
  const resto = fonte.slice(inicio);
  const fim = resto.indexOf('\n  },');
  return fim < 0 ? resto : resto.slice(0, fim);
}

/** Entradas `{ title, href, icon }` do grupo, lidas do código-fonte. */
function entradasDoGrupo(): Array<{ title: string; href: string; icon: string }> {
  const re = /\{\s*title:\s*'([^']+)',\s*href:\s*'([^']+)',\s*icon:\s*([A-Za-z0-9_]+)/g;
  return [...grupoTransporte().matchAll(re)].map((m) => ({ title: m[1], href: m[2], icon: m[3] }));
}

/** Identificadores importados de `lucide-react` (com o alias, quando há `as`). */
function iconesImportados(): Set<string> {
  const fonte = readFileSync(SIDEBAR, 'utf8');
  const m = fonte.match(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split(/\s+as\s+/).pop()!.trim()),
  );
}

describe('#171 — sanidade', () => {
  it.each(NOVAS)('%s tem page.tsx (a página já existe)', (rota) => {
    const page = path.join(DASHBOARD, ...rota.split('/').filter(Boolean), 'page.tsx');
    expect(existsSync(page)).toBe(true);
  });

  it('o detalhe de manutenção existe (transporte/manutencao/[id]/page.tsx)', () => {
    expect(existsSync(path.join(DASHBOARD, 'transporte', 'manutencao', '[id]', 'page.tsx'))).toBe(
      true,
    );
  });

  it('o extractor encontra o grupo de Transporte (Viaturas lá está)', () => {
    expect(entradasDoGrupo().map((e) => e.href)).toContain('/transporte/veiculos');
  });
});

describe('#171 — entradas no grupo «Transporte & Logística»', () => {
  it.each(NOVAS)('%s tem entrada no grupo', (rota) => {
    expect(entradasDoGrupo().map((e) => e.href)).toContain(rota);
  });

  it.each(NOVAS)('%s aparece uma só vez em toda a barra lateral', (rota) => {
    const fonte = readFileSync(SIDEBAR, 'utf8');
    const ocorrencias = [...fonte.matchAll(/\bhref:\s*'([^']+)'/g)].filter((m) => m[1] === rota);
    expect(ocorrencias).toHaveLength(1);
  });

  it.each(NOVAS)('%s tem título e ícone do lucide-react importado', (rota) => {
    const entrada = entradasDoGrupo().find((e) => e.href === rota);
    expect(entrada, rota).toBeDefined();
    expect(entrada?.title.trim().length ?? 0).toBeGreaterThan(0);
    expect(iconesImportados().has(entrada?.icon ?? '')).toBe(true);
  });

  it('os dois «Documentos» distinguem-se pelo título (não são dois rótulos iguais)', () => {
    const titulos = entradasDoGrupo()
      .filter((e) => e.href === DOC_VIATURAS || e.href === DOC_MOTORISTAS)
      .map((e) => e.title.trim().toLowerCase());
    expect(titulos).toHaveLength(2);
    expect(new Set(titulos).size).toBe(2);
  });

  it('as entradas que já existiam mantêm-se no grupo', () => {
    const hrefs = entradasDoGrupo().map((e) => e.href);
    for (const rota of JA_EXISTENTES) expect(hrefs, rota).toContain(rota);
  });
});

describe('#171 — mapa rota → permissão (lib/permissoes-rotas)', () => {
  it('transporte:ver existe no catálogo', () => {
    expect(CATALOGO.has('transporte:ver')).toBe(true);
  });

  it.each(NOVAS)('%s resolve para transporte:ver', async (rota) => {
    const m = await modulo();
    expect(m.permissaoDaRota?.(rota)).toBe('transporte:ver');
  });

  it('o detalhe de manutenção resolve para transporte:ver', async () => {
    const m = await modulo();
    expect(m.permissaoDaRota?.('/transporte/manutencao/abc')).toBe('transporte:ver');
  });

  it('ADMIN e GESTOR vêem as três entradas novas', async () => {
    const m = await modulo();
    for (const papel of ['ADMIN', 'GESTOR']) {
      const p = perms(papel);
      expect(p, papel).toContain('transporte:ver');
      for (const rota of NOVAS) expect(m.podeVerRota?.(rota, p), `${papel} ${rota}`).toBe(true);
    }
  });

  it('sem transporte:ver, nenhuma das três aparece', async () => {
    const m = await modulo();
    expect(typeof m.podeVerRota).toBe('function');
    for (const rota of NOVAS) expect(m.podeVerRota?.(rota, []), rota).toBe(false);
    const semTransporte = perms('ADMIN').filter((c) => c !== 'transporte:ver');
    for (const rota of NOVAS) expect(m.podeVerRota?.(rota, semTransporte), rota).toBe(false);
  });
});

describe('#171 — lista de manutenção liga ao detalhe', () => {
  it('a tabela de manutenção passa rowHref para /transporte/manutencao/{id}', () => {
    const fonte = readFileSync(TABELA_MANUTENCAO, 'utf8');
    expect(fonte).toMatch(
      /rowHref=\{\s*\(\s*(\w+)\s*\)\s*=>\s*`\/transporte\/manutencao\/\$\{\s*\1\.id\s*\}`\s*\}/,
    );
  });

  it('a tabela de manutenção continua a ser um módulo cliente (funções não atravessam a fronteira RSC)', () => {
    const fonte = readFileSync(TABELA_MANUTENCAO, 'utf8');
    expect(fonte.trimStart().startsWith("'use client'")).toBe(true);
  });
});
