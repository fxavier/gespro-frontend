/**
 * Teste de integração — Estorno de lançamento: corrida (#356)
 *
 * Dois `estornarLancamento` simultâneos sobre o mesmo lançamento têm de produzir
 * UM só lançamento de estorno: um pedido passa, o outro é recusado como regra de
 * negócio (`BusinessRuleError`). Hoje a leitura do estado é feita sem tranca e os
 * dois pedidos só se serializam no `Diario FOR UPDATE` (numeração) — o segundo
 * prossegue com a leitura antiga e grava um segundo estorno; o razão fica
 * revertido duas vezes.
 *
 * A corrida repete-se em RONDAS (um lançamento novo por ronda) para que o
 * resultado não dependa de um único entrelaçamento.
 *
 * Setup no molde de `apuramento-iva-estorno-concorrente.test.ts` (#354).
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

type AnyDb = any;

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const RONDAS = 6;

describe.skipIf(skip)('Estorno de lançamento — corrida (#356)', () => {
  let db: AnyDb;
  const TS = Date.now();
  const TENANT_ID = `tenant-lanc-estorno-conc-${TS}`;
  const USER_ID = `user-lanc-estorno-conc-${TS}`;
  const CTX = { tenantId: TENANT_ID, userId: USER_ID };

  let periodoId: string;
  let diarioId: string;
  const contas: Record<string, string> = {};
  let sequencia = 0;

  /** Data dentro do período 2026-03 (meio-dia de Maputo, longe dos limites). */
  const DATA_MARCO = new Date(Date.UTC(2026, 2, 15, 10, 0, 0));

  /** Cria um lançamento LANCADO e equilibrado no período 2026-03. */
  async function lancamentoLancado(rotulo: string) {
    sequencia += 1;
    const lanc = await db.lancamento.create({
      data: {
        tenantId: TENANT_ID,
        numero: `L${String(sequencia).padStart(5, '0')}`,
        data: DATA_MARCO,
        tipo: 'MANUAL',
        origem: 'MANUAL',
        diarioId,
        periodoId,
        periodoFiscal: '2026-03',
        historico: `Lançamento a estornar ${rotulo}`,
        valorTotal: new Prisma.Decimal('500'),
        status: 'LANCADO',
        criadoPorId: USER_ID,
      },
    });
    await db.partidaLancamento.createMany({
      data: [
        { tenantId: TENANT_ID, lancamentoId: lanc.id, contaId: contas['11-EST'], tipo: 'DEBITO', valor: new Prisma.Decimal('500') },
        { tenantId: TENANT_ID, lancamentoId: lanc.id, contaId: contas['71-EST'], tipo: 'CREDITO', valor: new Prisma.Decimal('500') },
      ],
    });
    return lanc.id as string;
  }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: process.env.INTEGRATION_DB_URL! });
    db = new PrismaClient({ adapter });

    await db.tenant.create({
      data: { id: TENANT_ID, nome: 'Tenant Estorno Lançamento', slug: `lanc-estorno-conc-${TS}`, nuit: '400123459' },
    });
    await db.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: `lanc-estorno-conc-${TS}@test.mz`,
        nome: 'Utilizador Estorno Lançamento',
        keycloakSub: `kc-lanc-estorno-conc-${TS}`,
      },
    });

    const exercicio = await db.exercicioContabil.create({
      data: {
        tenantId: TENANT_ID,
        codigo: '2026-lanc-estorno',
        dataInicio: new Date('2025-12-31T22:00:00Z'),
        dataFim: new Date('2026-12-31T21:59:59.999Z'),
        estado: 'ABERTO',
      },
    });
    const periodo = await db.periodoContabil.create({
      data: {
        tenantId: TENANT_ID,
        exercicioId: exercicio.id,
        ordem: 3,
        codigo: '2026-03',
        dataInicio: new Date('2026-02-28T22:00:00Z'),
        dataFim: new Date('2026-03-31T21:59:59.999Z'),
        estado: 'ABERTO',
      },
    });
    periodoId = periodo.id;

    const diario = await db.diario.create({
      data: { tenantId: TENANT_ID, codigo: 'OP-LEST', nome: 'Operações Estorno Lançamento', tipo: 'OPERACOES', ativo: true },
    });
    diarioId = diario.id;

    const definicoes = [
      { codigo: '11-EST', nome: 'Caixa Estorno', classe: 'CLASSE_1', natureza: 'DEVEDORA', tipo: 'ATIVO' },
      { codigo: '71-EST', nome: 'Vendas Estorno', classe: 'CLASSE_7', natureza: 'CREDORA', tipo: 'RENDIMENTO' },
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
    'corrida: dois estornos simultâneos do mesmo lançamento criam UM só estorno e uma recusa',
    async () => {
      const { estornarLancamento } = await import('@/server/services/financas/contabilidade.service');

      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const lancamentoId = await lancamentoLancado(`ronda ${ronda}`);

        const resultados = await Promise.allSettled([
          estornarLancamento({ lancamentoId, motivo: `Corrida A #356 (${ronda})`, data: DATA_MARCO }, CTX),
          estornarLancamento({ lancamentoId, motivo: `Corrida B #356 (${ronda})`, data: DATA_MARCO }, CTX),
        ]);

        // A afirmação que decide: o razão não pode ficar com o lançamento revertido duas vezes.
        const estornos = await db.lancamento.count({
          where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
        });
        expect(estornos, `ronda ${ronda}: lançamentos de estorno`).toBe(1);

        const partidasEstorno = await db.partidaLancamento.count({
          where: { tenantId: TENANT_ID, lancamento: { lancamentoEstornoId: lancamentoId } },
        });
        expect(partidasEstorno, `ronda ${ronda}: partidas de estorno`).toBe(2);

        const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(cumpridos, `ronda ${ronda}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${ronda}: pedidos recusados`).toHaveLength(1);
        expect(rejeitados[0].reason).toMatchObject({ name: 'BusinessRuleError' });

        const original = await db.lancamento.findFirst({ where: { id: lancamentoId, tenantId: TENANT_ID } });
        expect(original.status, `ronda ${ronda}: estado do original`).toBe('ESTORNADO');
      }
    },
    120_000,
  );

  it(
    'estornar um lançamento já ESTORNADO: BusinessRuleError TRANSICAO_INVALIDA e nenhum estorno extra',
    async () => {
      const { estornarLancamento } = await import('@/server/services/financas/contabilidade.service');
      const lancamentoId = await lancamentoLancado('sequencial');

      await estornarLancamento({ lancamentoId, motivo: 'Primeiro estorno #356', data: DATA_MARCO }, CTX);
      await expect(
        estornarLancamento({ lancamentoId, motivo: 'Duplo clique #356', data: DATA_MARCO }, CTX),
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });

      const estornos = await db.lancamento.count({
        where: { tenantId: TENANT_ID, lancamentoEstornoId: lancamentoId },
      });
      expect(estornos).toBe(1);
    },
    60_000,
  );
});
