/**
 * Oráculo do nó D:analytics-caixa-cp-397-398 (issues #397 e #398) — escrito pelo verificador.
 * Alterar este ficheiro do lado de quem implementa é BLOCKER (doutrina 00 §2).
 *
 * Contra Postgres real (Testcontainers), chamando os `kpi*Impl` do dashboard SEM contexto de
 * tenant — é assim que correm em produção, dentro de `unstable_cache`. Um leitor que use o
 * `prisma` estendido em vez do `prismaBase` rebenta aqui com SEM_CONTEXTO_TENANT.
 *
 *  #397 — `kpiFinancasImpl.saldoCaixaAtual` somava `fundoInicial + totalEntradas − totalSaidas`
 *         das sessões ABERTA, mas essas colunas são a fotografia do fecho (a zero numa sessão
 *         aberta): o KPI mostrava só o fundo. Contrato: para as sessões ABERTA, os totais saem
 *         dos movimentos (groupBy por sessão e tipo, `prismaBase`, tenantId explícito) pela
 *         aritmética única `totaisSessaoCaixa`, e o KPI soma o `saldoEsperado` de cada uma.
 *         Sessões FECHADA não entram; outro tenant não entra.
 *  #398 — `kpiComprasImpl.contasAPagarVencidas` contava só ABERTA/VENCIDA e comparava com o
 *         INSTANTE actual. Contrato (o predicado do #388/#79): estados ABERTA,
 *         PARCIALMENTE_PAGA e VENCIDA, e `dataVencimento < inicioDoDiaCivilMaputo()` — uma conta
 *         que vence hoje (dia de Maputo) ainda está no prazo, mesmo que a hora já tenha passado.
 *
 * Os movimentos de caixa entram pelos caminhos de produção (`abrirSessao`,
 * `registarMovimentoCaixa`, `registarSangria`, `fecharSessao`); nenhum total é escrito à mão.
 * Os valores esperados estão apurados à mão nos comentários.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('next/cache', () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const D = (v: string | number) => new Prisma.Decimal(v);
const dois = (v: unknown) => D(String(v)).toFixed(2);

type Ctx = { tenantId: string; userId: string };

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

/** Instante `hh:mm` de Maputo no dia de hoje deslocado `deslocDias` (fixado no arranque). */
const HOJE = hojeEmMaputo();
function instanteMaputo(deslocDias: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(HOJE.ano, HOJE.mes - 1, HOJE.dia + deslocDias, hh - 2, mm));
}

