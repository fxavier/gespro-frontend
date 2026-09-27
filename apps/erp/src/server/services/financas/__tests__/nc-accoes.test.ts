/**
 * Oráculo do ticket 3 (#252) do épico #148 — cancelar e liquidar notas de crédito.
 *
 * Escrito pelo verificador ANTES da implementação; o implementador não o altera.
 *
 * Corre contra um duplo COM ESTADO do cliente estendido (`prisma`):
 *   - `$transaction(fn)` executa a callback com o próprio duplo; se lançar, repõe
 *     o estado (fotografia) — «nada escrito» afirma-se sobre o estado final;
 *   - `$queryRaw`/`$executeRaw` REGISTAM o SQL (são as trancas) e devolvem a linha
 *     trancada quando o id e o tenant batem, para servir os dois estilos de código;
 *   - `findFirst`/`findUnique` leem e ficam no registo, para provar que a tranca
 *     vem antes da leitura;
 *   - `prismaBase` rebenta a qualquer acesso: a escrita vai pelo cliente estendido
 *     (auditoria), como fixado no desenho.
 *
 * As funções de contrato de outros módulos são o seam e estão mockadas:
 * `estornarLancamentoEmTx`, `registarLancamentoContabilistico` (contabilidade),
 * `resolverContaMeioPagamento` (meio-pagamento), `registarMovimentoCaixa` (caixa).
 *
 * Invariantes (docs/agentic/issue-148/tickets.md):
 *   N1 — NC CANCELADA ⇒ o lançamento dela foi estornado e `lancamentoEstornoId` aponta
 *        para o estorno.
 *   N2 — LIQUIDADA por DEVOLUCAO ⇒ lançamento 411 D / conta do meio C pelo total.
 *   N3 — LIQUIDADA por COMPENSACAO ⇒ `totalPago` da factura sobe o total da NC, sem lançamento.
 *   N4 — `motivoCancelamento` preenchido; `observacoes` inalterado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;
type Entrada =
  | { tipo: 'tranca'; texto: string }
  | { tipo: 'leitura'; modelo: string; op: string }
  | { tipo: 'escrita'; modelo: string; op: string; data?: Row };

// ---------------------------------------------------------------------------
// Duplo com estado
// ---------------------------------------------------------------------------

function textoRaw(args: unknown[]): { texto: string; valores: unknown[] } {
  const [primeiro, ...valores] = args as [any, ...unknown[]];
  if (Array.isArray(primeiro) || (primeiro && Array.isArray(primeiro.raw))) {
    return { texto: [...(primeiro as string[]), ...valores.map(String)].join(' '), valores };
  }
  if (primeiro && typeof primeiro === 'object' && 'strings' in primeiro) {
    const vs = (primeiro.values ?? []) as unknown[];
    return { texto: [...primeiro.strings, ...vs.map(String)].join(' '), valores: vs };
  }
  return { texto: [String(primeiro), ...valores.map(String)].join(' '), valores };
}

function corresponde(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (k === 'AND') {
      if (!(Array.isArray(cond) ? cond : [cond]).every((w) => corresponde(row, w))) return false;
      continue;
    }
    const v = row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('equals' in c && v !== c.equals) return false;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      if ('not' in c && v === c.not) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

const MODELOS = ['notaCredito', 'fatura'] as const;
type Modelo = (typeof MODELOS)[number];

class Duplo {
  tabelas: Record<Modelo, Row[]> = { notaCredito: [], fatura: [] };
  registo: Entrada[] = [];

  semear(modelo: Modelo, r: Row): Row {
    this.tabelas[modelo].push(r);
    return r;
  }

  obter(modelo: Modelo, id: string): Row {
    const r = this.tabelas[modelo].find((x) => x.id === id);
    if (!r) throw new Error(`duplo: ${modelo} ${id} não existe`);
    return r;
  }

  fotografia(): string {
    return JSON.stringify(this.tabelas);
  }

  escritas(modelo?: Modelo): Entrada[] {
    return this.registo.filter((e) => e.tipo === 'escrita' && (!modelo || e.modelo === modelo));
  }

  private tabela(modelo: Modelo) {
    const ler = (op: string) => this.registo.push({ tipo: 'leitura', modelo, op });
    const proibido = (op: string) => async () => {
      throw new Error(`duplo: ${modelo}.${op} proibido (a auditoria só vê escritas singulares)`);
    };
    return {
      findFirst: async (args: Row = {}) => {
        ler('findFirst');
        const r = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        return r ? { ...r } : null;
      },
      findUnique: async (args: Row = {}) => {
        ler('findUnique');
        const r = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        return r ? { ...r } : null;
      },
      findFirstOrThrow: async (args: Row = {}) => {
        ler('findFirstOrThrow');
        const r = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        if (!r) throw new Prisma.PrismaClientKnownRequestError('No record found', { code: 'P2025', clientVersion: 'duplo' });
        return { ...r };
      },
      update: async (args: Row) => {
        this.registo.push({ tipo: 'escrita', modelo, op: 'update', data: args.data });
        const alvo = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        if (!alvo) {
          throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: 'duplo',
          });
        }
        Object.assign(alvo, args.data, { updatedAt: new Date() });
        return { ...alvo };
      },
      create: proibido('create'),
      delete: proibido('delete'),
      createMany: proibido('createMany'),
      updateMany: proibido('updateMany'),
      deleteMany: proibido('deleteMany'),
      upsert: proibido('upsert'),
    };
  }

  readonly notaCredito = this.tabela('notaCredito');
  readonly fatura = this.tabela('fatura');

  /** Devolve a linha trancada quando um id e o tenant dela aparecem nos valores do SQL. */
  private linhaTrancada(valores: unknown[]): Row[] {
    const vs = valores.map(String);
    for (const m of MODELOS) {
      const r = this.tabelas[m].find((x) => vs.includes(x.id) && vs.includes(x.tenantId));
      if (r) return [{ id: r.id, status: r.status, tenantId: r.tenantId }];
    }
    return [];
  }

  $queryRaw = async (...args: unknown[]) => {
    const { texto, valores } = textoRaw(args);
    this.registo.push({ tipo: 'tranca', texto });
    return this.linhaTrancada(valores);
  };

  $queryRawUnsafe = async (...args: unknown[]) => {
    const { texto, valores } = textoRaw(args);
    this.registo.push({ tipo: 'tranca', texto });
    return this.linhaTrancada(valores);
  };

  $executeRaw = async (...args: unknown[]) => {
    const { texto, valores } = textoRaw(args);
    this.registo.push({ tipo: 'tranca', texto });
    return this.linhaTrancada(valores).length;
  };

  $transaction = async (fn: unknown) => {
    if (typeof fn !== 'function') throw new Error('duplo: só $transaction interactiva (callback)');
    // As escritas mutam as linhas vivas (Object.assign); as cópias rasas ficam intactas.
    const antes = {
      notaCredito: this.tabelas.notaCredito.map((r) => ({ ...r })),
      fatura: this.tabelas.fatura.map((r) => ({ ...r })),
    };
    try {
      return await (fn as (tx: Duplo) => Promise<unknown>)(this);
    } catch (e) {
      this.tabelas = antes;
      throw e;
    }
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ duplo: undefined as unknown }));

