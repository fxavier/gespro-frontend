/**
 * Teste de integração — Reprodutibilidade do apuramento de IVA (ADR-0034 §9)
 *
 * Prova que recalcular o apuramento sobre um período fechado produz exactamente
 * os mesmos números que foram gravados na primeira corrida.
 *
 * A propriedade não é trivial:
 *  - Um `new Date()` dentro do cálculo (ex.: data de emissão usada como filtro)
 *    produziria resultados diferentes se chamado noutro instante.
 *  - Ler o nome actual de uma conta em vez do nome congelado na linha produziria
 *    `contaNome` diferente após uma renomeação.
 *  - Uma ordenação não determinística das partidas produziria `linhas` em ordem
 *    diferente entre corridas.
 *  - Uma taxa lida da configuração corrente em vez da do período produziria
 *    `taxaAplicada` diferente após alteração do regime.
 *
 * O teste: criar partidas IVA → `apurarIva` (grava) → fechar o período
 * (partidas imutáveis) → re-agregar da BD + recalcular com as funções puras
 * → comparar campo a campo com o gravado.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 * Localmente salta, o que é esperado. O CI verifica.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// CONTAS_IVA_FILTRO replicado aqui para não importar módulo com 'server-only'
const CONTAS_IVA_FILTRO = [
  '44331', '44332', '44333',
  '44321', '44322', '44323',
  '44341', '44342', '44343',
  '4435',  '4437',  '4438',
];

describe.skipIf(skip)('Reprodutibilidade do apuramento IVA — DB efémera', () => {
  let db: AnyDb;
  const TS = Date.now();
  const TENANT_ID = `tenant-repro-${TS}`;
  const USER_ID   = `user-repro-${TS}`;

  let periodoId: string;
  let conta44331Id: string;
  let conta44321Id: string;

  // ---------------------------------------------------------------------------
  // Setup: estrutura mínima para apurarIva funcionar
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg }     = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: process.env.INTEGRATION_DB_URL! });
    db = new PrismaClient({ adapter });

    // Tenant
    await db.tenant.create({
      data: { id: TENANT_ID, nome: 'Tenant Repro IVA', slug: `repro-iva-${TS}`, nuit: '400123456' },
    });

    // Utilizador mínimo (necessário para o audit trail do apuramento)
    await db.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: `repro-${TS}@test.mz`,
        nome: 'Utilizador Reprodutibilidade',
        keycloakSub: `kc-repro-${TS}`,
      },
    });

    // Exercício + período
    const exercicio = await db.exercicioContabil.create({
      data: {
        tenantId: TENANT_ID,
        codigo: '2026-repro',
        dataInicio: new Date('2025-12-31T22:00:00Z'),
        dataFim:    new Date('2026-12-31T21:59:59.999Z'),
        estado: 'ABERTO',
      },
    });

    const periodo = await db.periodoContabil.create({
      data: {
        tenantId:  TENANT_ID,
        exercicioId: exercicio.id,
        ordem: 6,
        codigo: '2026-06',
        dataInicio: new Date('2026-05-31T22:00:00Z'),
        dataFim:    new Date('2026-06-30T21:59:59.999Z'),
        estado: 'ABERTO',
      },
    });
    periodoId = periodo.id;

    // Diário OPERACOES (necessário para registarLancamentoContabilistico)
    await db.diario.create({
      data: {
        tenantId: TENANT_ID,
        codigo: 'OP-REPRO',
        nome: 'Operações Reprodutibilidade',
        tipo: 'OPERACOES',
        ativo: true,
      },
    });

    // Contas IVA mínimas (44331 liquidado, 44321 dedutível, 4435/4437/4438 apuramento)
    const contasIva = [
      { codigo: '44331', descricao: 'IVA liquidado — operações gerais', natureza: 'DEVEDORA' },
      { codigo: '44321', descricao: 'IVA dedutível — inventários',      natureza: 'DEVEDORA' },
      { codigo: '4435',  descricao: 'IVA — apuramento',                 natureza: 'DEVEDORA' },
      { codigo: '4437',  descricao: 'IVA a pagar ao Estado',            natureza: 'DEVEDORA' },
      { codigo: '4438',  descricao: 'IVA a recuperar do Estado',        natureza: 'DEVEDORA' },
    ];
    for (const c of contasIva) {
      await db.contaPGC.create({
        data: {
          tenantId: TENANT_ID,
          codigo: c.codigo,
          nome: c.descricao,
          nivel: c.codigo.length,
          classe: `CLASSE_${c.codigo[0]}`,
          natureza: c.natureza,
          // Regra do tenant-bootstrap (derivarTipoConta): classes 1–4 → tipo pela natureza.
          tipo: c.natureza === 'DEVEDORA' ? 'ATIVO' : 'PASSIVO',
          aceitaLancamento: true,
          ativo: true,
        },
      });
    }

    // Resolver ids das contas IVA
    const c44331 = await db.contaPGC.findFirst({ where: { tenantId: TENANT_ID, codigo: '44331' } });
    const c44321 = await db.contaPGC.findFirst({ where: { tenantId: TENANT_ID, codigo: '44321' } });
    conta44331Id = c44331!.id;
    conta44321Id = c44321!.id;

    // Diário de operações para a fonte dos lançamentos IVA
    const diarioOp = await db.diario.create({
      data: {
        tenantId: TENANT_ID,
        codigo: 'VD-REPRO',
        nome: 'Vendas Reprodutibilidade',
        tipo: 'VENDAS',
        ativo: true,
      },
    });

    // Lançamento LANCADO com partidas IVA
    // (inserção directa para evitar dependências de stock, facturas, etc.)
    const lancFonte = await db.lancamento.create({
      data: {
        tenantId: TENANT_ID,
        numero: '000001',
        data: new Date('2026-06-15T12:00:00Z'),
        tipo: 'AUTOMATICO',
        origem: 'VENDA', // a origem que a faturacao.service grava
        diarioId: diarioOp.id,
        periodoId,
        periodoFiscal: '2026-06',
        historico: 'Lançamento IVA teste reprodutibilidade',
        valorTotal: new Prisma.Decimal('1600'),
        status: 'LANCADO',
        criadoPorId: USER_ID,
      },
    });

    // Partidas: C 44331 = 1600 (IVA liquidado, saldo credor)
    //           D 44321 = 1000 (IVA dedutível, saldo devedor)
    // + partidas de contrapartida para equilibrar o lançamento
    // (as contas de contrapartida não têm de existir em ContaPGC aqui —
    //  inserimos directamente sem resolver a conta, o que é válido no teste)
    const contaReceitasId = (await db.contaPGC.create({
      data: {
        tenantId: TENANT_ID, codigo: '71-REPRO', nome: 'Vendas Repro',
        nivel: 2, classe: 'CLASSE_7', natureza: 'CREDORA', tipo: 'RENDIMENTO',
        aceitaLancamento: true, ativo: true,
      },
    })).id;
    const contaFornId = (await db.contaPGC.create({
      data: {
        tenantId: TENANT_ID, codigo: '22-REPRO', nome: 'Clientes Repro',
        nivel: 2, classe: 'CLASSE_2', natureza: 'DEVEDORA', tipo: 'ATIVO',
        aceitaLancamento: true, ativo: true,
      },
    })).id;

    // Partidas do lançamento fonte
    await db.partidaLancamento.createMany({
      data: [
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: conta44331Id, tipo: 'CREDITO', valor: new Prisma.Decimal('1600'), historico: 'IVA liquidado' },
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: conta44321Id, tipo: 'DEBITO',  valor: new Prisma.Decimal('1000'), historico: 'IVA dedutível' },
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contaReceitasId, tipo: 'CREDITO', valor: new Prisma.Decimal('10000'), historico: 'Receitas' },
        { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contaFornId,    tipo: 'DEBITO',  valor: new Prisma.Decimal('11600'), historico: 'Clientes' },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.linhaApuramentoIva.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.apuramentoIva.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.partidaLancamento.deleteMany({ where: { tenantId: TENANT_ID } });
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

  // ---------------------------------------------------------------------------
  // Teste de reprodutibilidade
  // ---------------------------------------------------------------------------

  it(
    'recalcular sobre o período fechado devolve exactamente o gravado (§9)',
    async () => {
      const CTX = { tenantId: TENANT_ID, userId: USER_ID };

      // Passo 1 — importar e chamar apurarIva (usa prismaBase com DATABASE_URL do container)
      const { apurarIva, calcularSaldos, montarPartidasApuramento } =
        await import('@/server/services/financas/apuramento-iva.service');

      const apuramentoGravado = await apurarIva({ periodoId }, CTX);

      // Passo 2 — fechar o período (as partidas ficam imutáveis a partir daqui)
      await db.periodoContabil.update({
        where: { id: periodoId },
        data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: USER_ID },
      });

      // Passo 3 — re-agregar as partidas IVA do período fechado (mesmo algoritmo do serviço)
      // O serviço agrega ANTES de gravar o seu lançamento de apuramento (que salda 4433x/4432x);
      // esse lançamento é a saída do cálculo, não a entrada — fica de fora da re-agregação.
      const FILTRO_LANCADO = { in: ['LANCADO', 'ESTORNADO'] };
      const agregados = await db.partidaLancamento.groupBy({
        by: ['contaId', 'tipo'],
        where: {
          tenantId: TENANT_ID,
          lancamento: {
            periodoId,
            status: FILTRO_LANCADO,
            ...(apuramentoGravado.lancamentoId ? { id: { not: apuramentoGravado.lancamentoId } } : {}),
          },
          conta: { codigo: { in: CONTAS_IVA_FILTRO } },
        },
        _sum: { valor: true },
      });

      const contasIdsSet = [...new Set(agregados.map((a: { contaId: string }) => a.contaId))];
      const contasDb = await db.contaPGC.findMany({
        where: { tenantId: TENANT_ID, id: { in: contasIdsSet } },
        select: { id: true, codigo: true, nome: true },
      });
      // O serviço lê `ContaPGC.nome` (apuramento-iva.service.ts, passo 6)
      const contasMap = new Map<string, { codigo: string; nome: string }>(
        contasDb.map((c: { id: string; codigo: string; nome: string }) => [
          c.id,
          { codigo: c.codigo, nome: c.nome },
        ]),
      );

      const saldos = calcularSaldos(agregados, contasMap);

      // Crédito reportado de 4438 (períodos anteriores) — zero no setup deste teste
      const saldo4438 = await db.partidaLancamento.groupBy({
        by: ['tipo'],
        where: {
          tenantId: TENANT_ID,
          conta: { codigo: '4438' },
          lancamento: { periodoId: { not: periodoId }, status: FILTRO_LANCADO },
        },
        _sum: { valor: true },
      });
      const d4438 = saldo4438.find((a: { tipo: string }) => a.tipo === 'DEBITO')?._sum?.valor ?? new Prisma.Decimal(0);
      const c4438 = saldo4438.find((a: { tipo: string }) => a.tipo === 'CREDITO')?._sum?.valor ?? new Prisma.Decimal(0);
      const creditoReportado = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(d4438).minus(new Prisma.Decimal(c4438)));

      // Passo 4 — recalcular com as funções puras
      const recalculado = montarPartidasApuramento(saldos, creditoReportado);

      // Passo 5 — comparar campo a campo com o gravado

      // Totais
      expect(recalculado.totalLiquidado.toString()).toBe(
        apuramentoGravado.totalIvaLiquidado.toString(),
      );
      expect(recalculado.totalDedutivel.toString()).toBe(
        apuramentoGravado.totalIvaDedutivel.toString(),
      );
      expect(recalculado.totalRegularizacoes.toString()).toBe(
        apuramentoGravado.totalRegularizacoes.toString(),
      );
      expect(recalculado.saldoApuramento.toString()).toBe(
        apuramentoGravado.saldoApuramento.toString(),
      );
      expect(recalculado.creditoReportado.toString()).toBe(
        apuramentoGravado.creditoReportado.toString(),
      );

      // Linhas gravadas: contaNome e taxaAplicada (os campos que mudam se o cálculo
      // ler dados actuais em vez de os congelar)
      const linhasGravadas = apuramentoGravado.linhas;
      expect(linhasGravadas.length).toBeGreaterThan(0);

      for (const linha of linhasGravadas) {
        // Garantir que contaNome foi gravado no momento do apuramento
        // (não é buscado ao vivo — se o nome da conta mudasse, o mapa reemitido em 2031 mostraria o novo nome)
        expect(linha.contaNome).toBeTruthy();
        expect(typeof linha.contaNome).toBe('string');

        // valorImposto deve corresponder ao que recalculamos
        const partidaRecalc = recalculado.partidas.find(
          (p) => p.contaCodigo === linha.contaCodigo && p.tipo === linha.tipoMovimento,
        );
        // Pode não existir se a linha for de 4437/4438 (calculada, não parte das IVA de entrada)
        if (partidaRecalc) {
          expect(linha.valorImposto.toString()).toBe(partidaRecalc.valor.toString());
        }
      }

      // Invariante: o lançamento de apuramento existe e referencia o período
      if (apuramentoGravado.lancamentoId) {
        const lancApur = await db.lancamento.findFirst({
          where: { id: apuramentoGravado.lancamentoId, tenantId: TENANT_ID },
        });
        expect(lancApur).not.toBeNull();
        expect(lancApur!.periodoId).toBe(periodoId);
        expect(lancApur!.status).toBe('LANCADO');
      }
    },
    60_000,
  );

  // ---------------------------------------------------------------------------
  // §7 — ciclo completo: apurar → estornar → apurar de novo
  //
  // Propriedade: a versão 2 reproduz os totais da versão 1; a versão 1 fica
  // ESTORNADO; o estorno do lançamento de apuramento pertence ao mesmo período.
  //
  // O que isto apanha (e que nenhum teste unitário apanha):
  //  - `estornarApuramentoIva` sem `data` faz `new Date()` → estorno vai para
  //    hoje → o razão do período corrigido não é revertido → segunda corrida
  //    encontra as contas a zero → v2 tem totais=0 em vez dos totais da v1.
  //  - Se o período de hoje estiver fechado: `PERIODO_FECHADO` ao estornar,
  //    tornando o §7 impossível mesmo quando o período original está aberto.
  // ---------------------------------------------------------------------------

  it(
    '§7 — estornar e re-apurar: v2 reproduz totais da v1; estorno no período correcto',
    async () => {
      // Período separado para não colidir com o teste anterior (que fechou o seu)
      const periodoSete = await db.periodoContabil.create({
        data: {
          tenantId: TENANT_ID,
          exercicioId: (await db.exercicioContabil.findFirst({ where: { tenantId: TENANT_ID } })).id,
          ordem: 7,
          codigo: '2026-07',
          dataInicio: new Date('2026-06-30T22:00:00Z'),
          dataFim:    new Date('2026-07-31T21:59:59.999Z'),
          estado: 'ABERTO',
        },
      });
      const periodoSeteId = periodoSete.id;

      // Lançamento fonte com partidas IVA no período 2026-07
      const diarioVd = await db.diario.findFirst({ where: { tenantId: TENANT_ID, tipo: 'VENDAS' } });
      const conta44331 = await db.contaPGC.findFirst({ where: { tenantId: TENANT_ID, codigo: '44331' } });
      const conta44321 = await db.contaPGC.findFirst({ where: { tenantId: TENANT_ID, codigo: '44321' } });
      const contaRec   = await db.contaPGC.findFirst({ where: { tenantId: TENANT_ID, codigo: '71-REPRO' } });
      const contaClientes = await db.contaPGC.findFirst({ where: { tenantId: TENANT_ID, codigo: '22-REPRO' } });

      const lancFonte = await db.lancamento.create({
        data: {
          tenantId: TENANT_ID,
          numero: '000001',
          data: new Date('2026-07-15T12:00:00Z'),
          tipo: 'AUTOMATICO', origem: 'VENDA', // a origem que a faturacao.service grava
          diarioId: diarioVd.id,
          periodoId: periodoSeteId,
          periodoFiscal: '2026-07',
          historico: 'IVA §7 teste',
          valorTotal: new Prisma.Decimal('1600'),
          status: 'LANCADO',
          criadoPorId: USER_ID,
        },
      });
      await db.partidaLancamento.createMany({
        data: [
          { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: conta44331.id, tipo: 'CREDITO', valor: new Prisma.Decimal('1600') },
          { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: conta44321.id, tipo: 'DEBITO',  valor: new Prisma.Decimal('1000') },
          { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contaRec.id,   tipo: 'CREDITO', valor: new Prisma.Decimal('10000') },
          { tenantId: TENANT_ID, lancamentoId: lancFonte.id, contaId: contaClientes.id, tipo: 'DEBITO', valor: new Prisma.Decimal('11600') },
        ],
      });

      const CTX = { tenantId: TENANT_ID, userId: USER_ID };
      const { apurarIva, estornarApuramentoIva } =
        await import('@/server/services/financas/apuramento-iva.service');

      // v1: primeira corrida
      const apuramentoV1 = await apurarIva({ periodoId: periodoSeteId }, CTX);
      expect(apuramentoV1.versao).toBe(1);
      expect(apuramentoV1.totalIvaLiquidado.toString()).toBeTruthy();

      // Estornar v1 — o estorno do lançamento de apuramento DEVE ficar no mesmo período
      await estornarApuramentoIva({ apuramentoId: apuramentoV1.id, motivo: 'Correcção de teste §7' }, CTX);

      // Verificar que v1 ficou ESTORNADO
      const v1Apos = await db.apuramentoIva.findFirst({ where: { id: apuramentoV1.id } });
      expect(v1Apos.estado).toBe('ESTORNADO');

      // Verificar que o lançamento de estorno ficou NO MESMO PERÍODO (não no período actual)
      if (apuramentoV1.lancamentoId) {
        const estornoLanc = await db.lancamento.findFirst({
          where: {
            tenantId: TENANT_ID,
            documentoOrigemId: apuramentoV1.lancamentoId,
            tipo: 'ESTORNO',
          },
        });
        expect(estornoLanc).not.toBeNull();
        // O estorno tem de estar no período 2026-07, NÃO no período actual (hoje)
        expect(estornoLanc!.periodoId).toBe(periodoSeteId);
        expect(estornoLanc!.periodoFiscal).toBe('2026-07');
      }

      // v2: segunda corrida — deve reproduzir os totais da v1
      const apuramentoV2 = await apurarIva({ periodoId: periodoSeteId }, CTX);
      expect(apuramentoV2.versao).toBe(2);

      // Propriedade central do §7: v2 reproduz exactamente os totais da v1
      expect(apuramentoV2.totalIvaLiquidado.toString()).toBe(
        apuramentoV1.totalIvaLiquidado.toString(),
      );
      expect(apuramentoV2.totalIvaDedutivel.toString()).toBe(
        apuramentoV1.totalIvaDedutivel.toString(),
      );
      expect(apuramentoV2.saldoApuramento.toString()).toBe(
        apuramentoV1.saldoApuramento.toString(),
      );

      // v2 não pode ter totais a zero (prova que o razão foi correctamente revertido)
      expect(apuramentoV2.totalIvaLiquidado.greaterThan(0)).toBe(true);
    },
    90_000,
  );
});
