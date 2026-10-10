/**
 * Oráculo — issue #126 (parte de UI e de fonte): `/stock/reposicao` mostra nomes, não ids.
 *
 * O comportamento do serviço (nomes, códigos, semântica do alerta e isolamento) está no oráculo
 * de integração `test/integration/reposicao-nomes-126.test.ts`. Este ficheiro tranca:
 *   - a tabela `ReposicaoTable` mostra o nome e o código do produto e o nome da localização que o
 *     serviço devolve (`produto: { codigo, nome }`, `localizacao: { nome }`), e não mostra os ids
 *     (nem truncados, `abcdefgh…`, nem a sentinela `__total__`);
 *   - `obterAlertasStockMinimo` filtra o tenant EXPLICITAMENTE (regra «Multi-tenancy» do
 *     CLAUDE.md: o serviço não depende só da extensão) — no catálogo de produtos que percorre.
 *
 * Render no servidor (`react-dom/server`), `next/navigation` dobrado (a `DataTable` usa-o).
 * Escrito pelo verificador do nó D:reposicao-nomes-126; um agente de implementação que o altere
 * é BLOCKER.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/stock/reposicao',
  useSearchParams: () => new URLSearchParams(),
}));

const ERP = path.resolve(__dirname, '../../../../..'); // apps/erp

const PRODUTO_ID = 'cmprodutoabcdefghijklmn126';
const LOC_ID = 'cmlocalizacaoxyzwvutsr126';

const linha = (over: Record<string, unknown> = {}) => ({
  id: `${PRODUTO_ID}::__total__`,
  tenantId: 'tenant-126',
  produtoId: PRODUTO_ID,
  varianteProdutoId: '',
  localizacaoId: LOC_ID,
  saldo: '3',
  saldoReservado: '0',
  saldoDisponivel: '3',
  updatedAt: new Date('2026-10-10T08:00:00Z'),
  produto: { codigo: 'CIM-126', nome: 'Cimento Portland 126', unidade: 'UN' },
  localizacao: { nome: 'Armazém Central 126' },
  ...over,
});

async function render(data: unknown[]): Promise<string> {
  // Acesso dinâmico: falha o caso, não o ficheiro.
  const mod: any = await import('../reposicao/_components/reposicao-table');
  return renderToStaticMarkup(createElement(mod.ReposicaoTable, { data }));
}

describe('#126 — ReposicaoTable mostra nomes em vez de ids', () => {
  it('mostra o nome e o código do produto', async () => {
    const html = await render([linha()]);
    expect(html).toContain('Cimento Portland 126');
    expect(html).toContain('CIM-126');
  });

  it('mostra o nome da localização', async () => {
    const html = await render([linha()]);
    expect(html).toContain('Armazém Central 126');
  });

  it('não mostra os ids do produto nem da localização (inteiros ou truncados)', async () => {
    const html = await render([linha()]);
    expect(html).not.toContain(PRODUTO_ID.slice(0, 8));
    expect(html).not.toContain(LOC_ID.slice(0, 8));
  });

  it('não mostra a sentinela `__total__` da linha agregada', async () => {
    const html = await render([linha({ localizacaoId: '__total__', localizacao: { nome: 'Várias localizações' } })]);
    expect(html).not.toContain('__total__');
    expect(html).not.toContain('__total');
    expect(html).toContain('Várias localizações');
  });

  it('continua a mostrar o saldo e o estado vazio', async () => {
    const html = await render([linha({ saldo: '3' })]);
    expect(html).toContain('Stock Baixo');
    const vazio = await render([]);
    expect(vazio).toContain('Sem alertas de stock');
  });
});

describe('#126 — obterAlertasStockMinimo filtra o tenant explicitamente', () => {
  function corpoDe(nome: string, src: string): string {
    const inicio = src.search(new RegExp(`export\\s+async\\s+function\\s+${nome}\\s*\\(`));
    expect(inicio, `função ${nome} não encontrada`).toBeGreaterThanOrEqual(0);
    const resto = src.slice(inicio + 1);
    const fim = resto.search(/\n\}\n/); // fecho da função (estilo da casa: `}` na coluna 0)
    return fim === -1 ? resto : resto.slice(0, fim);
  }

  it('o corpo de obterAlertasStockMinimo inclui `tenantId: ctx.tenantId` (ou o tenant em SQL)', () => {
    const fonte = readFileSync(path.join(ERP, 'src/server/services/inventario/stock.service.ts'), 'utf8');
    const corpo = corpoDe('obterAlertasStockMinimo', fonte);
    expect(corpo).toMatch(/tenantId\s*:\s*ctx\.tenantId|"tenantId"\s*=\s*\$\{\s*ctx\.tenantId\s*\}/);
  });
});
