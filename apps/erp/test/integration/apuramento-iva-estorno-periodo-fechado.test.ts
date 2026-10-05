/**
 * Teste de integração — Estorno do apuramento de IVA é atómico (#89)
 *
 * `estornarApuramentoIva` tem de deixar o apuramento e o seu lançamento em
 * estados coerentes: ou os dois passam a ESTORNADO, ou nenhum muda. Se o
 * estorno do lançamento falhar (período fechado, lançamento já estornado),
 * o apuramento continua APURADO e nenhum lançamento de estorno fica gravado.
 *
 * O setup segue `apuramento-iva-reproducibilidade.test.ts` (estrutura mínima
 * do tenant + lançamento fonte com partidas IVA inseridas directamente), que
 * é o caminho já provado para `apurarIva` produzir um `lancamentoId`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

type AnyDb = any;

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('Estorno do apuramento de IVA — atomicidade (#89)', () => {
  let db: AnyDb;
  const TS = Date.now();
  const TENANT_ID = `tenant-estorno-iva-${TS}`;
  const USER_ID = `user-estorno-iva-${TS}`;
  const CTX = { tenantId: TENANT_ID, userId: USER_ID };

  let exercicioId: string;
  let diarioVendasId: string;
  const contas: Record<string, string> = {};

  /**
   * Cria um período ABERTO (mês `mes` de 2026), um lançamento fonte com
   * partidas IVA nesse período, e corre `apurarIva` sobre ele.
   * Devolve o apuramento gravado e o período.
   */
  async function periodoApurado(mes: number) {
    const mm = String(mes).padStart(2, '0');
    // Limites em instantes de Maputo (UTC+2): início = último dia do mês anterior 22:00Z.
    const inicio = new Date(Date.UTC(2026, mes - 1, 1, 0, 0, 0) - 2 * 3600_000);
    const fim = new Date(Date.UTC(2026, mes, 1, 0, 0, 0) - 2 * 3600_000 - 1);
    const periodo = await db.periodoContabil.create({
      data: {
        tenantId: TENANT_ID,
        exercicioId,
        ordem: mes,
        codigo: `2026-${mm}`,
        dataInicio: inicio,
        dataFim: fim,
        estado: 'ABERTO',
      },
    });

    const lancFonte = await db.lancamento.create({
      data: {
        tenantId: TENANT_ID,
        numero: '000001',
        data: new Date(Date.UTC(2026, mes - 1, 15, 12, 0, 0)),
        tipo: 'AUTOMATICO',
        origem: 'VENDA',
        diarioId: diarioVendasId,
        periodoId: periodo.id,
        periodoFiscal: `2026-${mm}`,
        historico: `IVA estorno teste ${mm}`,
        valorTotal: new Prisma.Decimal('1600'),
        status: 'LANCADO',
        criadoPorId: USER_ID,
      },
    });
    await db.partidaLancamento.createMany({
      data: [
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contas['44331'], tipo: 'CREDITO', valor: new Prisma.Decimal('1600') },
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contas['44321'], tipo: 'DEBITO', valor: new Prisma.Decimal('1000') },
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contas['71-EST'], tipo: 'CREDITO', valor: new Prisma.Decimal('10000') },
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contas['22-EST'], tipo: 'DEBITO', valor: new Prisma.Decimal('11600') },
      ],
    });

    const { apurarIva } = await import('@/server/services/financas/apuramento-iva.service');
    const apuramento = await apurarIva({ periodoId: periodo.id }, CTX);
    // Os casos dependem de haver um lançamento de apuramento a estornar.
    expect(apuramento.lancamentoId).not.toBeNull();
    return { apuramento, periodo, lancamentoId: apuramento.lancamentoId as string };
  }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: process.env.INTEGRATION_DB_URL! });
    db = new PrismaClient({ adapter });

    await db.tenant.create({
      data: { id: TENANT_ID, nome: 'Tenant Estorno IVA', slug: `estorno-iva-${TS}`, nuit: '400123457' },
    });
    await db.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: `estorno-iva-${TS}@test.mz`,
        nome: 'Utilizador Estorno IVA',
        keycloakSub: `kc-estorno-iva-${TS}`,
      },
    });

    const exercicio = await db.exercicioContabil.create({
      data: {
        tenantId: TENANT_ID,
        codigo: '2026-estorno',
        dataInicio: new Date('2025-12-31T22:00:00Z'),
        dataFim: new Date('2026-12-31T21:59:59.999Z'),
        estado: 'ABERTO',
      },
    });
    exercicioId = exercicio.id;

    await db.diario.create({
      data: { tenantId: TENANT_ID, codigo: 'OP-EST', nome: 'Operações Estorno', tipo: 'OPERACOES', ativo: true },
    });
    const diarioVd = await db.diario.create({
      data: { tenantId: TENANT_ID, codigo: 'VD-EST', nome: 'Vendas Estorno', tipo: 'VENDAS', ativo: true },
    });
    diarioVendasId = diarioVd.id;

    const definicoes = [
      { codigo: '44331', nome: 'IVA liquidado — operações gerais', classe: 'CLASSE_4', natureza: 'DEVEDORA', tipo: 'ATIVO' },
      { codigo: '44321', nome: 'IVA dedutível — inventários', classe: 'CLASSE_4', natureza: 'DEVEDORA', tipo: 'ATIVO' },
      { codigo: '4435', nome: 'IVA — apuramento', classe: 'CLASSE_4', natureza: 'DEVEDORA', tipo: 'ATIVO' },
      { codigo: '4437', nome: 'IVA a pagar ao Estado', classe: 'CLASSE_4', natureza: 'DEVEDORA', tipo: 'ATIVO' },
      { codigo: '4438', nome: 'IVA a recuperar do Estado', classe: 'CLASSE_4', natureza: 'DEVEDORA', tipo: 'ATIVO' },
      { codigo: '71-EST', nome: 'Vendas Estorno', classe: 'CLASSE_7', natureza: 'CREDORA', tipo: 'RENDIMENTO' },
      { codigo: '22-EST', nome: 'Clientes Estorno', classe: 'CLASSE_2', natureza: 'DEVEDORA', tipo: 'ATIVO' },
    ];
    for (const c of definicoes) {
      const conta = await db.contaPGC.create({
        data: {
          tenantId: TENANT_ID,
          codigo: c.codigo,
          nome: c.nome,
          nivel: c.codigo.length,
          classe: c.classe,
          natureza: c.natureza,
          tipo: c.tipo,
          aceitaLancamento: true,
          ativo: true,
        },
      });
      contas[c.codigo] = conta.id;
    }
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.linhaApuramentoIva.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.apuramentoIva.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.partidaLancamento.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.lancamento.updateMany({ where: { tenantId: TENANT_ID }, data: { lancamentoEstornoId: null } });
      await db.lancamento.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.periodoContabil.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.exercicioContabil.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.contaPGC.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.diario.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.user.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.tenant.deleteMany({ where: { id: TENANT_ID } });
    } finally {
      await db.$disconnect();
    }
  });

  it(
    'período fechado: rejeita com PERIODO_FECHADO e não deixa o apuramento ESTORNADO',
    async () => {
      const { apuramento, periodo, lancamentoId } = await periodoApurado(8);

      // Fecho directo do PeriodoContabil pelo client cru — o mesmo que o teste de
      // reprodutibilidade faz. `fecharPeriodo` exige sete pré-condições alheias a este
      // defeito; o que está em teste é só a reacção do estorno a um período não ABERTO.
      await db.periodoContabil.update({
        where: { id: periodo.id },
        data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: USER_ID },
      });

      const { estornarApuramentoIva } = await import('@/server/services/financas/apuramento-iva.service');
      await expect(
        estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: 'Período fechado #89' }, CTX),
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'PERIODO_FECHADO' });

      const apuramentoDepois = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
      expect(apuramentoDepois.estado).toBe('APURADO');

      const lancamentoDepois = await db.lancamento.findFirst({ where: { id: lancamentoId } });
      expect(lancamentoDepois.status).toBe('LANCADO');

      const estornos = await db.lancamento.count({
        where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
      });
      expect(estornos).toBe(0);
    },
    60_000,
  );

  it(
    'lançamento já estornado: rejeita e o apuramento continua APURADO',
    async () => {
      const { apuramento, periodo, lancamentoId } = await periodoApurado(9);

      // Estorno directo do lançamento de apuramento, com o período aberto e a data
      // dentro do próprio período (não depende do dia em que o teste corre).
      const { estornarLancamento } = await import('@/server/services/financas/contabilidade.service');
      await estornarLancamento({ lancamentoId, motivo: 'Estorno prévio #89', data: periodo.dataFim }, CTX);
      const lancamentoAntes = await db.lancamento.findFirst({ where: { id: lancamentoId } });
      expect(lancamentoAntes.status).toBe('ESTORNADO');

      const { estornarApuramentoIva } = await import('@/server/services/financas/apuramento-iva.service');
      await expect(
        estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: 'Lançamento já estornado #89' }, CTX),
      ).rejects.toThrow();

      const apuramentoDepois = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
      expect(apuramentoDepois.estado).toBe('APURADO');
    },
    60_000,
  );

  it(
    'período aberto: apuramento e lançamento ESTORNADO, um único estorno no mesmo período',
    async () => {
      const { apuramento, periodo, lancamentoId } = await periodoApurado(10);

      const { estornarApuramentoIva } = await import('@/server/services/financas/apuramento-iva.service');
      await estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: 'Correcção #89' }, CTX);

      const apuramentoDepois = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
      expect(apuramentoDepois.estado).toBe('ESTORNADO');

      const original = await db.lancamento.findFirst({ where: { id: lancamentoId } });
      expect(original.status).toBe('ESTORNADO');

      const estornos = await db.lancamento.findMany({
        where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
      });
      expect(estornos).toHaveLength(1);
      expect(estornos[0].periodoId).toBe(original.periodoId);
      expect(estornos[0].periodoId).toBe(periodo.id);
    },
    60_000,
  );
});
