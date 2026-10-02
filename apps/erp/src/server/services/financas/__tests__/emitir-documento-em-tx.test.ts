/**
 * Oráculo S1 — o travão de e-mail confirmado fica FORA do núcleo (ADR-0041 §3; issue #305).
 *
 * - `emitirDocumentoEmTx` e `emitirNotaCreditoEmTx` não consultam a sessão: chamados sem
 *   sessão nenhuma, emitem (o POS aplica o travão na abertura da sessão, ADR-0041 §6).
 * - `emitirFatura`, `emitirNotaCredito` e `converterProformaEmFatura` — quem tem sessão —
 *   continuam a recusar com EMAIL_POR_CONFIRMAR_EMISSAO, antes de escrever o que quer que seja.
 *
 * Molde: faturacao-iva-zero.test.ts — prisma mockado, `tx` que regista os `create`,
 * `registarLancamentoContabilistico` e `auth()` são duplos (a sessão é fronteira).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// `auth` é criado aqui e não na fábrica: `@/lib/auth` é importado dinamicamente pelo
// serviço e a fábrica só corre nessa altura.
const h = vi.hoisted(() => ({
  tx: null as any,
  registarLancamento: null as any,
  auth: vi.fn(async (): Promise<unknown> => null),
  transaction: null as any,
}));

vi.mock('@/lib/auth', () => ({ auth: h.auth }));

vi.mock('@/server/services/financas/contabilidade.service', () => {
  h.registarLancamento = vi.fn().mockResolvedValue({ id: 'lan-305' });
  return { registarLancamentoContabilistico: h.registarLancamento };
});

vi.mock('@/server/db/client', () => {
  h.transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(h.tx));
  return { prisma: { $transaction: h.transaction }, prismaBase: { $transaction: h.transaction } };
});

import * as fat from '../faturacao.service';
import { EmitirFaturaSchema, EmitirNotaCreditoSchema } from '@/lib/validations/faturacao';

const ctx = { tenantId: 'tenant-305', userId: 'user-305' };
const SERIE = 'cjld2cjxh0000qzrmn831i7rn';
const FATURA_ORIGINAL = 'cjld2cjxh0001qzrmn831i7ro';
const PROFORMA = 'cjld2cjxh0002qzrmn831i7rp';
const NUIT = '400000305';

/** tx com estado: cada create grava; findFirst do documento devolve-o com as linhas. */
function criarTx() {
  const criados: Record<string, any[]> = {};
  const modelo = (nome: string, extra: Record<string, unknown> = {}) => ({
    create: vi.fn(async ({ data }: any) => {
      const reg = { id: `${nome}-${(criados[nome]?.length ?? 0) + 1}`, ...data };
      (criados[nome] ??= []).push(reg);
      return reg;
    }),
    update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    ...extra,
  });
  const tx: any = {
    criados,
    $queryRaw: vi.fn(async () => [
      { id: SERIE, numero: 1, prefixo: 'DOC', ano: 2026, formatoNumero: '{prefixo}/{ano}/{numero:06}' },
    ]),
    $executeRaw: vi.fn(async () => 1),
    cliente: {
      findFirst: vi.fn(async () => ({ id: 'cli-305', nuit: NUIT })),
      findUnique: vi.fn(async () => ({ id: 'cli-305', nuit: NUIT })),
    },
    venda: { findFirst: vi.fn(async () => ({ id: 'ven-305' })) },
    fatura: modelo('fatura', {
      findFirst: vi.fn(async ({ where }: any) =>
        where.id === FATURA_ORIGINAL
          ? { id: FATURA_ORIGINAL, tenantId: ctx.tenantId, status: 'EMITIDA', clienteId: 'cli-305' }
          : { ...(criados.fatura ?? []).find((f) => f.id === where.id), linhas: criados.linhaFatura ?? [] },
      ),
    }),
    linhaFatura: modelo('linhaFatura'),
    notaCredito: modelo('notaCredito', {
      findFirst: vi.fn(async ({ where }: any) => ({
        ...(criados.notaCredito ?? []).find((n) => n.id === where.id),
        linhas: criados.linhaNotaCredito ?? [],
      })),
    }),
    linhaNotaCredito: modelo('linhaNotaCredito'),
    proforma: modelo('proforma', {
      findFirst: vi.fn(async () => ({
        id: PROFORMA,
        tenantId: ctx.tenantId,
        status: 'ACEITE',
        clienteId: 'cli-305',
        moeda: 'MZN',
        subtotal: new Prisma.Decimal('1000'),
        descontoTotal: new Prisma.Decimal('0'),
        ivaTotal: new Prisma.Decimal('160'),
        total: new Prisma.Decimal('1160'),
        linhas: [],
      })),
    }),
  };
  return tx;
}

const LINHA_16 = { descricao: 'Mercadoria', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 };

const inputFatura = () =>
  EmitirFaturaSchema.parse({
    clienteId: 'cli-305',
    dataEmissao: '2026-09-25',
    dataVencimento: '2026-10-25',
    linhas: [LINHA_16],
  });

