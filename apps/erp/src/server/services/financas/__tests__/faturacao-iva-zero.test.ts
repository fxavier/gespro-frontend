/**
 * Oráculo da issue #77 — T4 (faturação): uma linha a 0% chega aos serviços
 * como 0 e é gravada como 0, sem IVA liquidado no lançamento.
 *
 * O defeito da issue vive nos formulários (o `|| 0.16`), não nestes serviços:
 * os casos daqui ficam VERDES já hoje e não são discriminantes — trancam que a
 * correcção não parte o caminho do servidor. O caso discriminante de T4 é a
 * adjudicação (compras-iva-zero.test.ts).
 *
 * Molde: prisma mockado (como compras.service.test.ts), com um `tx` que regista
 * o que cada `create` recebeu; `registarLancamentoContabilistico` e `auth()`
 * são duplos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  tx: null as any,
  registarLancamento: null as any,
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { emailVerificado: true } }),
}));

vi.mock('@/server/services/financas/contabilidade.service', () => {
  h.registarLancamento = vi.fn().mockResolvedValue({ id: 'lan-77' });
  return { registarLancamentoContabilistico: h.registarLancamento };
});

vi.mock('@/server/db/client', () => ({
  prisma: {},
  prismaBase: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(h.tx)) },
}));

import {
  emitirFatura,
  emitirNotaCredito,
  criarProforma,
  criarCotacaoComercial,
  PGC_FATURACAO,
} from '../faturacao.service';
import {
  EmitirFaturaSchema,
  EmitirNotaCreditoSchema,
  CriarProformaSchema,
  CriarCotacaoComercialSchema,
} from '@/lib/validations/faturacao';

const ctx = { tenantId: 'tenant-77', userId: 'user-77' };
const SERIE = 'cjld2cjxh0000qzrmn831i7rn';
const FATURA_ORIGINAL = 'cjld2cjxh0001qzrmn831i7ro';

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
    ...extra,
  });
  const tx: any = {
    criados,
    $queryRaw: vi.fn(async () => [
      { numero: 1, prefixo: 'DOC', ano: 2026, formatoNumero: '{prefixo}/{ano}/{numero:06}' },
    ]),
    serieDocumento: { findFirst: vi.fn(async () => ({ id: SERIE, tipo: 'FATURA', ativo: true })) },
    cliente: { findFirst: vi.fn(async () => ({ id: 'cli-77' })) },
    venda: { findFirst: vi.fn(async () => ({ id: 'ven-77' })) },
    fatura: modelo('fatura', {
      findFirst: vi.fn(async ({ where }: any) =>
        where.id === FATURA_ORIGINAL
          ? { id: FATURA_ORIGINAL, tenantId: ctx.tenantId, status: 'EMITIDA' }
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
      findFirst: vi.fn(async ({ where }: any) => ({
        ...(criados.proforma ?? []).find((p) => p.id === where.id),
        linhas: criados.linhaProforma ?? [],
      })),
    }),
    linhaProforma: modelo('linhaProforma'),
    cotacaoComercial: modelo('cotacaoComercial', {
      findFirst: vi.fn(async ({ where }: any) => ({
        ...(criados.cotacaoComercial ?? []).find((c) => c.id === where.id),
        linhas: criados.linhaCotacaoComercial ?? [],
      })),
    }),
    linhaCotacaoComercial: modelo('linhaCotacaoComercial'),
  };
  return tx;
}

const dec = (v: unknown) => new Prisma.Decimal(String(v));
const LINHA_ISENTA = { descricao: 'Serviço isento', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0 };
const LINHA_16 = { descricao: 'Serviço normal', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 };

function partidasDoLancamento() {
  expect(h.registarLancamento).toHaveBeenCalledTimes(1);
  return h.registarLancamento.mock.calls[0][1].partidas as Array<{ contaCodigo: string; tipo: string; valor: string }>;
}

function somar(partidas: Array<{ tipo: string; valor: string }>, tipo: string) {
  return partidas.filter((p) => p.tipo === tipo).reduce((a, p) => a.plus(dec(p.valor)), new Prisma.Decimal(0));
}

beforeEach(() => {
  h.tx = criarTx();
  h.registarLancamento.mockClear();
});

describe('emitirFatura com linha a 0% — verde já hoje (não discriminante)', () => {
  it('LinhaFatura.taxaIva = 0, ivaItem = 0; Fatura.ivaTotal = 0; lançamento sem 44331 e equilibrado', async () => {
    const input = EmitirFaturaSchema.parse({
      serieDocumentoId: SERIE,
      clienteId: 'cli-77',
      dataEmissao: '2026-09-25',
      dataVencimento: '2026-10-25',
      linhas: [LINHA_ISENTA],
    });
    await emitirFatura(input, ctx);

    const [linha] = h.tx.criados.linhaFatura;
    expect(dec(linha.taxaIva).isZero()).toBe(true);
    expect(dec(linha.ivaItem).isZero()).toBe(true);
    expect(dec(linha.total).equals(dec('1000'))).toBe(true);

    const [fatura] = h.tx.criados.fatura;
    expect(dec(fatura.ivaTotal).isZero()).toBe(true);
    expect(dec(fatura.total).equals(dec('1000'))).toBe(true);

    const partidas = partidasDoLancamento();
    expect(partidas.some((p) => p.contaCodigo === PGC_FATURACAO.IVA_LIQUIDADO)).toBe(false);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);
  });

  it('linha a 0% + linha a 16%: só a de 16% tem IVA (160), total 2160', async () => {
    const input = EmitirFaturaSchema.parse({
      serieDocumentoId: SERIE,
      clienteId: 'cli-77',
      dataEmissao: '2026-09-25',
      dataVencimento: '2026-10-25',
      linhas: [LINHA_ISENTA, LINHA_16],
    });
    await emitirFatura(input, ctx);

    const linhas = h.tx.criados.linhaFatura;
    const isenta = linhas.find((l: any) => l.descricao === LINHA_ISENTA.descricao);
    expect(dec(isenta.taxaIva).isZero()).toBe(true);
    expect(dec(isenta.ivaItem).isZero()).toBe(true);

    const [fatura] = h.tx.criados.fatura;
    expect(dec(fatura.ivaTotal).equals(dec('160'))).toBe(true);
    expect(dec(fatura.total).equals(dec('2160'))).toBe(true);
  });
});

describe('emitirNotaCredito com linha a 0% — verde já hoje (não discriminante)', () => {
  it('LinhaNotaCredito.taxaIva = 0, ivaTotal = 0; lançamento sem estorno de 44331 e equilibrado', async () => {
    h.tx.serieDocumento.findFirst.mockResolvedValue({ id: SERIE, tipo: 'NOTA_CREDITO', ativo: true });
    const input = EmitirNotaCreditoSchema.parse({
      serieDocumentoId: SERIE,
      faturaOriginalId: FATURA_ORIGINAL,
      motivo: 'Devolução',
      dataEmissao: '2026-09-25',
      linhas: [LINHA_ISENTA],
    });
    await emitirNotaCredito(input, ctx);

    const [linha] = h.tx.criados.linhaNotaCredito;
    expect(dec(linha.taxaIva).isZero()).toBe(true);
    expect(dec(linha.ivaItem).isZero()).toBe(true);

    const [nc] = h.tx.criados.notaCredito;
    expect(dec(nc.ivaTotal).isZero()).toBe(true);

    const partidas = partidasDoLancamento();
    expect(partidas.some((p) => p.contaCodigo === PGC_FATURACAO.IVA_LIQUIDADO)).toBe(false);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);
  });
});

describe('proforma e cotação comercial com linha a 0% — verde já hoje (não discriminante)', () => {
  it('criarProforma grava LinhaProforma.taxaIva = 0 e ivaTotal 0', async () => {
    h.tx.serieDocumento.findFirst.mockResolvedValue({ id: SERIE, tipo: 'PROFORMA', ativo: true });
    const input = CriarProformaSchema.parse({
      serieDocumentoId: SERIE,
      clienteId: 'cli-77',
      dataEmissao: '2026-09-25',
      dataValidade: '2026-10-25',
      linhas: [LINHA_ISENTA],
    });
    await criarProforma(input, ctx);

    const [linha] = h.tx.criados.linhaProforma;
    expect(dec(linha.taxaIva).isZero()).toBe(true);
    expect(dec(linha.ivaItem).isZero()).toBe(true);
    expect(dec(h.tx.criados.proforma[0].ivaTotal).isZero()).toBe(true);
  });

  it('criarCotacaoComercial grava LinhaCotacaoComercial.taxaIva = 0 e ivaTotal 0', async () => {
    h.tx.serieDocumento.findFirst.mockResolvedValue({ id: SERIE, tipo: 'COTACAO_COMERCIAL', ativo: true });
    const input = CriarCotacaoComercialSchema.parse({
      serieDocumentoId: SERIE,
      clienteId: 'cli-77',
      dataEmissao: '2026-09-25',
      dataValidade: '2026-10-25',
      linhas: [LINHA_ISENTA],
    });
    await criarCotacaoComercial(input, ctx);

    const [linha] = h.tx.criados.linhaCotacaoComercial;
    expect(dec(linha.taxaIva).isZero()).toBe(true);
    expect(dec(linha.ivaItem).isZero()).toBe(true);
    expect(dec(h.tx.criados.cotacaoComercial[0].ivaTotal).isZero()).toBe(true);
  });
});
