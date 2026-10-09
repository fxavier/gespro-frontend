/**
 * Oráculo da issue #144 (lado do serviço) — as mensagens de recusa do apuramento de IVA
 * apontam o passo que resolve, e nunca um que não resolve. Os CÓDIGOS não mudam.
 *
 * Contrato (decisão do orquestrador, D:mensagens-recusa-144):
 *  - DOCUMENTO_SEM_LANCAMENTO: o lançamento de um documento fiscal nasce na emissão e só
 *    a emissão o liga ao documento (`Fatura.lancamentoId`). Um lançamento manual NÃO fica
 *    ligado e não levanta a recusa — a mensagem não o pode sugerir («Gere/Registe os
 *    lançamentos em falta», «Contabilidade → Lançamentos») e tem de o dizer. Não há no
 *    produto acção do utilizador que crie a ligação: o passo certo é o suporte (opção
 *    conservadora — sem endpoint novo). Continua a identificar os documentos.
 *  - PRORATA_NAO_SUPORTADO: a recusa é incondicional enquanto houver as operações; lançar
 *    regularizações (44341/44342/44343) não a levanta — a mensagem não o pode sugerir.
 *    Mantém o pro rata, as operações isentas e o contabilista.
 *
 * Prisma mockado, no molde de `apuramento-iva-preconditions.test.ts`.
 * Escrito pelo verificador; um agente de implementação que o altere é BLOCKER.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  apuramentoFindFirst: vi.fn(),
  lancamentoCount: vi.fn(),
  faturaFindMany: vi.fn(),
  notaCreditoFindMany: vi.fn(),
  notaDebitoFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prismaBase: { $transaction: mocks.transaction },
  prisma: { $transaction: mocks.transaction },
}));

vi.mock('@/server/observability/context', () => ({
  getRequestContext: vi.fn(() => ({ requestId: 'req-test-144' })),
}));

vi.mock('../contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn(),
  estornarLancamentoEmTx: vi.fn(),
  FILTRO_LANCAMENTO_MAPA: { in: ['LANCADO', 'ESTORNADO'] },
}));

import { apurarIva } from '../apuramento-iva.service';

const CTX = { tenantId: 'tenant-144', userId: 'user-144' };
const PERIODO = {
  id: 'per-144',
  codigo: '2026-06',
  estado: 'ABERTO',
  ordem: 6,
  dataInicio: new Date('2026-05-31T22:00:00Z'),
  dataFim: new Date('2026-06-30T21:59:59.999Z'),
};

function docs(n: number, prefixo: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixo}-${i + 1}`,
    numero: `${prefixo.toUpperCase()}/2026/00000${i + 1}`,
    dataEmissao: new Date('2026-06-15T10:00:00Z'),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  const tx = {
    apuramentoIva: { findFirst: mocks.apuramentoFindFirst },
    lancamento: { count: mocks.lancamentoCount },
    fatura: { findMany: mocks.faturaFindMany },
    notaCredito: { findMany: mocks.notaCreditoFindMany },
    notaDebito: { findMany: mocks.notaDebitoFindMany },
    $queryRaw: mocks.queryRaw,
  };
  mocks.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
  mocks.queryRaw.mockResolvedValue([PERIODO]);
  mocks.apuramentoFindFirst.mockResolvedValue(null);
  mocks.lancamentoCount.mockResolvedValue(0);
  mocks.faturaFindMany.mockResolvedValue([]);
  mocks.notaCreditoFindMany.mockResolvedValue([]);
  mocks.notaDebitoFindMany.mockResolvedValue([]);
});

async function recusa(): Promise<{ code?: string; message: string; details?: unknown }> {
  try {
    await apurarIva({ periodoId: PERIODO.id }, CTX);
  } catch (e) {
    return e as { code?: string; message: string; details?: unknown };
  }
  throw new Error('o apuramento devia ter sido recusado');
}

// Frases que mandam fazer o que não resolve.
const SUGERE_LANCAR_EM_FALTA = /\b(registe|gere|lance|crie|registar|gerar|lançar|criar)\b[^.]*lançamentos?\s+em\s+falta/i;
const APONTA_ECRA_LANCAMENTOS = /Contabilidade\s*[→›>]\s*Lançamentos/i;
const DIZ_QUE_MANUAL_NAO_RESOLVE = /lançamentos?\s+manua(l|is)[^.]*\bnão\b|\bnão\b[^.]*lançamentos?\s+manua(l|is)/i;
const SUGERE_REGULARIZAR = /\b(lance|lançar|registe|registar|faça|fazer|efectue|efetue)\b[^.]*regulariza/i;

describe('#144 — DOCUMENTO_SEM_LANCAMENTO no apuramento', () => {
  beforeEach(() => {
    mocks.faturaFindMany.mockResolvedValueOnce(docs(2, 'fat'));
    mocks.notaCreditoFindMany.mockResolvedValueOnce(docs(1, 'nc'));
  });

  it('mantém o código, os números e os documentos no details', async () => {
    const e = await recusa();
    expect(e.code).toBe('DOCUMENTO_SEM_LANCAMENTO');
    expect(e.message).toContain('FAT/2026/000001');
    expect(e.message).toContain('NC/2026/000001');
    expect((e.details as { documentos: unknown[] }).documentos).toHaveLength(3);
  });

  it('não manda gerar/registar os lançamentos em falta nem aponta o ecrã de Lançamentos', async () => {
    const e = await recusa();
    expect(e.message).not.toMatch(SUGERE_LANCAR_EM_FALTA);
    expect(e.message).not.toMatch(APONTA_ECRA_LANCAMENTOS);
  });

  it('diz que um lançamento manual não resolve e aponta o suporte', async () => {
    const e = await recusa();
    expect(e.message).toMatch(DIZ_QUE_MANUAL_NAO_RESOLVE);
    expect(e.message).toMatch(/suporte/i);
  });
});

describe('#144 — PRORATA_NAO_SUPORTADO no apuramento', () => {
  beforeEach(() => {
    mocks.queryRaw
      .mockResolvedValueOnce([PERIODO]) // FOR UPDATE
      .mockResolvedValueOnce([{ existe: true }]) // saídas a 0 % / 5 %
      .mockResolvedValueOnce([{ existe: false }]); // ContaPagar
  });

  it('mantém o código e diz porquê (pro rata, operações isentas) e a quem recorrer', async () => {
    const e = await recusa();
    expect(e.code).toBe('PRORATA_NAO_SUPORTADO');
    expect(e.message).toMatch(/pro\s?rata/i);
    expect(e.message).toMatch(/isent/i);
    expect(e.message).toMatch(/contabilista/i);
  });

  it('não sugere lançar regularizações (não levantam a recusa)', async () => {
    const e = await recusa();
    expect(e.message).not.toMatch(SUGERE_REGULARIZAR);
    expect(e.message).not.toMatch(/4434[123]/);
  });
});