vi.mock('@/server/db/client', () => {
  const prisma = new Proxy(
    {},
    {
      get: (_t, prop) => {
        const d = h.duplo as Record<string | symbol, unknown>;
        const v = d[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(d) : v;
      },
    },
  );
  const prismaBase = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        throw new Error(`duplo: prismaBase.${String(prop)} — o desenho fixa prisma.$transaction (cliente estendido)`);
      },
    },
  );
  return { prisma, prismaBase };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

vi.mock('../contabilidade.service', () => ({
  estornarLancamentoEmTx: vi.fn(),
  registarLancamentoContabilistico: vi.fn(),
}));

vi.mock('../meio-pagamento.service', () => ({
  resolverContaMeioPagamento: vi.fn(),
}));

vi.mock('../caixa.service', () => ({
  registarMovimentoCaixa: vi.fn(),
}));

import { cancelarNotaCredito, liquidarNotaCredito } from '../faturacao.service';
import { estornarLancamentoEmTx, registarLancamentoContabilistico } from '../contabilidade.service';
import { resolverContaMeioPagamento } from '../meio-pagamento.service';
import { registarMovimentoCaixa } from '../caixa.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { CancelarDocumentoSchema, LiquidarNotaCreditoSchema } from '@/lib/validations/faturacao';

