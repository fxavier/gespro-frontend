/**
 * Oráculo da issue #93 — a série que o documento grava é a que o numerou.
 *
 * O defeito: o formulário deixava escolher `serieDocumentoId` de qualquer ano,
 * mas o número vinha sempre da série activa do tipo no ano (Africa/Maputo) da
 * data do documento. O documento gravava a série ESCOLHIDA ⇒ `FAT/2026/…`
 * ligado à série de 2027 (ou o contrário).
 *
 * O contrato novo, provado aqui para as SETE portas de emissão:
 *  - `numerarDocumento(tx, tipo, ctx, data)` devolve `{ numero, serieDocumentoId }`
 *    — o mesmo `UPDATE … RETURNING`, com o `id` da série que numerou;
 *  - `proximoNumeroSerie` continua a devolver só a string (contrato de outros
 *    domínios);
 *  - cada porta grava `serieDocumentoId` = o id devolvido pela numeração, e
 *    ignora um `serieDocumentoId` que ainda chegue no input;
 *  - sem série activa para o ano ⇒ `SERIE_NAO_ENCONTRADA`, vindo da numeração;
 *  - os schemas de emissão já não têm a chave `serieDocumentoId`.
 *
 * Molde: `faturacao-iva-zero.test.ts` (tx com estado, `$queryRaw` dobrado);
 * `auth()` e `registarLancamentoContabilistico` são duplos. As conversões
 * datam o documento com `new Date()`: o relógio é fixado em 2027.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  tx: null as any,
  /** Tipo da série de 2026 — acompanha a porta em teste, para que o caminho
   *  antigo chegue de facto à escrita e o teste falhe pela série, não por outra razão. */
  tipoEscolhido: 'FATURA',
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { emailVerificado: true } }),
}));

vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn().mockResolvedValue({ id: 'lan-93' }),
}));

vi.mock('@/server/db/client', () => ({
  prisma: {},
  prismaBase: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(h.tx)) },
}));

import * as faturacao from '../faturacao.service';
import {
  emitirFatura,
  emitirNotaCredito,
  emitirNotaDebito,
  criarProforma,
  converterProformaEmFatura,
  criarCotacaoComercial,
  converterCotacaoEmProforma,
  proximoNumeroSerie,
} from '../faturacao.service';
import {
  LinhaDocumentoSchema,
  EmitirFaturaSchema,
  EmitirNotaCreditoSchema,
  EmitirNotaDebitoSchema,
  CriarProformaSchema,
  CriarCotacaoComercialSchema,
  type EmitirFaturaInput,
  type EmitirNotaCreditoInput,
  type EmitirNotaDebitoInput,
  type CriarProformaInput,
  type CriarCotacaoComercialInput,
} from '@/lib/validations/faturacao';

const ctx = { tenantId: 'tenant-93', userId: 'user-93' };

/** A série que NUMERA (2027) e a que o utilizador teria escolhido (2026). */
const SERIE_2027 = 'serie-2027';
const SERIE_2026 = 'serie-2026';

/** 5 de Janeiro de 2027, 10h em Maputo. */
const DATA_2027 = new Date('2027-01-05T10:00:00+02:00');

const PREFIXO: Record<string, string> = {
  FATURA: 'FAT',
  NOTA_CREDITO: 'NC',
  NOTA_DEBITO: 'ND',
  PROFORMA: 'PF',
  COTACAO_COMERCIAL: 'COT',
};
const FORMATO = '{prefixo}/{ano}/{numero:06}';
const NUMERO_SEQ = 7;
const numeroEsperado = (tipo: string) => `${PREFIXO[tipo]}/2027/00000${NUMERO_SEQ}`;

const FATURA_ORIGINAL = 'fat-original';
const PROFORMA_ORIGEM = 'pf-origem';
const COTACAO_ORIGEM = 'cc-origem';

