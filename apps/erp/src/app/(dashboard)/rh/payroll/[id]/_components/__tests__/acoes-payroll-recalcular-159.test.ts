/**
 * Oráculo da issue #159 — «Recalcular» um payroll PENDENTE pede confirmação (AlertDialog).
 *
 * Contrato (decisão do orquestrador): no detalhe de um payroll PENDENTE, «Recalcular» abre um
 * `AlertDialog` (a única excepção ao padrão sem-modais: confirmação, sem recolher dados) e só a
 * acção de confirmação do diálogo chama `recalcularPayrollAction({ payrollId })`. Cancelar, ou
 * clicar no botão que abre o diálogo, não recalcula nada. «Adicionar ajuste» continua a ser uma
 * rota dedicada (`/rh/payroll/<id>/ajuste`), não um diálogo.
 *
 * O comportamento do serviço (recalcular preserva as linhas manuais, só PENDENTE) é provado
 * contra Postgres real em `test/integration/payroll-recalcular-ajustes-159.test.ts`.
 *
 * Teste unitário em ambiente `node`, sem DOM (molde: `venda-acoes-submeter-132.test.ts`): o
 * componente é chamado como função com os hooks de React dobrados; componentes locais da árvore
 * são expandidos (o diálogo pode viver num subcomponente); os `onClick` são invocados
 * directamente. A Server Action é dobrada.
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
  recalcularPayrollAction: vi.fn(async (_input: unknown) => ({ ok: true, data: undefined })),
  ajustarLinhaManualAction: vi.fn(async (_input: unknown) => ({ ok: true, data: undefined })),
}));
vi.mock('@/server/actions/payroll.actions', () => actions);

import * as AD from '@/components/ui/alert-dialog';
import * as modulo from '../acoes-payroll';

const AcoesPayroll = (modulo as any).AcoesPayroll as (props: Record<string, unknown>) => ReactElement | null;

type No = ReactElement<{ children?: ReactNode; onClick?: (...a: unknown[]) => unknown; href?: unknown }> & {
  /** true quando o elemento está dentro de um AlertDialogAction. */
  __dentroDaAccao?: boolean;
};

const ALERT = new Set<unknown>(Object.values(AD));

/**
 * Todos os elementos da árvore, expandindo componentes-função locais (não os do
 * `ui/alert-dialog`, que são folhas do ponto de vista do contrato).
 */
function elementos(n: ReactNode, dentroDaAccao = false, profundidade = 0): No[] {
  if (n == null || typeof n === 'boolean' || typeof n === 'string' || typeof n === 'number') return [];
  if (Array.isArray(n)) return n.flatMap((x) => elementos(x, dentroDaAccao, profundidade));
  const el = n as No;
  if (!el.props) return [];
  const aqui = dentroDaAccao || el.type === (AD as any).AlertDialogAction;
  const proprio = Object.assign(Object.create(Object.getPrototypeOf(el)), el, { __dentroDaAccao: aqui }) as No;
  const filhos = elementos(el.props.children, aqui, profundidade);
  let expandidos: No[] = [];
  if (typeof el.type === 'function' && !ALERT.has(el.type) && profundidade < 8) {
    try {
      const saida = (el.type as (p: unknown) => ReactNode)(el.props);
      expandidos = elementos(saida, aqui, profundidade + 1);
    } catch {
      // componente que precisa de contexto real (ex.: primitivos Radix/Slot): fica como folha
    }
  }
  return [proprio, ...filhos, ...expandidos];
}

function texto(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(texto).join('');
  return texto((n as No).props?.children);
}

const doTipo = (arvore: No[], nome: keyof typeof AD) => arvore.filter((e) => e.type === (AD as any)[nome]);

async function clicar(el: No) {
  el.props.onClick?.({ preventDefault() {}, stopPropagation() {} });
  await Promise.all(pendentes.splice(0));
}

const PAYROLL_ID = 'cl159payrollpendente00001';

function arvore(): No[] {
  return elementos(AcoesPayroll({ payrollId: PAYROLL_ID }));
}

beforeEach(() => {
  actions.recalcularPayrollAction.mockClear();
  actions.ajustarLinhaManualAction.mockClear();
  pendentes.length = 0;
});

describe('#159 — AcoesPayroll: «Recalcular» com confirmação (AlertDialog)', () => {
  it('a acção «Recalcular» vive num AlertDialog com Trigger, Action e Cancel', () => {
    const a = arvore();
    expect(doTipo(a, 'AlertDialog'), 'tem de existir um AlertDialog').not.toHaveLength(0);

    const triggers = doTipo(a, 'AlertDialogTrigger');
    expect(
      triggers.some((t) => /Recalcular/.test(texto(t.props.children))),
      'o botão «Recalcular» do cabeçalho é o AlertDialogTrigger',
    ).toBe(true);

    expect(doTipo(a, 'AlertDialogAction'), 'confirmação do diálogo').toHaveLength(1);
    expect(doTipo(a, 'AlertDialogCancel'), 'cancelar do diálogo').toHaveLength(1);
  });

  it('o diálogo explica que os ajustes manuais são preservados', () => {
    const a = arvore();
    const conteudo = doTipo(a, 'AlertDialogContent');
    expect(conteudo, 'AlertDialogContent').not.toHaveLength(0);
    const t = conteudo.map((c) => texto(c.props.children)).join(' ');
    expect(t).toMatch(/recalcular/i);
    expect(t, 'menciona os ajustes manuais').toMatch(/ajuste/i);
  });

  it('nenhum clique fora da confirmação chama recalcularPayrollAction (trigger, cancelar, outros)', async () => {
    const a = arvore();
    const foraDaAccao = a.filter((e) => typeof e.props.onClick === 'function' && !e.__dentroDaAccao);
    for (const el of foraDaAccao) await clicar(el);
    expect(actions.recalcularPayrollAction).not.toHaveBeenCalled();
  });

  it('confirmar no diálogo chama recalcularPayrollAction uma vez com o payrollId', async () => {
    const a = arvore();
    const accao = doTipo(a, 'AlertDialogAction')[0];
    expect(accao, 'AlertDialogAction').toBeDefined();
    expect(texto(accao.props.children)).toMatch(/Recalcular|Confirmar/);

    const clicaveis = a.filter((e) => e.__dentroDaAccao && typeof e.props.onClick === 'function');
    expect(clicaveis.length, 'a confirmação tem um onClick').toBeGreaterThan(0);
    await clicar(clicaveis[0]);

    expect(actions.recalcularPayrollAction).toHaveBeenCalledTimes(1);
    expect(actions.recalcularPayrollAction.mock.calls[0][0]).toEqual({ payrollId: PAYROLL_ID });
  });

  it('«Adicionar ajuste» continua a ser uma rota dedicada, fora de qualquer diálogo', () => {
    const a = arvore();
    const links = a.filter((e) => e.props.href === `/rh/payroll/${PAYROLL_ID}/ajuste`);
    expect(links, 'link para /rh/payroll/<id>/ajuste').not.toHaveLength(0);
    const dentroDeDialogo = doTipo(a, 'AlertDialogContent').some((c) =>
      elementos(c.props.children).some((e) => e.props.href === `/rh/payroll/${PAYROLL_ID}/ajuste`),
    );
    expect(dentroDeDialogo, 'o ajuste não é recolhido num diálogo').toBe(false);
    expect(actions.ajustarLinhaManualAction).not.toHaveBeenCalled();
  });
});
