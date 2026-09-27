/**
 * Oráculo da revisão do #253 (épico #148) — tranca da factura em `registarPagamento`
 * e `marcarVencida`.
 *
 * Escrito pelo verificador ANTES da implementação; o implementador não o altera.
 *
 * A compensação de uma NC (liquidarNotaCredito) tranca a factura com `FOR UPDATE` e
 * soma ao `totalPago`. Se `registarPagamento` ler a factura sem tranca, os dois
 * read-modify-write perdem um ao outro. Fixado: as duas funções correm em
 * `prisma.$transaction` (cliente estendido) e fazem `SELECT … FOR UPDATE` da factura
 * (id + tenant) ANTES do `findFirst`.
 *
 * O duplo simula a corrida: a tranca é o momento em que a transacção concorrente
 * acabou de fazer commit (o gancho `aoTrancar` muda a linha). Quem lê antes de trancar
 * escreve com o valor velho; quem lê depois escreve com o valor novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;
type Entrada = { tipo: 'tranca'; texto: string; emTx: boolean } | { tipo: 'leitura' } | { tipo: 'escrita'; data: Row };

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
  return Object.entries(where).every(([k, v]) => v === undefined || row[k] === v);
}

class Duplo {
  faturas: Row[] = [];
  registo: Entrada[] = [];
  /** Corre na primeira tranca da factura: o commit da transacção concorrente. */
  aoTrancar: ((f: Row) => void) | null = null;

  readonly fatura = {
    findFirst: async (args: Row = {}) => {
      this.registo.push({ tipo: 'leitura' });
      const r = this.faturas.find((x) => corresponde(x, args.where));
      return r ? { ...r } : null;
    },
    findUnique: async (args: Row = {}) => {
      this.registo.push({ tipo: 'leitura' });
      const r = this.faturas.find((x) => corresponde(x, args.where));
      return r ? { ...r } : null;
    },
    update: async (args: Row) => {
      this.registo.push({ tipo: 'escrita', data: args.data });
      const alvo = this.faturas.find((x) => corresponde(x, args.where));
      if (!alvo) throw new Error('duplo: P2025');
      Object.assign(alvo, args.data);
      return { ...alvo };
    },
    updateMany: async () => {
      throw new Error('duplo: updateMany proibido (a auditoria só vê escritas singulares)');
    },
    upsert: async () => {
      throw new Error('duplo: upsert proibido (a auditoria só vê escritas singulares)');
    },
  };

  private trancar(args: unknown[]) {
    const { texto, valores } = textoRaw(args);
    this.registo.push({ tipo: 'tranca', texto, emTx: this.profundidade > 0 });
    const vs = valores.map(String);
    const r = this.faturas.find((x) => vs.includes(x.id) && vs.includes(x.tenantId));
    if (r && this.aoTrancar) {
      const f = this.aoTrancar;
      this.aoTrancar = null;
      f(r);
    }
    return r ? [{ id: r.id, status: r.status }] : [];
  }

  $queryRaw = async (...args: unknown[]) => this.trancar(args);
  $queryRawUnsafe = async (...args: unknown[]) => this.trancar(args);
  $executeRaw = async (...args: unknown[]) => this.trancar(args).length;

  $transaction = async (fn: unknown) => {
    if (typeof fn !== 'function') throw new Error('duplo: só $transaction interactiva (callback)');
    const antes = this.faturas.map((r) => ({ ...r }));
    this.profundidade += 1;
    try {
      return await (fn as (tx: Duplo) => Promise<unknown>)(this);
    } catch (e) {
      this.faturas = antes;
      throw e;
    } finally {
      this.profundidade -= 1;
    }
  };

  /** > 0 dentro de um $transaction: uma tranca fora de transacção não tranca nada. */
  profundidade = 0;
}

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
        throw new Error(`duplo: prismaBase.${String(prop)} — fixado prisma.$transaction (cliente estendido)`);
      },
    },
  );
  return { prisma, prismaBase };
});

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { emailVerificado: true } })) }));

import { registarPagamento, marcarVencida } from '../faturacao.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

const TA = 'tenant-a';
const TB = 'tenant-b';
const CTX_A = { tenantId: TA, userId: 'user-a' };
const ID_FAT = 'cfat000000000000000000001';
const DATA_PAG = new Date('2026-09-20T10:00:00Z');

let d: Duplo;

function semearFatura(extra: Row = {}): Row {
  const f = {
    id: ID_FAT,
    tenantId: TA,
    numero: 'FAT/2026/000010',
    total: new Prisma.Decimal('1160'),
    totalPago: new Prisma.Decimal('0'),
    status: 'EMITIDA',
    dataPagamento: null,
    ...extra,
  };
  d.faturas.push(f);
  return f;
}