const LINHA = LinhaDocumentoSchema.parse({
  descricao: 'Serviço',
  quantidade: 1,
  precoUnitario: 1000,
  desconto: 0,
  taxaIva: 0.16,
});

/**
 * tx com estado. A numeração devolve SEMPRE a série de 2027 (é a activa do ano
 * do documento). A série de 2026 existe e está activa — se o serviço a for
 * buscar pelo id do input, encontra-a; é exactamente o defeito da #93.
 */
function criarTx(numeracao: unknown[] | 'por-tipo' = 'por-tipo') {
  const criados: Record<string, any[]> = {};
  const linhaOrigem = {
    produtoId: null,
    descricao: 'Serviço',
    quantidade: new Prisma.Decimal(1),
    precoUnitario: new Prisma.Decimal(1000),
    desconto: new Prisma.Decimal(0),
    taxaIva: new Prisma.Decimal('0.16'),
    subtotal: new Prisma.Decimal(1000),
    ivaItem: new Prisma.Decimal(160),
    total: new Prisma.Decimal(1160),
    ordemLinha: 0,
  };
  const valores = {
    moeda: 'MZN',
    subtotal: new Prisma.Decimal(1000),
    descontoTotal: new Prisma.Decimal(0),
    ivaTotal: new Prisma.Decimal(160),
    total: new Prisma.Decimal(1160),
  };
  const fontes: Record<string, Record<string, any>> = {
    fatura: { [FATURA_ORIGINAL]: { id: FATURA_ORIGINAL, tenantId: ctx.tenantId, status: 'EMITIDA' } },
    proforma: {
      [PROFORMA_ORIGEM]: {
        id: PROFORMA_ORIGEM,
        tenantId: ctx.tenantId,
        status: 'ACEITE',
        clienteId: 'cli-93',
        ...valores,
        linhas: [linhaOrigem],
      },
    },
    cotacaoComercial: {
      [COTACAO_ORIGEM]: {
        id: COTACAO_ORIGEM,
        tenantId: ctx.tenantId,
        status: 'ACEITE',
        clienteId: 'cli-93',
        dataValidade: new Date('2027-02-05T12:00:00+02:00'),
        ...valores,
        linhas: [linhaOrigem],
      },
    },
  };
  const modelo = (nome: string) => ({
    create: vi.fn(async ({ data }: any) => {
      const reg = { id: `${nome}-${(criados[nome]?.length ?? 0) + 1}`, ...data };
      (criados[nome] ??= []).push(reg);
      return reg;
    }),
    update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    findFirst: vi.fn(async ({ where }: any) => {
      const fonte = fontes[nome]?.[where?.id];
      if (fonte) return fonte;
      const reg = (criados[nome] ?? []).find((r) => r.id === where?.id);
      return reg ? { ...reg, linhas: [] } : null;
    }),
  });

  const tx: any = {
    criados,
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, ...params: unknown[]) => {
      if (numeracao !== 'por-tipo') return numeracao;
      const tipo = params.find((p) => typeof p === 'string' && p in PREFIXO) as string;
      return [
        { id: SERIE_2027, numero: NUMERO_SEQ, prefixo: PREFIXO[tipo] ?? 'DOC', ano: 2027, formatoNumero: FORMATO },
      ];
    }),
    serieDocumento: {
      findFirst: vi.fn(async ({ where }: any) =>
        where?.id === SERIE_2026 ? { id: SERIE_2026, tipo: h.tipoEscolhido, ano: 2026, ativo: true } : null,
      ),
    },
    cliente: { findFirst: vi.fn(async () => ({ id: 'cli-93' })) },
    venda: { findFirst: vi.fn(async () => ({ id: 'ven-93' })) },
    fatura: modelo('fatura'),
    linhaFatura: modelo('linhaFatura'),
    notaCredito: modelo('notaCredito'),
    linhaNotaCredito: modelo('linhaNotaCredito'),
    notaDebito: modelo('notaDebito'),
    linhaNotaDebito: modelo('linhaNotaDebito'),
    proforma: modelo('proforma'),
    linhaProforma: modelo('linhaProforma'),
    cotacaoComercial: modelo('cotacaoComercial'),
    linhaCotacaoComercial: modelo('linhaCotacaoComercial'),
  };
  return tx;
}

