/**
 * Oráculo do nó A:cp-vencidas-79 (issue #79) — contas a pagar vencidas derivadas na leitura.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `actualizarVencidas()` só é chamado em testes, logo nenhuma ContaPagar passa a
 * VENCIDA; `listar({ vencidas: true })` só olha para ABERTA/PARCIALMENTE_PAGA e compara com o
 * INSTANTE actual (uma conta que vence hoje ao meio-dia já aparece vencida às 13h); e o KPI
 * «A pagar» de /fornecedores/contas-pagar soma só as ABERTA.
 *
 * Contrato (decisão do orquestrador, sem cron):
 *   L1 `listar({ vencidas: true })` devolve as contas em ABERTA, PARCIALMENTE_PAGA ou VENCIDA
 *      cujo dia civil de Maputo de `dataVencimento` é ANTERIOR ao dia de hoje em Maputo
 *      (o mesmo predicado que `vencimentoJaPassou` das facturas). No próprio dia do
 *      vencimento a conta ainda está no prazo; às 00:00 de Maputo do dia seguinte — que em
 *      UTC ainda é o dia do vencimento — já está vencida. PAGA, CANCELADA, futuras e contas
 *      de outro tenant nunca entram.
 *   L2 `actualizarVencidas()` usa o mesmo dia de Maputo: marca VENCIDA só as ABERTA /
 *      PARCIALMENTE_PAGA desse conjunto, devolve quantas marcou, não toca valores, nem
 *      PAGA/CANCELADA, nem outro tenant. Depois de marcadas continuam a aparecer em L1.
 *   K1 KPI «A pagar» = Σ valorRestante de ABERTA + PARCIALMENTE_PAGA + VENCIDA.
 *   K2 KPI «Vencidas» = n.º de contas vencidas derivadas (L1), incluindo as que já têm
 *      status VENCIDA.
 *
 * Determinismo: as escritas e leituras de L1/L2 correm com o `Date` falseado
 * (`vi.useFakeTimers({ toFake: ['Date'] })`) num dia D a 30 dias de hoje. O KPI (K1/K2)
 * corre com o relógio real e datas a ±10 dias — longe de qualquer fronteira.
 *
 * O KPI é lido renderizando a própria página (Server Component) com `auth` dobrado e a base
 * efémera real: os elementos com `title` + `value` (KpiCard) são recolhidos da árvore,
 * resolvendo os componentes assíncronos de servidor pelo caminho; os de cliente (hooks)
 * são saltados.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const sessao = vi.hoisted(() => ({ atual: null as null | { user: Record<string, unknown> } }));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => sessao.atual),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Relógio de Maputo (UTC+2, sem hora de Verão)
// ─────────────────────────────────────────────────────────────────────────────

function hojeEmMaputo(): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' })
    .format(new Date())
    .split('-')
    .map(Number);
  return { ano, mes, dia };
}

/** Instante `hh:mm` de Maputo no dia de hoje deslocado `deslocDias`. */
function instanteMaputo(deslocDias: number, hh: number, mm: number): Date {
  const h = hojeEmMaputo();
  return new Date(Date.UTC(h.ano, h.mes - 1, h.dia + deslocDias, hh - 2, mm));
}

const D = 30; // dia do vencimento, a 30 dias de hoje
/** D 23:59 de Maputo (21:59Z de D) — ainda é o dia do vencimento. */
const ULTIMO_MINUTO_DE_D = () => instanteMaputo(D, 23, 59);
/** D+1 00:30 de Maputo (22:30Z de D) — já é o dia seguinte, embora em UTC ainda seja D. */
const MEIA_HORA_DEPOIS_DE_D = () => instanteMaputo(D + 1, 0, 30);

/** Valor monetário de um texto de KPI, independente do formato («MT 7500», «7 500,00 MT», «7.500,00»). */
function valorDoTexto(texto: string): number {
  const s = String(texto).replace(/[^\d,.]/g, '');
  const dec = s.match(/[.,](\d{2})$/);
  const inteiro = (dec ? s.slice(0, -3) : s).replace(/\D/g, '');
  return Number(inteiro) + (dec ? Number(dec[1]) / 100 : 0);
}

