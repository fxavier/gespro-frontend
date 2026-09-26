/**
 * Oráculo do ticket 4 do épico #149 — serviço das séries de documento.
 *
 * Escrito pelo verificador ANTES da implementação; o implementador não o altera.
 *
 * Corre contra um duplo COM ESTADO do cliente estendido (`prisma`):
 *   - `$transaction(fn)` executa a callback com o próprio duplo; se lançar, repõe
 *     o estado (snapshot) — o teste afirma «nada escrito» sem ditar a ordem;
 *   - `$executeRaw`/`$queryRaw` só REGISTAM (devolvem 0/[]) — são as trancas;
 *   - `findFirst`/`findUnique`/`findMany`/`count` leem e ficam no registo, para
 *     provar que a tranca vem antes da leitura;
 *   - `create`/`update` impõem `@@unique([tenantId, tipo, ano, prefixo])` E o
 *     índice parcial `SerieDocumento_activa_unica` (uma activa por
 *     tenant+tipo+ano), lançando um `PrismaClientKnownRequestError` P2002 real.
 *   - `prismaBase` rebenta a qualquer acesso: a escrita tem de ir pelo cliente
 *     estendido, senão a auditoria não a vê.
 *
 * Invariantes: S1 (uma activa), S2/S3 (usada ⇔ proximoNumero > numeroInicial;
 * usada não se edita nem elimina), S4 (formato fixo), S5 (ano corrente ou
 * seguinte em Africa/Maputo, só na criação).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;
type Entrada = { tipo: 'lock-exec' | 'lock-query' | 'leitura' | 'escrita'; texto: string; op?: string };

const FORMATO = '{prefixo}/{ano}/{numero:06}';

// ---------------------------------------------------------------------------
// Duplo com estado
// ---------------------------------------------------------------------------

function p2002(alvo: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (${alvo.join(',')})`, {
    code: 'P2002',
    clientVersion: 'duplo',
    meta: { modelName: 'SerieDocumento', target: alvo },
  });
}

function textoRaw(args: unknown[]): string {
  const [primeiro, ...valores] = args as [any, ...unknown[]];
  // tagged template: (strings, ...values)
  if (Array.isArray(primeiro) || (primeiro && Array.isArray(primeiro.raw))) {
    return [...(primeiro as string[]), ...valores.map(String)].join(' ');
  }
  // Prisma.sql / Prisma.Sql
  if (primeiro && typeof primeiro === 'object' && 'strings' in primeiro) {
    return [...primeiro.strings, ...(primeiro.values ?? []).map(String)].join(' ');
  }
  return String(primeiro);
}

function corresponde(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (k === 'AND') {
      if (!(Array.isArray(cond) ? cond : [cond]).every((w) => corresponde(row, w))) return false;
      continue;
    }
    if (k === 'OR') {
      if (!(cond as Row[]).some((w) => corresponde(row, w))) return false;
      continue;
    }
    if (k === 'NOT') {
      if ((Array.isArray(cond) ? cond : [cond]).some((w) => corresponde(row, w))) return false;
      continue;
    }
    const v = row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('equals' in c && v !== c.equals) return false;
      if ('not' in c && (c.not !== null && typeof c.not === 'object' ? corresponde(row, { [k]: c.not }) : v === c.not)) return false;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      if ('notIn' in c && (c.notIn as unknown[]).includes(v)) return false;
      if ('lt' in c && !(v < c.lt)) return false;
      if ('lte' in c && !(v <= c.lte)) return false;
      if ('gt' in c && !(v > c.gt)) return false;
      if ('gte' in c && !(v >= c.gte)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

class DuploSeries {
  series: Row[] = [];
  registo: Entrada[] = [];
  escritasTentadas = 0;
  private seq = 0;

  semear(s: Partial<Row> & { tenantId: string; tipo: string; ano: number; prefixo: string }): Row {
    const r: Row = {
      id: `cserie${String(++this.seq).padStart(8, '0')}`,
      proximoNumero: 1,
      numeroInicial: 1,
      formatoNumero: FORMATO,
      ativo: true,
      createdAt: new Date('2026-01-01T08:00:00Z'),
      updatedAt: new Date('2026-01-01T08:00:00Z'),
      ...s,
    };
    this.series.push(r);
    return r;
  }

  obter(id: string): Row | undefined {
    return this.series.find((s) => s.id === id);
  }

  /** Simula a emissão de um documento: o que `proximoNumeroSerie` faz em SQL. */
  emitir(id: string): void {
    this.obter(id)!.proximoNumero += 1;
  }

  fotografia(): string {
    return JSON.stringify(this.series);
  }

  limparRegisto(): void {
    this.registo = [];
    this.escritasTentadas = 0;
  }

  private impor(candidato: Row, ignorarId?: string): void {
    const outros = this.series.filter((s) => s.id !== ignorarId);
    if (
      outros.some(
        (s) =>
          s.tenantId === candidato.tenantId &&
          s.tipo === candidato.tipo &&
          s.ano === candidato.ano &&
          s.prefixo === candidato.prefixo,
      )
    ) {
      throw p2002(['tenantId', 'tipo', 'ano', 'prefixo']);
    }
    if (
      candidato.ativo &&
      outros.some((s) => s.ativo && s.tenantId === candidato.tenantId && s.tipo === candidato.tipo && s.ano === candidato.ano)
    ) {
      throw p2002(['tenantId', 'tipo', 'ano']); // SerieDocumento_activa_unica (índice parcial)
    }
  }

  private ler(op: string) {
    this.registo.push({ tipo: 'leitura', texto: op, op });
  }

  readonly serieDocumento = {
    findFirst: async (args: Row = {}) => {
      this.ler('findFirst');
      const r = this.series.find((s) => corresponde(s, args.where));
      return r ? { ...r } : null;
    },
    findUnique: async (args: Row = {}) => {
      this.ler('findUnique');
      const r = this.series.find((s) => corresponde(s, args.where));
      return r ? { ...r } : null;
    },
    findMany: async (args: Row = {}) => {
      this.ler('findMany');
      return this.series.filter((s) => corresponde(s, args.where)).map((s) => ({ ...s }));
    },
    count: async (args: Row = {}) => {
      this.ler('count');
      return this.series.filter((s) => corresponde(s, args.where)).length;
    },
    create: async (args: Row) => {
      this.escritasTentadas += 1;
      this.registo.push({ tipo: 'escrita', texto: 'create', op: 'create' });
      const agora = new Date();
      const r: Row = {
        id: `cserie${String(++this.seq).padStart(8, '0')}`,
        proximoNumero: 1,
        numeroInicial: 1,
        formatoNumero: FORMATO,
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
        ...args.data,
      };
      this.impor(r);
      this.series.push(r);
      return { ...r };
    },
    update: async (args: Row) => {
      this.escritasTentadas += 1;
      this.registo.push({ tipo: 'escrita', texto: 'update', op: 'update' });
      const alvo = this.series.find((s) => corresponde(s, args.where));
      if (!alvo) {
        throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
          code: 'P2025',
          clientVersion: 'duplo',
        });
      }
      const novo = { ...alvo, ...args.data, updatedAt: new Date() };
      this.impor(novo, alvo.id);
      Object.assign(alvo, novo);
      return { ...alvo };
    },
    delete: async (args: Row) => {
      this.escritasTentadas += 1;
      this.registo.push({ tipo: 'escrita', texto: 'delete', op: 'delete' });
      const i = this.series.findIndex((s) => corresponde(s, args.where));
      if (i < 0) {
        throw new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', {
          code: 'P2025',
          clientVersion: 'duplo',
        });
      }
      const [r] = this.series.splice(i, 1);
      return { ...r };
    },
    // Escritas em lote não passam na auditoria — o serviço não as pode usar.
    createMany: async () => {
      throw new Error('duplo: createMany proibido (a auditoria só vê escritas singulares)');
    },
    updateMany: async () => {
      throw new Error('duplo: updateMany proibido (a auditoria só vê escritas singulares)');
    },
    deleteMany: async () => {
      throw new Error('duplo: deleteMany proibido (a auditoria só vê escritas singulares)');
    },
    upsert: async () => {
      throw new Error('duplo: upsert proibido (a auditoria só vê escritas singulares)');
    },
  };

  $executeRaw = async (...args: unknown[]) => {
    this.registo.push({ tipo: 'lock-exec', texto: textoRaw(args) });
    return 0;
  };

  $queryRaw = async (...args: unknown[]) => {
    this.registo.push({ tipo: 'lock-query', texto: textoRaw(args) });
    return [];
  };

  $transaction = async (fn: unknown) => {
    if (typeof fn !== 'function') throw new Error('duplo: só $transaction interactiva (callback)');
    const antes = this.series.map((s) => ({ ...s }));
    const seqAntes = this.seq;
    try {
      return await (fn as (tx: DuploSeries) => Promise<unknown>)(this);
    } catch (e) {
      this.series = antes;
      this.seq = seqAntes;
      throw e;
    }
  };
}