const mEstornar = vi.mocked(estornarLancamentoEmTx);
const mRegistarLanc = vi.mocked(registarLancamentoContabilistico);
const mResolver = vi.mocked(resolverContaMeioPagamento);
const mMovCaixa = vi.mocked(registarMovimentoCaixa);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TA = 'tenant-a';
const TB = 'tenant-b';
const AGORA = new Date('2026-09-26T10:00:00Z');
const DATA_LIQ = new Date('2026-09-25T10:00:00Z');

const ID_NC = 'cnc0000000000000000000001';
const ID_FAT = 'cfat000000000000000000001';
const ID_CONTA_BANCARIA = 'cbanco0000000000000000001';

type Perm = 'caixa:operar' | 'financas:banca:escrita' | 'faturacao:nc:liquidar';

type CtxLiquidar = Parameters<typeof liquidarNotaCredito>[1];

function ctxCom(...perms: Perm[]): CtxLiquidar {
  // A verificação de caixa/banca é no SERVIÇO, pelo `ctx.permissions` (o do createSafeAction).
  return { tenantId: TA, userId: 'user-a', permissions: new Set<string>(['faturacao:nc:liquidar', ...perms]) };
}
const CTX_A = ctxCom();

let d: Duplo;

function semearNC(extra: Row = {}): Row {
  return d.semear('notaCredito', {
    id: ID_NC,
    tenantId: TA,
    numero: 'NC/2026/000003',
    faturaOriginalId: ID_FAT,
    motivo: 'Devolução de mercadoria',
    subtotal: new Prisma.Decimal('100'),
    ivaTotal: new Prisma.Decimal('16'),
    total: new Prisma.Decimal('116'),
    status: 'EMITIDA',
    dataEmissao: new Date('2026-09-10T10:00:00Z'),
    observacoes: 'Observação original do emissor',
    motivoCancelamento: null,
    lancamentoId: 'lan-nc-1',
    lancamentoEstornoId: null,
    lancamentoLiquidacaoId: null,
    formaLiquidacao: null,
    dataLiquidacao: null,
    ...extra,
  });
}

function semearFatura(extra: Row = {}): Row {
  return d.semear('fatura', {
    id: ID_FAT,
    tenantId: TA,
    numero: 'FAT/2026/000010',
    total: new Prisma.Decimal('1160'),
    totalPago: new Prisma.Decimal('0'),
    status: 'EMITIDA',
    dataPagamento: null,
    ...extra,
  });
}

const num = (v: unknown) => Number(String(v));

