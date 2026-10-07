/**
 * Teste de integração — PRORATA_NAO_SUPORTADO apanha as operações isentas (#208, ADR-0034 §4)
 *
 * O ADR-0034 §4 diz que, com operações isentas no período, a dedução do IVA
 * suportado é limitada pelo pro rata — que o produto não calcula. Enquanto não
 * calcular, o apuramento tem de RECUSAR (PRORATA_NAO_SUPORTADO) em vez de
 * devolver um IVA a entregar sobrestimado a favor da dedução.
 *
 * Antes do #208 a pré-condição só olhava para `LinhaFatura.taxaIva NOT IN (0, 0.16)`:
 *  - uma factura com linha isenta (0 %, com motivoIsencao) passava;
 *  - as notas de débito nem eram consultadas.
 *
 * Contrato provado aqui (todas as datas em períodos ≥ PERIODO_LEI_10_2025 = '2026-01',
 * excepto o caso que tranca esse limite):
 *  1. factura de 2026 com uma linha a 0 % → recusa PRORATA_NAO_SUPORTADO, e a
 *     mensagem nomeia as operações isentas e o pro rata;
 *  2. controlo: factura de 2026 só com linhas a 16 % → apura;
 *  3. nota de débito de 2026 com linha a 0 % (factura do período a 16 %) → recusa;
 *  4. nota de débito de 2026 com linha a 5 % → recusa (taxa não-standard em ND);
 *  5. período de 2025 (antes da Lei 10/2025) com linha a 0 % → NÃO é PRORATA_NAO_SUPORTADO.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

type AnyDb = any;

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const D = (v: string) => new Prisma.Decimal(v);

describe.skipIf(skip)('PRORATA_NAO_SUPORTADO com operações isentas (#208) — DB efémera', () => {
  let db: AnyDb;
  const TS = Date.now();
  const TENANT_ID = `tenant-prorata-${TS}`;
  const USER_ID = `user-prorata-${TS}`;
  const CTX = { tenantId: TENANT_ID, userId: USER_ID };

  let exercicio2026Id: string;
  let exercicio2025Id: string;
  let diarioVendasId: string;
  let serieFaturaId: string;
  let serieNotaDebitoId: string;
  const contas: Record<string, string> = {};

  // Números de documento consumidos da série (proximoNumero é avançado no fim).
  let nFatura = 0;
  let nNotaDebito = 0;
  let nLancamento = 0;

  // ---------------------------------------------------------------------------
  // Helpers de construção
  // ---------------------------------------------------------------------------

  async function criarPeriodo(
    exercicioId: string,
    ordem: number,
    codigo: string,
    dataInicio: string,
    dataFim: string,
  ): Promise<string> {
    const p = await db.periodoContabil.create({
      data: {
        tenantId: TENANT_ID,
        exercicioId,
        ordem,
        codigo,
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        estado: 'ABERTO',
      },
    });
    return p.id;
  }

  /** Lançamento LANCADO com IVA liquidado (C 44331) e dedutível (D 44321), equilibrado. */
  async function criarLancamentoIva(periodoId: string, codigoPeriodo: string, data: string): Promise<string> {
    nLancamento += 1;
    const lanc = await db.lancamento.create({
      data: {
        tenantId: TENANT_ID,
        numero: String(nLancamento).padStart(6, '0'),
        data: new Date(data),
        tipo: 'AUTOMATICO',
        origem: 'VENDA',
        diarioId: diarioVendasId,
        periodoId,
        periodoFiscal: codigoPeriodo,
        historico: `Lançamento IVA #208 ${codigoPeriodo}`,
        valorTotal: D('11600'),
        status: 'LANCADO',
        criadoPorId: USER_ID,
      },
    });
    await db.partidaLancamento.createMany({
      data: [
        { tenantId: TENANT_ID, lancamentoId: lanc.id, contaId: contas['44331'], tipo: 'CREDITO', valor: D('1600') },
        { tenantId: TENANT_ID, lancamentoId: lanc.id, contaId: contas['44321'], tipo: 'DEBITO', valor: D('1000') },
        { tenantId: TENANT_ID, lancamentoId: lanc.id, contaId: contas['71-PR'], tipo: 'CREDITO', valor: D('10000') },
        { tenantId: TENANT_ID, lancamentoId: lanc.id, contaId: contas['21-PR'], tipo: 'DEBITO', valor: D('10600') },
      ],
    });
    return lanc.id;
  }

  interface LinhaSpec {
    taxa: string; // '0.16', '0', '0.05'
    motivoIsencao?: string;
  }

  function valoresLinha(l: LinhaSpec, i: number) {
    const subtotal = D('1000');
    const ivaItem = subtotal.times(D(l.taxa)).toDecimalPlaces(2);
    return {
      tenantId: TENANT_ID,
      descricao: `Linha ${i + 1} (taxa ${l.taxa})`,
      quantidade: D('1'),
      precoUnitario: subtotal,
      taxaIva: D(l.taxa),
      motivoIsencao: l.motivoIsencao ?? null,
      subtotal,
      ivaItem,
      total: subtotal.plus(ivaItem),
      ordemLinha: i,
    };
  }

  /** Factura EMITIDA, com lançamento (passa DOCUMENTO_SEM_LANCAMENTO), na data dada. */
  async function criarFatura(dataEmissao: string, lancamentoId: string, linhas: LinhaSpec[]) {
    nFatura += 1;
    const ls = linhas.map(valoresLinha);
    const subtotal = ls.reduce((a, l) => a.plus(l.subtotal), D('0'));
    const iva = ls.reduce((a, l) => a.plus(l.ivaItem), D('0'));
    return db.fatura.create({
      data: {
        tenantId: TENANT_ID,
        serieDocumentoId: serieFaturaId,
        numero: `FPR/2026/${String(nFatura).padStart(6, '0')}`,
        clienteId: `cliente-prorata-${TS}`,
        subtotal,
        baseIva: subtotal,
        ivaTotal: iva,
        total: subtotal.plus(iva),
        status: 'EMITIDA',
        dataEmissao: new Date(dataEmissao),
        dataVencimento: new Date(dataEmissao),
        lancamentoId,
        emitidoPorId: USER_ID,
        linhas: { create: ls },
      },
    });
  }

  /** Nota de débito EMITIDA, com lançamento, na data dada. */
  async function criarNotaDebito(dataEmissao: string, lancamentoId: string, linhas: LinhaSpec[]) {
    nNotaDebito += 1;
    const ls = linhas.map(valoresLinha);
    const subtotal = ls.reduce((a, l) => a.plus(l.subtotal), D('0'));
    const iva = ls.reduce((a, l) => a.plus(l.ivaItem), D('0'));
    return db.notaDebito.create({
      data: {
        tenantId: TENANT_ID,
        serieDocumentoId: serieNotaDebitoId,
        numero: `NDPR/2026/${String(nNotaDebito).padStart(6, '0')}`,
        clienteId: `cliente-prorata-${TS}`,
        motivo: 'Acerto de preço — teste #208',
        subtotal,
        ivaTotal: iva,
        total: subtotal.plus(iva),
        status: 'EMITIDA',
        dataEmissao: new Date(dataEmissao),
        lancamentoId,
        emitidoPorId: USER_ID,
        linhas: { create: ls },
      },
    });
  }

  /** Corre apurarIva e devolve o erro (ou null se apurou). */
  async function apurarECapturar(periodoId: string): Promise<{ code?: string; message?: string } | null> {
    const svc: AnyDb = await import('@/server/services/financas/apuramento-iva.service');
    try {
      await svc.apurarIva({ periodoId }, CTX);
      return null;
    } catch (e) {
      return e as { code?: string; message?: string };
    }
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: process.env.INTEGRATION_DB_URL! });
    db = new PrismaClient({ adapter });

    await db.tenant.create({
      data: { id: TENANT_ID, nome: 'Tenant Prorata Isentas', slug: `prorata-${TS}`, nuit: '400765432' },
    });
    await db.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: `prorata-${TS}@test.mz`,
        nome: 'Utilizador Prorata',
        keycloakSub: `kc-prorata-${TS}`,
      },
    });

    exercicio2026Id = (
      await db.exercicioContabil.create({
        data: {
          tenantId: TENANT_ID,
          codigo: '2026-prorata',
          dataInicio: new Date('2025-12-31T22:00:00Z'),
          dataFim: new Date('2026-12-31T21:59:59.999Z'),
          estado: 'ABERTO',
        },
      })
    ).id;
    exercicio2025Id = (
      await db.exercicioContabil.create({
        data: {
          tenantId: TENANT_ID,
          codigo: '2025-prorata',
          dataInicio: new Date('2024-12-31T22:00:00Z'),
          dataFim: new Date('2025-12-31T21:59:59.999Z'),
          estado: 'ABERTO',
        },
      })
    ).id;

    // Diário OPERACOES (o lançamento de apuramento vai para ele) + diário de vendas (fonte)
    await db.diario.create({
      data: { tenantId: TENANT_ID, codigo: 'OP-PR', nome: 'Operações Prorata', tipo: 'OPERACOES', ativo: true },
    });
    diarioVendasId = (
      await db.diario.create({
        data: { tenantId: TENANT_ID, codigo: 'VD-PR', nome: 'Vendas Prorata', tipo: 'VENDAS', ativo: true },
      })
    ).id;

    const planoMinimo = [
      { codigo: '44331', nome: 'IVA liquidado — operações gerais', natureza: 'DEVEDORA', tipo: 'ATIVO', classe: 'CLASSE_4' },
      { codigo: '44321', nome: 'IVA dedutível — inventários', natureza: 'DEVEDORA', tipo: 'ATIVO', classe: 'CLASSE_4' },
      { codigo: '4435', nome: 'IVA — apuramento', natureza: 'DEVEDORA', tipo: 'ATIVO', classe: 'CLASSE_4' },
      { codigo: '4437', nome: 'IVA a pagar ao Estado', natureza: 'DEVEDORA', tipo: 'ATIVO', classe: 'CLASSE_4' },
      { codigo: '4438', nome: 'IVA a recuperar do Estado', natureza: 'DEVEDORA', tipo: 'ATIVO', classe: 'CLASSE_4' },
      { codigo: '71-PR', nome: 'Vendas Prorata', natureza: 'CREDORA', tipo: 'RENDIMENTO', classe: 'CLASSE_7' },
      { codigo: '21-PR', nome: 'Clientes Prorata', natureza: 'DEVEDORA', tipo: 'ATIVO', classe: 'CLASSE_2' },
    ];
    for (const c of planoMinimo) {
      const criada = await db.contaPGC.create({
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
      contas[c.codigo] = criada.id;
    }

    serieFaturaId = (
      await db.serieDocumento.create({
        data: { tenantId: TENANT_ID, tipo: 'FATURA', prefixo: 'FPR', ano: 2026, proximoNumero: 1 },
      })
    ).id;
    serieNotaDebitoId = (
      await db.serieDocumento.create({
        data: { tenantId: TENANT_ID, tipo: 'NOTA_DEBITO', prefixo: 'NDPR', ano: 2026, proximoNumero: 1 },
      })
    ).id;
  });

  afterAll(async () => {
    if (!db) return;
    try {
      // A série fica avançada para os números que este teste gastou (regra da casa).
      if (serieFaturaId) {
        await db.serieDocumento.update({ where: { id: serieFaturaId }, data: { proximoNumero: nFatura + 1 } });
      }
      if (serieNotaDebitoId) {
        await db.serieDocumento.update({ where: { id: serieNotaDebitoId }, data: { proximoNumero: nNotaDebito + 1 } });
      }
      await db.linhaApuramentoIva.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.apuramentoIva.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.linhaNotaDebito.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.notaDebito.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.linhaFatura.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.fatura.deleteMany({ where: { tenantId: TENANT_ID } });
      await db.serieDocumento.deleteMany({ where: { tenantId: TENANT_ID } });
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
  // Casos
  // ---------------------------------------------------------------------------

  it('1. factura de 2026 com linha isenta (0 %, motivoIsencao) → recusa PRORATA_NAO_SUPORTADO', async () => {
    const periodoId = await criarPeriodo(
      exercicio2026Id, 3, '2026-03', '2026-02-28T22:00:00Z', '2026-03-31T21:59:59.999Z',
    );
    const lancId = await criarLancamentoIva(periodoId, '2026-03', '2026-03-15T12:00:00Z');
    await criarFatura('2026-03-15T10:00:00Z', lancId, [
      { taxa: '0.16' },
      { taxa: '0', motivoIsencao: 'Isento — artigo 9 do CIVA' },
    ]);

    const erro = await apurarECapturar(periodoId);

    expect(erro, 'o período com operação isenta foi apurado — devia ter sido recusado').not.toBeNull();
    expect(erro!.code).toBe('PRORATA_NAO_SUPORTADO');
    // A mensagem tem de dizer porquê: operações isentas / a 0 % e o pro rata não suportado.
    expect(erro!.message).toMatch(/isent|0\s?%/i);
    expect(erro!.message).toMatch(/pro\s?rata/i);

    // Recusa não deixa rasto: nenhum apuramento gravado no período.
    const apuramentos = await db.apuramentoIva.count({ where: { tenantId: TENANT_ID, periodoId } });
    expect(apuramentos).toBe(0);
  });

  it('2. controlo: factura de 2026 só com linhas a 16 % → apura', async () => {
    const periodoId = await criarPeriodo(
      exercicio2026Id, 4, '2026-04', '2026-03-31T22:00:00Z', '2026-04-30T21:59:59.999Z',
    );
    const lancId = await criarLancamentoIva(periodoId, '2026-04', '2026-04-15T12:00:00Z');
    await criarFatura('2026-04-15T10:00:00Z', lancId, [{ taxa: '0.16' }, { taxa: '0.16' }]);

    const erro = await apurarECapturar(periodoId);

    expect(erro, `apuramento recusado: ${erro?.code} — ${erro?.message}`).toBeNull();
    const apuramento = await db.apuramentoIva.findFirst({ where: { tenantId: TENANT_ID, periodoId } });
    expect(apuramento).not.toBeNull();
    expect(apuramento.estado).toBe('APURADO');
    expect(apuramento.totalIvaLiquidado.toString()).toBe('1600');
  });

  it('3. nota de débito de 2026 com linha isenta (0 %) → recusa PRORATA_NAO_SUPORTADO', async () => {
    const periodoId = await criarPeriodo(
      exercicio2026Id, 5, '2026-05', '2026-04-30T22:00:00Z', '2026-05-31T21:59:59.999Z',
    );
    const lancId = await criarLancamentoIva(periodoId, '2026-05', '2026-05-15T12:00:00Z');
    // A factura do período é standard: só a ND pode disparar a recusa.
    await criarFatura('2026-05-10T10:00:00Z', lancId, [{ taxa: '0.16' }]);
    await criarNotaDebito('2026-05-20T10:00:00Z', lancId, [
      { taxa: '0', motivoIsencao: 'Isento — artigo 9 do CIVA' },
    ]);

    const erro = await apurarECapturar(periodoId);

    expect(erro, 'o período com ND isenta foi apurado — devia ter sido recusado').not.toBeNull();
    expect(erro!.code).toBe('PRORATA_NAO_SUPORTADO');
    const apuramentos = await db.apuramentoIva.count({ where: { tenantId: TENANT_ID, periodoId } });
    expect(apuramentos).toBe(0);
  });

  it('4. nota de débito de 2026 com linha a 5 % (taxa não-standard) → recusa PRORATA_NAO_SUPORTADO', async () => {
    const periodoId = await criarPeriodo(
      exercicio2026Id, 6, '2026-06', '2026-05-31T22:00:00Z', '2026-06-30T21:59:59.999Z',
    );
    const lancId = await criarLancamentoIva(periodoId, '2026-06', '2026-06-15T12:00:00Z');
    await criarFatura('2026-06-10T10:00:00Z', lancId, [{ taxa: '0.16' }]);
    await criarNotaDebito('2026-06-20T10:00:00Z', lancId, [{ taxa: '0.05' }]);

    const erro = await apurarECapturar(periodoId);

    expect(erro, 'o período com ND a 5 % foi apurado — devia ter sido recusado').not.toBeNull();
    expect(erro!.code).toBe('PRORATA_NAO_SUPORTADO');
  });

  it('5. período de 2025 (antes da Lei 10/2025) com linha isenta → não é PRORATA_NAO_SUPORTADO', async () => {
    const periodoId = await criarPeriodo(
      exercicio2025Id, 12, '2025-12', '2025-11-30T22:00:00Z', '2025-12-31T21:59:59.999Z',
    );
    const lancId = await criarLancamentoIva(periodoId, '2025-12', '2025-12-15T12:00:00Z');
    await criarFatura('2025-12-15T10:00:00Z', lancId, [
      { taxa: '0', motivoIsencao: 'Isento — artigo 9 do CIVA' },
    ]);
    await criarNotaDebito('2025-12-20T10:00:00Z', lancId, [
      { taxa: '0', motivoIsencao: 'Isento — artigo 9 do CIVA' },
    ]);

    const erro = await apurarECapturar(periodoId);

    // O limite PERIODO_LEI_10_2025 mantém-se: antes de 2026-01 a pré-condição não corre.
    expect(erro?.code).not.toBe('PRORATA_NAO_SUPORTADO');
  });
});
