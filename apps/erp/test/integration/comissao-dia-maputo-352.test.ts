/**
 * Oráculo #352 — a regra de comissão POR_PERIODO vale o último dia INTEIRO de Maputo, ponta a
 * ponta: schema → `comissaoService.criarRegra` (grava na base) → `calcularComissao` (lê da base).
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (decisão do orquestrador):
 *   - Create/UpdateRegraComissaoSchema lêem `aaaa-mm-dd` como dia civil de Maputo
 *     (dataInicio 00:00 · dataFim 23:59:59,999, +02:00); o que se grava é esse instante.
 *   - O predicado de vigência compara dias civis de Maputo — cobre também as regras já gravadas
 *     à meia-noite UTC, sem migração.
 *   - Relógio fixo 2026-06-30T10:00Z (12h00 de Maputo) com dataFim '2026-06-30' → regra vigente.
 *
 * Só o `Date` é dobrado (`toFake: ['Date']`): timers e I/O do driver continuam reais.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#352 comissão POR_PERIODO no dia civil de Maputo — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comissaoService: any;
  let CreateRegraComissaoSchema: (typeof import('@/lib/validations/vendas'))['CreateRegraComissaoSchema'];
  let UpdateRegraComissaoSchema: (typeof import('@/lib/validations/vendas'))['UpdateRegraComissaoSchema'];

  const sufixo = Date.now();
  // Um tenant por caso: cada um isola as suas regras (calcularComissao lê todas as activas do tenant).
  let seq = 0;
  const novoCtx = () => ({ tenantId: `tenant-comissao-352-${sufixo}-${++seq}`, userId: `ccomissao352${sufixo}` });
  const VENDEDOR = `cvend352${sufixo}`;
  const tenants: string[] = [];

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comissaoService } = await import('@/server/services/comercial/comissao.service'));
    ({ CreateRegraComissaoSchema, UpdateRegraComissaoSchema } = await import('@/lib/validations/vendas'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (db && tenants.length) await db.regraComissao.deleteMany({ where: { tenantId: { in: tenants } } });
  });

  async function criarPeloSchema(ctx: { tenantId: string; userId: string }, dataInicio: string, dataFim: string) {
    tenants.push(ctx.tenantId);
    const input = CreateRegraComissaoSchema.parse({
      nome: 'Campanha de Junho',
      tipo: 'POR_PERIODO',
      percentualBase: 12,
      descricao: 'Regra de período (#352)',
      dataInicio,
      dataFim,
    });
    return runCtx(ctx, () => comissaoService.criarRegra(input, ctx));
  }

  async function calcularAs(relogio: string, ctx: { tenantId: string; userId: string }) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(relogio));
    try {
      return await runCtx(ctx, () => comissaoService.calcularComissao(VENDEDOR, 'venda-352', '1000', undefined, ctx));
    } finally {
      vi.useRealTimers();
    }
  }

  const vigente = (res: any) =>
    res.regrasAplicadas.includes('Campanha de Junho') &&
    new Prisma.Decimal(res.percentualAplicado).equals(12) &&
    new Prisma.Decimal(res.valorComissao).equals(120);

  it("regra criada com dataFim '2026-06-30' grava 2026-06-30T21:59:59.999Z e dataInicio '2026-06-01' grava 2026-05-31T22:00Z", async () => {
    const ctx = novoCtx();
    const regra = await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    const gravada = await db.regraComissao.findFirst({ where: { id: regra.id, tenantId: ctx.tenantId } });
    expect(gravada.dataFim.toISOString()).toBe('2026-06-30T21:59:59.999Z');
    expect(gravada.dataInicio.toISOString()).toBe('2026-05-31T22:00:00.000Z');
  });

  it('relógio 2026-06-30T10:00Z (12h00 de Maputo do último dia) → regra criada pelo schema está vigente', async () => {
    const ctx = novoCtx();
    await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    expect(vigente(await calcularAs('2026-06-30T10:00:00.000Z', ctx))).toBe(true);
  });

  it('relógio 2026-06-30T21:30Z (23h30 de Maputo do último dia) → ainda vigente', async () => {
    const ctx = novoCtx();
    await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    expect(vigente(await calcularAs('2026-06-30T21:30:00.000Z', ctx))).toBe(true);
  });

  it('relógio 2026-06-30T22:30Z (00h30 de Maputo de 01/07) → já não vigente', async () => {
    const ctx = novoCtx();
    await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    const res = await calcularAs('2026-06-30T22:30:00.000Z', ctx);
    expect(res.regrasAplicadas).not.toContain('Campanha de Junho');
    expect(new Prisma.Decimal(res.percentualAplicado).equals(5)).toBe(true);
  });

  it('relógio 2026-05-31T22:30Z (00h30 de Maputo do primeiro dia) → vigente; 21:30Z (23h30 da véspera) → não', async () => {
    const ctx = novoCtx();
    await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    expect(vigente(await calcularAs('2026-05-31T22:30:00.000Z', ctx))).toBe(true);
    const vespera = await calcularAs('2026-05-31T21:30:00.000Z', ctx);
    expect(vespera.regrasAplicadas).not.toContain('Campanha de Junho');
  });

  it('regra JÁ GRAVADA à meia-noite UTC (schema antigo, sem migração) vale o último dia inteiro de Maputo', async () => {
    const ctx = novoCtx();
    tenants.push(ctx.tenantId);
    await db.regraComissao.create({
      data: {
        tenantId: ctx.tenantId,
        nome: 'Campanha de Junho',
        tipo: 'POR_PERIODO',
        percentualBase: new Prisma.Decimal(12),
        dataInicio: new Date('2026-06-01T00:00:00.000Z'),
        dataFim: new Date('2026-06-30T00:00:00.000Z'),
        prioridade: 1,
        descricao: 'Regra legada (#352)',
        ativa: true,
      },
    });
    expect(vigente(await calcularAs('2026-06-30T10:00:00.000Z', ctx))).toBe(true);
    expect(vigente(await calcularAs('2026-06-30T21:30:00.000Z', ctx))).toBe(true);
    expect(vigente(await calcularAs('2026-05-31T22:30:00.000Z', ctx))).toBe(true);
    expect((await calcularAs('2026-06-30T22:30:00.000Z', ctx)).regrasAplicadas).not.toContain('Campanha de Junho');
  });

  it("actualizar dataFim para '2026-07-15' grava 2026-07-15T21:59:59.999Z e a regra vale às 12h00 de Maputo desse dia", async () => {
    const ctx = novoCtx();
    const regra = await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    const input = UpdateRegraComissaoSchema.parse({ dataFim: '2026-07-15' });
    await runCtx(ctx, () => comissaoService.atualizarRegra(regra.id, input, ctx));
    const gravada = await db.regraComissao.findFirst({ where: { id: regra.id, tenantId: ctx.tenantId } });
    expect(gravada.dataFim.toISOString()).toBe('2026-07-15T21:59:59.999Z');
    expect(vigente(await calcularAs('2026-07-15T10:00:00.000Z', ctx))).toBe(true);
  });

  it('actualizar com dataFim null limpa a data (null não cai no preprocess)', async () => {
    const ctx = novoCtx();
    const regra = await criarPeloSchema(ctx, '2026-06-01', '2026-06-30');
    const input = UpdateRegraComissaoSchema.parse({ dataFim: null });
    await runCtx(ctx, () => comissaoService.atualizarRegra(regra.id, input, ctx));
    const gravada = await db.regraComissao.findFirst({ where: { id: regra.id, tenantId: ctx.tenantId } });
    expect(gravada.dataFim).toBeNull();
  });
});
