/**
 * Issue #76 — menu e páginas filtram por permissão de CONSULTA (ORÁCULO, escrito
 * pelo verificador; outro agente implementa).
 *
 * Contrato:
 *  - `src/lib/permissoes-rotas.ts` exporta:
 *      `PERMISSAO_POR_ROTA: Record<string, string>` — prefixo de rota → permissão de consulta;
 *      `ROTAS_PUBLICAS: readonly string[]`          — hrefs que qualquer sessão vê (ex.: `/dashboard`);
 *      `permissaoDaRota(caminho): string | null`    — maior prefixo por SEGMENTO inteiro; `null` se não houver;
 *      `podeVerRota(caminho, permissoes): boolean`  — a MESMA decisão para o menu e para a guarda.
 *  - Todo o href da barra lateral resolve para uma entrada do mapa ou é explicitamente público.
 *  - Só permissões que já existem no catálogo (`prisma/seed/rbac.ts`).
 *  - Utilizadores e Auditoria exigem `admin:ver_utilizadores` / `admin:ver_auditoria`
 *    (não o `core_tenancy:ver` genérico) — e o OPERADOR deixa de as ter.
 *  - `AppSidebar.tsx` filtra pelo módulo novo; `exigirPermissaoPagina` vive em `lib/auth`;
 *    um `layout.tsx` por rota do mapa chama-a; um único `SemPermissao` partilhado.
 *
 * O módulo é importado por caminho dinâmico para que, enquanto não existir, falhe
 * cada caso — não o ficheiro.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const SRC = path.join(RAIZ, 'src');
const DASHBOARD = path.join(SRC, 'app', '(dashboard)');
const SIDEBAR = path.join(SRC, 'components', 'layout', 'AppSidebar.tsx');

type Mod = any;
async function modulo(): Promise<Mod> {
  const caminho = '@/lib/permissoes-rotas';
  try {
    return await import(/* @vite-ignore */ caminho);
  } catch {
    try {
      return await import(/* @vite-ignore */ path.join(SRC, 'lib', 'permissoes-rotas.ts'));
    } catch {
      return {};
    }
  }
}

const CATALOGO = new Set(PERMISSIONS.map((p) => p.code));
const perms = (papel: string): string[] =>
  SYSTEM_ROLES.find((r) => r.nome === papel)?.permissionCodes ?? [];

/** Os hrefs declarados na barra lateral (lidos do código-fonte, não de uma cópia). */
function hrefsDaBarraLateral(): string[] {
  const fonte = readFileSync(SIDEBAR, 'utf8');
  const hrefs = [...fonte.matchAll(/\bhref:\s*'([^']+)'/g)].map((m) => m[1]);
  return [...new Set(hrefs)];
}

