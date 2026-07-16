/**
 * Teste de integração — fluxo OrdemProducao + stock (WS A)
 *
 * Prova que a transição PLANEADA → LIBERADA → EM_PRODUCAO → CONCLUIDA:
 *   - LIBERADA: reserva stock dos componentes no armazém MP;
 *               guarda reservaId em ConsumoProducao.
 *   - CONCLUIDA: confirma o consumo de cada reserva;
 *                dá entrada do produto acabado no armazém PA.
 *
 * Usa um mock de TxClient e spy do StockContratoA — sem DB real.
 * O invariante "SaldoStock desce/sobe" é garantido pela chamada à sequência
 * correcta de operações (reservarStock → confirmarConsumoStock → entradaStock).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TxClient } from '@/server/services/types';
import type { StockContratoA } from '../producao.interface';
import type { MovimentoStockDto } from '@/server/services/inventario/stock.interface';

// ── Mocks de módulos externos ──────────────────────────────────────────────────

vi.mock('@/server/db/client', () => ({
  prisma: {},
  prismaBase: { $transaction: vi.fn() },
}));

vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: vi.fn().mockResolvedValue('OP-2026-0001'),
}));

// Importar DEPOIS dos mocks
import { OrdemProducaoService } from '../producao.service';

// ── Fixtures ────────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-integracao-teste';
const USER_ID = 'user-teste';
const ORDEM_ID = 'ordem-test-001';
const PRODUTO_PA_ID = 'prod-cadeira-001';
const PRODUTO_MP1_ID = 'prod-madeira-001';
const PRODUTO_MP2_ID = 'prod-parafuso-001';
const BOM_ID = 'bom-cadeira-001';
const LOC_MP_ID = 'loc-mp-real-001';
const LOC_PA_ID = 'loc-pa-real-001';
const RESERVA_ID_MP1 = 'reserva-real-mp1';
const RESERVA_ID_MP2 = 'reserva-real-mp2';
const MOV_CONFIRM_ID1 = 'mov-confirm-001';
const MOV_CONFIRM_ID2 = 'mov-confirm-002';
const CONSUMO_1_ID = 'consumo-001';
const CONSUMO_2_ID = 'consumo-002';

const ctx = { tenantId: TENANT_ID, userId: USER_ID };

function makeMovimento(id: string): MovimentoStockDto {
  return {
    id,
    tenantId: TENANT_ID,
    produtoId: PRODUTO_MP1_ID,
    varianteProdutoId: null,
    tipo: 'SAIDA',
    quantidade: '10',
    localizacaoOrigemId: LOC_MP_ID,
    localizacaoDestinoId: null,
    transferenciaRefId: null,
    documentoReferenciaId: ORDEM_ID,
    documentoReferenciaTipo: 'OrdemProducao',
    motivo: null,
    observacoes: null,
    criadoPor: USER_ID,
    createdAt: new Date(),
  };
}

// ── Mock TxClient ────────────────────────────────────────────────────────────────

function buildMockTx(overrides: Partial<{
  ordemStatus: string;
  ordemConsumosParaConcluir: Array<{ id: string; reservaId: string | null }>;
  ordemQualidadeAprovada: boolean;
  ordemQuantidade: number;
}>= {}): TxClient {
  const {
    ordemStatus = 'PLANEADA',
    ordemConsumosParaConcluir = [
      { id: CONSUMO_1_ID, reservaId: RESERVA_ID_MP1 },
      { id: CONSUMO_2_ID, reservaId: RESERVA_ID_MP2 },
    ],
    ordemQualidadeAprovada = true,
    ordemQuantidade = 100,
  } = overrides;

  let callCount = 0;
  const mockTx = {
    ordemProducao: {
      findFirst: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          status: ordemStatus,
          produtoId: PRODUTO_PA_ID,
          quantidade: ordemQuantidade,
          roteiroId: null,
          qualidadeAprovada: ordemQualidadeAprovada,
          operacoes: [
            { status: 'CONCLUIDA' },
            { status: 'CONCLUIDA' },
          ],
          consumos: ordemConsumosParaConcluir,
        });
      }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    estruturaProduto: {
      findFirst: vi.fn().mockResolvedValue({ id: BOM_ID }),
    },
    componenteBOM: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'comp-001',
          componenteProdutoId: PRODUTO_MP1_ID,
          codigoComponente: 'MP-001',
          nomeComponente: 'Madeira de Pinho',
          componentePaiId: null,
          quantidade: 5,
          unidadeMedida: 'UN',
          perdaPrevista: 0,
          custoUnitario: 100,
          categoria: 'MATERIA_PRIMA',
          tempoLead: null,
        },
        {
          id: 'comp-002',
          componenteProdutoId: PRODUTO_MP2_ID,
          codigoComponente: 'MP-002',
          nomeComponente: 'Parafusos M6',
          componentePaiId: null,
          quantidade: 8,
          unidadeMedida: 'UN',
          perdaPrevista: 0.05,
          custoUnitario: 2,
          categoria: 'MATERIA_PRIMA',
          tempoLead: null,
        },
      ]),
    },
    consumoProducao: {
      create: vi.fn().mockImplementation((args: { data: { reservaId: string } }) =>
        Promise.resolve({ id: `consumo-${args.data.reservaId}` }),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    localizacao: {
      findFirst: vi.fn().mockImplementation((args: { where: { codigo: string } }) => {
        if (args.where.codigo === 'MP') return Promise.resolve({ id: LOC_MP_ID });
        if (args.where.codigo === 'PA') return Promise.resolve({ id: LOC_PA_ID });
        return Promise.resolve(null);
      }),
    },
    ordemProducao_update_calls: [] as unknown[],
  } as unknown as TxClient;
  return mockTx;
}

// ── Spy StockContratoA ───────────────────────────────────────────────────────────

function buildSpyStock(): StockContratoA & {
  _reservas: Array<{ produtoId: string; localizacaoId: string; quantidade: number }>;
  _confirmacoes: string[];
  _entradas: Array<{ produtoId: string; localizacaoDestinoId: string; quantidade: number }>;
} {
  const _reservas: Array<{ produtoId: string; localizacaoId: string; quantidade: number }> = [];
  const _confirmacoes: string[] = [];
  const _entradas: Array<{ produtoId: string; localizacaoDestinoId: string; quantidade: number }> = [];
  let reservaCounter = 0;

  return {
    _reservas,
    _confirmacoes,
    _entradas,
    reservarStock: vi.fn().mockImplementation(async (_tx, data, _ctx) => {
      _reservas.push({ produtoId: data.produtoId, localizacaoId: data.localizacaoId, quantidade: data.quantidade });
      reservaCounter++;
      const reservaId = reservaCounter === 1 ? RESERVA_ID_MP1 : RESERVA_ID_MP2;
      return { reservaId };
    }),
    confirmarConsumoStock: vi.fn().mockImplementation(async (_tx, reservaId, _ctx) => {
      _confirmacoes.push(reservaId);
      const movId = reservaId === RESERVA_ID_MP1 ? MOV_CONFIRM_ID1 : MOV_CONFIRM_ID2;
      return makeMovimento(movId);
    }),
    libertarStock: vi.fn().mockResolvedValue(undefined),
    entradaStock: vi.fn().mockImplementation(async (_tx, data, _ctx) => {
      _entradas.push({ produtoId: data.produtoId, localizacaoDestinoId: data.localizacaoDestinoId, quantidade: data.quantidade });
      return makeMovimento('mov-entrada-pa');
    }),
  };
}

// ── Testes ───────────────────────────────────────────────────────────────────────

describe('OrdemProducao — integração stock (Wave 3)', () => {
  let mockTx: TxClient;
  let spyStock: ReturnType<typeof buildSpyStock>;

  beforeEach(() => {
    vi.clearAllMocks();
    spyStock = buildSpyStock();
  });

  describe('PLANEADA → LIBERADA: reserva de stock dos componentes BOM', () => {
    beforeEach(() => {
      mockTx = buildMockTx({ ordemStatus: 'PLANEADA' });
    });

    it('chama reservarStock para cada componente com localizacaoId real (MP)', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'LIBERADA', spyStock, ctx);

      expect(spyStock.reservarStock).toHaveBeenCalledTimes(2);
      // Primeiro componente: madeira
      expect(spyStock.reservarStock).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          produtoId: PRODUTO_MP1_ID,
          localizacaoId: LOC_MP_ID, // armazém real, não placeholder
          documentoReferenciaId: ORDEM_ID,
          documentoReferenciaTipo: 'OrdemProducao',
        }),
        ctx,
      );
      // Segundo componente: parafusos
      expect(spyStock.reservarStock).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          produtoId: PRODUTO_MP2_ID,
          localizacaoId: LOC_MP_ID,
        }),
        ctx,
      );
    });

    it('persiste reservaId real em ConsumoProducao (append-only)', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'LIBERADA', spyStock, ctx);

      const createCalls = (mockTx as unknown as { consumoProducao: { create: ReturnType<typeof vi.fn> } }).consumoProducao.create.mock.calls;
      expect(createCalls).toHaveLength(2);
      // Primeiro consumo guarda o reservaId real
      expect(createCalls[0][0].data.reservaId).toBe(RESERVA_ID_MP1);
      expect(createCalls[1][0].data.reservaId).toBe(RESERVA_ID_MP2);
    });

    it('não chama confirmarConsumoStock nem entradaStock ao libertar', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'LIBERADA', spyStock, ctx);

      expect(spyStock.confirmarConsumoStock).not.toHaveBeenCalled();
      expect(spyStock.entradaStock).not.toHaveBeenCalled();
    });

    it('resolve o armazém MP do tenant (localizacao.findFirst com codigo=MP)', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'LIBERADA', spyStock, ctx);

      const txAny = mockTx as unknown as { localizacao: { findFirst: ReturnType<typeof vi.fn> } };
      const mpCall = txAny.localizacao.findFirst.mock.calls.find(
        (c: Array<{ where: { codigo: string } }>) => c[0]?.where?.codigo === 'MP',
      );
      expect(mpCall).toBeDefined();
      expect(mpCall![0].where.tenantId).toBe(TENANT_ID);
      expect(mpCall![0].where.ativa).toBe(true);
    });

    it('lança LOCALIZACAO_NAO_CONFIGURADA se não existir armazém MP', async () => {
      const txSemMP = buildMockTx({ ordemStatus: 'PLANEADA' });
      (txSemMP as unknown as { localizacao: { findFirst: ReturnType<typeof vi.fn> } })
        .localizacao.findFirst.mockResolvedValue(null);

      await expect(
        OrdemProducaoService.transitarStatus(txSemMP, ORDEM_ID, 'LIBERADA', spyStock, ctx),
      ).rejects.toMatchObject({ code: 'LOCALIZACAO_NAO_CONFIGURADA' });
    });
  });

  describe('EM_PRODUCAO → CONCLUIDA: confirmação de consumos + entrada produto acabado', () => {
    beforeEach(() => {
      mockTx = buildMockTx({
        ordemStatus: 'EM_PRODUCAO',
        ordemConsumosParaConcluir: [
          { id: CONSUMO_1_ID, reservaId: RESERVA_ID_MP1 },
          { id: CONSUMO_2_ID, reservaId: RESERVA_ID_MP2 },
        ],
        ordemQualidadeAprovada: true,
      });
    });

    it('chama confirmarConsumoStock para cada consumo com reservaId', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'CONCLUIDA', spyStock, ctx);

      expect(spyStock.confirmarConsumoStock).toHaveBeenCalledTimes(2);
      expect(spyStock.confirmarConsumoStock).toHaveBeenCalledWith(mockTx, RESERVA_ID_MP1, ctx);
      expect(spyStock.confirmarConsumoStock).toHaveBeenCalledWith(mockTx, RESERVA_ID_MP2, ctx);
    });

    it('chama entradaStock com produto acabado no armazém PA real', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'CONCLUIDA', spyStock, ctx);

      expect(spyStock.entradaStock).toHaveBeenCalledTimes(1);
      expect(spyStock.entradaStock).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          produtoId: PRODUTO_PA_ID,
          localizacaoDestinoId: LOC_PA_ID, // armazém real PA
          documentoReferenciaTipo: 'ProducaoOutput',
        }),
        ctx,
      );
    });

    it('grava movimentoStockId nos registos de consumo após confirmar', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'CONCLUIDA', spyStock, ctx);

      const txAny = mockTx as unknown as { consumoProducao: { update: ReturnType<typeof vi.fn> } };
      const updateCalls = txAny.consumoProducao.update.mock.calls;
      expect(updateCalls).toHaveLength(2);
      // Primeiro consumo recebe o movimentoStockId do confirmar
      expect(updateCalls[0][0].data.movimentoStockId).toBe(MOV_CONFIRM_ID1);
      expect(updateCalls[1][0].data.movimentoStockId).toBe(MOV_CONFIRM_ID2);
    });

    it('não chama reservarStock ao concluir', async () => {
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'CONCLUIDA', spyStock, ctx);
      expect(spyStock.reservarStock).not.toHaveBeenCalled();
    });

    it('lança QUALIDADE_NAO_APROVADA se qualidade não aprovada', async () => {
      const txSemQualidade = buildMockTx({
        ordemStatus: 'EM_PRODUCAO',
        ordemQualidadeAprovada: false,
      });
      await expect(
        OrdemProducaoService.transitarStatus(txSemQualidade, ORDEM_ID, 'CONCLUIDA', spyStock, ctx),
      ).rejects.toMatchObject({ code: 'QUALIDADE_NAO_APROVADA' });
    });
  });

  describe('→ CANCELADA: libertar reservas activas', () => {
    it('chama libertarStock para cada consumo com reservaId', async () => {
      mockTx = buildMockTx({
        ordemStatus: 'EM_PRODUCAO',
        ordemConsumosParaConcluir: [
          { id: CONSUMO_1_ID, reservaId: RESERVA_ID_MP1 },
          { id: CONSUMO_2_ID, reservaId: RESERVA_ID_MP2 },
        ],
      });
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'CANCELADA', spyStock, ctx);

      expect(spyStock.libertarStock).toHaveBeenCalledTimes(2);
      expect(spyStock.libertarStock).toHaveBeenCalledWith(mockTx, RESERVA_ID_MP1, ctx);
      expect(spyStock.libertarStock).toHaveBeenCalledWith(mockTx, RESERVA_ID_MP2, ctx);
    });

    it('não chama libertarStock se estava em PLANEADA (sem reservas)', async () => {
      mockTx = buildMockTx({
        ordemStatus: 'PLANEADA',
        ordemConsumosParaConcluir: [],
      });
      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'CANCELADA', spyStock, ctx);
      expect(spyStock.libertarStock).not.toHaveBeenCalled();
    });
  });

  describe('invariante: sequência de chamadas stock preserva atomicidade', () => {
    it('LIBERADA: reservarStock antes de consumoProducao.create', async () => {
      const callOrder: string[] = [];
      mockTx = buildMockTx({ ordemStatus: 'PLANEADA' });

      const txAny = mockTx as unknown as {
        consumoProducao: { create: (...a: unknown[]) => unknown };
      };
      const originalCreate = txAny.consumoProducao.create.bind(txAny.consumoProducao);
      txAny.consumoProducao.create = vi.fn().mockImplementation((...args: unknown[]) => {
        callOrder.push('consumoProducao.create');
        return originalCreate(...args);
      });

      const originalReservar = spyStock.reservarStock.bind(spyStock);
      spyStock.reservarStock = vi.fn().mockImplementation(async (...args: unknown[]) => {
        callOrder.push('reservarStock');
        return (originalReservar as (...a: unknown[]) => Promise<unknown>)(...args);
      }) as typeof spyStock.reservarStock;

      await OrdemProducaoService.transitarStatus(mockTx, ORDEM_ID, 'LIBERADA', spyStock, ctx);

      // Para cada componente: reservarStock DEVE preceder consumoProducao.create
      const reservarIdxs = callOrder.reduce<number[]>((acc, v, i) => (v === 'reservarStock' ? [...acc, i] : acc), []);
      const createIdxs = callOrder.reduce<number[]>((acc, v, i) => (v === 'consumoProducao.create' ? [...acc, i] : acc), []);
      expect(reservarIdxs.length).toBe(2);
      expect(createIdxs.length).toBe(2);
      // Cada reserva deve preceder o correspondente create
      reservarIdxs.forEach((rIdx, i) => {
        expect(rIdx).toBeLessThan(createIdxs[i]!);
      });
    });
  });
});
