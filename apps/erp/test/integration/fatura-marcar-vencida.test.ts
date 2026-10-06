/**
 * Oráculo P3 (fatura-pdf-pagamento) — marcar factura como vencida.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (RUN.md «Decisões»):
 *   V1 `marcarVencida` recusa com BusinessRuleError `FATURA_NAO_VENCIDA` enquanto o dia
 *      civil de Maputo de AGORA for ≤ o dia de Maputo de `dataVencimento` — só vence a
 *      partir do dia seguinte ao vencimento. A recusa não escreve nada.
 *   V2 fora disso, inalterado: EMITIDA/PARCIALMENTE_PAGA → VENCIDA; outros estados →
 *      `TRANSICAO_INVALIDA`; outro tenant → NotFoundError.
 *
 * Determinismo: as facturas são emitidas HOJE (com o relógio real — séries, períodos e
 * lançamentos do ano corrente) e vencem num dia D futuro, ao meio-dia de Maputo. Só a
 * chamada a `marcarVencida` corre com o `Date` falseado (`vi.useFakeTimers({ toFake:
 * ['Date'] })`): D 23:59 de Maputo (21:59Z) ainda é o dia do vencimento; D+1 00:01 de
 * Maputo (22:01Z de D) já é o dia seguinte — embora em UTC ainda seja D, o que denuncia
 * uma comparação por dia UTC.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

function hojeEmMaputo(): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' })
    .format(new Date())
    .split('-')
    .map(Number);
  return { ano, mes, dia };
}

/** Instante `hh:mm` de Maputo (UTC+2, sem hora de Verão) no dia de hoje deslocado `deslocDias`. */
function instanteMaputo(deslocDias: number, hh: number, mm: number): Date {
  const h = hojeEmMaputo();
  return new Date(Date.UTC(h.ano, h.mes - 1, h.dia + deslocDias, hh - 2, mm));
}

const DIAS_ATE_VENCER = 5;
const VENCIMENTO = () => instanteMaputo(DIAS_ATE_VENCER, 12, 0);
const ULTIMO_MINUTO_DO_VENCIMENTO = () => instanteMaputo(DIAS_ATE_VENCER, 23, 59);
const PRIMEIRO_MINUTO_SEGUINTE = () => instanteMaputo(DIAS_ATE_VENCER + 1, 0, 1);

