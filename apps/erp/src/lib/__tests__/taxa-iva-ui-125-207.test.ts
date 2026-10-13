/**
 * Oráculo — issues #125 (produtos) e #207 (serviços): o campo «Taxa de IVA» dos formulários é um
 * Select com as taxas que o servidor aceita, e mostra a taxa escolhida.
 *
 * Contrato:
 *   (1) Render (servidor, `react-dom/server`, sem browser):
 *       - `NovoProdutoForm` (#125), `NovoServicoForm` (#207, criação e edição) e
 *         `NovoAgendamentoForm` (#207) têm o campo de IVA como Select (`role="combobox"`) — nunca um
 *         `<input>` livre de número (onde 0.17 se escreve e só o servidor o recusa);
 *       - o gatilho do Select MOSTRA a taxa escolhida: «16%» por omissão na criação, «0%» num
 *         serviço gravado isento. Um gatilho vazio é o «placeholder» incoerente da #125: o Radix só
 *         resolve o texto do item depois de a lista abrir (CLAUDE.md: passa o rótulo como filho).
 *   (2) Guarda estática em `src/app/**`: num ficheiro que fala de `taxaIva`,
 *       - nenhum `<SelectItem value="N">` numérico fora de `TAXAS_IVA` (o 5% e o 17% dos serviços);
 *       - nenhum `register('…taxaIva', …)` (campo livre ligado ao react-hook-form);
 *       - nenhum literal 0.17 / 17% (o placeholder da #125).
 *
 * Fora: as variantes de produto sem UI (parte da #125) — não fazem parte deste nó.
 * Acesso dinâmico (`as any`) de propósito: o caso falha pelo comportamento, não o ficheiro.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TAXAS_IVA } from '@/lib/iva';

vi.mock('@/server/actions/inventario.actions', () => ({
  criarProdutoAction: vi.fn(async () => ({ ok: true, data: null })),
  actualizarProdutoAction: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock('@/server/actions/servicos.actions', () => ({
  criarServicoAction: vi.fn(async () => ({ ok: true, data: null })),
  actualizarServicoAction: vi.fn(async () => ({ ok: true, data: null })),
  criarAgendamentoAction: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock('@/server/actions/clientes.actions', () => ({
  procurarClientes: vi.fn(async () => ({ ok: true, data: [] })),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const ROTULO_IVA = /<label\b[^>]*>\s*Taxa (?:de )?IVA\b[^<]*(?:<[^>]+>[^<]*)*?<\/label>/i;

/** O bloco do campo de IVA: do rótulo até ao fim do primeiro controlo a seguir. */
function campoIva(html: string): { combobox: string | null; inputLivre: boolean } {
  const m = ROTULO_IVA.exec(html);
  expect(m, 'rótulo «Taxa (de) IVA» não encontrado no formulário').not.toBeNull();
  const resto = html.slice((m!.index ?? 0) + m![0].length);
  const proxBotao = resto.search(/<button\b[^>]*role="combobox"/);
  const proxInput = resto.search(/<input\b/);
  const inputLivre = proxInput >= 0 && (proxBotao < 0 || proxInput < proxBotao) &&
    /^<input\b[^>]*type="(?:number|text)"/.test(resto.slice(proxInput));
  if (proxBotao < 0 || inputLivre) return { combobox: null, inputLivre };
  const fim = resto.indexOf('</button>', proxBotao);
  return { combobox: resto.slice(proxBotao, fim), inputLivre };
}

function textoVisivel(fragmento: string): string {
  return fragmento.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function render(modulo: string, exportado: string, props: Record<string, unknown>): Promise<string> {
  const mod: any = await import(/* @vite-ignore */ modulo);
  expect(mod[exportado], `${exportado} exportado de ${modulo}`).toBeDefined();
  return renderToStaticMarkup(createElement(mod[exportado], props));
}

const servicoIsento = {
  id: 'ckz0000000000000000000207',
  codigo: 'SRV-207',
  nome: 'Serviço isento 207',
  descricao: null,
  tipoServico: 'OUTRO',
  categoriaServicoId: null,
  preco: 1000,
  duracaoEstimada: 60,
  unidadeMedida: 'un',
  taxaIva: 0,
  disponivel: true,
  requerAgendamento: true,
  requerTecnico: false,
  incluiMaterial: false,
  diasDisponibilidade: [],
  observacoes: null,
};

const FORMS: Array<{ caso: string; modulo: string; exportado: string; props: Record<string, unknown>; mostra: RegExp }> = [
  {
    caso: '#125 NovoProdutoForm (criação)',
    modulo: '@/app/(dashboard)/produtos/_components/novo-produto-form',
    exportado: 'NovoProdutoForm',
    props: { categorias: [] },
    mostra: /(?:^|\D)16\s?%/,
  },
  {
    // Controlo positivo: já cumpre (rótulo passado como filho do SelectValue) — prova que a
    // leitura do gatilho funciona e que o vermelho dos outros é do produto, não do teste.
    caso: '#125 EditarProdutoForm (edição de um produto isento — controlo)',
    modulo: '@/app/(dashboard)/produtos/[id]/editar/_components/editar-produto-form',
    exportado: 'EditarProdutoForm',
    props: {
      id: 'ckz0000000000000000000125',
      categorias: [],
      defaultValues: {
        nome: 'Livro', categoriaId: '', unidadeMedida: 'UN', precoVenda: '100', precoCompra: '50',
        taxaIva: '0', stockMinimo: '0', ativo: true,
      },
    },
    mostra: /(?:^|\D)0\s?%/,
  },
  {
    caso: '#207 NovoServicoForm (criação)',
    modulo: '@/app/(dashboard)/servicos/_components/novo-servico-form',
    exportado: 'NovoServicoForm',
    props: {},
    mostra: /(?:^|\D)16\s?%/,
  },
  {
    caso: '#207 NovoServicoForm (edição de um serviço isento)',
    modulo: '@/app/(dashboard)/servicos/_components/novo-servico-form',
    exportado: 'NovoServicoForm',
    props: { servico: servicoIsento, categorias: [] },
    mostra: /(?:^|\D)0\s?%/,
  },
  {
    caso: '#207 NovoAgendamentoForm (criação)',
    modulo: '@/app/(dashboard)/servicos/agendamentos/novo/_components/novo-agendamento-form',
    exportado: 'NovoAgendamentoForm',
    props: { servicos: [], clientesIniciais: [] },
    mostra: /(?:^|\D)16\s?%/,
  },
];

describe('#125/#207 — o campo de IVA é um Select que mostra a taxa escolhida', () => {
  for (const f of FORMS) {
    it(`${f.caso}: Select (não input livre) e o gatilho mostra a taxa`, async () => {
      const html = await render(f.modulo, f.exportado, f.props);
      const { combobox, inputLivre } = campoIva(html);
      expect(inputLivre, 'o IVA é um <input> livre — 0.17 escreve-se e só o servidor recusa').toBe(false);
      expect(combobox, 'o IVA não é um Select (role="combobox")').not.toBeNull();
      const texto = textoVisivel(combobox!);
      expect(texto, `gatilho do IVA mostra «${texto}»`).toMatch(f.mostra);
      expect(texto).not.toMatch(/17\s?%|0[.,]17/);
    });
  }
});

// ---------------------------------------------------------------------------
// Guarda estática
// ---------------------------------------------------------------------------

const RAIZ_APP = path.resolve(__dirname, '../../app');

function listarTsx(dir: string): string[] {
  const saida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const c = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      saida.push(...listarTsx(c));
    } else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
      saida.push(c);
    }
  }
  return saida;
}