const { estado } = vi.hoisted(() => ({ estado: { duplo: undefined as unknown } }));

vi.mock('@/server/db/client', () => {
  const prisma = new Proxy(
    {},
    {
      get: (_t, prop) => {
        const d = estado.duplo as Record<string | symbol, unknown>;
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
        throw new Error(`duplo: prismaBase.${String(prop)} — as séries escrevem pelo cliente estendido (auditoria)`);
      },
    },
  );
  return { prisma, prismaBase };
});

import {
  criarSerie,
  editarSerie,
  activarSerie,
  desactivarSerie,
  eliminarSerie,
} from '../faturacao.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { AUDIT_MODELS } from '@/server/db/audit-extension';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TA = 'tenant-a';
const TB = 'tenant-b';
const CTX_A = { tenantId: TA, userId: 'user-a' };

let d: DuploSeries;

beforeEach(() => {
  d = new DuploSeries();
  estado.duplo = d;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-26T10:00:00Z')); // 26/09/2026, Maputo
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

async function esperarRegra(p: Promise<unknown>, codigo: string): Promise<void> {
  const e = await erroDe(p);
  expect(e).toBeInstanceOf(BusinessRuleError);
  expect(e.code).toBe(codigo);
}

async function esperarNaoEncontrada(p: Promise<unknown>): Promise<void> {
  const e = await erroDe(p);
  expect(e).toBeInstanceOf(NotFoundError);
  expect(e.code).toBe('NAO_ENCONTRADO');
}

/** Afirma que nada mudou no estado e que nenhuma escrita foi sequer tentada. */
function esperarNadaEscrito(foto: string): void {
  expect(d.fotografia()).toBe(foto);
  expect(d.escritasTentadas).toBe(0);
}

const primeiraLeitura = () => d.registo.findIndex((e) => e.tipo === 'leitura');
const ultimaLeitura = () => d.registo.map((e) => e.tipo).lastIndexOf('leitura');
const indiceAdvisory = (tenantId: string, tipo: string, ano: number) =>
  d.registo.findIndex(
    (e) =>
      e.tipo === 'lock-exec' &&
      e.texto.includes('pg_advisory_xact_lock') &&
      e.texto.includes(tenantId) &&
      e.texto.includes(tipo) &&
      e.texto.includes(String(ano)),
  );
const indiceForUpdate = (id: string, tenantId: string) =>
  d.registo.findIndex(
    (e) =>
      e.tipo === 'lock-query' &&
      /FOR\s+UPDATE/i.test(e.texto) &&
      e.texto.includes('"SerieDocumento"') &&
      e.texto.includes(id) &&
      e.texto.includes(tenantId),
  );

// ---------------------------------------------------------------------------
// criarSerie
// ---------------------------------------------------------------------------

describe('criarSerie', () => {
  it('cria activa, com formato fixo (S4) e proximoNumero = numeroInicial', async () => {
    const s = await criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2026, numeroInicial: 350 }, CTX_A);
    expect(s).toMatchObject({
      tenantId: TA,
      tipo: 'FATURA',
      prefixo: 'FAT',
      ano: 2026,
      numeroInicial: 350,
      proximoNumero: 350,
      formatoNumero: FORMATO,
      ativo: true,
    });
    expect(d.series).toHaveLength(1);
    expect(d.series[0]).toMatchObject({ tenantId: TA, numeroInicial: 350, proximoNumero: 350, formatoNumero: FORMATO, ativo: true });
  });

  it('numeroInicial por omissão (1) chega a proximoNumero', async () => {
    const s = await criarSerie({ tipo: 'RECIBO', prefixo: 'REC', ano: 2027, numeroInicial: 1 }, CTX_A);
    expect(s).toMatchObject({ numeroInicial: 1, proximoNumero: 1, ativo: true, formatoNumero: FORMATO });
  });

  it('S5: aceita o ano corrente e o seguinte (Africa/Maputo)', async () => {
    await criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2026, numeroInicial: 1 }, CTX_A);
    await criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2027, numeroInicial: 1 }, CTX_A);
    expect(d.series.map((s) => s.ano).sort()).toEqual([2026, 2027]);
  });

  it.each([2024, 2025, 2028])('S5: recusa o ano %i com SERIE_ANO_INVALIDO, sem escrever', async (ano) => {
    const foto = d.fotografia();
    await esperarRegra(criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano, numeroInicial: 1 }, CTX_A), 'SERIE_ANO_INVALIDO');
    esperarNadaEscrito(foto);
  });

  it('S5 na fronteira: 31/12/2026 22h00 UTC já é 2027 em Maputo ⇒ 2026 recusado, 2028 aceite', async () => {
    vi.setSystemTime(new Date('2026-12-31T22:00:00Z'));
    const foto = d.fotografia();
    await esperarRegra(
      criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2026, numeroInicial: 1 }, CTX_A),
      'SERIE_ANO_INVALIDO',
    );
    esperarNadaEscrito(foto);
    const s = await criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2028, numeroInicial: 1 }, CTX_A);
    expect(s.ano).toBe(2028);
  });

  it('S5 na fronteira: 31/12/2026 21h59 UTC ainda é 2026 ⇒ 2028 recusado', async () => {
    vi.setSystemTime(new Date('2026-12-31T21:59:00Z'));
    await esperarRegra(
      criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2028, numeroInicial: 1 }, CTX_A),
      'SERIE_ANO_INVALIDO',
    );
    const s = await criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2026, numeroInicial: 1 }, CTX_A);
    expect(s.ano).toBe(2026);
  });

  it('S1: outra activa no mesmo tipo+ano ⇒ SERIE_ACTIVA_EXISTENTE, sem escrever', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    const foto = d.fotografia();
    await esperarRegra(
      criarSerie({ tipo: 'FATURA', prefixo: 'FT', ano: 2026, numeroInicial: 1 }, CTX_A),
      'SERIE_ACTIVA_EXISTENTE',
    );
    esperarNadaEscrito(foto);
  });

  it('S1 não confunde tipo, ano nem tenant', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' }); // mesmo tenant+ano, outro tipo
    d.semear({ tenantId: TA, tipo: 'NOTA_CREDITO', ano: 2027, prefixo: 'NC' }); // mesmo tenant+tipo, outro ano
    d.semear({ tenantId: TB, tipo: 'NOTA_CREDITO', ano: 2026, prefixo: 'NCB' }); // outro tenant
    const s = await criarSerie({ tipo: 'NOTA_CREDITO', prefixo: 'NC', ano: 2026, numeroInicial: 1 }, CTX_A);
    expect(s).toMatchObject({ tenantId: TA, tipo: 'NOTA_CREDITO', ano: 2026, ativo: true });
  });

  it('uma série INACTIVA no mesmo tipo+ano não impede criar outra (prefixo diferente)', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: false });
    const s = await criarSerie({ tipo: 'FATURA', prefixo: 'FT', ano: 2026, numeroInicial: 1 }, CTX_A);
    expect(s).toMatchObject({ prefixo: 'FT', ativo: true });
  });

  it('mesmo tipo+ano+prefixo (inactiva existente) ⇒ P2002 ⇒ SERIE_DUPLICADA, estado intacto', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: false });
    const foto = d.fotografia();
    await esperarRegra(
      criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2026, numeroInicial: 1 }, CTX_A),
      'SERIE_DUPLICADA',
    );
    expect(d.fotografia()).toBe(foto);
  });

  it('P2002 vindo da escrita (corrida) é traduzido para SERIE_DUPLICADA', async () => {
    const original = d.serieDocumento.create;
    (d.serieDocumento as any).create = async (args: Row) => {
      d.escritasTentadas += 1;
      void args;
      throw p2002(['tenantId', 'tipo', 'ano', 'prefixo']);
    };
    const foto = d.fotografia();
    await esperarRegra(
      criarSerie({ tipo: 'FATURA', prefixo: 'FAT', ano: 2026, numeroInicial: 1 }, CTX_A),
      'SERIE_DUPLICADA',
    );
    expect(d.fotografia()).toBe(foto);
    (d.serieDocumento as any).create = original;
  });

  it('tranca: pg_advisory_xact_lock com tenant+tipo+ano ANTES de qualquer leitura', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: false });
    await criarSerie({ tipo: 'PROFORMA', prefixo: 'PRO', ano: 2027, numeroInicial: 1 }, CTX_A);
    const iLock = indiceAdvisory(TA, 'PROFORMA', 2027);
    expect(iLock).toBeGreaterThanOrEqual(0);
    const iLeitura = primeiraLeitura();
    expect(iLeitura).toBeGreaterThan(iLock);
    expect(d.registo.findIndex((e) => e.tipo === 'escrita')).toBeGreaterThan(iLeitura);
  });
});

