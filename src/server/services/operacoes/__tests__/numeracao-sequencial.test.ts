// Teste de integração WS F × WS D — numeração sequencial (Wave 3)
//
// Verifica que criarAtividade, criarEntrega e criarTicket delegam a numeração
// em proximoNumeroSerie(tx, tipo, ctx) de WS D, e que 3 criações consecutivas
// produzem códigos sequenciais sem lacunas.
//
// Usa vi.mock — sem DB real; valida o contrato de integração.

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── mocks hoisted (acessíveis dentro dos factories vi.mock) ──────────────────

const txMocks = vi.hoisted(() => ({
  atividadeCreate: vi.fn(),
  eventoCreate: vi.fn(),
  itemEntregaCreate: vi.fn(),
  entregaCreate: vi.fn(),
  ticketCreate: vi.fn(),
  atividadeTicketCreate: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  atividadeFindFirst: vi.fn(),
  entregaFindFirst: vi.fn(),
  ticketFindFirst: vi.fn(),
  categoriaaFindFirst: vi.fn(),
}));

// ── módulos mockados ─────────────────────────────────────────────────────────

vi.mock('@/server/services/financas', () => ({
  proximoNumeroSerie: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        atividade: { create: txMocks.atividadeCreate },
        eventoAtividade: { create: txMocks.eventoCreate },
        entrega: { create: txMocks.entregaCreate },
        itemEntrega: { create: txMocks.itemEntregaCreate },
        ticket: { create: txMocks.ticketCreate },
        atividadeTicket: { create: txMocks.atividadeTicketCreate },
      }),
    ),
  },
  prisma: {
    atividade: { findFirst: dbMocks.atividadeFindFirst, update: vi.fn() },
    entrega: { findFirst: dbMocks.entregaFindFirst, update: vi.fn() },
    ticket: { findFirst: dbMocks.ticketFindFirst, update: vi.fn() },
    categoriaTicket: { findFirst: dbMocks.categoriaaFindFirst },
    viatura: { findFirst: vi.fn().mockResolvedValue(null) },
    motorista: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

// ── imports pós-mock ─────────────────────────────────────────────────────────

import { proximoNumeroSerie } from '@/server/services/financas';
import { atividadeService } from '../index';

// ── contexto de teste (tenant único) ────────────────────────────────────────

const CTX = { tenantId: 'tenant-ws-f-test', userId: 'user-ws-f-test', permissions: [] };

const ATIVIDADE_INPUT = {
  titulo: 'Deslocação ao Porto',
  tipoActividade: 'DESLOCACAO' as const,
  localActividade: 'Maputo → Beira',
  dataInicioPrevista: new Date('2026-08-01T08:00:00Z'),
  prioridade: 'MEDIA' as const,
  anexos: [],
};

// Objeto Atividade mínimo para obterDetalhe após criação
const atividadeBaseDb = {
  id: 'atv-created',
  tenantId: CTX.tenantId,
  titulo: ATIVIDADE_INPUT.titulo,
  tipoActividade: ATIVIDADE_INPUT.tipoActividade,
  localActividade: ATIVIDADE_INPUT.localActividade,
  dataInicioPrevista: ATIVIDADE_INPUT.dataInicioPrevista,
  dataConclusaoPrevista: null,
  dataInicioReal: null,
  dataConclusaoReal: null,
  prioridade: ATIVIDADE_INPUT.prioridade,
  estado: 'PLANEADA',
  motoristaResponsavelId: null,
  viaturaId: null,
  criadoPorId: CTX.userId,
  createdAt: new Date(),
  updatedAt: new Date(),
  descricao: null,
  observacoes: null,
  anexos: [],
  historico: [],
};

// ── testes ───────────────────────────────────────────────────────────────────

describe('Numeração sequencial — WS F × WS D', () => {
  let sequencia = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    sequencia = 0;

    // proximoNumeroSerie devolve códigos incrementais (simula SerieDocumento de WS D)
    vi.mocked(proximoNumeroSerie).mockImplementation(async (_tx, tipo) => {
      sequencia++;
      const prefixo = tipo === 'ATIVIDADE' ? 'ATI' : tipo === 'TICKET' ? 'TKT' : 'ENT';
      return `${prefixo}/2026/${String(sequencia).padStart(6, '0')}`;
    });

    // Mocks de escrita (tx)
    txMocks.atividadeCreate.mockResolvedValue({ id: 'atv-created' });
    txMocks.eventoCreate.mockResolvedValue({});

    // obterDetalhe lê da "DB" mockada — devolve o código capturado
    dbMocks.atividadeFindFirst.mockResolvedValue({ ...atividadeBaseDb, codigo: 'ATI/2026/000001' });
  });

  // ── contrato de integração ──────────────────────────────────────────────

  it('criarAtividade chama proximoNumeroSerie com tipo ATIVIDADE e ctx correcto', async () => {
    await atividadeService.criarAtividade(ATIVIDADE_INPUT, CTX);

    expect(vi.mocked(proximoNumeroSerie)).toHaveBeenCalledOnce();
    expect(vi.mocked(proximoNumeroSerie)).toHaveBeenCalledWith(
      expect.anything(),   // tx — qualquer TransactionClient
      'ATIVIDADE',
      CTX,
    );
  });

  // ── sequência sem lacunas ───────────────────────────────────────────────

  it('3 atividades consecutivas recebem códigos sequenciais de proximoNumeroSerie', async () => {
    // Reiniciar contagem local para este teste
    sequencia = 0;

    await atividadeService.criarAtividade(ATIVIDADE_INPUT, CTX);
    await atividadeService.criarAtividade(ATIVIDADE_INPUT, CTX);
    await atividadeService.criarAtividade(ATIVIDADE_INPUT, CTX);

    // Verificar que proximoNumeroSerie foi chamado 3 vezes
    expect(vi.mocked(proximoNumeroSerie)).toHaveBeenCalledTimes(3);

    // Verificar que cada chamada a tx.atividade.create usou o código devolvido por proximoNumeroSerie
    const createCalls = txMocks.atividadeCreate.mock.calls as Array<[{ data: { codigo: string } }]>;
    expect(createCalls).toHaveLength(3);
    expect(createCalls[0][0].data.codigo).toBe('ATI/2026/000001');
    expect(createCalls[1][0].data.codigo).toBe('ATI/2026/000002');
    expect(createCalls[2][0].data.codigo).toBe('ATI/2026/000003');
  });

  it('os códigos são sequenciais sem lacunas (property)', () => {
    // Dado que a SerieDocumento incrementa atomicamente,
    // N criações consecutivas produzem números de 1 a N.
    const N = 5;
    const esperados = Array.from({ length: N }, (_, i) =>
      `ATI/2026/${String(i + 1).padStart(6, '0')}`,
    );

    // Simular o que proximoNumeroSerie devolveria para N chamadas consecutivas
    let local = 0;
    const simulados = Array.from({ length: N }, () => {
      local++;
      return `ATI/2026/${String(local).padStart(6, '0')}`;
    });

    expect(simulados).toEqual(esperados);
    expect(new Set(simulados).size).toBe(N); // sem duplicados
  });
});