// ---------------------------------------------------------------------------
// Entradas (sem série) — objectos já «parsed», que é o que o serviço recebe
// ---------------------------------------------------------------------------

const BASE = {
  fatura: {
    clienteId: 'cli-93',
    moeda: 'MZN',
    dataEmissao: DATA_2027,
    dataVencimento: new Date('2027-02-05T12:00:00+02:00'),
    linhas: [LINHA],
  },
  notaCredito: {
    faturaOriginalId: FATURA_ORIGINAL,
    motivo: 'Devolução',
    moeda: 'MZN',
    dataEmissao: DATA_2027,
    linhas: [LINHA],
  },
  notaDebito: {
    clienteId: 'cli-93',
    motivo: 'Juros de mora',
    moeda: 'MZN',
    dataEmissao: DATA_2027,
    linhas: [LINHA],
  },
  proforma: {
    clienteId: 'cli-93',
    moeda: 'MZN',
    dataEmissao: DATA_2027,
    dataValidade: new Date('2027-02-05T12:00:00+02:00'),
    linhas: [LINHA],
  },
  cotacao: {
    clienteId: 'cli-93',
    moeda: 'MZN',
    dataEmissao: DATA_2027,
    dataValidade: new Date('2027-02-05T12:00:00+02:00'),
    linhas: [LINHA],
  },
};

type Porta = {
  nome: string;
  tipo: string;
  /** Modelo onde o documento criado fica gravado. */
  modelo: string;
  /** Chamada sem série no input (contrato novo). */
  semSerie: () => Promise<unknown>;
  /** Chamada com uma série de outro ano a chegar no input (via cast) — tem de ser ignorada. */
  comSerieDoInput: (() => Promise<unknown>) | null;
};

const comSerie = <T>(o: object) => ({ ...o, serieDocumentoId: SERIE_2026 }) as unknown as T;

const PORTAS: Porta[] = [
  {
    nome: 'emitirFatura',
    tipo: 'FATURA',
    modelo: 'fatura',
    semSerie: () => emitirFatura(BASE.fatura as unknown as EmitirFaturaInput, ctx),
    comSerieDoInput: () => emitirFatura(comSerie<EmitirFaturaInput>(BASE.fatura), ctx),
  },
  {
    nome: 'emitirNotaCredito',
    tipo: 'NOTA_CREDITO',
    modelo: 'notaCredito',
    semSerie: () => emitirNotaCredito(BASE.notaCredito as unknown as EmitirNotaCreditoInput, ctx),
    comSerieDoInput: () => emitirNotaCredito(comSerie<EmitirNotaCreditoInput>(BASE.notaCredito), ctx),
  },
  {
    nome: 'emitirNotaDebito',
    tipo: 'NOTA_DEBITO',
    modelo: 'notaDebito',
    semSerie: () => emitirNotaDebito(BASE.notaDebito as unknown as EmitirNotaDebitoInput, ctx),
    comSerieDoInput: () => emitirNotaDebito(comSerie<EmitirNotaDebitoInput>(BASE.notaDebito), ctx),
  },
  {
    nome: 'criarProforma',
    tipo: 'PROFORMA',
    modelo: 'proforma',
    semSerie: () => criarProforma(BASE.proforma as unknown as CriarProformaInput, ctx),
    comSerieDoInput: () => criarProforma(comSerie<CriarProformaInput>(BASE.proforma), ctx),
  },
  {
    nome: 'criarCotacaoComercial',
    tipo: 'COTACAO_COMERCIAL',
    modelo: 'cotacaoComercial',
    semSerie: () => criarCotacaoComercial(BASE.cotacao as unknown as CriarCotacaoComercialInput, ctx),
    comSerieDoInput: () => criarCotacaoComercial(comSerie<CriarCotacaoComercialInput>(BASE.cotacao), ctx),
  },
  {
    // Assinatura nova: (id, ctx) — sem série de destino.
    nome: 'converterProformaEmFatura',
    tipo: 'FATURA',
    modelo: 'fatura',
    semSerie: () => (converterProformaEmFatura as (id: string, c: typeof ctx) => Promise<unknown>)(PROFORMA_ORIGEM, ctx),
    comSerieDoInput: null,
  },
  {
    // Assinatura nova: (id, ctx) — sem série de destino.
    nome: 'converterCotacaoEmProforma',
    tipo: 'PROFORMA',
    modelo: 'proforma',
    semSerie: () => (converterCotacaoEmProforma as (id: string, c: typeof ctx) => Promise<unknown>)(COTACAO_ORIGEM, ctx),
    comSerieDoInput: null,
  },
];