describe('#76 — mapa rota → permissão de consulta', () => {
  it('o módulo exporta o mapa, as rotas públicas e as duas funções', async () => {
    const m = await modulo();
    expect(typeof m.PERMISSAO_POR_ROTA).toBe('object');
    expect(Array.isArray(m.ROTAS_PUBLICAS)).toBe(true);
    expect(typeof m.permissaoDaRota).toBe('function');
    expect(typeof m.podeVerRota).toBe('function');
  });

  it('a barra lateral tem hrefs (sanidade do extractor)', () => {
    expect(hrefsDaBarraLateral().length).toBeGreaterThan(30);
  });

  it('todo o href da barra lateral resolve para uma entrada do mapa ou é explicitamente público', async () => {
    const m = await modulo();
    const publicas: string[] = m.ROTAS_PUBLICAS ?? [];
    const orfaos = hrefsDaBarraLateral().filter((href) => {
      if (publicas.includes(href)) return false;
      const p = m.permissaoDaRota?.(href);
      return typeof p !== 'string';
    });
    expect(orfaos).toEqual([]);
  });

  it('o /dashboard geral é público', async () => {
    const m = await modulo();
    expect(m.ROTAS_PUBLICAS).toContain('/dashboard');
    expect(m.podeVerRota?.('/dashboard', [])).toBe(true);
  });

  it('só usa permissões que já existem no catálogo de prisma/seed/rbac.ts', async () => {
    const m = await modulo();
    const valores = Object.values((m.PERMISSAO_POR_ROTA ?? {}) as Record<string, string>);
    expect(valores.length).toBeGreaterThan(0);
    expect(valores.filter((p) => !CATALOGO.has(p))).toEqual([]);
  });

  it('as chaves do mapa são rotas reais do (dashboard)', async () => {
    const m = await modulo();
    const chaves = Object.keys(m.PERMISSAO_POR_ROTA ?? {});
    expect(chaves.length).toBeGreaterThan(0);
    const inexistentes = chaves.filter(
      (k) => !k.startsWith('/') || !existsSync(path.join(DASHBOARD, ...k.split('/').filter(Boolean))),
    );
    expect(inexistentes).toEqual([]);
  });

  it('Utilizadores e Auditoria exigem a permissão de administração, não core_tenancy:ver', async () => {
    const m = await modulo();
    expect(m.permissaoDaRota?.('/core-tenancy/utilizadores')).toBe('admin:ver_utilizadores');
    expect(m.permissaoDaRota?.('/core-tenancy/utilizadores/abc/editar')).toBe('admin:ver_utilizadores');
    expect(m.permissaoDaRota?.('/core-tenancy/utilizadores/novo')).toBe('admin:ver_utilizadores');
    expect(m.permissaoDaRota?.('/core-tenancy/auditoria')).toBe('admin:ver_auditoria');
    expect(m.permissaoDaRota?.('/core-tenancy')).toBe('core_tenancy:ver');
  });

  it('prefixo só por segmento inteiro', async () => {
    const m = await modulo();
    expect(typeof m.permissaoDaRota).toBe('function');
    expect(m.permissaoDaRota?.('/core-tenancy/utilizadores-antigos')).not.toBe('admin:ver_utilizadores');
    expect(m.permissaoDaRota?.('/core-tenancyx')).not.toBe('core_tenancy:ver');
  });

  it('mantém as permissões que a barra lateral já declarava (DFC, séries, subscrição)', async () => {
    const m = await modulo();
    expect(m.permissaoDaRota?.('/contabilidade/dfc')).toBe('financas:fluxo-caixa:leitura');
    expect(m.permissaoDaRota?.('/faturacao/series')).toBe('faturacao:leitura');
    expect(m.permissaoDaRota?.('/definicoes/faturacao')).toBe('assinatura:ver');
  });
});

describe('#76 — quem vê o quê (podeVerRota, a função do menu e da guarda)', () => {
  it('OPERADOR não vê Utilizadores nem Auditoria', async () => {
    const m = await modulo();
    const op = perms('OPERADOR');
    expect(op.length).toBeGreaterThan(0);
    expect(m.podeVerRota?.('/core-tenancy/utilizadores', op)).toBe(false);
    expect(m.podeVerRota?.('/core-tenancy/auditoria', op)).toBe(false);
  });

  it('ADMIN vê Utilizadores, Auditoria e todos os hrefs da barra lateral', async () => {
    const m = await modulo();
    const admin = perms('ADMIN');
    expect(m.podeVerRota?.('/core-tenancy/utilizadores', admin)).toBe(true);
    expect(m.podeVerRota?.('/core-tenancy/auditoria', admin)).toBe(true);
    const escondidos = hrefsDaBarraLateral().filter((h) => m.podeVerRota?.(h, admin) !== true);
    expect(escondidos).toEqual([]);
  });

  it('o OPERADOR continua a chegar ao seu trabalho (POS, inventário, dashboard)', async () => {
    const m = await modulo();
    const op = perms('OPERADOR');
    expect(m.podeVerRota?.('/pos', op)).toBe(true);
    expect(m.podeVerRota?.('/inventario', op)).toBe(true);
    expect(m.podeVerRota?.('/dashboard', op)).toBe(true);
  });

  it('o OPERADOR continua sem a DFC (não regride o filtro que já existia)', async () => {
    const m = await modulo();
    expect(m.podeVerRota?.('/contabilidade/dfc', perms('OPERADOR'))).toBe(false);
  });

  it('sem permissões nenhumas, só o público passa', async () => {
    const m = await modulo();
    expect(m.podeVerRota?.('/core-tenancy', [])).toBe(false);
    expect(m.podeVerRota?.('/core-tenancy/utilizadores', [])).toBe(false);
  });
});

