/**
 * Teste de integração — Período 13 (encerramento) não é um período de IVA (#138)
 *
 * ADR-0035 §2: o período 13 (`ordem = 13`, `dataInicio = dataFim` = último instante
 * do ano em Maputo) só recebe os lançamentos de encerramento; não tem operações.
 * ADR-0035 §7: o apuramento do IVA é pré-condição dos **doze** períodos mensais.
 *
 * Defeito: `fecharPeriodo` aplica ao período 13 as mesmas pré-condições de um mês —
 * exige `IVA_NAO_APURADO`, e as janelas por datas (reconciliação, sessão de caixa)
 * apanham o que pertence a Dezembro, porque o instante do período 13 cai dentro do
 * período 12. E `apurarIva` aceita o período 13.
 *
 * Cada caso monta o seu próprio tenant: as pré-condições de datas de `fecharPeriodo`
 * contam reconciliações e sessões do tenant inteiro, e um caso não pode contaminar
 * o seguinte.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

type AnyDb = any;

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

/** Início do mês `mes` de 2026 em Maputo (UTC+2), como instante UTC. */
const inicioMes = (mes: number) => new Date(Date.UTC(2026, mes - 1, 1) - 2 * 3600_000);
/** Último milissegundo do mês `mes` de 2026 em Maputo. */
const fimMes = (mes: number) => new Date(Date.UTC(2026, mes, 1) - 2 * 3600_000 - 1);
/** Instante do período 13: dataInicio = dataFim = fim do ano (ADR-0033 §2). */
const FIM_ANO = fimMes(12);