const num = (v: unknown) => Number(String(v));

beforeEach(() => {
  d = new Duplo();
  h.duplo = d;
});

function indiceTranca(): number {
  return d.registo.findIndex(
    (e) => e.tipo === 'tranca' && /FOR\s+UPDATE/i.test(e.texto) && e.texto.includes(ID_FAT) && e.texto.includes(TA),
  );
}
const indiceLeitura = () => d.registo.findIndex((e) => e.tipo === 'leitura');
function trancaEmTransacao(): boolean {
  const t = d.registo[indiceTranca()];
  return t?.tipo === 'tranca' && t.emTx;
}

async function erroDe(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('esperava-se uma rejeição e a promessa cumpriu');
}

describe('registarPagamento — tranca da factura', () => {
  it('tranca a factura com FOR UPDATE (id + tenant) ANTES de a ler', async () => {
    semearFatura();

    await registarPagamento({ faturaId: ID_FAT, valor: 100, dataPagamento: DATA_PAG }, CTX_A);

    expect(indiceTranca()).toBeGreaterThanOrEqual(0);
    expect(indiceLeitura()).toBeGreaterThanOrEqual(0);
    expect(indiceTranca()).toBeLessThan(indiceLeitura());
    expect(trancaEmTransacao()).toBe(true);
  });

  it('escreve a partir do valor lido DEPOIS da tranca (uma compensação concorrente não se perde)', async () => {
    semearFatura();
    // Enquanto esperava pela tranca, a compensação de uma NC de 116 fez commit.
    d.aoTrancar = (f) => {
      f.totalPago = new Prisma.Decimal('116');
      f.status = 'PARCIALMENTE_PAGA';
    };

    await registarPagamento({ faturaId: ID_FAT, valor: 100, dataPagamento: DATA_PAG }, CTX_A);

    const f = d.faturas[0];
    expect(num(f.totalPago)).toBe(216);
    expect(f.status).toBe('PARCIALMENTE_PAGA');
  });

  it('o estado decisivo é o lido depois da tranca: fica PAGA com a soma dos dois', async () => {
    semearFatura();
    d.aoTrancar = (f) => {
      f.totalPago = new Prisma.Decimal('1060');
      f.status = 'PARCIALMENTE_PAGA';
    };

    await registarPagamento({ faturaId: ID_FAT, valor: 100, dataPagamento: DATA_PAG }, CTX_A);

    const f = d.faturas[0];
    expect(num(f.totalPago)).toBe(1160);
    expect(f.status).toBe('PAGA');
    expect((f.dataPagamento as Date).getTime()).toBe(DATA_PAG.getTime());
  });

  it('cross-tenant ⇒ NotFoundError, sem escrita', async () => {
    semearFatura({ tenantId: TB });

    const e = await erroDe(registarPagamento({ faturaId: ID_FAT, valor: 100, dataPagamento: DATA_PAG }, CTX_A));

    expect(e).toBeInstanceOf(NotFoundError);
    expect(d.registo.filter((x) => x.tipo === 'escrita')).toHaveLength(0);
  });
});

describe('marcarVencida — tranca da factura', () => {
  it('tranca a factura com FOR UPDATE (id + tenant) ANTES de a ler, e marca VENCIDA', async () => {
    semearFatura();

    await marcarVencida(ID_FAT, CTX_A);

    expect(indiceTranca()).toBeGreaterThanOrEqual(0);
    expect(indiceTranca()).toBeLessThan(indiceLeitura());
    expect(trancaEmTransacao()).toBe(true);
    expect(d.faturas[0].status).toBe('VENCIDA');
  });

  it('factura paga entretanto (commit concorrente) ⇒ recusa e não sobrescreve PAGA', async () => {
    semearFatura();
    d.aoTrancar = (f) => {
      f.totalPago = new Prisma.Decimal('1160');
      f.status = 'PAGA';
    };

    const e = await erroDe(marcarVencida(ID_FAT, CTX_A));

    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(d.faturas[0].status).toBe('PAGA');
    expect(d.registo.filter((x) => x.tipo === 'escrita')).toHaveLength(0);
  });

  it('cross-tenant ⇒ NotFoundError, sem escrita', async () => {
    semearFatura({ tenantId: TB });

    const e = await erroDe(marcarVencida(ID_FAT, CTX_A));

    expect(e).toBeInstanceOf(NotFoundError);
    expect(d.registo.filter((x) => x.tipo === 'escrita')).toHaveLength(0);
  });
});
