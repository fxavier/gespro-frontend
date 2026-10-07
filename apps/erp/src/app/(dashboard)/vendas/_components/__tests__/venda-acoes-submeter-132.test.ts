/**
 * Oráculo da issue #132 — «Submeter» uma venda em Rascunho falha sempre.
 *
 * Causa raiz (lida no código): o botão «Submeter» de `VendaAcoes` (estado RASCUNHO, que é o
 * estado inicial das vendas de origem ENCOMENDA — `venda.service.ts`, `statusInicial`) pede
 * RASCUNHO → CONFIRMADA à `transitarVendaAction`. `TRANSICOES_VENDA` só permite
 * RASCUNHO → PENDENTE | CANCELADA, logo o serviço recusa sempre com TRANSICAO_INVALIDA.
 *
 * Contrato escolhido (o mais conservador — não mexe na máquina de estados nem retira o único
 * caminho de saída de uma encomenda em Rascunho): «Submeter» leva RASCUNHO → PENDENTE, o
 * passo seguinte da máquina; «Confirmar» (PENDENTE → CONFIRMADA) continua igual.
 *
 * Invariante geral: nenhum botão de `VendaAcoes` pede ao servidor uma transição que
 * `TRANSICOES_VENDA` recuse a partir do estado mostrado.
 *
 * Teste unitário em ambiente `node`, sem DOM: o componente é chamado como função com os hooks
 * de React dobrados, e os `onClick` da árvore devolvida são invocados directamente. As Server
 * Actions são dobradas — a regra do servidor é a `TRANSICOES_VENDA` real, importada aqui.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const pendentes: Promise<unknown>[] = [];

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  return {
    ...real,
    useTransition: () => [false, (fn: () => unknown) => { pendentes.push(Promise.resolve(fn())); }],
    useState: (inicial: unknown) => [typeof inicial === 'function' ? (inicial as () => unknown)() : inicial, () => {}],
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const actions = vi.hoisted(() => ({
  transitarVendaAction: vi.fn(async (_input: unknown) => ({ ok: true, data: {} })),
  cancelarVenda: vi.fn(async (_input: unknown) => ({ ok: true, data: {} })),
}));
vi.mock('@/server/actions/vendas.actions', () => actions);

import { TRANSICOES_VENDA } from '@/server/services/comercial/venda.interface';
import * as modulo from '../venda-acoes';

const VendaAcoes = (modulo as any).VendaAcoes as (props: Record<string, unknown>) => ReactElement | null;

type No = ReactElement<{ children?: ReactNode; onClick?: (...a: unknown[]) => unknown }>;

/** Todos os elementos da árvore JSX devolvida (sem renderizar os componentes filhos). */
function elementos(n: ReactNode): No[] {
  if (n == null || typeof n === 'boolean' || typeof n === 'string' || typeof n === 'number') return [];
  if (Array.isArray(n)) return n.flatMap(elementos);
  const el = n as No;
  if (!el.props) return [];
  return [el, ...elementos(el.props.children)];
}

function texto(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(texto).join('');
  return texto((n as No).props?.children);
}

function botaoComTexto(arvore: ReactNode, rotulo: RegExp): No | undefined {
  return elementos(arvore).find((e) => typeof e.props.onClick === 'function' && rotulo.test(texto(e.props.children)));
}

async function clicar(el: No) {
  el.props.onClick?.({ preventDefault() {} });
  await Promise.all(pendentes.splice(0));
}

function render(status: string, faturaId: string | null = null) {
  return VendaAcoes({ id: 'venda-132', status, faturaId });
}

beforeEach(() => {
  actions.transitarVendaAction.mockClear();
  actions.cancelarVenda.mockClear();
  pendentes.length = 0;
});

describe('#132 — VendaAcoes: «Submeter» de uma venda em Rascunho', () => {
  it('fixture: RASCUNHO → CONFIRMADA é recusada pela máquina e RASCUNHO → PENDENTE é permitida', () => {
    expect(TRANSICOES_VENDA.RASCUNHO).not.toContain('CONFIRMADA');
    expect(TRANSICOES_VENDA.RASCUNHO).toContain('PENDENTE');
  });

  it('RASCUNHO: o botão «Submeter» existe e pede RASCUNHO → PENDENTE (não CONFIRMADA)', async () => {
    const arvore = render('RASCUNHO');
    const submeter = botaoComTexto(arvore, /Submeter/);
    expect(submeter, 'uma venda em Rascunho tem de mostrar «Submeter»').toBeDefined();

    await clicar(submeter!);

    expect(actions.transitarVendaAction).toHaveBeenCalledTimes(1);
    const input = actions.transitarVendaAction.mock.calls[0][0] as any;
    expect(input.vendaId).toBe('venda-132');
    expect(input.paraStatus).toBe('PENDENTE');
  });

  it('controlo: PENDENTE — «Confirmar» continua a pedir PENDENTE → CONFIRMADA', async () => {
    const confirmar = botaoComTexto(render('PENDENTE'), /^Confirmar$/);
    expect(confirmar).toBeDefined();

    await clicar(confirmar!);

    expect(actions.transitarVendaAction).toHaveBeenCalledTimes(1);
    const input = actions.transitarVendaAction.mock.calls[0][0] as any;
    expect(input).toMatchObject({ vendaId: 'venda-132', paraStatus: 'CONFIRMADA' });
  });

  it.each(Object.keys(TRANSICOES_VENDA))(
    'invariante: em %s nenhum botão pede uma transição que TRANSICOES_VENDA recuse',
    async (status) => {
      const arvore = render(status);
      for (const el of elementos(arvore).filter((e) => typeof e.props.onClick === 'function')) {
        await clicar(el);
      }
      const permitidas = (TRANSICOES_VENDA as Record<string, string[]>)[status];
      for (const [input] of actions.transitarVendaAction.mock.calls as any[]) {
        expect(
          permitidas,
          `${status}: a UI pediu ${status} → ${input.paraStatus}, que o servidor recusa sempre`,
        ).toContain(input.paraStatus);
      }
    },
  );
});