// ---------------------------------------------------------------------------
// editarSerie
// ---------------------------------------------------------------------------

describe('editarSerie', () => {
  it('altera prefixo e numeroInicial, e proximoNumero acompanha numeroInicial', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', numeroInicial: 1, proximoNumero: 1 });
    const r = await editarSerie({ id: s.id, prefixo: 'FT', numeroInicial: 1200 }, CTX_A);
    expect(r).toMatchObject({ id: s.id, prefixo: 'FT', numeroInicial: 1200, proximoNumero: 1200 });
    expect(d.obter(s.id)).toMatchObject({ prefixo: 'FT', numeroInicial: 1200, proximoNumero: 1200 });
  });

  it('série do bootstrap (1,1): editável até emitir; depois de emitir, SERIE_USADA e trancada', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', numeroInicial: 1, proximoNumero: 1 });

    await editarSerie({ id: s.id, prefixo: 'FAT', numeroInicial: 50 }, CTX_A);
    expect(d.obter(s.id)).toMatchObject({ numeroInicial: 50, proximoNumero: 50 });

    d.emitir(s.id); // FAT/2026/000050 emitida ⇒ proximoNumero 51
    d.limparRegisto();
    const foto = d.fotografia();
    await esperarRegra(editarSerie({ id: s.id, prefixo: 'FT', numeroInicial: 1 }, CTX_A), 'SERIE_USADA');
    esperarNadaEscrito(foto);
    expect(d.obter(s.id)).toMatchObject({ prefixo: 'FAT', numeroInicial: 50, proximoNumero: 51 });
  });

  it('S3: série usada (proximoNumero > numeroInicial) ⇒ SERIE_USADA, sem escrever', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', numeroInicial: 1, proximoNumero: 488 });
    const foto = d.fotografia();
    await esperarRegra(editarSerie({ id: s.id, prefixo: 'FAT', numeroInicial: 1 }, CTX_A), 'SERIE_USADA');
    esperarNadaEscrito(foto);
  });

  it('prefixo colide com outra série do mesmo tipo+ano ⇒ SERIE_DUPLICADA, estado intacto', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FT', ativo: false });
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    const foto = d.fotografia();
    await esperarRegra(editarSerie({ id: s.id, prefixo: 'FT', numeroInicial: 1 }, CTX_A), 'SERIE_DUPLICADA');
    expect(d.fotografia()).toBe(foto);
  });

  it('inexistente ⇒ NotFoundError, sem escrever', async () => {
    const foto = d.fotografia();
    await esperarNaoEncontrada(editarSerie({ id: 'cnaoexiste000000000000000', prefixo: 'X', numeroInicial: 1 }, CTX_A));
    esperarNadaEscrito(foto);
  });

  it('cross-tenant ⇒ NotFoundError (nunca 403), sem escrever', async () => {
    const s = d.semear({ tenantId: TB, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    const foto = d.fotografia();
    const e = await erroDe(editarSerie({ id: s.id, prefixo: 'X', numeroInicial: 9 }, CTX_A));
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.status).toBe(404);
    esperarNadaEscrito(foto);
  });

  it('tranca: SELECT … FOR UPDATE da série (id + tenant) ANTES de qualquer leitura', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    await editarSerie({ id: s.id, prefixo: 'FT', numeroInicial: 3 }, CTX_A);
    const iLock = indiceForUpdate(s.id, TA);
    expect(iLock).toBeGreaterThanOrEqual(0);
    expect(primeiraLeitura()).toBeGreaterThan(iLock);
  });
});

