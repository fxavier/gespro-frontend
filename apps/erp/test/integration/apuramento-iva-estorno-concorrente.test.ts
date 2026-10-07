/**
 * Teste de integração — Estorno do apuramento de IVA: corrida e transição inválida (#354)
 *
 * 1. Dois `estornarApuramentoIva` simultâneos sobre o mesmo apuramento têm de
 *    produzir UM só lançamento de estorno: um pedido passa, o outro é recusado
 *    como regra de negócio. Hoje a leitura do estado é feita sem tranca e os
 *    dois pedidos só se serializam no `Diario FOR UPDATE` — o segundo prossegue
 *    com a leitura antiga e grava um segundo estorno.
 *    A corrida repete-se em RONDAS (um período/apuramento novo por ronda) para
 *    que o resultado não dependa de um único entrelaçamento.
 * 2. Estornar ou declarar um apuramento já ESTORNADO tem de chegar ao
 *    utilizador como `BusinessRuleError` (`TRANSICAO_INVALIDA`), não como `Error`
 *    cru («Erro interno», 500).
 *
 * 3. (#356) Declarar e estornar o mesmo apuramento ao mesmo tempo nunca pode
 *    deixar o apuramento DECLARADO sobre um lançamento já estornado. Hoje o
 *    `marcarDeclarado` decide com um `findFirst` sem tranca e escreve com um
 *    `update` incondicional: se o estorno fizer commit entre a leitura e a
 *    escrita, o declarar sobrescreve ESTORNADO. O entrelaçamento é forçado de
 *    forma determinística: uma terceira transacção tranca a linha do apuramento,
 *    o estorno e o declarar ficam ambos à espera (por essa ordem) e só então a
 *    tranca é largada.
 *
 * Setup copiado de `apuramento-iva-estorno-periodo-fechado.test.ts` (#89).
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

type AnyDb = any;

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

/** Meses usados pelas rondas da corrida (um período/apuramento por ronda). */
const MESES_CORRIDA = [1, 2, 3, 4, 5];

