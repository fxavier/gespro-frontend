/**
 * Oráculo #158 — tabelas INSS e escalões IRPS por vigência (skill fiscalidade-mz)
 *
 * O ecrã /rh/payroll/tabelas já existe (10449f7, oráculos e2e/26-payroll-tabelas.spec.ts e
 * src/lib/__tests__/payroll-vigencia.test.ts). O que falta do contrato é o travão do SERVIÇO:
 *
 *   (D) A data de início de uma nova vigência é o mês CORRENTE ou um mês FUTURO (mês civil de
 *       Africa/Maputo). Uma vigência retroactiva reescreve a tabela que um mês já passado usa —
 *       recusada com `VIGENCIA_INVALIDA`, mesmo quando é posterior à vigência actual.
 *   (F) Uma vigência já usada por folhas processadas não se edita. Criar uma vigência nova fecha
 *       a anterior em `inicio − 1 ms`: se houver uma folha `PROCESSADO`/`PAGO` em (ano, mês) ≥ ao
 *       mês de início, essa folha passava a ter sido calculada com uma tabela que já não é a sua.
 *       Recusada com `VIGENCIA_USADA_POR_FOLHA`. Folhas `PENDENTE`/`CANCELADO`, folhas de meses
 *       anteriores ao início e folhas de outro tenant não bloqueiam.
 *   (A) Recusa é atómica: nenhuma linha nova, e a vigência actual continua aberta (`vigenciaFim` NULL).
 *
 * Decisão conservadora do verificador (o contrato não a fixava): «corrente» é o MÊS civil de
 * Maputo — o formulário só produz o dia 1 de um mês (`inicioDeVigencia`), e é esse dia 1 (UTC) que
 * `dataReferencia(ano, mes)` usa para resolver o mês.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

type Tabela = 'INSS' | 'IRPS';

/** (ano, mes 1-12) do mês civil corrente em Africa/Maputo. */
function mesCorrenteMaputo(): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Maputo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const ano = Number(partes.find((p) => p.type === 'year')!.value);
  const mes = Number(partes.find((p) => p.type === 'month')!.value);
  return { ano, mes };
}

