/**
 * Issue #145 — DRE, Centros de Custo e Contas Bancárias no menu lateral (ORÁCULO,
 * escrito pelo verificador; outro agente implementa).
 *
 * Contrato (decisão do orquestrador; opção conservadora onde ficou em aberto):
 *  - As três rotas `/contabilidade/dre`, `/contabilidade/centros-custo` e
 *    `/contabilidade/contas-bancarias` têm entrada no grupo «Finanças & Contabilidade»
 *    de `src/components/layout/AppSidebar.tsx`, cada uma com um ícone do `lucide-react`
 *    importado no ficheiro.
 *  - Cada href resolve para uma entrada de `src/lib/permissoes-rotas.ts` (#76):
 *      DRE e Centros de Custo herdam `/contabilidade` → `financas:ver` (a guarda que já
 *      protege as duas páginas; nenhuma permissão nova, nenhum dado alterado);
 *      Contas Bancárias tem entrada própria → `financas:banca:contas:leitura` (a
 *      permissão de consulta de banca do catálogo), com `layout.tsx` próprio — o teste
 *      do #76 já exige uma guarda por cada chave do mapa.
 *  - Quem não tem a permissão não vê a entrada (a decisão do menu é `podeVerRota`).
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

const DRE = '/contabilidade/dre';
const CENTROS = '/contabilidade/centros-custo';
const CONTAS = '/contabilidade/contas-bancarias';
const TRES = [DRE, CENTROS, CONTAS] as const;

const ESPERADA: Record<string, string> = {
  [DRE]: 'financas:ver',
  [CENTROS]: 'financas:ver',
  [CONTAS]: 'financas:banca:contas:leitura',
};

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

/** Fonte do grupo «Finanças & Contabilidade» (do título até ao grupo seguinte). */
function grupoContabilidade(): string {
  const fonte = readFileSync(SIDEBAR, 'utf8');
  const inicio = fonte.indexOf("title: 'Finanças & Contabilidade'");
  if (inicio < 0) return '';
  const resto = fonte.slice(inicio);
  const fim = resto.indexOf('\n  },');
  return fim < 0 ? resto : resto.slice(0, fim);
}