describe.skipIf(skip)('Estorno do apuramento de IVA — corrida e transição inválida (#354)', () => {
  let db: AnyDb;
  const TS = Date.now();
  const TENANT_ID = `tenant-estorno-conc-${TS}`;
  const USER_ID = `user-estorno-conc-${TS}`;
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
        historico: `IVA estorno concorrente ${mm}`,
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
      data: { id: TENANT_ID, nome: 'Tenant Estorno IVA', slug: `estorno-conc-${TS}`, nuit: '400123458' },
    });
    await db.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: `estorno-conc-${TS}@test.mz`,
        nome: 'Utilizador Estorno IVA',
        keycloakSub: `kc-estorno-conc-${TS}`,
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
    'corrida: dois estornos simultâneos do mesmo apuramento criam UM só estorno',
    async () => {
      const { estornarApuramentoIva } = await import('@/server/services/financas/apuramento-iva.service');

      for (const mes of MESES_CORRIDA) {
        const { apuramento, lancamentoId } = await periodoApurado(mes);

        const resultados = await Promise.allSettled([
          estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: `Corrida A #354 (${mes})` }, CTX),
          estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: `Corrida B #354 (${mes})` }, CTX),
        ]);

        const estornos = await db.lancamento.count({
          where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
        });
        // A afirmação que decide: o razão do período não pode ficar com o IVA revertido duas vezes.
        expect(estornos, `ronda ${mes}: lançamentos de estorno do apuramento`).toBe(1);

        const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(cumpridos, `ronda ${mes}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${mes}: pedidos recusados`).toHaveLength(1);
        expect(rejeitados[0].reason).toMatchObject({ name: 'BusinessRuleError' });

        const apuramentoDepois = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
        expect(apuramentoDepois.estado).toBe('ESTORNADO');
      }
    },
    120_000,
  );

  it(
    'estornar um apuramento já ESTORNADO: BusinessRuleError TRANSICAO_INVALIDA e nenhum estorno extra',
    async () => {
      const { apuramento, lancamentoId } = await periodoApurado(7);

      const { estornarApuramentoIva } = await import('@/server/services/financas/apuramento-iva.service');
      await estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: 'Primeiro estorno #354' }, CTX);

      await expect(
        estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: 'Duplo clique #354' }, CTX),
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });

      const estornos = await db.lancamento.count({
        where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
      });
      expect(estornos).toBe(1);

      const apuramentoDepois = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
      expect(apuramentoDepois.estado).toBe('ESTORNADO');
    },
    60_000,
  );

  it(
    'declarar um apuramento ESTORNADO: BusinessRuleError TRANSICAO_INVALIDA e continua ESTORNADO',
    async () => {
      const { apuramento } = await periodoApurado(11);

      const { estornarApuramentoIva, marcarDeclarado } = await import(
        '@/server/services/financas/apuramento-iva.service'
      );
      await estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: 'Estorno antes de declarar #354' }, CTX);

      await expect(
        marcarDeclarado(
          { apuramentoId: apuramento.id, declaradoEm: new Date(), referenciaEntrega: 'REF-354' },
          CTX,
        ),
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });

      const apuramentoDepois = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
      expect(apuramentoDepois.estado).toBe('ESTORNADO');
      expect(apuramentoDepois.declaradoEm).toBeNull();
    },
    60_000,
  );

  // ── #356: declarar vs estornar ────────────────────────────────────────────

  /** Número de backends desta base à espera de uma tranca de linha/transacção. */
  async function emEsperaDeTranca(): Promise<number> {
    const [linha] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
    `;
    return Number(linha.n);
  }

  async function esperarAte(cond: () => Promise<boolean>, rotulo: string, limiteMs = 20_000) {
    const fim = Date.now() + limiteMs;
    while (Date.now() < fim) {
      if (await cond()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Tempo esgotado à espera de: ${rotulo}`);
  }

  /**
   * Invariante do #356: o par (apuramento, lançamento) fica coerente.
   * - DECLARADO ⇒ lançamento LANCADO e nenhum estorno dele;
   * - ESTORNADO ⇒ lançamento ESTORNADO, exactamente um estorno, e sem declaração.
   */
  async function afirmarCoerente(apuramentoId: string, lancamentoId: string, rotulo: string) {
    const ap = await db.apuramentoIva.findFirst({ where: { id: apuramentoId } });
    const lanc = await db.lancamento.findFirst({ where: { id: lancamentoId } });
    const estornos = await db.lancamento.count({
      where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
    });
    // A afirmação que decide: nunca DECLARADO com o lançamento estornado.
    expect(
      { apuramento: ap.estado, lancamento: lanc.status },
      `${rotulo}: apuramento DECLARADO sobre lançamento estornado`,
    ).not.toEqual({ apuramento: 'DECLARADO', lancamento: 'ESTORNADO' });
    if (ap.estado === 'DECLARADO') {
      expect(lanc.status, `${rotulo}: lançamento do apuramento declarado`).toBe('LANCADO');
      expect(estornos, `${rotulo}: estornos do apuramento declarado`).toBe(0);
    } else {
      expect(ap.estado, `${rotulo}: estado final do apuramento`).toBe('ESTORNADO');
      expect(lanc.status, `${rotulo}: lançamento do apuramento estornado`).toBe('ESTORNADO');
      expect(estornos, `${rotulo}: estornos do apuramento estornado`).toBe(1);
      expect(ap.declaradoEm, `${rotulo}: declaradoEm do apuramento estornado`).toBeNull();
    }
  }

  it(
    'declarar vs estornar (estorno faz commit primeiro): o declarar é recusado e o apuramento fica ESTORNADO (#356)',
    async () => {
      const { apuramento, lancamentoId } = await periodoApurado(8);
      const { estornarApuramentoIva, marcarDeclarado } = await import(
        '@/server/services/financas/apuramento-iva.service'
      );

      // Tranca a linha do apuramento numa transacção à parte, para forçar a ordem:
      // o estorno chega primeiro à escrita do apuramento, o declarar (que já leu
      // APURADO sem tranca) chega depois.
      let largar!: () => void;
      const largada = new Promise<void>((r) => (largar = r));
      let trancado!: () => void;
      const trancada = new Promise<void>((r) => (trancado = r));
      const tranca = db.$transaction(
        async (tx: AnyDb) => {
          await tx.$queryRaw`SELECT id FROM "ApuramentoIva" WHERE id = ${apuramento.id} FOR UPDATE`;
          trancado();
          await largada;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      await trancada;

      const base = await emEsperaDeTranca();
      const estornar = estornarApuramentoIva(
        { apuramentoId: apuramento.id, motivo: 'Estorno contra declarar #356' },
        CTX,
      );
      const estornarSettled = estornar.then(
        (v) => ({ status: 'fulfilled' as const, value: v }),
        (e) => ({ status: 'rejected' as const, reason: e }),
      );
      await esperarAte(async () => (await emEsperaDeTranca()) >= base + 1, 'estorno bloqueado no apuramento');

      const declarar = marcarDeclarado(
        { apuramentoId: apuramento.id, declaradoEm: new Date(), referenciaEntrega: 'REF-356-A' },
        CTX,
      );
      const declararSettled = declarar.then(
        (v) => ({ status: 'fulfilled' as const, value: v }),
        (e) => ({ status: 'rejected' as const, reason: e }),
      );
      await esperarAte(async () => (await emEsperaDeTranca()) >= base + 2, 'declarar bloqueado no apuramento');

      largar();
      await tranca;
      const [rEstornar, rDeclarar] = await Promise.all([estornarSettled, declararSettled]);

      expect(rEstornar.status, 'o estorno, que chegou primeiro, passa').toBe('fulfilled');
      expect(rDeclarar.status, 'o declarar, que leu APURADO antes do commit do estorno, é recusado').toBe('rejected');
      expect((rDeclarar as { reason: unknown }).reason).toMatchObject({ name: 'BusinessRuleError' });

      await afirmarCoerente(apuramento.id, lancamentoId, 'estorno primeiro');
      const ap = await db.apuramentoIva.findFirst({ where: { id: apuramento.id } });
      expect(ap.estado).toBe('ESTORNADO');
      expect(ap.referenciaEntrega).toBeNull();
    },
    90_000,
  );

  it(
    'declarar vs estornar em rondas com Promise.allSettled: um passa, o outro é recusado, estado coerente (#356)',
    async () => {
      const { estornarApuramentoIva, marcarDeclarado } = await import(
        '@/server/services/financas/apuramento-iva.service'
      );

      for (const mes of [9, 10, 12]) {
        const { apuramento, lancamentoId } = await periodoApurado(mes);

        const resultados = await Promise.allSettled([
          estornarApuramentoIva({ apuramentoId: apuramento.id, motivo: `Corrida declarar #356 (${mes})` }, CTX),
          marcarDeclarado(
            { apuramentoId: apuramento.id, declaradoEm: new Date(), referenciaEntrega: `REF-356-${mes}` },
            CTX,
          ),
        ]);

        const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(cumpridos, `ronda ${mes}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${mes}: pedidos recusados`).toHaveLength(1);
        expect(rejeitados[0].reason).toMatchObject({ name: 'BusinessRuleError' });

        await afirmarCoerente(apuramento.id, lancamentoId, `ronda ${mes}`);
      }
    },
    120_000,
  );
});