describe.skipIf(skip)('#397/#398 — KPI do dashboard: caixa aberta e contas a pagar vencidas (DB efémera)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let analytics: typeof import('@/server/services/plataforma/analytics.service');

  const sufixo = Date.now();
  let seq = 0;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    caixa = await import('@/server/services/financas/caixa.service');
    analytics = await import('@/server/services/plataforma/analytics.service');
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  async function novoTenant(rotulo: string, comContabilidade: boolean): Promise<string> {
    seq += 1;
    const tenantId = `tenant-acp397-${rotulo}-${sufixo}-${seq}`;
    const slug = `acp397-${rotulo}-${sufixo}-${seq}`;
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq}`.slice(-9) },
    });
    if (comContabilidade) {
      const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });
    }
    return tenantId;
  }

  async function novoUtilizador(tenantId: string): Promise<Ctx> {
    seq += 1;
    const userId = `acp397${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `acp397-${sufixo}-${seq}@test.mz`,
        nome: `Operador ${seq}`,
        keycloakSub: `kc-acp397-${sufixo}-${seq}`,
      },
    });
    return { tenantId, userId };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // #397 — saldo das caixas abertas
  // ───────────────────────────────────────────────────────────────────────────

  async function abrir(ctx: Ctx, fundoInicial: number): Promise<string> {
    const s: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial }, ctx));
    return s.id as string;
  }

  async function movimento(ctx: Ctx, sessaoCaixaId: string, tipo: string, valor: string) {
    await runCtx(ctx, () =>
      db.$transaction((tx: any) =>
        caixa.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId,
            tipo: tipo as any,
            valor,
            descricao: `analytics-caixa-cp-397-398 ${tipo} ${valor}`,
            documentoOrigemTipo: 'Oraculo',
            documentoOrigemId: `oraculo-397-${tipo}-${valor}-${seq}`,
          },
          ctx,
        ),
      ),
    );
  }

  it('#397 saldoCaixaAtual: sessão ABERTA com fundo 1000, VENDA 300, RECEBIMENTO 200 e SANGRIA 50 ⇒ 1450 (hoje 1000)', async () => {
    const tenantId = await novoTenant('caixa', true);
    const op = await novoUtilizador(tenantId);
    const id = await abrir(op, 1000);
    await movimento(op, id, 'VENDA', '300.00');
    await movimento(op, id, 'RECEBIMENTO', '200.00');
    await runCtx(op, () => caixa.registarSangria({ sessaoCaixaId: id, valor: 50, motivo: 'cofre' } as any, op));

    // Sessão FECHADA no mesmo tenant: não entra no saldo das caixas abertas.
    const op2 = await novoUtilizador(tenantId);
    const fechada = await abrir(op2, 500);
    await movimento(op2, fechada, 'VENDA', '100.00');
    await runCtx(op2, () => caixa.fecharSessao({ sessaoCaixaId: fechada, fundoFinal: 600 } as any, op2));

    // Outro tenant com caixa aberta e vendas: não entra.
    const outroTenant = await novoTenant('caixa-outro', true);
    const opOutro = await novoUtilizador(outroTenant);
    const idOutro = await abrir(opOutro, 7000);
    await movimento(opOutro, idOutro, 'VENDA', '900.00');

    // Pré-condição: as colunas da sessão aberta continuam por escrever (fotografia do fecho).
    const linha = await db.sessaoCaixa.findFirst({ where: { id, tenantId } });
    expect(dois(linha.totalEntradas)).toBe('0.00');
    expect(dois(linha.totalSaidas)).toBe('0.00');

    // Sem contexto de tenant, como dentro do unstable_cache.
    const kpi = await analytics.kpiFinancasImpl(tenantId);

    // À mão: fundo 1000 + entradas (300 + 200) − saídas 50 = 1450.
    // A ABERTURA (1000) já está no fundo; a FECHADA (600) e o outro tenant (7900) ficam de fora.
    expect(kpi.saldoCaixaAtual, 'o saldo das caixas abertas tem de incluir os movimentos antes do fecho').toBe(
      '1450.00',
    );
  });

  it('#397 saldoCaixaAtual: duas sessões ABERTA somam o saldo esperado de cada uma', async () => {
    const tenantId = await novoTenant('caixa-duas', true);
    const a = await novoUtilizador(tenantId);
    const b = await novoUtilizador(tenantId);
    const idA = await abrir(a, 200);
    const idB = await abrir(b, 0);
    await movimento(a, idA, 'VENDA', '150.50');
    await movimento(b, idB, 'VENDA', '80.00');
    await movimento(b, idB, 'PAGAMENTO', '30.25');

    const kpi = await analytics.kpiFinancasImpl(tenantId);

    // À mão: A = 200 + 150,50 = 350,50; B = 0 + 80 − 30,25 = 49,75; total 400,25.
    expect(kpi.saldoCaixaAtual).toBe('400.25');
  });

  it('#397 saldoCaixaAtual: tenant sem sessões abertas ⇒ 0.00', async () => {
    const tenantId = await novoTenant('caixa-vazio', false);
    const kpi = await analytics.kpiFinancasImpl(tenantId);
    expect(kpi.saldoCaixaAtual).toBe('0.00');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // #398 — contas a pagar vencidas
  // ───────────────────────────────────────────────────────────────────────────

  async function novoFornecedor(tenantId: string): Promise<string> {
    seq += 1;
    const f = await db.fornecedor.create({
      data: {
        tenantId,
        codigo: `FOR-acp398-${sufixo}-${seq}`,
        nome: 'Fornecedor Credor',
        tipo: 'PESSOA_JURIDICA',
        nuit: '400000398',
        email: `for-acp398-${sufixo}-${seq}@test.mz`,
      },
    });
    return f.id;
  }

  async function conta(
    tenantId: string,
    fornecedorId: string,
    rotulo: string,
    status: 'ABERTA' | 'PARCIALMENTE_PAGA' | 'PAGA' | 'CANCELADA' | 'VENCIDA',
    dataVencimento: Date,
    valores: { original: number; pago?: number },
  ): Promise<void> {
    seq += 1;
    const pago = valores.pago ?? 0;
    await db.contaPagar.create({
      data: {
        tenantId,
        numero: `CP-398-${rotulo}-${sufixo}-${seq}`,
        fornecedorId,
        descricao: `analytics-caixa-cp-397-398 ${rotulo}`,
        valorOriginal: String(valores.original),
        valorPago: String(pago),
        valorRestante: String(valores.original - pago),
        dataEmissao: instanteMaputo(-40, 12, 0),
        dataVencimento,
        status,
      },
    });
  }

  it('#398 contasAPagarVencidas: conta PARCIALMENTE_PAGA, ABERTA e VENCIDA pelo dia de Maputo; hoje ainda no prazo ⇒ 3500 (hoje 2200)', async () => {
    const tenantId = await novoTenant('cp', false);
    const forn = await novoFornecedor(tenantId);
    const outro = await novoTenant('cp-outro', false);
    const fornOutro = await novoFornecedor(outro);

    await conta(tenantId, forn, 'aberta-ontem', 'ABERTA', instanteMaputo(-1, 12, 0), { original: 1000 });
    await conta(tenantId, forn, 'parcial-10d', 'PARCIALMENTE_PAGA', instanteMaputo(-10, 12, 0), {
      original: 3000,
      pago: 1000,
    });
    await conta(tenantId, forn, 'vencida', 'VENCIDA', instanteMaputo(-3, 12, 0), { original: 500 });
    // Vence HOJE às 00:30 de Maputo: o instante já passou às 23:00, mas o dia ainda é o do prazo.
    await conta(tenantId, forn, 'aberta-hoje-cedo', 'ABERTA', instanteMaputo(0, 0, 30), { original: 700 });
    await conta(tenantId, forn, 'paga', 'PAGA', instanteMaputo(-10, 12, 0), { original: 900, pago: 900 });
    await conta(tenantId, forn, 'cancelada', 'CANCELADA', instanteMaputo(-10, 12, 0), { original: 900 });
    await conta(tenantId, forn, 'futura', 'ABERTA', instanteMaputo(5, 12, 0), { original: 400 });
    await conta(outro, fornOutro, 'outro-tenant', 'ABERTA', instanteMaputo(-10, 12, 0), { original: 800 });

    // Hoje às 23:00 de Maputo (21:00Z) — só o Date é falseado.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteMaputo(0, 23, 0));
    const kpi = await analytics.kpiComprasImpl(tenantId);
    vi.useRealTimers();

    // À mão: ABERTA ontem 1000 + PARCIALMENTE_PAGA restante 2000 + VENCIDA 500 = 3500.
    // Fora: a que vence hoje (700, ainda no prazo), PAGA, CANCELADA, futura, outro tenant.
    // Hoje: 1000 + 500 + 700 = 2200 (perde a parcial, apanha a de hoje pelo instante).
    expect(kpi.contasAPagarVencidas).toBe('3500.00');
  });

  it('#398 contasAPagarVencidas: às 00:30 de Maputo (ainda ontem em UTC) a conta que venceu ontem já conta', async () => {
    const tenantId = await novoTenant('cp-fronteira', false);
    const forn = await novoFornecedor(tenantId);
    // Venceu ontem às 23:59 de Maputo; "agora" é hoje 00:30 de Maputo (22:30Z de ontem).
    await conta(tenantId, forn, 'parcial-ontem-noite', 'PARCIALMENTE_PAGA', instanteMaputo(-1, 23, 59), {
      original: 1200,
      pago: 200,
    });
    // Vence hoje ao meio-dia: ainda no prazo.
    await conta(tenantId, forn, 'aberta-hoje', 'ABERTA', instanteMaputo(0, 12, 0), { original: 300 });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instanteMaputo(0, 0, 30));
    const kpi = await analytics.kpiComprasImpl(tenantId);
    vi.useRealTimers();

    // À mão: só a parcial, restante 1200 − 200 = 1000.
    expect(kpi.contasAPagarVencidas).toBe('1000.00');
  });
});