/** O documento criado no modelo da porta (nas conversões, o que NÃO é a origem). */
function documentoCriado(modelo: string) {
  const criados = h.tx.criados[modelo] ?? [];
  expect(criados, `nenhum ${modelo} criado`).toHaveLength(1);
  return criados[0];
}

/** Parâmetros do `$queryRaw` da numeração (tenantId, tipo, ano). */
function paramsDaNumeracao() {
  expect(h.tx.$queryRaw).toHaveBeenCalledTimes(1);
  const [sql, ...params] = h.tx.$queryRaw.mock.calls[0];
  return { sql: (sql as TemplateStringsArray).join('?'), params };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(DATA_2027);
  h.tx = criarTx();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// numerarDocumento / proximoNumeroSerie
// ---------------------------------------------------------------------------

describe('numerarDocumento — a numeração devolve a série que numerou', () => {
  it('é exportada pelo serviço', () => {
    expect(typeof (faturacao as Record<string, unknown>).numerarDocumento).toBe('function');
  });

  it('devolve { numero, serieDocumentoId } com o id do RETURNING', async () => {
    const numerar = (faturacao as any).numerarDocumento;
    expect(typeof numerar).toBe('function');
    const r = await numerar(h.tx, 'FATURA', ctx, DATA_2027);
    expect(r).toEqual({ numero: 'FAT/2027/000007', serieDocumentoId: SERIE_2027 });
  });

  it('filtra pelo tipo e pelo ano do documento em Maputo, e o RETURNING traz o id', async () => {
    const numerar = (faturacao as any).numerarDocumento;
    expect(typeof numerar).toBe('function');
    // 1 de Janeiro de 2027 às 00h30 em Maputo = 31/12/2026 22h30 UTC.
    await numerar(h.tx, 'FATURA', ctx, new Date('2026-12-31T22:30:00Z'));
    const { sql, params } = paramsDaNumeracao();
    expect(params).toEqual(expect.arrayContaining([ctx.tenantId, 'FATURA', 2027]));
    expect(params).not.toContain(2026);
    expect(sql).toMatch(/RETURNING[\s\S]*\bid\b/);
  });

  it('sem série activa para o ano ⇒ SERIE_NAO_ENCONTRADA', async () => {
    h.tx = criarTx([]);
    const numerar = (faturacao as any).numerarDocumento;
    expect(typeof numerar).toBe('function');
    await expect(numerar(h.tx, 'FATURA', ctx, DATA_2027)).rejects.toMatchObject({
      code: 'SERIE_NAO_ENCONTRADA',
    });
  });
});

describe('proximoNumeroSerie — retrocompatível (contrato de outros domínios)', () => {
  it('continua a devolver só a string do número', async () => {
    const r = await proximoNumeroSerie(h.tx, 'FATURA', ctx, DATA_2027);
    expect(r).toBe('FAT/2027/000007');
    expect(typeof r).toBe('string');
  });

  it('sem série activa para o ano ⇒ SERIE_NAO_ENCONTRADA', async () => {
    h.tx = criarTx([]);
    await expect(proximoNumeroSerie(h.tx, 'FATURA', ctx, DATA_2027)).rejects.toMatchObject({
      code: 'SERIE_NAO_ENCONTRADA',
    });
  });
});

// ---------------------------------------------------------------------------
// As sete portas de emissão
// ---------------------------------------------------------------------------

describe.each(PORTAS)('$nome — a série gravada é a que numerou', (porta) => {
  beforeEach(() => {
    h.tipoEscolhido = porta.tipo;
  });

  it('sem série no input: grava serieDocumentoId da numeração (2027) e o número …/2027/…', async () => {
    await porta.semSerie();

    const doc = documentoCriado(porta.modelo);
    expect(doc.serieDocumentoId).toBe(SERIE_2027);
    expect(doc.numero).toBe(numeroEsperado(porta.tipo));

    // A numeração foi pedida para o tipo da porta e para o ano do documento.
    const { params } = paramsDaNumeracao();
    expect(params).toEqual(expect.arrayContaining([ctx.tenantId, porta.tipo, 2027]));
  });

  it('sem série activa para o ano ⇒ SERIE_NAO_ENCONTRADA, e nada é gravado', async () => {
    h.tx = criarTx([]);
    await expect(porta.semSerie()).rejects.toMatchObject({ code: 'SERIE_NAO_ENCONTRADA' });
    expect(h.tx.criados[porta.modelo] ?? []).toHaveLength(0);
  });

  if (porta.comSerieDoInput) {
    const chamar = porta.comSerieDoInput;
    it('um serieDocumentoId de outro ano no input (serie-2026) é ignorado', async () => {
      await chamar();

      const doc = documentoCriado(porta.modelo);
      expect(doc.serieDocumentoId).toBe(SERIE_2027);
      expect(doc.serieDocumentoId).not.toBe(SERIE_2026);
      expect(doc.numero).toBe(numeroEsperado(porta.tipo));
      // O id do input nem sequer serve para ir buscar a série.
      expect(h.tx.serieDocumento.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: SERIE_2026 }) }),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Schemas — a chave saiu
// ---------------------------------------------------------------------------

/** Desembrulha `.refine`/`.transform` (ZodEffects) até ao ZodObject. */
function chaves(schema: z.ZodTypeAny): string[] {
  let s: z.ZodTypeAny = schema;
  while (s instanceof z.ZodEffects) s = s.innerType();
  expect(s).toBeInstanceOf(z.ZodObject);
  return Object.keys((s as z.AnyZodObject).shape);
}

const SCHEMAS: Array<[string, z.ZodTypeAny, Record<string, unknown>]> = [
  ['EmitirFaturaSchema', EmitirFaturaSchema, BASE.fatura],
  ['EmitirNotaCreditoSchema', EmitirNotaCreditoSchema, { ...BASE.notaCredito, faturaOriginalId: 'cjld2cjxh0001qzrmn831i7ro' }],
  ['EmitirNotaDebitoSchema', EmitirNotaDebitoSchema, BASE.notaDebito],
  ['CriarProformaSchema', CriarProformaSchema, BASE.proforma],
  ['CriarCotacaoComercialSchema', CriarCotacaoComercialSchema, BASE.cotacao],
];

const LINHA_CRUA = { descricao: 'Serviço', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 };

describe.each(SCHEMAS)('%s — sem serieDocumentoId', (_nome, schema, entrada) => {
  it('não tem a chave serieDocumentoId', () => {
    expect(chaves(schema)).not.toContain('serieDocumentoId');
  });

  it('aceita uma entrada válida sem série', () => {
    const r = schema.safeParse({ ...entrada, linhas: [LINHA_CRUA] });
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty('serieDocumentoId');
  });
});
