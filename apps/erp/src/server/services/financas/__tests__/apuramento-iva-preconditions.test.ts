/**
 * Testes das pré-condições §4 do ADR-0034.
 *
 * Cada teste prova que o serviço lança `BusinessRuleError` com o código
 * correcto quando a condição de recusa está presente. São testes de serviço
 * com a camada de BD mockada (o mesmo padrão de periodo-contabil.test.ts).
 *
 * Os quatro códigos:
 *  - PERIODO_JA_APURADO          — já existe apuramento APURADO/DECLARADO
 *  - PERIODO_COM_RASCUNHOS       — lançamentos em RASCUNHO no período
 *  - DOCUMENTO_SEM_LANCAMENTO    — faturas/NC/ND sem lancamentoId
 *  - PRORATA_NAO_SUPORTADO       — taxa não-standard (ex.: 5%) → recusa, não avisa
 *
 * O teste PRORATA é o mais consequente: «O número sai do produto, entra numa
 * declaração assinada pelo contribuinte e é entregue à AT. Um aviso que se
 * fecha não é defesa.»
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction:         vi.fn(),
  apuramentoFindFirst: vi.fn(),
  lancamentoCount:     vi.fn(),
  faturaFindMany:      vi.fn(),
  notaCreditoFindMany: vi.fn(),
  notaDebitoFindMany:  vi.fn(),
  queryRaw:            vi.fn(),
  getRequestContext:   vi.fn(() => ({ requestId: 'req-test-123' })),
}));

// Mocked DB client
vi.mock('@/server/db/client', () => {
  const tx = {
    apuramentoIva:       { findFirst: mocks.apuramentoFindFirst },
    lancamento:          { count: mocks.lancamentoCount },
    fatura:              { findMany: mocks.faturaFindMany },
    notaCredito:         { findMany: mocks.notaCreditoFindMany },
    notaDebito:          { findMany: mocks.notaDebitoFindMany },
    $queryRaw:           mocks.queryRaw,
  };
  return {
    prismaBase: { $transaction: mocks.transaction },
    prisma:     { $transaction: mocks.transaction },
  };
});

vi.mock('@/server/observability/context', () => ({
  getRequestContext: mocks.getRequestContext,
}));

// Mocked contabilidade service (não testamos o lançamento aqui)
vi.mock('../contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn(),
  estornarLancamento:               vi.fn(),
  FILTRO_LANCAMENTO_MAPA:           { in: ['LANCADO', 'ESTORNADO'] },
}));

import { apurarIva } from '../apuramento-iva.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX = { tenantId: 'tenant-t', userId: 'user-t' };
const INPUT = { periodoId: 'per-1' };

// Período em 2026-06 → sujeito à Lei 10/2025 (PERIODO_LEI_10_2025 = '2026-01')
const PERIODO_2026 = {
  id: 'per-1',
  codigo: '2026-06',
  estado: 'ABERTO',
  dataInicio: new Date('2026-06-01T00:00:00Z'),
  dataFim:    new Date('2026-06-30T23:59:59Z'),
};

/** n documentos sem lançamento, no formato que o serviço selecciona. */
function semLancamento(n: number, prefixo: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixo}-${i + 1}`,
    numero: `${prefixo.toUpperCase()}/2026/00000${i + 1}`,
    dataEmissao: new Date('2026-06-15T00:00:00Z'),
  }));
}

/**
 * Configura `mocks.transaction` para chamar o callback com `tx` e devolve `tx`
 * para que cada teste o possa sobrepor parcialmente.
 */
function setupTx(overrides: Record<string, unknown> = {}) {
  const tx = {
    apuramentoIva:    { findFirst: mocks.apuramentoFindFirst },
    lancamento:       { count: mocks.lancamentoCount },
    fatura:           { findMany: mocks.faturaFindMany },
    notaCredito:      { findMany: mocks.notaCreditoFindMany },
    notaDebito:       { findMany: mocks.notaDebitoFindMany },
    $queryRaw:        mocks.queryRaw,
    ...overrides,
  };
  mocks.transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults seguros: período encontrado, sem impedimentos
  mocks.queryRaw.mockResolvedValue([PERIODO_2026]);   // FOR UPDATE
  mocks.apuramentoFindFirst.mockResolvedValue(null);  // sem apuramento anterior
  mocks.lancamentoCount.mockResolvedValue(0);
  mocks.faturaFindMany.mockResolvedValue([]);
  mocks.notaCreditoFindMany.mockResolvedValue([]);
  mocks.notaDebitoFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// §4 — PERIODO_JA_APURADO
// ---------------------------------------------------------------------------

describe('§4 — PERIODO_JA_APURADO', () => {
  it('lança quando já existe apuramento APURADO no período', async () => {
    setupTx();
    // Passo 1 (FOR UPDATE): retorna período
    mocks.queryRaw.mockResolvedValueOnce([PERIODO_2026]);
    // Passo 2 (jaApurado): apuramento activo encontrado
    mocks.apuramentoFindFirst.mockResolvedValueOnce({ id: 'apr-1', versao: 1 });

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'PERIODO_JA_APURADO',
    });
  });

  it('lança quando já existe apuramento DECLARADO no período', async () => {
    setupTx();
    mocks.queryRaw.mockResolvedValueOnce([PERIODO_2026]);
    mocks.apuramentoFindFirst.mockResolvedValueOnce({ id: 'apr-2', versao: 2, estado: 'DECLARADO' });

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'PERIODO_JA_APURADO',
    });
  });
});

// ---------------------------------------------------------------------------
// §4 — PERIODO_COM_RASCUNHOS
// ---------------------------------------------------------------------------

describe('§4 — PERIODO_COM_RASCUNHOS', () => {
  it('lança quando há lançamentos RASCUNHO no período', async () => {
    setupTx();
    mocks.queryRaw.mockResolvedValueOnce([PERIODO_2026]);
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);   // sem apuramento anterior
    mocks.lancamentoCount.mockResolvedValueOnce(3);          // 3 rascunhos

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'PERIODO_COM_RASCUNHOS',
    });
  });

  it('não lança quando todos os lançamentos estão LANCADOS', async () => {
    // Precisa chegar à próxima pré-condição sem lançar PERIODO_COM_RASCUNHOS.
    // A próxima pré-condição (DOCUMENTO_SEM_LANCAMENTO) lançará com 1 fatura sem lançamento.
    setupTx();
    mocks.queryRaw.mockResolvedValueOnce([PERIODO_2026]);
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);    // zero rascunhos → não lança
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(1, 'fat'));        // 1 fatura sem lançamento → lança a seguir

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'DOCUMENTO_SEM_LANCAMENTO',  // prova que passou PERIODO_COM_RASCUNHOS
    });
  });
});

// ---------------------------------------------------------------------------
// §4 — DOCUMENTO_SEM_LANCAMENTO
// ---------------------------------------------------------------------------

describe('§4 — DOCUMENTO_SEM_LANCAMENTO', () => {
  it('lança quando há factura emitida sem lancamentoId', async () => {
    setupTx();
    mocks.queryRaw.mockResolvedValueOnce([PERIODO_2026]);
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(2, 'fat'));   // 2 faturas sem lançamento
    mocks.notaCreditoFindMany.mockResolvedValueOnce(semLancamento(1, 'nc'));
    mocks.notaDebitoFindMany.mockResolvedValueOnce(semLancamento(0, 'nd'));

    // A recusa identifica QUAIS são os documentos — sem isso o utilizador tem
    // de os procurar à mão num período inteiro.
    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'DOCUMENTO_SEM_LANCAMENTO',
      message: expect.stringContaining('FAT/2026/000001'),
      details: {
        documentos: [
          { tipo: 'FATURA', id: 'fat-1', numero: 'FAT/2026/000001' },
          { tipo: 'FATURA', id: 'fat-2', numero: 'FAT/2026/000002' },
          { tipo: 'NOTA_CREDITO', id: 'nc-1', numero: 'NC/2026/000001' },
        ],
      },
    });
  });

  it('lança quando há nota de crédito emitida sem lancamentoId', async () => {
    setupTx();
    mocks.queryRaw.mockResolvedValueOnce([PERIODO_2026]);
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(0, 'fat'));
    mocks.notaCreditoFindMany.mockResolvedValueOnce(semLancamento(1, 'nc'));
    mocks.notaDebitoFindMany.mockResolvedValueOnce(semLancamento(0, 'nd'));

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'DOCUMENTO_SEM_LANCAMENTO',
    });
  });

  it('não lança quando todos os documentos têm lancamentoId', async () => {
    // Sem docs sem lançamento → chega à verificação PRORATA (próxima pré-condição).
    // O $queryRaw do PRORATA devolvendo `existe: true` fará lançar PRORATA_NAO_SUPORTADO.
    setupTx();
    mocks.queryRaw
      .mockResolvedValueOnce([PERIODO_2026])           // FOR UPDATE
      .mockResolvedValueOnce([{ existe: true }])       // PRORATA — LinhaFatura com taxa 5%
      .mockResolvedValueOnce([{ existe: false }]);     // PRORATA — ContaPagar
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(0, 'fat'));
    mocks.notaCreditoFindMany.mockResolvedValueOnce(semLancamento(0, 'nc'));
    mocks.notaDebitoFindMany.mockResolvedValueOnce(semLancamento(0, 'nd'));

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'PRORATA_NAO_SUPORTADO',  // prova que passou DOCUMENTO_SEM_LANCAMENTO
    });
  });
});

// ---------------------------------------------------------------------------
// §4 — PRORATA_NAO_SUPORTADO (o mais consequente — ADR-0034 §4 ¶3)
// ---------------------------------------------------------------------------

describe('§4 — PRORATA_NAO_SUPORTADO', () => {
  it('lança quando LinhaFatura tem taxa 5 % (taxa não-standard)', async () => {
    // Este é o teste mais importante do §4:
    // «O número sai do produto, entra numa declaração assinada pelo
    //  contribuinte e é entregue à AT. Um aviso que se fecha não é defesa.»
    setupTx();
    mocks.queryRaw
      .mockResolvedValueOnce([PERIODO_2026])         // FOR UPDATE
      .mockResolvedValueOnce([{ existe: true }])     // LinhaFatura taxa 5% existe
      .mockResolvedValueOnce([{ existe: false }]);   // ContaPagar taxa normal
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(0, 'fat'));
    mocks.notaCreditoFindMany.mockResolvedValueOnce(semLancamento(0, 'nc'));
    mocks.notaDebitoFindMany.mockResolvedValueOnce(semLancamento(0, 'nd'));

    const promise = apurarIva(INPUT, CTX);

    // Lança (não avisa): a recusa é a defesa
    await expect(promise).rejects.toMatchObject({ code: 'PRORATA_NAO_SUPORTADO' });
  });

  it('lança quando ContaPagar tem taxa reduzida em compras', async () => {
    setupTx();
    mocks.queryRaw
      .mockResolvedValueOnce([PERIODO_2026])
      .mockResolvedValueOnce([{ existe: false }])    // LinhaFatura ok
      .mockResolvedValueOnce([{ existe: true }]);    // ContaPagar com taxa 5%
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(0, 'fat'));
    mocks.notaCreditoFindMany.mockResolvedValueOnce(semLancamento(0, 'nc'));
    mocks.notaDebitoFindMany.mockResolvedValueOnce(semLancamento(0, 'nd'));

    await expect(apurarIva(INPUT, CTX)).rejects.toMatchObject({
      code: 'PRORATA_NAO_SUPORTADO',
    });
  });

  it('não lança para período anterior a 2026-01 (lei não vigente)', async () => {
    // Período 2025-12: a Lei 10/2025 ainda não era vigente.
    // Mesmo com taxa não-standard, o código não verifica pro rata.
    // A pré-condição seguinte (agregação de saldos) lançará algo.
    const periodo2025 = {
      ...PERIODO_2026,
      codigo: '2025-12',
      dataInicio: new Date('2025-12-01T00:00:00Z'),
      dataFim:    new Date('2025-12-31T23:59:59Z'),
    };
    setupTx();
    mocks.queryRaw
      .mockResolvedValueOnce([periodo2025])          // FOR UPDATE
      // A verificação PRORATA não corre para períodos < 2026-01
      // O serviço prossegue para a agregação — o groupBy falhará sem mock,
      // o que é o comportamento esperado (não é PRORATA_NAO_SUPORTADO)
      .mockRejectedValueOnce(new Error('groupBy não mockado')); // aggregação
    mocks.apuramentoFindFirst.mockResolvedValueOnce(null);
    mocks.lancamentoCount.mockResolvedValueOnce(0);
    mocks.faturaFindMany.mockResolvedValueOnce(semLancamento(0, 'fat'));
    mocks.notaCreditoFindMany.mockResolvedValueOnce(semLancamento(0, 'nc'));
    mocks.notaDebitoFindMany.mockResolvedValueOnce(semLancamento(0, 'nd'));

    await expect(apurarIva({ periodoId: 'per-1' }, CTX)).rejects.not.toMatchObject({
      code: 'PRORATA_NAO_SUPORTADO',
    });
  });
});
