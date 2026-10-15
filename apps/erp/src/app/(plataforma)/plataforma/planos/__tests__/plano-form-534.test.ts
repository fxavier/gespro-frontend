/**
 * ORÁCULO — issue #534 (nó E:planos-reparos-form, ADR-0049 §2/§4): textos de ajuda do formulário
 * de plano e o erro PRICE_ID_DUPLICADO no campo certo.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; alterar do lado de quem
 * implementa é BLOCKER.
 *
 * Contrato:
 *   F1 Na secção «Preços» (do título até «Limites e suporte"), o texto exacto
 *      «Alterar o preço ou o Price ID só afecta subscrições novas; quem já tem o plano continua no
 *      preço com que subscreveu.» — em criar e em editar.
 *   F2 Na secção «Limites e suporte» (até «Funcionalidades»), uma frase que diz que os limites
 *      valem JÁ para as assinaturas do plano (frase com «limites», «já» e «assinaturas») — em criar
 *      e em editar (hoje só a edição tem um aviso, e fora da secção).
 *   F3 Na secção «Funcionalidades» (até «Apresentação»), o texto exacto
 *      «Texto mostrado ao cliente no site e na facturação; não liga nem desliga módulos.»
 *   F4 O mapeamento recusa → campo é uma função pura exportada (nome e módulo fixados pelo
 *      verificador): `campoDoErroPlano({ code, details })` de `../_components/plano-erros`
 *      (módulo neutro, sem 'use client' nem server-only), que devolve o `Path` do campo ou
 *      `undefined`:
 *        PLANO_CODIGO_INVALIDO / PLANO_CODIGO_DUPLICADO → 'codigo';
 *        PRICE_ID_DUPLICADO + details.campo 'stripePriceIdMensal' | 'stripePriceIdAnual' → esse campo;
 *        PRICE_ID_DUPLICADO sem details.campo, ou com um campo que não é Price → undefined
 *          (decisão conservadora: nenhum campo > campo errado; o toast continua a dizer o erro);
 *        qualquer outro código → undefined.
 *   F5 O `plano-form.tsx` usa essa função (deixa de ter o PRICE_ID_DUPLICADO fixo no mensal).
 *
 * Render no servidor (`react-dom/server`), sem browser: action, router e toast dobrados.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/server/actions/plataforma-planos.actions', () => ({
  criarPlano: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  actualizarPlano: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  arquivarPlano: vi.fn(),
  desarquivarPlano: vi.fn(),
  apagarPlano: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/plataforma/planos/novo',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const AJUDA_PRECO =
  'Alterar o preço ou o Price ID só afecta subscrições novas; quem já tem o plano continua no preço com que subscreveu.';
const AJUDA_FUNC = 'Texto mostrado ao cliente no site e na facturação; não liga nem desliga módulos.';
// «já» como palavra: \b é ASCII-only e não reconhece a fronteira depois de «á».
const LIMITES_JA =
  /limites[^.]*(?<!\p{L})já(?!\p{L})[^.]*assinaturas|assinaturas[^.]*(?<!\p{L})já(?!\p{L})[^.]*limites/iu;

const PLANO = {
  id: 'p-534',
  codigo: 'TPRF_FORM',
  nome: 'Profissional',
  descricao: 'Plano de teste',
  precoMensalUsd: '29',
  precoAnualUsd: '290',
  stripePriceIdMensal: 'price_m_534',
  stripePriceIdAnual: null,
  limiteUtilizadores: 5,
  limiteArmazens: -1,
  suporte: 'Email (48h)',
  funcionalidades: ['Facturação', 'Stock'],
  ordem: 1,
  destaque: false,
  arquivadoEm: null,
  assinaturas: 3,
};

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** O texto entre o título de uma secção e o da seguinte (ordem do formulário). */
function seccao(t: string, titulo: string, proximo: string): string {
  const i = t.indexOf(titulo, t.indexOf('Identificação'));
  expect(i, `secção «${titulo}» não encontrada`).toBeGreaterThanOrEqual(0);
  const j = t.indexOf(proximo, i + titulo.length);
  expect(j, `secção «${proximo}» não encontrada depois de «${titulo}»`).toBeGreaterThan(i);
  return t.slice(i, j);
}