describe.skipIf(skip)('#79 — contas a pagar vencidas pelo dia de Maputo — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // contaPagarService

  const sufixo = Date.now();
  let seq = 0;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ contaPagarService: svc } = await import('@/server/services/compras/conta-pagar.service'));
  });

  async function novoTenant(rotulo: string): Promise<{ tenantId: string; userId: string; fornecedorId: string }> {
    seq += 1;
    const tenantId = `tenant-cpv79-${rotulo}-${sufixo}-${seq}`;
    const userId = `user-cpv79-${rotulo}-${sufixo}-${seq}`;
    const slug = `cpv79-${rotulo}-${sufixo}-${seq}`;
    await db.tenant.create({ data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq}`.slice(-9) } });
    await db.user.create({
      data: { id: userId, tenantId, email: `${userId}@test.mz`, nome: 'Financeiro', keycloakSub: `kc-${userId}` },
    });
    const f = await db.fornecedor.create({
      data: {
        tenantId,
        codigo: `FOR-${slug}`,
        nome: 'Fornecedor Credor',
        tipo: 'PESSOA_JURIDICA',
        nuit: '400000079',
        email: `for-${slug}@test.mz`,
      },
    });
    return { tenantId, userId, fornecedorId: f.id };
  }

  async function conta(
    t: { tenantId: string; fornecedorId: string },
    rotulo: string,
    status: 'ABERTA' | 'PARCIALMENTE_PAGA' | 'PAGA' | 'CANCELADA' | 'VENCIDA',
    dataVencimento: Date,
    valores: { original: number; pago?: number; restante?: number } = { original: 1000 },
  ): Promise<string> {
    seq += 1;
    const pago = valores.pago ?? 0;
    const restante = valores.restante ?? valores.original - pago;
    const c = await db.contaPagar.create({
      data: {
        tenantId: t.tenantId,
        numero: `CP-79-${rotulo}-${sufixo}-${seq}`,
        fornecedorId: t.fornecedorId,
        descricao: `cp-vencidas-79 ${rotulo}`,
        valorOriginal: String(valores.original),
        valorPago: String(pago),
        valorRestante: String(restante),
        dataEmissao: instanteMaputo(-40, 12, 0),
        dataVencimento,
        status,
      },
    });
    return c.id;
  }

  /** Corre `fn` com o relógio de parede em `agora` (só o Date é falseado). */
  async function em<T>(agora: Date, fn: () => Promise<T>): Promise<T> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  }

  async function idsVencidas(t: { tenantId: string; userId: string }): Promise<string[]> {
    const ctx = { tenantId: t.tenantId, userId: t.userId };
    const r: any = await runCtx(ctx, () =>
      svc.listar({ vencidas: true, take: 100, orderBy: 'dataVencimento', orderDir: 'asc' }, ctx),
    );
    return r.items.map((c: any) => c.id);
  }

  async function estados(ids: string[]): Promise<Record<string, string>> {
    const rows = await db.contaPagar.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
    return Object.fromEntries(rows.map((r: any) => [r.id, r.status]));
  }

  /** Cenário do dia D: o mesmo conjunto para L1 e L2. */
  async function cenarioD() {
    const t = await novoTenant('d');
    const outro = await novoTenant('outro');
    const ids = {
      abertaMeioDia: await conta(t, 'aberta-12h', 'ABERTA', instanteMaputo(D, 12, 0)),
      abertaNoite: await conta(t, 'aberta-23h30', 'ABERTA', instanteMaputo(D, 23, 30)),
      parcial: await conta(t, 'parcial', 'PARCIALMENTE_PAGA', instanteMaputo(D, 12, 0), { original: 3000, pago: 1000 }),
      jaVencida: await conta(t, 'ja-vencida', 'VENCIDA', instanteMaputo(D - 3, 12, 0)),
      paga: await conta(t, 'paga', 'PAGA', instanteMaputo(D - 10, 12, 0), { original: 900, pago: 900 }),
      cancelada: await conta(t, 'cancelada', 'CANCELADA', instanteMaputo(D - 10, 12, 0)),
      futura: await conta(t, 'futura', 'ABERTA', instanteMaputo(D + 5, 12, 0)),
      outroTenant: await conta(outro, 'outro-tenant', 'ABERTA', instanteMaputo(D - 10, 12, 0)),
    };
    return { t, outro, ids };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // L1 — listar({ vencidas: true })
  // ───────────────────────────────────────────────────────────────────────────

  it('L1: conta já com status VENCIDA aparece na lista de vencidas', async () => {
    const { t, ids } = await cenarioD();
    const lista = await em(MEIA_HORA_DEPOIS_DE_D(), () => idsVencidas(t));
    expect(lista, 'a VENCIDA ficou de fora de listar({ vencidas: true })').toContain(ids.jaVencida);
  });

  it('L1: no próprio dia do vencimento (D 23:59 de Maputo) as contas que vencem em D ainda NÃO estão vencidas', async () => {
    const { t, ids } = await cenarioD();
    const lista = await em(ULTIMO_MINUTO_DE_D(), () => idsVencidas(t));
    expect(lista, 'vence hoje às 12:00 e já aparece vencida às 23:59 — comparação por instante').not.toContain(
      ids.abertaMeioDia,
    );
    expect(lista).not.toContain(ids.abertaNoite);
    expect(lista).not.toContain(ids.parcial);
    // A que venceu há 3 dias continua lá.
    expect(lista).toContain(ids.jaVencida);
  });

  it('L1: no dia seguinte (D+1 00:30 de Maputo, ainda D em UTC) ABERTA, PARCIALMENTE_PAGA e VENCIDA estão vencidas; o resto não', async () => {
    const { t, ids } = await cenarioD();
    const lista = await em(MEIA_HORA_DEPOIS_DE_D(), () => idsVencidas(t));
    expect([...lista].sort()).toEqual(
      [ids.abertaMeioDia, ids.abertaNoite, ids.parcial, ids.jaVencida].sort(),
    );
    for (const fora of [ids.paga, ids.cancelada, ids.futura, ids.outroTenant]) {
      expect(lista).not.toContain(fora);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // L2 — actualizarVencidas()
  // ───────────────────────────────────────────────────────────────────────────

  it('L2: em D 23:59 de Maputo não marca nada (as de D ainda estão no prazo)', async () => {
    const { t, ids } = await cenarioD();
    const ctx = { tenantId: t.tenantId, userId: t.userId };
    const n = await em(ULTIMO_MINUTO_DE_D(), () => runCtx(ctx, () => svc.actualizarVencidas(ctx)));
    expect(n).toBe(0);
    const e = await estados(Object.values(ids));
    expect(e[ids.abertaMeioDia]).toBe('ABERTA');
    expect(e[ids.abertaNoite]).toBe('ABERTA');
    expect(e[ids.parcial]).toBe('PARCIALMENTE_PAGA');
  });

  it('L2: em D+1 00:30 de Maputo marca as três de D, não toca valores, PAGA, CANCELADA, futuras nem outro tenant', async () => {
    const { t, ids } = await cenarioD();
    const ctx = { tenantId: t.tenantId, userId: t.userId };
    const n = await em(MEIA_HORA_DEPOIS_DE_D(), () => runCtx(ctx, () => svc.actualizarVencidas(ctx)));
    expect(n).toBe(3);
    const e = await estados(Object.values(ids));
    expect(e[ids.abertaMeioDia]).toBe('VENCIDA');
    expect(e[ids.abertaNoite]).toBe('VENCIDA');
    expect(e[ids.parcial]).toBe('VENCIDA');
    expect(e[ids.jaVencida]).toBe('VENCIDA');
    expect(e[ids.paga]).toBe('PAGA');
    expect(e[ids.cancelada]).toBe('CANCELADA');
    expect(e[ids.futura]).toBe('ABERTA');
    expect(e[ids.outroTenant]).toBe('ABERTA');
    const parcial = await db.contaPagar.findFirst({ where: { id: ids.parcial } });
    expect(Number(String(parcial.valorPago))).toBeCloseTo(1000, 2);
    expect(Number(String(parcial.valorRestante))).toBeCloseTo(2000, 2);
  });

  it('L2→L1: depois de marcadas VENCIDA, continuam na lista de vencidas', async () => {
    const { t, ids } = await cenarioD();
    const ctx = { tenantId: t.tenantId, userId: t.userId };
    const lista = await em(MEIA_HORA_DEPOIS_DE_D(), async () => {
      await runCtx(ctx, () => svc.actualizarVencidas(ctx));
      return idsVencidas(t);
    });
    expect([...lista].sort()).toEqual(
      [ids.abertaMeioDia, ids.abertaNoite, ids.parcial, ids.jaVencida].sort(),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // K1/K2 — KPI da página /fornecedores/contas-pagar
  // ───────────────────────────────────────────────────────────────────────────

  /** Percorre a árvore devolvida pela página e recolhe { title, value } de cada KpiCard. */
  async function recolherKpis(no: unknown, saida: Map<string, string>, prof = 0): Promise<void> {
    if (prof > 40 || no == null || typeof no !== 'object') return;
    if (Array.isArray(no)) {
      for (const filho of no) await recolherKpis(filho, saida, prof + 1);
      return;
    }
    const el = no as { type?: unknown; props?: Record<string, unknown> };
    const props = el.props ?? {};
    if (typeof props.title === 'string' && 'value' in props) {
      saida.set(props.title, String(props.value));
      return;
    }
    if (typeof el.type === 'function') {
      let out: unknown;
      try {
        out = await (el.type as (p: unknown) => unknown)(props);
      } catch {
        return; // componente de cliente (hooks) — não tem KPIs de servidor
      }
      await recolherKpis(out, saida, prof + 1);
      return;
    }
    if ('children' in props) await recolherKpis(props.children, saida, prof + 1);
  }

  async function kpisDaPagina(t: { tenantId: string; userId: string }): Promise<Map<string, string>> {
    sessao.atual = { user: { id: t.userId, tenantId: t.tenantId, emailVerificado: true, permissions: [] } };
    const { default: Pagina } = await import('@/app/(dashboard)/fornecedores/contas-pagar/page');
    const arvore = await (Pagina as any)({ searchParams: Promise.resolve({}) });
    const kpis = new Map<string, string>();
    await recolherKpis(arvore, kpis);
    return kpis;
  }

  async function cenarioKpi() {
    const t = await novoTenant('kpi');
    const outro = await novoTenant('kpi-outro');
    await conta(t, 'aberta-vencida', 'ABERTA', instanteMaputo(-10, 12, 0), { original: 1000 });
    await conta(t, 'aberta-futura', 'ABERTA', instanteMaputo(10, 12, 0), { original: 500 });
    await conta(t, 'parcial-vencida', 'PARCIALMENTE_PAGA', instanteMaputo(-10, 12, 0), { original: 3000, pago: 1000 });
    await conta(t, 'vencida', 'VENCIDA', instanteMaputo(-10, 12, 0), { original: 4000 });
    await conta(t, 'paga', 'PAGA', instanteMaputo(-10, 12, 0), { original: 900, pago: 900 });
    await conta(t, 'cancelada', 'CANCELADA', instanteMaputo(-10, 12, 0), { original: 8000 });
    await conta(outro, 'outro-tenant', 'VENCIDA', instanteMaputo(-10, 12, 0), { original: 64000 });
    return t;
  }

  it('K1: KPI «A pagar» soma valorRestante de ABERTA + PARCIALMENTE_PAGA + VENCIDA (1000 + 500 + 2000 + 4000 = 7500)', async () => {
    const t = await cenarioKpi();
    const kpis = await kpisDaPagina(t);
    expect(kpis.has('A pagar'), `KPIs encontrados: ${[...kpis.keys()].join(', ')}`).toBe(true);
    expect(valorDoTexto(kpis.get('A pagar')!), `«A pagar» mostra «${kpis.get('A pagar')}»`).toBeCloseTo(7500, 2);
  });

  it('K2: KPI «Vencidas» conta as vencidas derivadas, incluindo as de status VENCIDA (3)', async () => {
    const t = await cenarioKpi();
    const kpis = await kpisDaPagina(t);
    expect(kpis.has('Vencidas'), `KPIs encontrados: ${[...kpis.keys()].join(', ')}`).toBe(true);
    expect(valorDoTexto(kpis.get('Vencidas')!)).toBe(3);
  });

  it('K (guarda): «Total de contas» e «Liquidadas» mantêm-se (6 e 1)', async () => {
    const t = await cenarioKpi();
    const kpis = await kpisDaPagina(t);
    expect(valorDoTexto(kpis.get('Total de contas') ?? '')).toBe(6);
    expect(valorDoTexto(kpis.get('Liquidadas') ?? '')).toBe(1);
  });
});