/** Desloca (ano, mes) por `delta` meses. */
function deslocar(base: { ano: number; mes: number }, delta: number): { ano: number; mes: number } {
  const d = new Date(Date.UTC(base.ano, base.mes - 1 + delta, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

/** Dia 1 do mês, meia-noite UTC — o que `inicioDeVigencia` + `z.coerce.date` produzem. */
const inicio = (m: { ano: number; mes: number }) => new Date(Date.UTC(m.ano, m.mes - 1, 1));

const CORRENTE = mesCorrenteMaputo();
const ANTERIOR = deslocar(CORRENTE, -1);
const SEGUINTE = deslocar(CORRENTE, 1);
const DAQUI_A_2 = deslocar(CORRENTE, 2);

describe.skipIf(skip)('#158 — nova vigência INSS/IRPS: só corrente/futura e nunca sobre folhas processadas', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // PayrollService

  const sufixo = Date.now();
  let seq = 0;

  /** Tenant isolado com a vigência de base INSS (2018) e IRPS (2024) abertas, como o seed. */
  async function novoTenant(): Promise<{ tenantId: string; userId: string }> {
    const n = seq++;
    const tenantId = `tenant-pay-tab-${n}-${sufixo}`;
    const userId = `user-pay-tab-${n}-${sufixo}`;
    await db.tenant.create({
      data: {
        id: tenantId,
        nome: `Tenant payroll tabelas ${n}`,
        slug: `pay-tab-${n}-${sufixo}`,
        nuit: `${sufixo + n}`.slice(-9),
      },
    });
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `pay-tab-${n}-${sufixo}@test.mz`,
        nome: 'Administrador payroll',
        keycloakSub: `kc-pay-tab-${n}-${sufixo}`,
      },
    });
    await db.tabelaINSS.create({
      data: {
        tenantId,
        vigenciaInicio: new Date(Date.UTC(2018, 0, 1)),
        taxaTrabalhador: '0.03',
        taxaEntidade: '0.04',
        tetoIncidencia: null,
      },
    });
    await db.escalaoIRPS.create({
      data: {
        tenantId,
        vigenciaInicio: new Date(Date.UTC(2024, 0, 1)),
        ordem: 1,
        limiteInferior: '0',
        limiteSuperior: null,
        taxa: '0.10',
        parcelaAbater: '0',
        numeroDependentes: 0,
      },
    });
    return { tenantId, userId };
  }

  async function folha(tenantId: string, m: { ano: number; mes: number }, status: string) {
    await db.folhaPagamento.create({
      data: { tenantId, anoReferencia: m.ano, mesReferencia: m.mes, status },
    });
  }

  function criar(tabela: Tabela, ctx: { tenantId: string; userId: string }, vigenciaInicio: Date) {
    return runCtx(ctx, () =>
      tabela === 'INSS'
        ? svc.criarTabelaINSS(
            { vigenciaInicio, taxaTrabalhador: 0.035, taxaEntidade: 0.045, descricao: 'Oráculo #158' },
            ctx,
          )
        : svc.criarEscaloesIRPS(
            {
              vigenciaInicio,
              descricao: 'Oráculo #158',
              escaloes: [
                { ordem: 1, limiteInferior: 0, limiteSuperior: 20000, taxa: 0, parcelaAbater: 0, numeroDependentes: 0 },
                { ordem: 2, limiteInferior: 20000, limiteSuperior: null, taxa: 0.1, parcelaAbater: 2000, numeroDependentes: 0 },
              ],
            },
            ctx,
          ),
    );
  }

  /** Linhas da tabela no tenant, por início ascendente. */
  async function linhas(tabela: Tabela, tenantId: string): Promise<any[]> {
    const model = tabela === 'INSS' ? db.tabelaINSS : db.escalaoIRPS;
    return model.findMany({ where: { tenantId }, orderBy: [{ vigenciaInicio: 'asc' }] });
  }

  /** (A) nada mudou: só a linha de base, ainda aberta. */
  async function intacta(tabela: Tabela, tenantId: string) {
    const ls = await linhas(tabela, tenantId);
    expect(ls, `${tabela}: nenhuma linha nova depois da recusa`).toHaveLength(1);
    expect(ls[0].vigenciaFim, `${tabela}: a vigência actual continua aberta`).toBeNull();
  }

  /** A nova vigência foi criada e a anterior fechada em início − 1 ms. */
  async function aceite(tabela: Tabela, tenantId: string, vigenciaInicio: Date) {
    const ls = await linhas(tabela, tenantId);
    const novas = ls.filter((l) => l.vigenciaInicio.getTime() === vigenciaInicio.getTime());
    expect(novas.length, `${tabela}: a nova vigência existe`).toBeGreaterThan(0);
    for (const l of novas) expect(l.vigenciaFim).toBeNull();
    const base = ls.filter((l) => l.vigenciaInicio.getTime() !== vigenciaInicio.getTime());
    expect(base.length).toBeGreaterThan(0);
    for (const l of base) {
      expect(l.vigenciaFim?.getTime(), `${tabela}: a anterior fecha em início − 1 ms`).toBe(
        vigenciaInicio.getTime() - 1,
      );
    }
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));
  });

  // -------------------------------------------------------------------------
  // (D) data de início: mês corrente ou futuro
  // -------------------------------------------------------------------------

  it.each<Tabela>(['INSS', 'IRPS'])(
    '%s: vigência a começar no mês ANTERIOR ao corrente (mas depois da actual) é recusada — VIGENCIA_INVALIDA',
    async (tabela) => {
      const ctx = await novoTenant();
      await expect(criar(tabela, ctx, inicio(ANTERIOR))).rejects.toMatchObject({ code: 'VIGENCIA_INVALIDA' });
      await intacta(tabela, ctx.tenantId);
    },
  );

  it.each<Tabela>(['INSS', 'IRPS'])(
    '%s: vigência retroactiva de há mais de um ano (posterior à actual) é recusada — VIGENCIA_INVALIDA',
    async (tabela) => {
      const ctx = await novoTenant();
      const passado = { ano: 2025, mes: 1 };
      await expect(criar(tabela, ctx, inicio(passado))).rejects.toMatchObject({ code: 'VIGENCIA_INVALIDA' });
      await intacta(tabela, ctx.tenantId);
    },
  );

  it.each<Tabela>(['INSS', 'IRPS'])('%s: vigência no mês CORRENTE, sem folhas, é aceite', async (tabela) => {
    const ctx = await novoTenant();
    await criar(tabela, ctx, inicio(CORRENTE));
    await aceite(tabela, ctx.tenantId, inicio(CORRENTE));
  });

  it.each<Tabela>(['INSS', 'IRPS'])('%s: vigência num mês FUTURO, sem folhas, é aceite', async (tabela) => {
    const ctx = await novoTenant();
    await criar(tabela, ctx, inicio(DAQUI_A_2));
    await aceite(tabela, ctx.tenantId, inicio(DAQUI_A_2));
  });

  // -------------------------------------------------------------------------
  // (F) nunca sobre uma vigência já usada por folhas processadas
  // -------------------------------------------------------------------------

  it.each<[Tabela, string]>([
    ['INSS', 'PROCESSADO'],
    ['INSS', 'PAGO'],
    ['IRPS', 'PROCESSADO'],
    ['IRPS', 'PAGO'],
  ])(
    '%s: folha %s no mês corrente impede vigência a começar no mês corrente — VIGENCIA_USADA_POR_FOLHA',
    async (tabela, status) => {
      const ctx = await novoTenant();
      await folha(ctx.tenantId, CORRENTE, status);
      await expect(criar(tabela, ctx, inicio(CORRENTE))).rejects.toMatchObject({
        code: 'VIGENCIA_USADA_POR_FOLHA',
      });
      await intacta(tabela, ctx.tenantId);
    },
  );

  it.each<Tabela>(['INSS', 'IRPS'])(
    '%s: folha PROCESSADO num mês FUTURO impede vigência que a cubra (corrente e no próprio mês)',
    async (tabela) => {
      const ctx = await novoTenant();
      await folha(ctx.tenantId, SEGUINTE, 'PROCESSADO');
      await expect(criar(tabela, ctx, inicio(CORRENTE))).rejects.toMatchObject({
        code: 'VIGENCIA_USADA_POR_FOLHA',
      });
      await expect(criar(tabela, ctx, inicio(SEGUINTE))).rejects.toMatchObject({
        code: 'VIGENCIA_USADA_POR_FOLHA',
      });
      await intacta(tabela, ctx.tenantId);
    },
  );

  it.each<Tabela>(['INSS', 'IRPS'])(
    '%s: folha PROCESSADO num mês anterior ao início não bloqueia (a vigência dela não muda)',
    async (tabela) => {
      const ctx = await novoTenant();
      await folha(ctx.tenantId, ANTERIOR, 'PROCESSADO');
      await folha(ctx.tenantId, CORRENTE, 'PAGO');
      await criar(tabela, ctx, inicio(SEGUINTE));
      await aceite(tabela, ctx.tenantId, inicio(SEGUINTE));
    },
  );

  it.each<[Tabela, string]>([
    ['INSS', 'PENDENTE'],
    ['INSS', 'CANCELADO'],
    ['IRPS', 'PENDENTE'],
    ['IRPS', 'CANCELADO'],
  ])('%s: folha %s no mês corrente não bloqueia (não foi processada)', async (tabela, status) => {
    const ctx = await novoTenant();
    await folha(ctx.tenantId, CORRENTE, status);
    await criar(tabela, ctx, inicio(CORRENTE));
    await aceite(tabela, ctx.tenantId, inicio(CORRENTE));
  });

  it.each<Tabela>(['INSS', 'IRPS'])('%s: folha processada de OUTRO tenant não bloqueia', async (tabela) => {
    const ctx = await novoTenant();
    const outro = await novoTenant();
    await folha(outro.tenantId, CORRENTE, 'PROCESSADO');
    await criar(tabela, ctx, inicio(CORRENTE));
    await aceite(tabela, ctx.tenantId, inicio(CORRENTE));
    await intacta(tabela, outro.tenantId);
  });

  // -------------------------------------------------------------------------
  // Regra pré-existente mantém-se: não começar antes/no início da actual
  // -------------------------------------------------------------------------

  it.each<Tabela>(['INSS', 'IRPS'])(
    '%s: nova vigência no mesmo início de uma vigência futura já aberta é recusada — VIGENCIA_INVALIDA',
    async (tabela) => {
      const ctx = await novoTenant();
      await criar(tabela, ctx, inicio(DAQUI_A_2));
      await expect(criar(tabela, ctx, inicio(DAQUI_A_2))).rejects.toMatchObject({ code: 'VIGENCIA_INVALIDA' });
      await expect(criar(tabela, ctx, inicio(SEGUINTE))).rejects.toMatchObject({ code: 'VIGENCIA_INVALIDA' });
    },
  );
});