const inputNC = () =>
  EmitirNotaCreditoSchema.parse({
    faturaOriginalId: FATURA_ORIGINAL,
    motivo: 'Devolução de balcão',
    dataEmissao: '2026-09-25',
    linhas: [LINHA_16],
  });

/** Nada foi escrito: nenhum create de documento nem lançamento. */
function nadaEscrito() {
  expect(h.tx.criados.fatura ?? []).toHaveLength(0);
  expect(h.tx.criados.linhaFatura ?? []).toHaveLength(0);
  expect(h.tx.criados.notaCredito ?? []).toHaveLength(0);
  expect(h.tx.criados.linhaNotaCredito ?? []).toHaveLength(0);
  expect(h.registarLancamento).not.toHaveBeenCalled();
  expect(h.tx.$queryRaw).not.toHaveBeenCalled();
}

beforeEach(() => {
  h.tx = criarTx();
  h.registarLancamento.mockClear();
  h.auth.mockReset();
  h.auth.mockResolvedValue(null);
  h.transaction.mockClear();
});

describe('núcleo de emissão — não consulta a sessão', () => {
  it('emitirDocumentoEmTx está exportado', () => {
    expect(typeof (fat as any).emitirDocumentoEmTx).toBe('function');
  });

  it('emitirNotaCreditoEmTx está exportado', () => {
    expect(typeof (fat as any).emitirNotaCreditoEmTx).toBe('function');
  });

  it('emitirDocumentoEmTx sem sessão emite (não lança EMAIL_POR_CONFIRMAR_EMISSAO) e não chama auth()', async () => {
    const f = await (fat as any).emitirDocumentoEmTx(h.tx, inputFatura(), ctx);

    expect(h.auth).not.toHaveBeenCalled();
    expect(f?.id).toBeTruthy();
    expect(h.tx.criados.fatura).toHaveLength(1);
    expect(h.registarLancamento).toHaveBeenCalledTimes(1);
  });

  it('emitirDocumentoEmTx usa a transacção que recebe — não abre outra', async () => {
    await (fat as any).emitirDocumentoEmTx(h.tx, inputFatura(), ctx);

    expect(h.transaction).not.toHaveBeenCalled();
    // O lançamento é escrito com o tx do chamador.
    expect(h.registarLancamento.mock.calls[0][0]).toBe(h.tx);
  });

  it('emitirDocumentoEmTx grava o NUIT do cliente em Fatura.nuitCliente', async () => {
    await (fat as any).emitirDocumentoEmTx(h.tx, inputFatura(), ctx);

    expect(h.tx.criados.fatura[0].nuitCliente).toBe(NUIT);
  });

  it('emitirNotaCreditoEmTx sem sessão emite (não lança EMAIL_POR_CONFIRMAR_EMISSAO) e não chama auth()', async () => {
    const nc = await (fat as any).emitirNotaCreditoEmTx(h.tx, inputNC(), ctx);

    expect(h.auth).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(nc?.id).toBeTruthy();
    expect(h.tx.criados.notaCredito).toHaveLength(1);
    expect(h.registarLancamento).toHaveBeenCalledTimes(1);
    expect(h.registarLancamento.mock.calls[0][0]).toBe(h.tx);
  });
});

describe('quem tem sessão continua a aplicar o travão de e-mail', () => {
  it.each([
    ['sem sessão', null],
    ['com e-mail por confirmar', { user: { emailVerificado: false } }],
  ])('emitirFatura %s recusa com EMAIL_POR_CONFIRMAR_EMISSAO antes de escrever', async (_rotulo, sessao) => {
    h.auth.mockResolvedValue(sessao);

    await expect(fat.emitirFatura(inputFatura(), ctx)).rejects.toMatchObject({ code: 'EMAIL_POR_CONFIRMAR_EMISSAO' });
    expect(h.auth).toHaveBeenCalled();
    nadaEscrito();
  });

  it('emitirNotaCredito sem sessão recusa com EMAIL_POR_CONFIRMAR_EMISSAO antes de escrever', async () => {
    await expect(fat.emitirNotaCredito(inputNC(), ctx)).rejects.toMatchObject({ code: 'EMAIL_POR_CONFIRMAR_EMISSAO' });
    expect(h.auth).toHaveBeenCalled();
    nadaEscrito();
  });

  it('converterProformaEmFatura sem sessão recusa com EMAIL_POR_CONFIRMAR_EMISSAO antes de escrever', async () => {
    await expect(fat.converterProformaEmFatura(PROFORMA, ctx)).rejects.toMatchObject({ code: 'EMAIL_POR_CONFIRMAR_EMISSAO' });
    expect(h.auth).toHaveBeenCalled();
    nadaEscrito();
  });

  it('emitirFatura com e-mail confirmado emite e lança (o travão deixa passar)', async () => {
    h.auth.mockResolvedValue({ user: { emailVerificado: true } });

    const f = await fat.emitirFatura(inputFatura(), ctx);
    expect(f?.id).toBeTruthy();
    expect(h.tx.criados.fatura).toHaveLength(1);
    expect(h.tx.criados.fatura[0].nuitCliente).toBe(NUIT);
    expect(h.registarLancamento).toHaveBeenCalledTimes(1);
  });
});
