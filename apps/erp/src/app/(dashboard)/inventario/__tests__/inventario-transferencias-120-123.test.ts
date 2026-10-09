/**
 * Oráculo — issues #120, #121, #122 e #123 (Inventário), parte de UI/rotas.
 *
 * O comportamento de servidor (filtro `TRANSFERENCIA` e `search` na query) está no oráculo de
 * integração `test/integration/inventario-transferencias-120-123.test.ts`. Este ficheiro tranca o
 * que liga a UI a esse contrato, sem browser:
 *
 * #120 — `/inventario/transferencias` deixa de filtrar em memória por `'TRANSFERENCIA'` e pede ao
 *        serviço o tipo (o valor de grupo `TRANSFERENCIA`, ver o oráculo de integração).
 * #121 — `/inventario/movimentacoes` passa `tipo` e `search` do URL ao serviço; as opções do filtro
 *        «Tipo» são todas valores que o `MovimentoStockFilterSchema` aceita (não há `BAIXA` no enum);
 *        a tabela etiqueta `TRANSFERENCIA_ENTRADA`/`_SAIDA` (nada de `TRANSFERENCIA ENTRADA` em bruto).
 * #122 — `ManutencaoAcoes` em «Em Andamento» mostra UM só botão «Concluir», que leva a `CONCLUIDA`;
 *        o botão que leva a `ORCAMENTO` tem outra etiqueta. Etiquetas das acções não destrutivas
 *        distintas em todos os estados.
 * #123 — nenhuma ligação do Inventário para `/inventario/localizacoes/<id>/editar` ou
 *        `/inventario/fisico/<id>/editar` sem a rota correspondente (criar a rota OU retirar o botão
 *        — o oráculo aceita as duas).
 *
 * Fora do contrato do orquestrador (não testado aqui): o campo «Custo Real» editável da #122.
 *
 * Render no servidor (`react-dom/server`): action, router e toast dobrados; o `Button` é dobrado
 * para capturar `onClick` e o texto de cada botão; `useTransition` corre o callback de imediato.
 * Escrito pelo verificador do nó B:inventario-transferencias-120-123; um agente de implementação
 * que o altere é BLOCKER.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  botoes: [] as { texto: string; onClick?: () => void; disabled?: boolean }[],
  transitar: [] as unknown[],
}));

vi.mock('react', async (importOriginal) => {
  const r: any = await importOriginal();
  return { ...r, default: r, useTransition: () => [false, (fn: () => unknown) => { void fn(); }] };
});
vi.mock('@/server/actions/inventario.actions', () => ({
  transitarStatusManutencaoAction: vi.fn(async (input: unknown) => {
    h.transitar.push(input);
    return { ok: true, data: null };
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/inventario',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

function textoDe(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join('');
  if (typeof n === 'object' && 'props' in (n as any)) return textoDe((n as any).props?.children);
  return '';
}

vi.mock('@/components/ui/button', async () => {
  const React: any = await vi.importActual('react');
  // React 19: `ref` chega como prop (o Slot do AlertDialogTrigger passa-o).
  function Button(props: any) {
    h.botoes.push({ texto: textoDe(props.children).trim(), onClick: props.onClick, disabled: props.disabled });
    const { asChild: _a, variant: _v, size: _s, ...resto } = props;
    return React.createElement('button', resto, props.children);
  }
  return { Button, buttonVariants: () => '' };
});

const ERP = path.resolve(__dirname, '../../../../..'); // apps/erp
const INV = path.join(ERP, 'src', 'app', '(dashboard)', 'inventario');
const ler = (rel: string) => readFileSync(path.join(INV, rel), 'utf8');

/** Argumentos (texto) da chamada `listarMovimentos(` no ficheiro — até ao `ctx` de fecho. */
function argsListarMovimentos(fonte: string): string {
  const i = fonte.indexOf('listarMovimentos(');
  expect(i, 'a página chama stockService.listarMovimentos').toBeGreaterThanOrEqual(0);
  let prof = 0;
  for (let j = i + 'listarMovimentos'.length; j < fonte.length; j++) {
    if (fonte[j] === '(') prof++;
    else if (fonte[j] === ')' && --prof === 0) return fonte.slice(i, j + 1);
  }
  throw new Error('chamada listarMovimentos( sem fecho');
}