// ---------------------------------------------------------------------------
// activarSerie / desactivarSerie — transições nos dois sentidos
// ---------------------------------------------------------------------------

describe('activarSerie / desactivarSerie', () => {
  it('activa → inactiva → activa, contra o estado; idempotentes sem escrever', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: true });

    const r1 = await desactivarSerie({ id: s.id }, CTX_A);
    expect(r1).toMatchObject({ id: s.id, ativo: false });
    expect(d.obter(s.id)!.ativo).toBe(false);

    d.limparRegisto();
    const r2 = await desactivarSerie({ id: s.id }, CTX_A); // já inactiva
    expect(r2).toMatchObject({ id: s.id, ativo: false });
    expect(d.escritasTentadas).toBe(0);

    d.limparRegisto();
    const r3 = await activarSerie({ id: s.id }, CTX_A);
    expect(r3).toMatchObject({ id: s.id, ativo: true });
    expect(d.obter(s.id)!.ativo).toBe(true);
    expect(d.escritasTentadas).toBe(1);

    d.limparRegisto();
    const r4 = await activarSerie({ id: s.id }, CTX_A); // já activa
    expect(r4).toMatchObject({ id: s.id, ativo: true });
    expect(d.escritasTentadas).toBe(0);
  });

  it('desactivar/activar não mexe em prefixo nem numeração (mesmo numa série usada)', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', numeroInicial: 1, proximoNumero: 40 });
    await desactivarSerie({ id: s.id }, CTX_A);
    await activarSerie({ id: s.id }, CTX_A);
    expect(d.obter(s.id)).toMatchObject({ prefixo: 'FAT', numeroInicial: 1, proximoNumero: 40, ativo: true });
  });

  it('S1: activar com outra activa no mesmo tipo+ano ⇒ SERIE_ACTIVA_EXISTENTE, sem escrever', async () => {
    d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: true });
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FT', ativo: false });
    const foto = d.fotografia();
    await esperarRegra(activarSerie({ id: s.id }, CTX_A), 'SERIE_ACTIVA_EXISTENTE');
    esperarNadaEscrito(foto);
  });

  it('S1 é por tenant: a activa de outro tenant não impede', async () => {
    d.semear({ tenantId: TB, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: true });
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: false });
    const r = await activarSerie({ id: s.id }, CTX_A);
    expect(r.ativo).toBe(true);
  });

  it('reactivar uma série de ano antigo (2024) é aceite — S5 só limita a criação', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'NOTA_DEBITO', ano: 2024, prefixo: 'ND', ativo: false, proximoNumero: 12 });
    const r = await activarSerie({ id: s.id }, CTX_A);
    expect(r).toMatchObject({ id: s.id, ano: 2024, ativo: true });
    expect(d.obter(s.id)!.ativo).toBe(true);
  });

  it('S1 aplica-se também a anos antigos: 2024 com outra activa em 2024 ⇒ recusa', async () => {
    d.semear({ tenantId: TA, tipo: 'NOTA_DEBITO', ano: 2024, prefixo: 'ND', ativo: true });
    const s = d.semear({ tenantId: TA, tipo: 'NOTA_DEBITO', ano: 2024, prefixo: 'ND2', ativo: false });
    const foto = d.fotografia();
    await esperarRegra(activarSerie({ id: s.id }, CTX_A), 'SERIE_ACTIVA_EXISTENTE');
    esperarNadaEscrito(foto);
  });

  it.each([
    ['activarSerie', (id: string) => activarSerie({ id }, CTX_A)],
    ['desactivarSerie', (id: string) => desactivarSerie({ id }, CTX_A)],
  ] as const)('%s: inexistente e cross-tenant ⇒ NotFoundError, sem escrever', async (_n, chamar) => {
    const alheia = d.semear({ tenantId: TB, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', ativo: false });
    const alheiaActiva = d.semear({ tenantId: TB, tipo: 'RECIBO', ano: 2026, prefixo: 'REC', ativo: true });
    const foto = d.fotografia();
    await esperarNaoEncontrada(chamar('cnaoexiste000000000000000'));
    await esperarNaoEncontrada(chamar(alheia.id));
    await esperarNaoEncontrada(chamar(alheiaActiva.id));
    esperarNadaEscrito(foto);
  });

  it('desactivar: tranca FOR UPDATE da série (id + tenant) ANTES de qualquer leitura', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    await desactivarSerie({ id: s.id }, CTX_A);
    const iLock = indiceForUpdate(s.id, TA);
    expect(iLock).toBeGreaterThanOrEqual(0);
    expect(primeiraLeitura()).toBeGreaterThan(iLock);
  });

  it('activar: há tranca antes da 1.ª leitura, e a advisory de tenant+tipo+ano antes da última', async () => {
    // A chave da advisory depende do tipo+ano da série, que só se conhece lendo-a:
    // o oráculo exige uma tranca antes de QUALQUER leitura e a advisory (a mesma
    // da criação) antes da leitura que decide S1 — a última.
    const s = d.semear({ tenantId: TA, tipo: 'COTACAO_COMERCIAL', ano: 2025, prefixo: 'COT', ativo: false });
    await activarSerie({ id: s.id }, CTX_A);
    const iPrimeiraTranca = d.registo.findIndex((e) => e.tipo === 'lock-exec' || e.tipo === 'lock-query');
    expect(iPrimeiraTranca).toBeGreaterThanOrEqual(0);
    expect(primeiraLeitura()).toBeGreaterThan(iPrimeiraTranca);
    const iAdvisory = indiceAdvisory(TA, 'COTACAO_COMERCIAL', 2025);
    expect(iAdvisory).toBeGreaterThanOrEqual(0);
    expect(ultimaLeitura()).toBeGreaterThan(iAdvisory);
  });
});