beforeEach(() => {
  d = new Duplo();
  h.duplo = d;
  vi.clearAllMocks();
  mEstornar.mockResolvedValue({ id: 'lan-estorno-1' } as any);
  mRegistarLanc.mockResolvedValue({ id: 'lan-liq-1' } as any);
  mMovCaixa.mockResolvedValue({ id: 'mov-1' } as any);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

async function erroDe(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('esperava-se uma rejeição e a promessa cumpriu');
}

async function esperarRegra(p: Promise<unknown>, codigo?: string): Promise<any> {
  const e = await erroDe(p);
  expect(e).toBeInstanceOf(BusinessRuleError);
  if (codigo) expect(e.code).toBe(codigo);
  return e;
}

/** Índice da primeira tranca FOR UPDATE que contém o id (e o tenant). */
function indiceTranca(id: string, tenantId: string): number {
  return d.registo.findIndex(
    (e) => e.tipo === 'tranca' && /FOR\s+UPDATE/i.test(e.texto) && e.texto.includes(id) && e.texto.includes(tenantId),
  );
}

function indicePrimeiraLeitura(modelo: Modelo): number {
  return d.registo.findIndex((e) => e.tipo === 'leitura' && e.modelo === modelo);
}

type Liq = Parameters<typeof liquidarNotaCredito>[0];
type FormaPag = Extract<Liq, { forma: 'DEVOLUCAO' }>['formaPagamento'];

const compensar = () => liquidarNotaCredito({ id: ID_NC, forma: 'COMPENSACAO', data: DATA_LIQ }, CTX_A);

const devolver = (formaPagamento: FormaPag, ctx: CtxLiquidar) =>
  liquidarNotaCredito(
    {
      id: ID_NC,
      forma: 'DEVOLUCAO',
      data: DATA_LIQ,
      formaPagamento,
      ...(formaPagamento === 'NUMERARIO' ? {} : { contaBancariaId: ID_CONTA_BANCARIA }),
    },
    ctx,
  );

// ---------------------------------------------------------------------------
// Schemas (contrato do ticket 2 — já verdes)
// ---------------------------------------------------------------------------

describe('schemas de cancelar e liquidar', () => {
  const base = { id: ID_NC, data: '2026-09-25' };

  it('LiquidarNotaCreditoSchema recusa DEVOLUCAO bancária sem contaBancariaId', () => {
    for (const formaPagamento of ['TRANSFERENCIA_BANCARIA', 'CHEQUE', 'M-PESA', 'E-MOLA']) {
      const r = LiquidarNotaCreditoSchema.safeParse({ ...base, forma: 'DEVOLUCAO', formaPagamento });
      expect(r.success, formaPagamento).toBe(false);
      if (!r.success) expect(r.error.issues.some((i) => i.path.includes('contaBancariaId'))).toBe(true);
    }
  });

  it('LiquidarNotaCreditoSchema aceita DEVOLUCAO em NUMERARIO sem conta e bancária com conta', () => {
    expect(LiquidarNotaCreditoSchema.safeParse({ ...base, forma: 'DEVOLUCAO', formaPagamento: 'NUMERARIO' }).success).toBe(true);
    expect(
      LiquidarNotaCreditoSchema.safeParse({
        ...base,
        forma: 'DEVOLUCAO',
        formaPagamento: 'TRANSFERENCIA_BANCARIA',
        contaBancariaId: ID_CONTA_BANCARIA,
      }).success,
    ).toBe(true);
  });

  it('LiquidarNotaCreditoSchema aceita COMPENSACAO só com data e recusa forma desconhecida', () => {
    expect(LiquidarNotaCreditoSchema.safeParse({ ...base, forma: 'COMPENSACAO' }).success).toBe(true);
    expect(LiquidarNotaCreditoSchema.safeParse({ ...base, forma: 'OUTRA' }).success).toBe(false);
  });

  it('CancelarDocumentoSchema recusa motivo com menos de 3 caracteres (também depois do trim)', () => {
    expect(CancelarDocumentoSchema.safeParse({ id: ID_NC, motivo: 'ab' }).success).toBe(false);
    expect(CancelarDocumentoSchema.safeParse({ id: ID_NC, motivo: '  ab  ' }).success).toBe(false);
    expect(CancelarDocumentoSchema.safeParse({ id: ID_NC, motivo: '' }).success).toBe(false);
    expect(CancelarDocumentoSchema.safeParse({ id: ID_NC, motivo: 'abc' }).success).toBe(true);
    expect(CancelarDocumentoSchema.safeParse({ id: ID_NC, motivo: 'x'.repeat(501) }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cancelarNotaCredito
// ---------------------------------------------------------------------------

describe('cancelarNotaCredito', () => {
  it('N1/N4: estorna o lançamento na MESMA tx e grava CANCELADA, motivo e lancamentoEstornoId; observacoes intacto', async () => {
    semearNC();
    await cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A);

    expect(mEstornar).toHaveBeenCalledTimes(1);
    const [tx, input, ctx] = mEstornar.mock.calls[0] as unknown as [unknown, Row, Row];
    expect(tx).toBe(d); // o tx da transacção em curso, não um cliente novo
    expect(input.lancamentoId).toBe('lan-nc-1');
    expect(input.motivo).toContain('NC/2026/000003');
    expect(input.motivo).toContain('Emitida por engano');
    expect(input.data).toBeInstanceOf(Date);
    expect((input.data as Date).getTime()).toBe(AGORA.getTime());
    expect(ctx.tenantId).toBe(TA);

    const nc = d.obter('notaCredito', ID_NC);
    expect(nc.status).toBe('CANCELADA');
    expect(nc.motivoCancelamento).toBe('Emitida por engano');
    expect(nc.lancamentoEstornoId).toBe('lan-estorno-1');
    expect(nc.observacoes).toBe('Observação original do emissor');
    expect(nc.formaLiquidacao).toBeNull();
    expect(nc.lancamentoLiquidacaoId).toBeNull();
  });

  it('tranca a NC com FOR UPDATE (id + tenant) ANTES de a ler', async () => {
    semearNC();
    await cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A);

    const tranca = indiceTranca(ID_NC, TA);
    const leitura = indicePrimeiraLeitura('notaCredito');
    expect(tranca).toBeGreaterThanOrEqual(0);
    expect(leitura).toBeGreaterThanOrEqual(0);
    expect(tranca).toBeLessThan(leitura);
  });

  it('PERIODO_FECHADO no estorno: propaga e a NC fica EMITIDA, sem nada gravado', async () => {
    semearNC();
    mEstornar.mockRejectedValueOnce(new BusinessRuleError('PERIODO_FECHADO', 'Período 2026-09 está fechado'));
    const antes = d.fotografia();

    await esperarRegra(cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A), 'PERIODO_FECHADO');

    expect(d.fotografia()).toBe(antes);
    const nc = d.obter('notaCredito', ID_NC);
    expect(nc.status).toBe('EMITIDA');
    expect(nc.motivoCancelamento).toBeNull();
    expect(nc.lancamentoEstornoId).toBeNull();
  });

  it('NC legada sem lancamentoId: cancela sem estorno e lancamentoEstornoId fica null', async () => {
    semearNC({ lancamentoId: null });
    await cancelarNotaCredito(ID_NC, 'Documento antigo', CTX_A);

    expect(mEstornar).not.toHaveBeenCalled();
    const nc = d.obter('notaCredito', ID_NC);
    expect(nc.status).toBe('CANCELADA');
    expect(nc.motivoCancelamento).toBe('Documento antigo');
    expect(nc.lancamentoEstornoId).toBeNull();
    expect(nc.observacoes).toBe('Observação original do emissor');
  });

  it.each(['LIQUIDADA', 'CANCELADA', 'RASCUNHO'])('NC %s ⇒ BusinessRuleError, sem estorno nem escrita', async (status) => {
    semearNC({ status });
    const antes = d.fotografia();

    await esperarRegra(cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A));

    expect(mEstornar).not.toHaveBeenCalled();
    expect(d.escritas()).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });

  it('cross-tenant ⇒ NotFoundError, sem estorno nem escrita', async () => {
    semearNC({ tenantId: TB });
    const antes = d.fotografia();

    const e = await erroDe(cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A));

    expect(e).toBeInstanceOf(NotFoundError);
    expect(mEstornar).not.toHaveBeenCalled();
    expect(d.escritas()).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });

  it('inexistente ⇒ NotFoundError', async () => {
    const e = await erroDe(cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A));
    expect(e).toBeInstanceOf(NotFoundError);
    expect(mEstornar).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// liquidarNotaCredito — COMPENSACAO
// ---------------------------------------------------------------------------

describe('liquidarNotaCredito — COMPENSACAO', () => {
  it('N3: sobe o totalPago da factura pelo total da NC (PARCIALMENTE_PAGA) e não gera lançamento', async () => {
    semearNC();
    semearFatura();

    await compensar();

    const fat = d.obter('fatura', ID_FAT);
    expect(num(fat.totalPago)).toBe(116);
    expect(fat.status).toBe('PARCIALMENTE_PAGA');
    expect(num(fat.total)).toBe(1160); // append-only: o total da factura não muda

    const nc = d.obter('notaCredito', ID_NC);
    expect(nc.status).toBe('LIQUIDADA');
    expect(nc.formaLiquidacao).toBe('COMPENSACAO');
    expect((nc.dataLiquidacao as Date).getTime()).toBe(DATA_LIQ.getTime());
    expect(nc.lancamentoLiquidacaoId ?? null).toBeNull();
    expect(nc.observacoes).toBe('Observação original do emissor');

    expect(mRegistarLanc).not.toHaveBeenCalled();
    expect(mMovCaixa).not.toHaveBeenCalled();
    expect(mResolver).not.toHaveBeenCalled();
    expect(mEstornar).not.toHaveBeenCalled();
  });

  it('pendente a zero ⇒ factura PAGA com dataPagamento = data da liquidação (regra do registarPagamento)', async () => {
    semearNC();
    semearFatura({ status: 'PARCIALMENTE_PAGA', totalPago: new Prisma.Decimal('1044') });

    await compensar();

    const fat = d.obter('fatura', ID_FAT);
    expect(num(fat.totalPago)).toBe(1160);
    expect(fat.status).toBe('PAGA');
    expect((fat.dataPagamento as Date).getTime()).toBe(DATA_LIQ.getTime());
  });

  it('factura VENCIDA é aceite (compensação total ⇒ PAGA)', async () => {
    semearNC();
    semearFatura({ status: 'VENCIDA', total: new Prisma.Decimal('116') });

    await compensar();

    const fat = d.obter('fatura', ID_FAT);
    expect(num(fat.totalPago)).toBe(116);
    expect(fat.status).toBe('PAGA');
    expect(d.obter('notaCredito', ID_NC).status).toBe('LIQUIDADA');
  });

  it('tranca a NC e a factura com FOR UPDATE antes de ler cada uma', async () => {
    semearNC();
    semearFatura();

    await compensar();

    const trancaNC = indiceTranca(ID_NC, TA);
    const trancaFat = indiceTranca(ID_FAT, TA);
    expect(trancaNC).toBeGreaterThanOrEqual(0);
    expect(trancaFat).toBeGreaterThanOrEqual(0);
    expect(trancaNC).toBeLessThan(indicePrimeiraLeitura('notaCredito'));
    expect(trancaFat).toBeLessThan(indicePrimeiraLeitura('fatura'));
  });

  it('saldo insuficiente ⇒ NC_COMPENSACAO_EXCEDE_SALDO, sem escrita', async () => {
    semearNC();
    semearFatura({ status: 'PARCIALMENTE_PAGA', totalPago: new Prisma.Decimal('1100') }); // saldo 60 < 116
    const antes = d.fotografia();

    await esperarRegra(compensar(), 'NC_COMPENSACAO_EXCEDE_SALDO');

    expect(d.fotografia()).toBe(antes);
    expect(mRegistarLanc).not.toHaveBeenCalled();
  });

  it('saldo exactamente igual ao total da NC é aceite', async () => {
    semearNC();
    semearFatura({ status: 'PARCIALMENTE_PAGA', totalPago: new Prisma.Decimal('1044') }); // saldo 116

    await compensar();
    expect(d.obter('notaCredito', ID_NC).status).toBe('LIQUIDADA');
  });

  it.each(['PAGA', 'CANCELADA', 'RASCUNHO'])('factura %s ⇒ FATURA_NAO_COMPENSAVEL, sem escrita', async (status) => {
    semearNC();
    semearFatura({ status });
    const antes = d.fotografia();

    await esperarRegra(compensar(), 'FATURA_NAO_COMPENSAVEL');

    expect(d.fotografia()).toBe(antes);
  });

  it('factura original noutro tenant ⇒ NotFoundError, sem escrita', async () => {
    semearNC();
    semearFatura({ tenantId: TB });
    const antes = d.fotografia();

    const e = await erroDe(compensar());

    expect(e).toBeInstanceOf(NotFoundError);
    expect(d.fotografia()).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// liquidarNotaCredito — DEVOLUCAO
// ---------------------------------------------------------------------------

describe('liquidarNotaCredito — DEVOLUCAO', () => {
  it('N2 bancária: resolve o meio, lança 411 D / conta do meio C pelo total e grava lancamentoLiquidacaoId', async () => {
    semearNC();
    semearFatura();
    mResolver.mockResolvedValueOnce({ contaCodigo: '1201', diarioTipo: 'BANCO' });
    const ctx = ctxCom('financas:banca:escrita');

    await devolver('TRANSFERENCIA_BANCARIA', ctx);

    expect(mResolver).toHaveBeenCalledTimes(1);
    const [txR, meio] = mResolver.mock.calls[0] as unknown as [unknown, Row];
    expect(txR).toBe(d);
    expect(meio).toMatchObject({ forma: 'TRANSFERENCIA_BANCARIA', contaBancariaId: ID_CONTA_BANCARIA });

    expect(mRegistarLanc).toHaveBeenCalledTimes(1);
    const [txL, lanc] = mRegistarLanc.mock.calls[0] as unknown as [unknown, Row];
    expect(txL).toBe(d);
    expect(lanc.diarioTipo).toBe('BANCO');
    expect((lanc.data as Date).getTime()).toBe(DATA_LIQ.getTime());
    const partidas = lanc.partidas as Row[];
    expect(partidas).toHaveLength(2);
    const deb = partidas.filter((p) => p.tipo === 'DEBITO');
    const cred = partidas.filter((p) => p.tipo === 'CREDITO');
    expect(deb).toHaveLength(1);
    expect(cred).toHaveLength(1);
    expect(deb[0].contaCodigo).toBe('411');
    expect(num(deb[0].valor)).toBe(116);
    expect(cred[0].contaCodigo).toBe('1201');
    expect(num(cred[0].valor)).toBe(116);

    const nc = d.obter('notaCredito', ID_NC);
    expect(nc.status).toBe('LIQUIDADA');
    expect(nc.formaLiquidacao).toBe('DEVOLUCAO');
    expect((nc.dataLiquidacao as Date).getTime()).toBe(DATA_LIQ.getTime());
    expect(nc.lancamentoLiquidacaoId).toBe('lan-liq-1');
    expect(nc.observacoes).toBe('Observação original do emissor');

    expect(mMovCaixa).not.toHaveBeenCalled();
    // A factura original não é tocada na devolução.
    expect(d.escritas('fatura')).toHaveLength(0);
  });

  it('N2 numerário: lança 411 D / 111 C no diário de CAIXA e regista a saída na sessão resolvida', async () => {
    semearNC();
    mResolver.mockResolvedValueOnce({ contaCodigo: '111', diarioTipo: 'CAIXA', sessaoCaixaId: 'sess-1' });
    const ctx = ctxCom('caixa:operar');

    await devolver('NUMERARIO', ctx);

    const [, meio] = mResolver.mock.calls[0] as unknown as [unknown, Row];
    expect(meio.forma).toBe('NUMERARIO');

    const [, lanc] = mRegistarLanc.mock.calls[0] as unknown as [unknown, Row];
    expect(lanc.diarioTipo).toBe('CAIXA');
    const partidas = lanc.partidas as Row[];
    expect(partidas.find((p) => p.tipo === 'DEBITO')?.contaCodigo).toBe('411');
    expect(partidas.find((p) => p.tipo === 'CREDITO')?.contaCodigo).toBe('111');

    expect(mMovCaixa).toHaveBeenCalledTimes(1);
    const [txM, mov] = mMovCaixa.mock.calls[0] as unknown as [unknown, Row];
    expect(txM).toBe(d);
    expect(mov.sessaoCaixaId).toBe('sess-1');
    expect(mov.tipo).toBe('DEVOLUCAO');
    expect(num(mov.valor)).toBe(116);

    const nc = d.obter('notaCredito', ID_NC);
    expect(nc.status).toBe('LIQUIDADA');
    expect(nc.lancamentoLiquidacaoId).toBe('lan-liq-1');
  });

  it('NUMERARIO sem caixa:operar ⇒ MEIO_PAGAMENTO_SEM_PERMISSAO antes de resolver ou escrever', async () => {
    semearNC();
    const antes = d.fotografia();

    await esperarRegra(devolver('NUMERARIO', ctxCom('financas:banca:escrita')), 'MEIO_PAGAMENTO_SEM_PERMISSAO');

    expect(mResolver).not.toHaveBeenCalled();
    expect(mRegistarLanc).not.toHaveBeenCalled();
    expect(mMovCaixa).not.toHaveBeenCalled();
    expect(d.escritas()).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });

  it.each(['TRANSFERENCIA_BANCARIA', 'CHEQUE', 'M-PESA', 'E-MOLA'] as const)(
    '%s sem financas:banca:escrita ⇒ MEIO_PAGAMENTO_SEM_PERMISSAO antes de resolver ou escrever',
    async (forma) => {
      semearNC();
      const antes = d.fotografia();

      await esperarRegra(devolver(forma, ctxCom('caixa:operar')), 'MEIO_PAGAMENTO_SEM_PERMISSAO');

      expect(mResolver).not.toHaveBeenCalled();
      expect(mRegistarLanc).not.toHaveBeenCalled();
      expect(d.escritas()).toHaveLength(0);
      expect(d.fotografia()).toBe(antes);
    },
  );

  it.each(['NUMERARIO', 'TRANSFERENCIA_BANCARIA'] as const)(
    '%s com ctx SEM permissions ⇒ MEIO_PAGAMENTO_SEM_PERMISSAO antes de resolver ou escrever',
    async (forma) => {
      semearNC();
      const antes = d.fotografia();
      const semPermissoes: CtxLiquidar = { tenantId: TA, userId: 'user-a' };

      await esperarRegra(devolver(forma, semPermissoes), 'MEIO_PAGAMENTO_SEM_PERMISSAO');

      expect(mResolver).not.toHaveBeenCalled();
      expect(mRegistarLanc).not.toHaveBeenCalled();
      expect(mMovCaixa).not.toHaveBeenCalled();
      expect(d.escritas()).toHaveLength(0);
      expect(d.fotografia()).toBe(antes);
    },
  );

  it('recusa do resolvedor (sem sessão de caixa) propaga e a NC fica EMITIDA', async () => {
    semearNC();
    mResolver.mockRejectedValueOnce(new BusinessRuleError('SESSAO_CAIXA_NECESSARIA', 'Abra o caixa'));
    const antes = d.fotografia();

    await esperarRegra(devolver('NUMERARIO', ctxCom('caixa:operar')), 'SESSAO_CAIXA_NECESSARIA');

    expect(mRegistarLanc).not.toHaveBeenCalled();
    expect(d.fotografia()).toBe(antes);
    expect(d.obter('notaCredito', ID_NC).status).toBe('EMITIDA');
  });

  it('PERIODO_FECHADO no lançamento de liquidação: propaga e a NC fica EMITIDA', async () => {
    semearNC();
    mResolver.mockResolvedValueOnce({ contaCodigo: '1201', diarioTipo: 'BANCO' });
    mRegistarLanc.mockRejectedValueOnce(new BusinessRuleError('PERIODO_FECHADO', 'fechado'));
    const antes = d.fotografia();

    await esperarRegra(devolver('TRANSFERENCIA_BANCARIA', ctxCom('financas:banca:escrita')), 'PERIODO_FECHADO');

    expect(d.fotografia()).toBe(antes);
  });

  it('tranca a NC com FOR UPDATE antes de a ler', async () => {
    semearNC();
    mResolver.mockResolvedValueOnce({ contaCodigo: '1201', diarioTipo: 'BANCO' });

    await devolver('TRANSFERENCIA_BANCARIA', ctxCom('financas:banca:escrita'));

    const tranca = indiceTranca(ID_NC, TA);
    expect(tranca).toBeGreaterThanOrEqual(0);
    expect(tranca).toBeLessThan(indicePrimeiraLeitura('notaCredito'));
  });
});

// ---------------------------------------------------------------------------
// liquidarNotaCredito — estados, tenant e sequências
// ---------------------------------------------------------------------------

describe('liquidarNotaCredito — estados e tenant', () => {
  it.each(['LIQUIDADA', 'CANCELADA', 'RASCUNHO'])('NC %s ⇒ BusinessRuleError, sem escrita', async (status) => {
    semearNC({ status });
    semearFatura();
    const antes = d.fotografia();

    await esperarRegra(compensar());

    expect(d.escritas()).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
    expect(mRegistarLanc).not.toHaveBeenCalled();
  });

  it('NC CANCELADA ⇒ devolução recusada sem chamar o resolvedor', async () => {
    semearNC({ status: 'CANCELADA' });
    const antes = d.fotografia();

    await esperarRegra(devolver('TRANSFERENCIA_BANCARIA', ctxCom('financas:banca:escrita')));

    expect(mResolver).not.toHaveBeenCalled();
    expect(mRegistarLanc).not.toHaveBeenCalled();
    expect(d.fotografia()).toBe(antes);
  });

  it('cross-tenant ⇒ NotFoundError, sem escrita', async () => {
    semearNC({ tenantId: TB });
    semearFatura({ tenantId: TB });
    const antes = d.fotografia();

    const e = await erroDe(compensar());

    expect(e).toBeInstanceOf(NotFoundError);
    expect(d.escritas()).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });

  it('EMITIDA ⇒ LIQUIDADA ⇒ cancelar recusa (BusinessRuleError) e nada é estornado', async () => {
    semearNC();
    semearFatura();

    await compensar();
    expect(d.obter('notaCredito', ID_NC).status).toBe('LIQUIDADA');
    const antes = d.fotografia();

    await esperarRegra(cancelarNotaCredito(ID_NC, 'Tarde demais', CTX_A));

    expect(mEstornar).not.toHaveBeenCalled();
    expect(d.fotografia()).toBe(antes);
    expect(d.obter('notaCredito', ID_NC).motivoCancelamento).toBeNull();
  });

  it('EMITIDA ⇒ CANCELADA ⇒ liquidar recusa (BusinessRuleError) e a factura não é tocada', async () => {
    semearNC();
    semearFatura();

    await cancelarNotaCredito(ID_NC, 'Emitida por engano', CTX_A);
    expect(d.obter('notaCredito', ID_NC).status).toBe('CANCELADA');
    const antes = d.fotografia();

    await esperarRegra(compensar());

    expect(d.fotografia()).toBe(antes);
    expect(num(d.obter('fatura', ID_FAT).totalPago)).toBe(0);
  });
});