const SELECT_ITEM_NUMERICO = /<SelectItem\b[^>]*\bvalue=["'{]+\s*(-?\d+(?:\.\d+)?)\s*["'}]+/g;
const REGISTER_TAXA = /register\(\s*[`'"][^`'"]*taxaIva[^`'"]*[`'"]/g;
const LITERAL_17 = /(?:^|[^\d.])0[.,]17(?!\d)|(?:^|\D)17\s?%/;

const ficheirosIva = listarTsx(RAIZ_APP).filter((f) => fs.readFileSync(f, 'utf8').includes('taxaIva'));

function linhaDe(texto: string, i: number) {
  return texto.slice(0, i).split('\n').length;
}

describe('#125/#207 — guarda estática dos campos de IVA em src/app', () => {
  it('os padrões detectam as formas conhecidas (auto-teste)', () => {
    expect([...'<SelectItem value="0.17">17%</SelectItem>'.matchAll(SELECT_ITEM_NUMERICO)].map((m) => m[1])).toEqual(['0.17']);
    expect([...'<SelectItem value="0.05">5%</SelectItem>'.matchAll(SELECT_ITEM_NUMERICO)].map((m) => m[1])).toEqual(['0.05']);
    expect([...'<SelectItem value={String(taxa)}>'.matchAll(SELECT_ITEM_NUMERICO)]).toEqual([]);
    expect("{...register('taxaIva', { valueAsNumber: true })}".match(REGISTER_TAXA)).not.toBeNull();
    expect('{...register(`itens.${i}.taxaIva`)}'.match(REGISTER_TAXA)).not.toBeNull();
    expect(LITERAL_17.test('placeholder="0.17"')).toBe(true);
    expect(LITERAL_17.test('<SelectItem value="0.17">17%</SelectItem>')).toBe(true);
    expect(LITERAL_17.test('placeholder="0.00"')).toBe(false);
    expect(LITERAL_17.test('precoUnitario: 10.17')).toBe(false);
  });

  it('há ficheiros a varrer (produtos e serviços incluídos)', () => {
    const rel = ficheirosIva.map((f) => path.relative(RAIZ_APP, f));
    expect(rel.some((r) => r.includes('produtos'))).toBe(true);
    expect(rel.some((r) => r.includes('servicos'))).toBe(true);
  });

  it('nenhum SelectItem numérico fora de TAXAS_IVA num ficheiro com taxaIva', () => {
    const permitidas = new Set<number>(TAXAS_IVA as readonly number[]);
    const achados: string[] = [];
    for (const f of ficheirosIva) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(SELECT_ITEM_NUMERICO)) {
        if (!permitidas.has(Number(m[1]))) achados.push(`${path.relative(RAIZ_APP, f)}:${linhaDe(t, m.index ?? 0)}: ${m[0]}`);
      }
    }
    expect(achados, `\n${achados.join('\n')}\n`).toEqual([]);
  });

  it('nenhum campo livre `register(…taxaIva…)` — a taxa escolhe-se num Select', () => {
    const achados: string[] = [];
    for (const f of ficheirosIva) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(REGISTER_TAXA)) achados.push(`${path.relative(RAIZ_APP, f)}:${linhaDe(t, m.index ?? 0)}: ${m[0]}`);
    }
    expect(achados, `\n${achados.join('\n')}\n`).toEqual([]);
  });

  it('nenhum literal 0.17 / 17% num ficheiro com taxaIva (placeholder da #125)', () => {
    const achados: string[] = [];
    for (const f of ficheirosIva) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (LITERAL_17.test(l)) achados.push(`${path.relative(RAIZ_APP, f)}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(achados, `\n${achados.join('\n')}\n`).toEqual([]);
  });
});