describe.skipIf(skip)('Período 13 — encerramento sem IVA nem operações (#138)', () => {
  let db: AnyDb;
  const TS = Date.now();
  const tenants: string[] = [];
  let seq = 0;

  interface Cenario {
    ctx: { tenantId: string; userId: string };
    periodos: Record<number, { id: string }>;
  }

  /**
   * Tenant novo com um exercício 2026 e os 13 períodos (o 13.º com o mesmo
   * instante em dataInicio e dataFim, como o `tenant-bootstrap` os cria).
   *
   * `fechados` lista as ordens que ficam FECHADO. O estado é escrito directamente
   * pelo client cru: `fecharPeriodo` exige pré-condições (IVA de cada mês, etc.)
   * alheias a este defeito — o que está em teste é só o fecho do período 13.
   */
  async function cenario(fechados: number[]): Promise<Cenario> {
    seq += 1;
    const tenantId = `tenant-p13-${TS}-${seq}`;
    const userId = `user-p13-${TS}-${seq}`;
    tenants.push(tenantId);

    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant P13 ${seq}`, slug: `p13-${TS}-${seq}`, nuit: `4001381${String(seq).padStart(2, '0')}` },
    });
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `p13-${TS}-${seq}@test.mz`,
        nome: 'Utilizador P13',
        keycloakSub: `kc-p13-${TS}-${seq}`,
      },
    });
    const exercicio = await db.exercicioContabil.create({
      data: {
        tenantId,
        codigo: '2026',
        dataInicio: inicioMes(1),
        dataFim: FIM_ANO,
        estado: 'ABERTO',
      },
    });

    const periodos: Record<number, { id: string }> = {};
    for (let ordem = 1; ordem <= 13; ordem++) {
      const fechado = fechados.includes(ordem);
      periodos[ordem] = await db.periodoContabil.create({
        data: {
          tenantId,
          exercicioId: exercicio.id,
          ordem,
          codigo: `2026-${String(ordem).padStart(2, '0')}`,
          dataInicio: ordem === 13 ? FIM_ANO : inicioMes(ordem),
          dataFim: ordem === 13 ? FIM_ANO : fimMes(ordem),
          estado: fechado ? 'FECHADO' : 'ABERTO',
          ...(fechado ? { fechadoEm: new Date(), fechadoPorId: userId } : {}),
        },
        select: { id: true },
      });
    }
    return { ctx: { tenantId, userId }, periodos };
  }

  const DOZE_MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: process.env.INTEGRATION_DB_URL! });
    db = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      const where = { tenantId: { in: tenants } };
      await db.linhaApuramentoIva.deleteMany({ where });
      await db.apuramentoIva.deleteMany({ where });
      await db.periodoReconciliacao.deleteMany({ where });
      await db.contaBancaria.deleteMany({ where });
      await db.sessaoCaixa.deleteMany({ where });
      await db.periodoContabil.deleteMany({ where });
      await db.exercicioContabil.deleteMany({ where });
      await db.contaPGC.deleteMany({ where });
      await db.user.deleteMany({ where });
      await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    } finally {
      await db.$disconnect();
    }
  });

  it('fecha o período 13 sem apuramento do IVA quando os doze meses estão fechados', async () => {
    const { ctx, periodos } = await cenario(DOZE_MESES);

    const { fecharPeriodo } = await import('@/server/services/financas/contabilidade.service');
    const resultado = await fecharPeriodo({ id: periodos[13].id }, ctx);

    expect('impedimentos' in resultado ? resultado.impedimentos : []).toEqual([]);
    expect(resultado.ok).toBe(true);
    const p13 = await db.periodoContabil.findFirst({ where: { id: periodos[13].id } });
    expect(p13.estado).toBe('FECHADO');
  });

  it('fecha o período 13 com uma reconciliação bancária em curso de 15 Dez a 15 Jan', async () => {
    const { ctx, periodos } = await cenario(DOZE_MESES);

    const conta = await db.contaPGC.create({
      data: {
        tenantId: ctx.tenantId,
        codigo: '12-P13',
        nome: 'Depósitos à ordem P13',
        nivel: 2,
        classe: 'CLASSE_1',
        natureza: 'DEVEDORA',
        tipo: 'ATIVO',
        aceitaLancamento: true,
        ativo: true,
      },
    });
    const contaBancaria = await db.contaBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        banco: 'Banco P13',
        agencia: '0001',
        numeroConta: `P13-${TS}`,
        tipoConta: 'CORRENTE',
        contaContabilId: conta.id,
      },
    });
    // A reconciliação atravessa o fim do ano: o que reconcilia pertence a Dezembro
    // (período 12, já fechado) e a Janeiro do exercício seguinte — nada ao período 13.
    await db.periodoReconciliacao.create({
      data: {
        tenantId: ctx.tenantId,
        contaBancariaId: contaBancaria.id,
        dataInicio: new Date('2026-12-14T22:00:00Z'),
        dataFim: new Date('2027-01-15T21:59:59.999Z'),
        estado: 'EM_RECONCILIACAO',
        saldoInicialBanco: new Prisma.Decimal('0'),
        saldoFinalBanco: new Prisma.Decimal('0'),
        saldoInicialContabil: new Prisma.Decimal('0'),
        saldoFinalContabil: new Prisma.Decimal('0'),
        responsavelId: ctx.userId,
      },
    });

    const { fecharPeriodo } = await import('@/server/services/financas/contabilidade.service');
    const resultado = await fecharPeriodo({ id: periodos[13].id }, ctx);

    expect('impedimentos' in resultado ? resultado.impedimentos : []).toEqual([]);
    expect(resultado.ok).toBe(true);
    const p13 = await db.periodoContabil.findFirst({ where: { id: periodos[13].id } });
    expect(p13.estado).toBe('FECHADO');
  });

  it('fecha o período 13 com uma sessão de caixa aberta no último instante de 31 Dez', async () => {
    const { ctx, periodos } = await cenario(DOZE_MESES);

    // Aberta às 23:59:59.999 de 31 Dez em Maputo — o mesmo instante que delimita o
    // período 13. A sessão é uma operação de Dezembro (período 12, já fechado).
    await db.sessaoCaixa.create({
      data: {
        tenantId: ctx.tenantId,
        responsavelId: ctx.userId,
        numero: `SC-P13-${TS}`,
        dataAbertura: FIM_ANO,
        fundoInicial: new Prisma.Decimal('0'),
        status: 'ABERTA',
      },
    });

    const { fecharPeriodo } = await import('@/server/services/financas/contabilidade.service');
    const resultado = await fecharPeriodo({ id: periodos[13].id }, ctx);

    expect('impedimentos' in resultado ? resultado.impedimentos : []).toEqual([]);
    expect(resultado.ok).toBe(true);
    const p13 = await db.periodoContabil.findFirst({ where: { id: periodos[13].id } });
    expect(p13.estado).toBe('FECHADO');
  });

  it('recusa apurar o IVA do período 13 e não grava apuramento', async () => {
    const { ctx, periodos } = await cenario(DOZE_MESES);

    const { apurarIva } = await import('@/server/services/financas/apuramento-iva.service');
    await expect(apurarIva({ periodoId: periodos[13].id }, ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'APURAMENTO_PERIODO_ENCERRAMENTO',
    });

    const apuramentos = await db.apuramentoIva.count({
      where: { tenantId: ctx.tenantId, periodoId: periodos[13].id },
    });
    expect(apuramentos).toBe(0);
  });

  it('um período mensal sem apuramento continua impedido por IVA_NAO_APURADO', async () => {
    const { ctx, periodos } = await cenario([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const { fecharPeriodo } = await import('@/server/services/financas/contabilidade.service');
    const resultado = await fecharPeriodo({ id: periodos[12].id }, ctx);

    expect(resultado.ok).toBe(false);
    expect('impedimentos' in resultado ? resultado.impedimentos : []).toContain('IVA_NAO_APURADO');
    const p12 = await db.periodoContabil.findFirst({ where: { id: periodos[12].id } });
    expect(p12.estado).toBe('ABERTO');
  });

  it('o período 13 com o período 12 aberto continua impedido por PERIODO_ANTERIOR_ABERTO', async () => {
    const { ctx, periodos } = await cenario([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const { fecharPeriodo } = await import('@/server/services/financas/contabilidade.service');
    const resultado = await fecharPeriodo({ id: periodos[13].id }, ctx);

    expect(resultado.ok).toBe(false);
    expect('impedimentos' in resultado ? resultado.impedimentos : []).toContain('PERIODO_ANTERIOR_ABERTO');
    const p13 = await db.periodoContabil.findFirst({ where: { id: periodos[13].id } });
    expect(p13.estado).toBe('ABERTO');
  });
});
