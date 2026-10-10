/**
 * Oráculo da issue #202 — lista de papéis sem linhas clicáveis e datas fora de `format-date.ts`
 * (nó C:papeis-detalhe-subscricao-202-180; escrito pelo VERIFICADOR — alterá-lo do lado de quem
 * implementa é BLOCKER).
 *
 * A. `RolesTable` passa `rowHref` ao `DataTable` e a linha leva à ficha `/core-tenancy/roles/<id>`
 *    (que existe: `[id]/page.tsx`).
 * B. «Criado em» formata pelo `src/lib/format-date.ts` (fuso fixo Africa/Maputo): um instante às
 *    23:30 UTC de 31/03 mostra 01/04/2026 seja qual for o fuso do processo; e nenhum componente
 *    da lista usa `toLocale*String`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Fuso do processo ≠ Maputo: uma formatação sem `timeZone` dá o dia errado e o teste vê-o.
const h = vi.hoisted(() => {
  process.env.TZ = 'America/Sao_Paulo';
  return { props: null as any };
});

vi.mock('@/components/patterns', async (importOriginal) => {
  const real: any = await importOriginal();
  return {
    ...real,
    DataTable: (props: any) => {
      h.props = props;
      return null;
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => '/core-tenancy/roles',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/server/actions/plataforma.actions', async (importOriginal) => {
  const real: any = await importOriginal().catch(() => ({}));
  const dobrado: Record<string, unknown> = {};
  for (const k of Object.keys(real)) dobrado[k] = vi.fn(async () => ({ ok: true, data: {} }));
  return dobrado;
});

const ROLES_DIR = path.resolve(__dirname, '..');
const INSTANTE = new Date('2026-03-31T23:30:00.000Z'); // 01/04/2026 01:30 em Maputo

const role = {
  id: 'clh3am8ka0000role00000001',
  tenantId: 'tenant-1',
  nome: 'Contabilista',
  descricao: 'Lança e consulta',
  isSystem: false,
  permissions: [],
  createdAt: INSTANTE,
  updatedAt: INSTANTE,
};

async function renderTabela() {
  h.props = null;
  const mod: any = await import('../_components/roles-table');
  renderToStaticMarkup(createElement(mod.RolesTable, { data: [role] }));
  expect(h.props, 'RolesTable tem de usar o DataTable dos patterns').not.toBeNull();
  return h.props;
}

beforeEach(() => {
  h.props = null;
});

describe('#202 — linhas da lista de papéis abrem a ficha', () => {
  it('a ficha /core-tenancy/roles/[id] existe', () => {
    expect(fs.existsSync(path.join(ROLES_DIR, '[id]', 'page.tsx'))).toBe(true);
  });

  it('DataTable recebe rowHref que leva a /core-tenancy/roles/<id>', async () => {
    const props = await renderTabela();
    expect(typeof props.rowHref, 'rowHref em falta: a linha não é clicável').toBe('function');
    const linha = props.data.find((r: any) => r.id === role.id);
    expect(props.rowHref(linha)).toBe(`/core-tenancy/roles/${role.id}`);
  });
});

describe('#202 — «Criado em» pelo format-date.ts', () => {
  it('mostra o dia civil de Maputo (01/04/2026), não o do fuso do processo', async () => {
    const { formatarData } = await import('@/lib/format-date');
    const props = await renderTabela();
    const coluna = props.columns.find(
      (c: any) => c.key === 'createdAt' || /criad/i.test(String(c.label)),
    );
    expect(coluna, 'coluna «Criado em» em falta').toBeTruthy();
    const linha = props.data.find((r: any) => r.id === role.id);
    const html = renderToStaticMarkup(createElement(Fragment, null, coluna.render(linha)));
    expect(formatarData(INSTANTE)).toBe('01/04/2026');
    expect(html).toContain(formatarData(INSTANTE));
    expect(html).not.toContain('31/03/2026');
  });

  it('nenhum componente da lista de papéis usa toLocale*String', () => {
    const dir = path.join(ROLES_DIR, '_components');
    const ofensores = fs
      .readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) =>
        /\.toLocale(Date|Time)?String\s*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')),
      );
    expect(ofensores).toEqual([]);
  });
});