async function render(plano?: typeof PLANO): Promise<string> {
  const mod: any = await import('../_components/plano-form');
  return texto(renderToStaticMarkup(createElement(mod.PlanoForm, plano ? { plano } : {})));
}

describe('#534 — textos de ajuda do formulário de plano', () => {
  for (const [modo, plano] of [
    ['criar', undefined],
    ['editar', PLANO],
  ] as const) {
    describe(modo, () => {
      it('F1 — junto aos preços/Price IDs: mudar o preço ou o Price só afecta subscrições novas', async () => {
        const t = await render(plano);
        expect(seccao(t, 'Preços', 'Limites e suporte')).toContain(AJUDA_PRECO);
      });

      it('F2 — junto aos limites: os limites valem já para as assinaturas do plano', async () => {
        const t = await render(plano);
        expect(seccao(t, 'Limites e suporte', 'Funcionalidades')).toMatch(LIMITES_JA);
      });

      it('F3 — junto às funcionalidades: texto ao cliente, não liga nem desliga módulos', async () => {
        const t = await render(plano);
        expect(seccao(t, 'Funcionalidades', 'Apresentação')).toContain(AJUDA_FUNC);
      });
    });
  }
});

describe('#534 — PRICE_ID_DUPLICADO no campo indicado pelo servidor', () => {
  async function campoDoErro(): Promise<(e: { code: string; details?: unknown }) => unknown> {
    const caminho: string = '../_components/plano-erros';
    const mod: any = await import(/* @vite-ignore */ caminho).catch(() => ({}));
    expect(typeof mod.campoDoErroPlano, '_components/plano-erros tem de exportar campoDoErroPlano').toBe('function');
    return mod.campoDoErroPlano;
  }

  it('F4 — details.campo anual → stripePriceIdAnual; mensal → stripePriceIdMensal', async () => {
    const f = await campoDoErro();
    expect(f({ code: 'PRICE_ID_DUPLICADO', details: { campo: 'stripePriceIdAnual' } })).toBe('stripePriceIdAnual');
    expect(f({ code: 'PRICE_ID_DUPLICADO', details: { campo: 'stripePriceIdMensal' } })).toBe('stripePriceIdMensal');
  });

  it('F4 — PRICE_ID_DUPLICADO sem campo, ou com campo que não é Price → nenhum campo', async () => {
    const f = await campoDoErro();
    expect(f({ code: 'PRICE_ID_DUPLICADO' })).toBeUndefined();
    expect(f({ code: 'PRICE_ID_DUPLICADO', details: {} })).toBeUndefined();
    expect(f({ code: 'PRICE_ID_DUPLICADO', details: { campo: 'nome' } })).toBeUndefined();
    expect(f({ code: 'PRICE_ID_DUPLICADO', details: { campo: 'codigo' } })).toBeUndefined();
    expect(f({ code: 'PRICE_ID_DUPLICADO', details: 'stripePriceIdAnual' })).toBeUndefined();
  });

  it('F4 — recusas do código continuam no campo código; o resto não tem campo', async () => {
    const f = await campoDoErro();
    expect(f({ code: 'PLANO_CODIGO_INVALIDO' })).toBe('codigo');
    expect(f({ code: 'PLANO_CODIGO_DUPLICADO' })).toBe('codigo');
    expect(f({ code: 'PLANO_EM_USO', details: { campo: 'stripePriceIdAnual' } })).toBeUndefined();
    expect(f({ code: 'ERRO_INTERNO' })).toBeUndefined();
  });

  it('F5 — o formulário usa campoDoErroPlano e já não fixa o PRICE_ID_DUPLICADO no mensal', () => {
    const src = readFileSync(path.resolve(__dirname, '../_components/plano-form.tsx'), 'utf8');
    expect(src).toMatch(/campoDoErroPlano/);
    expect(src).not.toMatch(/PRICE_ID_DUPLICADO\s*:\s*['"]stripePriceIdMensal['"]/);
  });
});