/** Entradas `{ title, href, icon }` do grupo, lidas do código-fonte. */
function entradasDoGrupo(): Array<{ title: string; href: string; icon: string }> {
  const re = /\{\s*title:\s*'([^']+)',\s*href:\s*'([^']+)',\s*icon:\s*([A-Za-z0-9_]+)/g;
  return [...grupoContabilidade().matchAll(re)].map((m) => ({ title: m[1], href: m[2], icon: m[3] }));
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

describe('#145 — as três páginas existem (sanidade)', () => {
  it.each(TRES)('%s tem page.tsx', (rota) => {
    const page = path.join(DASHBOARD, ...rota.split('/').filter(Boolean), 'page.tsx');
    expect(existsSync(page)).toBe(true);
  });

  it('o extractor encontra o grupo de Contabilidade (DFC lá está)', () => {
    expect(entradasDoGrupo().map((e) => e.href)).toContain('/contabilidade/dfc');
  });
});

describe('#145 — entradas no grupo «Finanças & Contabilidade»', () => {
  it.each(TRES)('%s tem entrada no grupo', (rota) => {
    const hrefs = entradasDoGrupo().map((e) => e.href);
    expect(hrefs).toContain(rota);
  });

  it.each(TRES)('%s aparece uma só vez em toda a barra lateral', (rota) => {
    const fonte = readFileSync(SIDEBAR, 'utf8');
    const ocorrencias = [...fonte.matchAll(/\bhref:\s*'([^']+)'/g)].filter((m) => m[1] === rota);
    expect(ocorrencias).toHaveLength(1);
  });

  it.each(TRES)('%s tem título e ícone do lucide-react importado', (rota) => {
    const entrada = entradasDoGrupo().find((e) => e.href === rota);
    expect(entrada, rota).toBeDefined();
    expect(entrada?.title.trim().length ?? 0).toBeGreaterThan(0);
    expect(iconesImportados().has(entrada?.icon ?? '')).toBe(true);
  });
});

describe('#145 — mapa rota → permissão (lib/permissoes-rotas)', () => {
  it.each(TRES)('%s resolve para a permissão de consulta acordada', async (rota) => {
    const m = await modulo();
    expect(m.permissaoDaRota?.(rota)).toBe(ESPERADA[rota]);
  });

  it('as permissões acordadas existem no catálogo', () => {
    for (const p of Object.values(ESPERADA)) expect(CATALOGO.has(p), p).toBe(true);
  });

  it('Contas Bancárias tem entrada própria no mapa (não herda o financas:ver)', async () => {
    const m = await modulo();
    const mapa = (m.PERMISSAO_POR_ROTA ?? {}) as Record<string, string>;
    expect(mapa[CONTAS]).toBe('financas:banca:contas:leitura');
  });

  it('as sub-rotas de Contas Bancárias (nova, [id]/editar) ficam sob a mesma permissão', async () => {
    const m = await modulo();
    expect(m.permissaoDaRota?.(`${CONTAS}/nova`)).toBe('financas:banca:contas:leitura');
    expect(m.permissaoDaRota?.(`${CONTAS}/abc/editar`)).toBe('financas:banca:contas:leitura');
  });

  it('Contas Bancárias tem layout.tsx próprio com exigirPermissaoPagina', () => {
    const layout = path.join(DASHBOARD, 'contabilidade', 'contas-bancarias', 'layout.tsx');
    const fonte = existsSync(layout) ? readFileSync(layout, 'utf8') : '';
    expect(fonte).toMatch(/exigirPermissaoPagina\s*\(/);
    expect(
      fonte.includes(`'${CONTAS}'`) || fonte.includes("'financas:banca:contas:leitura'"),
    ).toBe(true);
  });
});

describe('#145 — quem vê o quê (podeVerRota, a decisão do menu)', () => {
  it.each(['ADMIN', 'GESTOR', 'FINANCEIRO'])('%s vê as três entradas', async (papel) => {
    const m = await modulo();
    const p = perms(papel);
    expect(p.length).toBeGreaterThan(0);
    for (const rota of TRES) expect(m.podeVerRota?.(rota, p), `${papel} ${rota}`).toBe(true);
  });

  it('OPERADOR sem financas:banca:contas:leitura não vê Contas Bancárias', async () => {
    const m = await modulo();
    const semBanca = perms('OPERADOR').filter((c) => c !== 'financas:banca:contas:leitura');
    expect(semBanca).toContain('financas:ver'); // continua a ver o resto da contabilidade
    expect(m.podeVerRota?.(CONTAS, semBanca)).toBe(false);
    expect(m.podeVerRota?.(DRE, semBanca)).toBe(true);
  });

  it('só com financas:ver (sem banca) não vê Contas Bancárias', async () => {
    const m = await modulo();
    expect(typeof m.podeVerRota).toBe('function');
    expect(m.podeVerRota?.(CONTAS, ['financas:ver'])).toBe(false);
  });

  it('OPERADOR sem financas:ver não vê DRE nem Centros de Custo', async () => {
    const m = await modulo();
    const semVer = perms('OPERADOR').filter((c) => c !== 'financas:ver');
    expect(m.podeVerRota?.(DRE, semVer)).toBe(false);
    expect(m.podeVerRota?.(CENTROS, semVer)).toBe(false);
  });

  it('sem permissões nenhumas, nenhuma das três aparece', async () => {
    const m = await modulo();
    expect(typeof m.podeVerRota).toBe('function');
    for (const rota of TRES) expect(m.podeVerRota?.(rota, []), rota).toBe(false);
  });
});