describe.skipIf(skip)('marcarVencida — só a partir do dia seguinte ao vencimento (Maputo) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any; // '@/server/services/financas/faturacao.service'
  let val: typeof import('@/lib/validations/faturacao');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-fat-venc-${sufixo}`;
  const TENANT_B = `tenant-fat-venc-b-${sufixo}`;
  const USER = `user-fat-venc-${sufixo}`;
  const ctx = {
    tenantId: TENANT,
    userId: USER,
    permissions: new Set(['faturacao:fatura:gerir', 'faturacao:fatura:pagar', 'financas:banca:escrita']),
  };
  const ctxB = { tenantId: TENANT_B, userId: USER, permissions: ctx.permissions };
  let clienteId: string;
  let contaBancariaId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function emitirFatura(): Promise<string> {
    const input = val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: new Date(),
      dataVencimento: VENCIMENTO(),
      linhas: [{ descricao: 'Serviço', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const f: any = await runCtx(ctx, () => fat.emitirFatura(input, ctx));
    return f.id;
  }

  async function pagar(faturaId: string, valor: number) {
    // Contrato P2 (meio obrigatório); contra o contrato antigo os campos a mais são ignorados.
    return runCtx(ctx, () =>
      fat.registarPagamento(
        {
          faturaId,
          valor,
          dataPagamento: new Date(),
          formaPagamento: 'TRANSFERENCIA_BANCARIA',
          contaBancariaId,
        },
        ctx,
      ),
    );
  }

  /** Corre `marcarVencida` com o relógio de parede em `agora` (só o Date é falseado). */
  async function marcarEm(agora: Date | null, faturaId: string, c: typeof ctx | typeof ctxB = ctx) {
    if (agora) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(agora);
    }
    try {
      return await runCtx(c, () => fat.marcarVencida(faturaId, c));
    } finally {
      vi.useRealTimers();
    }
  }

  async function estado(faturaId: string): Promise<string> {
    return (await db.fatura.findFirst({ where: { id: faturaId } })).status;
  }

  async function esperarRecusa(agora: Date | null, faturaId: string, codigo: string) {
    const antes = await db.fatura.findFirst({ where: { id: faturaId } });
    const e = await capturarErro(() => marcarEm(agora, faturaId));
    expect(e, `esperava-se ${codigo} e a factura foi marcada vencida`).toBeInstanceOf(BusinessRuleError);
    expect(e.code, String(e?.message)).toBe(codigo);
    const depois = await db.fatura.findFirst({ where: { id: faturaId } });
    expect(depois.status).toBe(antes.status);
    expect(String(depois.totalPago)).toBe(String(antes.totalPago));
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    ({ BusinessRuleError, NotFoundError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `fat-venc-${sufixo}`, `${sufixo + 7}`.slice(-9)],
      [TENANT_B, `fat-venc-b-${sufixo}`, `${sufixo + 8}`.slice(-9)],
    ]) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Gestor', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Devedor',
        tipo: 'JURIDICA',
        nuit: '400000003',
        email: `cliente-venc-${sufixo}@test.mz`,
        telefone: '840000002',
        codigo: `CLI-VENC-${sufixo}`,
      },
    });
    clienteId = cliente.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const conta = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco Vencidas',
        agencia: '0001',
        numeroConta: `VENC-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaBancariaId = conta.id;
  });

  // -------------------------------------------------------------------------
  // V1 — ainda não vencida
  // -------------------------------------------------------------------------

  it('V1: antes do vencimento (agora real, vencimento daqui a 5 dias) → FATURA_NAO_VENCIDA, continua EMITIDA', async () => {
    const id = await emitirFatura();
    await esperarRecusa(null, id, 'FATURA_NAO_VENCIDA');
    expect(await estado(id)).toBe('EMITIDA');
  });

  it('V1: no próprio dia do vencimento, às 23:59 de Maputo → FATURA_NAO_VENCIDA', async () => {
    const id = await emitirFatura();
    await esperarRecusa(ULTIMO_MINUTO_DO_VENCIMENTO(), id, 'FATURA_NAO_VENCIDA');
    expect(await estado(id)).toBe('EMITIDA');
  });

  it('V1: PARCIALMENTE_PAGA ainda não vencida → FATURA_NAO_VENCIDA, mantém o estado', async () => {
    const id = await emitirFatura();
    await pagar(id, 100);
    expect(await estado(id)).toBe('PARCIALMENTE_PAGA');
    await esperarRecusa(ULTIMO_MINUTO_DO_VENCIMENTO(), id, 'FATURA_NAO_VENCIDA');
    expect(await estado(id)).toBe('PARCIALMENTE_PAGA');
  });

  // -------------------------------------------------------------------------
  // V2 — a partir do dia seguinte
  // -------------------------------------------------------------------------

  it('V2: EMITIDA no dia seguinte ao vencimento, às 00:01 de Maputo (ainda o dia D em UTC) → VENCIDA', async () => {
    const id = await emitirFatura();
    const r: any = await marcarEm(PRIMEIRO_MINUTO_SEGUINTE(), id);
    expect(r?.status).toBe('VENCIDA');
    expect(await estado(id)).toBe('VENCIDA');
  });

  it('V2: PARCIALMENTE_PAGA vencida → VENCIDA, totalPago intacto', async () => {
    const id = await emitirFatura();
    await pagar(id, 100);
    await marcarEm(PRIMEIRO_MINUTO_SEGUINTE(), id);
    const f = await db.fatura.findFirst({ where: { id } });
    expect(f.status).toBe('VENCIDA');
    expect(Number(String(f.totalPago))).toBeCloseTo(100, 2);
  });

  it('V2: PAGA com o vencimento já passado → TRANSICAO_INVALIDA (não FATURA_NAO_VENCIDA), continua PAGA', async () => {
    const id = await emitirFatura();
    await pagar(id, 1160);
    expect(await estado(id)).toBe('PAGA');
    await esperarRecusa(PRIMEIRO_MINUTO_SEGUINTE(), id, 'TRANSICAO_INVALIDA');
    expect(await estado(id)).toBe('PAGA');
  });

  it('V2: já VENCIDA → TRANSICAO_INVALIDA', async () => {
    const id = await emitirFatura();
    await marcarEm(PRIMEIRO_MINUTO_SEGUINTE(), id);
    await esperarRecusa(PRIMEIRO_MINUTO_SEGUINTE(), id, 'TRANSICAO_INVALIDA');
  });

  it('V2: factura de outro tenant → NotFoundError, factura intacta', async () => {
    const id = await emitirFatura();
    const e = await capturarErro(() => marcarEm(PRIMEIRO_MINUTO_SEGUINTE(), id, ctxB));
    expect(e).toBeInstanceOf(NotFoundError);
    expect(await estado(id)).toBe('EMITIDA');
  });
});