describe('#76 — papéis de sistema (prisma/seed/rbac.ts)', () => {
  it('o OPERADOR deixa de ter admin:ver_utilizadores e admin:ver_auditoria', () => {
    const op = perms('OPERADOR');
    expect(op).not.toContain('admin:ver_utilizadores');
    expect(op).not.toContain('admin:ver_auditoria');
  });

  it('o ADMIN mantém-nas', () => {
    const admin = perms('ADMIN');
    expect(admin).toContain('admin:ver_utilizadores');
    expect(admin).toContain('admin:ver_auditoria');
  });
});

describe('#76 — ligação ao menu e às páginas', () => {
  it('AppSidebar filtra pelo módulo partilhado (a mesma função da guarda)', () => {
    const fonte = readFileSync(SIDEBAR, 'utf8');
    expect(fonte).toMatch(/from\s+'@\/lib\/permissoes-rotas'/);
    expect(fonte).toMatch(/podeVerRota|permissaoDaRota/);
  });

  it('lib/auth exporta exigirPermissaoPagina', () => {
    const ficheiro = ['auth.ts', 'auth.tsx']
      .map((f) => path.join(SRC, 'lib', f))
      .find((f) => existsSync(f));
    const fonte = ficheiro ? readFileSync(ficheiro, 'utf8') : '';
    expect(fonte).toMatch(
      /export\s+(async\s+)?function\s+exigirPermissaoPagina\b|export\s+const\s+exigirPermissaoPagina\b/,
    );
  });

  it('cada rota do mapa tem um layout.tsx que chama exigirPermissaoPagina com a permissão dela', async () => {
    const m = await modulo();
    const mapa = (m.PERMISSAO_POR_ROTA ?? {}) as Record<string, string>;
    expect(Object.keys(mapa).length).toBeGreaterThan(0);
    const faltas: string[] = [];
    for (const [rota, permissao] of Object.entries(mapa)) {
      const layout = path.join(DASHBOARD, ...rota.split('/').filter(Boolean), 'layout.tsx');
      const fonte = existsSync(layout) ? readFileSync(layout, 'utf8') : '';
      const chama = /exigirPermissaoPagina\s*\(/.test(fonte);
      const comAPermissao = fonte.includes(`'${permissao}'`) || fonte.includes(`'${rota}'`);
      if (!chama || !comAPermissao) faltas.push(rota);
    }
    expect(faltas).toEqual([]);
  });

  it('Utilizadores e Auditoria têm guarda própria (o layout de /core-tenancy não chega)', () => {
    for (const sub of ['utilizadores', 'auditoria']) {
      const layout = path.join(DASHBOARD, 'core-tenancy', sub, 'layout.tsx');
      expect(existsSync(layout), `${sub}/layout.tsx`).toBe(true);
    }
  });

  it('há um único SemPermissao, partilhado em src/components', () => {
    const definicoes: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (statSync(p).isDirectory()) {
          if (nome === 'node_modules' || nome === '__tests__') continue;
          varrer(p);
        } else if (/\.tsx?$/.test(nome)) {
          if (/(?:function|const)\s+SemPermissao\b/.test(readFileSync(p, 'utf8'))) {
            definicoes.push(path.relative(SRC, p));
          }
        }
      }
    };
    varrer(SRC);
    expect(definicoes).toHaveLength(1);
    expect(definicoes[0]).toMatch(/^components\//);
  });
});