// ─── #120 ────────────────────────────────────────────────────────────────────

describe('#120 — /inventario/transferencias pede as transferências ao serviço', () => {
  const fonte = ler('transferencias/page.tsx');

  it('não compara com o literal inexistente `TRANSFERENCIA` em memória', () => {
    expect(fonte).not.toMatch(/===\s*['"]TRANSFERENCIA['"]/);
    expect(fonte).not.toMatch(/\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.tipo\b/);
  });

  it('a chamada a listarMovimentos passa o tipo das transferências (filtro na query)', () => {
    const args = argsListarMovimentos(fonte);
    expect(args).toMatch(/tipo\s*:\s*['"]TRANSFERENCIA['"]/);
  });
});

// ─── #121 ────────────────────────────────────────────────────────────────────

describe('#121 — /inventario/movimentacoes liga «Tipo» e a pesquisa à query', () => {
  const fonte = ler('movimentacoes/page.tsx');

  it('a chamada a listarMovimentos recebe `tipo` e `search` (explícitos ou por spread dos filtros)', () => {
    const args = argsListarMovimentos(fonte);
    const spread = /\.\.\.\s*filtros\b/.test(args);
    expect(spread || /\btipo\b/.test(args), `args: ${args}`).toBe(true);
    expect(spread || /\bsearch\b/.test(args), `args: ${args}`).toBe(true);
  });

  it('o schema de URL da página não deita fora `search` (usa o MovimentoStockFilterSchema ou declara search)', () => {
    const usaPartilhado = /MovimentoStockFilterSchema/.test(fonte);
    const declara = /\bsearch\s*:\s*z\./.test(fonte);
    expect(usaPartilhado || declara).toBe(true);
  });

  it('a FilterBar pesquisa pelo parâmetro `search`', () => {
    expect(fonte).toMatch(/searchKey\s*=\s*["']search["']/);
  });

  it('todas as opções do filtro «Tipo» são aceites pelo MovimentoStockFilterSchema', async () => {
    const { MovimentoStockFilterSchema } = await import('@/lib/validations/stock');
    const bloco = fonte.slice(fonte.indexOf('FILTER_CONFIGS'));
    const valores = [...bloco.matchAll(/value:\s*['"]([A-Z_]+)['"]/g)].map((m) => m[1]!);
    expect(valores.length, 'opções do filtro Tipo encontradas').toBeGreaterThan(0);
    const recusados = valores.filter((tipo) => !MovimentoStockFilterSchema.safeParse({ tipo }).success);
    expect(recusados).toEqual([]);
    expect(valores, 'a opção «Transferência» continua').toContain('TRANSFERENCIA');
  });

  it('a tabela etiqueta TRANSFERENCIA_ENTRADA e TRANSFERENCIA_SAIDA (nada em bruto)', async () => {
    const mod: any = await import('../movimentacoes/_components/movimentos-stock-table');
    const base = {
      tenantId: 't', produtoId: 'p1', produtoNome: 'Parafuso', produtoSku: 'PAR-1', varianteProdutoId: null,
      quantidade: '1', localizacaoOrigemId: null, localizacaoDestinoId: null, transferenciaRefId: 'tr',
      documentoReferenciaId: null, documentoReferenciaTipo: null, motivo: null, observacoes: null,
      criadoPor: 'u', createdAt: new Date('2026-01-05T08:00:00Z'),
    };
    const html = renderToStaticMarkup(
      createElement(mod.MovimentosStockTable, {
        data: [
          { ...base, id: 'm1', tipo: 'TRANSFERENCIA_ENTRADA' },
          { ...base, id: 'm2', tipo: 'TRANSFERENCIA_SAIDA' },
        ],
        nextCursor: null,
      }),
    );
    const texto = html.replace(/<[^>]+>/g, ' ');
    expect(texto).not.toMatch(/TRANSFERENCIA/);
    expect(texto).toMatch(/Transfer[eê]ncia/);
  });
});

// ─── #122 ────────────────────────────────────────────────────────────────────

describe('#122 — ManutencaoAcoes: um só «Concluir», e leva a CONCLUIDA', () => {
  beforeEach(() => {
    h.botoes.length = 0;
    h.transitar.length = 0;
  });

  async function render(status: string) {
    const mod: any = await import('../manutencao/_components/manutencao-acoes');
    renderToStaticMarkup(createElement(mod.ManutencaoAcoes, { id: 'man-1', status }));
    return h.botoes.filter((b) => b.texto !== 'Cancelar');
  }

  it('EM_ANDAMENTO → exactamente um botão «Concluir»', async () => {
    const botoes = await render('EM_ANDAMENTO');
    expect(botoes.filter((b) => /^concluir$/i.test(b.texto)).map((b) => b.texto)).toHaveLength(1);
  });

  it('EM_ANDAMENTO → «Concluir» transita para CONCLUIDA', async () => {
    const botoes = await render('EM_ANDAMENTO');
    const concluir = botoes.find((b) => /^concluir$/i.test(b.texto));
    expect(concluir, JSON.stringify(botoes.map((b) => b.texto))).toBeDefined();
    concluir!.onClick?.();
    await Promise.resolve();
    expect(h.transitar).toHaveLength(1);
    expect((h.transitar[0] as any).novoStatus).toBe('CONCLUIDA');
  });

  it('EM_ANDAMENTO → o botão que transita para ORCAMENTO não se chama «Concluir»', async () => {
    const botoes = await render('EM_ANDAMENTO');
    expect(botoes.length, JSON.stringify(botoes.map((b) => b.texto))).toBe(2);
    const porAlvo: Record<string, string> = {};
    for (const b of botoes) {
      h.transitar.length = 0;
      b.onClick?.();
      await Promise.resolve();
      porAlvo[(h.transitar[0] as any)?.novoStatus] = b.texto;
    }
    expect(Object.keys(porAlvo).sort()).toEqual(['CONCLUIDA', 'ORCAMENTO']);
    expect(porAlvo.ORCAMENTO).not.toMatch(/concluir/i);
  });

  it.each(['AGENDADA', 'EM_ANDAMENTO', 'ORCAMENTO'])('%s → etiquetas das acções não destrutivas são distintas', async (status) => {
    const botoes = await render(status);
    const textos = botoes.map((b) => b.texto.toLowerCase());
    expect(new Set(textos).size, JSON.stringify(textos)).toBe(textos.length);
  });
});

// ─── #123 ────────────────────────────────────────────────────────────────────

/** Todos os ficheiros .tsx/.ts sob o Inventário (sem testes). */
function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : ficheiros(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** A rota `/inventario/<a>/<dinâmico>/editar` existe? (qualquer nome de segmento dinâmico `[x]`). */
function rotaEditarExiste(seccao: string): boolean {
  const base = path.join(INV, seccao);
  if (!existsSync(base)) return false;
  return readdirSync(base)
    .filter((n) => /^\[[^\]]+\]$/.test(n))
    .some((din) => existsSync(path.join(base, din, 'editar', 'page.tsx')));
}

describe('#123 — sem ligações «Editar» para rotas inexistentes', () => {
  const todos = ficheiros(INV);

  it.each(['localizacoes', 'fisico'])('/inventario/%s/<id>/editar: ou a rota existe, ou ninguém liga para lá', (seccao) => {
    const re = new RegExp(`/inventario/${seccao}/\\$\\{[^}]+\\}/editar`);
    const quemLiga = todos.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => path.relative(ERP, f));
    if (!rotaEditarExiste(seccao)) {
      expect(quemLiga, `ligações para /inventario/${seccao}/<id>/editar sem rota`).toEqual([]);
    } else {
      // A rota existe: tem de ser uma página de servidor de verdade (não um 'use client' de protótipo).
      const base = path.join(INV, seccao);
      const din = readdirSync(base).find((n) => /^\[[^\]]+\]$/.test(n) && existsSync(path.join(base, n, 'editar', 'page.tsx')))!;
      const page = readFileSync(path.join(base, din, 'editar', 'page.tsx'), 'utf8');
      expect(page).not.toMatch(/^\s*['"]use client['"]/m);
      expect(page).not.toMatch(/localStorage/);
    }
  });
});