// ---------------------------------------------------------------------------
// eliminarSerie
// ---------------------------------------------------------------------------

describe('eliminarSerie', () => {
  it('elimina uma série não usada', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'PROFORMA', ano: 2026, prefixo: 'PRO', numeroInicial: 10, proximoNumero: 10 });
    const outra = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    await eliminarSerie({ id: s.id }, CTX_A);
    expect(d.obter(s.id)).toBeUndefined();
    expect(d.obter(outra.id)).toBeDefined();
  });

  it('S3: série usada ⇒ SERIE_USADA, sem escrever', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT', numeroInicial: 1, proximoNumero: 1 });
    d.emitir(s.id);
    const foto = d.fotografia();
    await esperarRegra(eliminarSerie({ id: s.id }, CTX_A), 'SERIE_USADA');
    esperarNadaEscrito(foto);
  });

  it('inexistente e cross-tenant ⇒ NotFoundError, sem escrever', async () => {
    const alheia = d.semear({ tenantId: TB, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    const foto = d.fotografia();
    await esperarNaoEncontrada(eliminarSerie({ id: 'cnaoexiste000000000000000' }, CTX_A));
    await esperarNaoEncontrada(eliminarSerie({ id: alheia.id }, CTX_A));
    esperarNadaEscrito(foto);
    expect(d.obter(alheia.id)).toBeDefined();
  });

  it('tranca: FOR UPDATE da série (id + tenant) ANTES de qualquer leitura', async () => {
    const s = d.semear({ tenantId: TA, tipo: 'FATURA', ano: 2026, prefixo: 'FAT' });
    await eliminarSerie({ id: s.id }, CTX_A);
    const iLock = indiceForUpdate(s.id, TA);
    expect(iLock).toBeGreaterThanOrEqual(0);
    expect(primeiraLeitura()).toBeGreaterThan(iLock);
  });
});

// ---------------------------------------------------------------------------
// Ticket 4.3 — auditoria
// ---------------------------------------------------------------------------

describe('auditoria (ticket 4.3)', () => {
  it("AUDIT_MODELS contém 'SerieDocumento'", () => {
    expect(AUDIT_MODELS.has('SerieDocumento')).toBe(true);
  });
});
