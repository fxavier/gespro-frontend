/**
 * Travão do ADR-0031 — emitir documento fiscal exige e-mail confirmado
 * (spec 21, tarefas 5.1 e 5.4).
 *
 * A transição é testada nos DOIS sentidos, como manda o `estado-com-escritor`:
 * recusa com o endereço por confirmar, passagem depois de confirmado. Um
 * travão que nunca levanta é tão defeito como um que nunca desce.
 *
 * Além da recusa, prova-se aqui o que é fácil escapar:
 *  - que a recusa acontece ANTES de qualquer escrita (o `$transaction` nem
 *    chega a ser aberto) — um travão que recusa depois de gravar não é travão;
 *  - que as portas de emissão são as QUATRO, incluindo a conversão de proforma,
 *    que cria uma Factura já EMITIDA sem passar por `emitirFatura`;
 *  - que o que NÃO é documento fiscal continua a passar com o endereço por
 *    confirmar (proforma e cotação) — o spec trava dois actos, não o produto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  $transaction: vi.fn(),
  registarLancamento: vi.fn(async () => ({ id: 'lanc-1' })),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: mocks.registarLancamento,
}));
vi.mock('@/server/db/client', () => ({
  prisma: {},
  prismaBase: { $transaction: mocks.$transaction },
}));

import {
  emitirFatura,
  emitirNotaCredito,
  emitirNotaDebito,
  converterProformaEmFatura,
  criarProforma,
} from '../faturacao.service';
import {
  EmitirFaturaSchema,
  EmitirNotaCreditoSchema,
  EmitirNotaDebitoSchema,
  CriarProformaSchema,
} from '@/lib/validations/faturacao';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };
const CODIGO = 'EMAIL_POR_CONFIRMAR_EMISSAO';

const ID = 'ckxyz00000000000000000001';

/** Sessão com o endereço confirmado / por confirmar / inexistente. */
function comSessao(emailVerificado: boolean | undefined) {
  mocks.auth.mockResolvedValue({
    user: { id: 'user-1', tenantId: 'tenant-1', permissions: [], emailVerificado },
  });
}
function semSessao() {
  mocks.auth.mockResolvedValue(null);
}

const LINHA = { descricao: 'Serviço', quantidade: 1, precoUnitario: 100, desconto: 0, taxaIva: 0.16, ordemLinha: 0 };

const SERIE = { id: ID, tipo: 'FATURA', prefixo: 'FT', ano: 2026, formatoNumero: '{prefixo}/{ano}/{numero:6}' };

/** `tx` com o mínimo que cada caminho feliz precisa de encontrar. */
function novaTx() {
  const doc = (id: string) => async () => ({ id, numero: 'FT/2026/000001', status: 'EMITIDA', linhas: [] });
  return {
    $queryRaw: vi.fn(async () => [{ numero: 1, prefixo: 'FT', ano: 2026, formatoNumero: SERIE.formatoNumero }]),
    serieDocumento: { findFirst: vi.fn(async () => SERIE) },
    cliente: { findFirst: vi.fn(async () => ({ id: 'cli-1' })) },
    venda: { findFirst: vi.fn(async () => ({ id: 'ven-1' })) },
    fatura: {
      create: vi.fn(doc('fat-1')),
      findFirst: vi.fn(doc('fat-1')),
    },
    linhaFatura: { create: vi.fn(async () => ({ id: 'lf-1' })) },
    notaCredito: { create: vi.fn(doc('nc-1')), findFirst: vi.fn(doc('nc-1')) },
    linhaNotaCredito: { create: vi.fn(async () => ({ id: 'lnc-1' })) },
    notaDebito: { create: vi.fn(doc('nd-1')), findFirst: vi.fn(doc('nd-1')) },
    linhaNotaDebito: { create: vi.fn(async () => ({ id: 'lnd-1' })) },
    proforma: {
      create: vi.fn(doc('pf-1')),
      findFirst: vi.fn(async () => ({
        id: 'pf-1',
        status: 'ACEITE', // única origem válida para CONVERTIDA
        clienteId: 'cli-1',
        moeda: 'MZN',
        subtotal: new Prisma.Decimal(100),
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal: new Prisma.Decimal(16),
        total: new Prisma.Decimal(116),
        linhas: [],
      })),
      update: vi.fn(async () => ({ id: 'pf-1' })),
    },
    linhaProforma: { create: vi.fn(async () => ({ id: 'lpf-1' })) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const tx = novaTx();
  mocks.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

// ---------------------------------------------------------------------------
// Entradas válidas (construídas pelo próprio schema, para não divergirem dele)
// ---------------------------------------------------------------------------

const FATURA = EmitirFaturaSchema.parse({
  serieDocumentoId: ID,
  clienteId: 'cli-1',
  dataEmissao: new Date('2026-09-01'),
  dataVencimento: new Date('2026-10-01'),
  linhas: [LINHA],
});
const NOTA_CREDITO = EmitirNotaCreditoSchema.parse({
  serieDocumentoId: ID,
  faturaOriginalId: ID,
  motivo: 'Devolução',
  dataEmissao: new Date('2026-09-01'),
  linhas: [LINHA],
});
const NOTA_DEBITO = EmitirNotaDebitoSchema.parse({
  serieDocumentoId: ID,
  clienteId: 'cli-1',
  motivo: 'Juros de mora',
  dataEmissao: new Date('2026-09-01'),
  linhas: [LINHA],
});
const PROFORMA = CriarProformaSchema.parse({
  serieDocumentoId: ID,
  clienteId: 'cli-1',
  dataEmissao: new Date('2026-09-01'),
  dataValidade: new Date('2026-09-30'),
  linhas: [LINHA],
});

/** As quatro portas por onde sai um documento fiscal. */
const PORTAS: Array<[string, () => Promise<unknown>]> = [
  ['emitirFatura', () => emitirFatura(FATURA, CTX)],
  ['emitirNotaCredito', () => emitirNotaCredito(NOTA_CREDITO, CTX)],
  ['emitirNotaDebito', () => emitirNotaDebito(NOTA_DEBITO, CTX)],
  ['converterProformaEmFatura', () => converterProformaEmFatura('pf-1', ID, CTX)],
];

// ---------------------------------------------------------------------------
// Sentido 1 — por confirmar: recusa, e recusa antes de escrever
// ---------------------------------------------------------------------------

describe('emissão de documento fiscal com o endereço POR CONFIRMAR', () => {
  it.each(PORTAS)('%s é recusada com o código estável', async (_nome, chamar) => {
    comSessao(false);
    await expect(chamar()).rejects.toMatchObject({ code: CODIGO, status: 409 });
  });

  it.each(PORTAS)('%s nem chega a abrir transacção', async (_nome, chamar) => {
    comSessao(false);
    await expect(chamar()).rejects.toThrow();
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('sessão inexistente conta como por confirmar (fail-closed)', async () => {
    semSessao();
    await expect(emitirFatura(FATURA, CTX)).rejects.toMatchObject({ code: CODIGO });
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('claim ausente conta como por confirmar (fail-closed) — JWT anterior ao ADR-0031', async () => {
    comSessao(undefined);
    await expect(emitirFatura(FATURA, CTX)).rejects.toMatchObject({ code: CODIGO });
  });

  it('um valor que não seja `true` não levanta o travão', async () => {
    mocks.auth.mockResolvedValue({ user: { emailVerificado: 'sim' as unknown as boolean } });
    await expect(emitirFatura(FATURA, CTX)).rejects.toMatchObject({ code: CODIGO });
  });
});

// ---------------------------------------------------------------------------
// A mensagem — nomeia a causa, o caminho, e não mente a quem acabou de confirmar
// ---------------------------------------------------------------------------

describe('mensagem da recusa', () => {
  it('nomeia a causa e o caminho para a resolver', async () => {
    comSessao(false);
    const erro = await emitirFatura(FATURA, CTX).catch((e: Error) => e);
    const msg = (erro as Error).message;
    expect(msg).toMatch(/confirmar o endereço de e-mail/i);
    expect(msg).toMatch(/liga(ção|cao) de confirma/i);
    expect(msg).toMatch(/reenvia/i);
  });

  it('não afirma nada de falso a quem confirmou há pouco: nomeia a janela e a saída', async () => {
    comSessao(false);
    const erro = await emitirFatura(FATURA, CTX).catch((e: Error) => e);
    const msg = (erro as Error).message;
    // A sessão só relê o estado na re-resolução seguinte (ADR-0011). Sem esta
    // frase, a mensagem estaria a dizer a essa pessoa uma coisa que é falsa.
    expect(msg).toMatch(/15/);
    expect(msg).toMatch(/iniciar sess(ã|a)o outra vez/i);
  });
});

// ---------------------------------------------------------------------------
// Sentido 2 — confirmado: passa
// ---------------------------------------------------------------------------

describe('emissão de documento fiscal com o endereço CONFIRMADO', () => {
  it.each(PORTAS)('%s passa e escreve', async (_nome, chamar) => {
    comSessao(true);
    await expect(chamar()).resolves.toBeTruthy();
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// O que NÃO é documento fiscal continua a passar por confirmar
// ---------------------------------------------------------------------------

describe('o travão não alastra ao que não é documento fiscal', () => {
  it('criar proforma passa com o endereço por confirmar', async () => {
    comSessao(false);
    await expect(criarProforma(PROFORMA, CTX)).resolves.toBeTruthy();
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });
});
