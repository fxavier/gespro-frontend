/**
 * Oráculo do ticket 3 (#252) do épico #148 — cancelar proforma e cotação comercial.
 *
 * Escrito pelo verificador ANTES da implementação; o implementador não o altera.
 *
 * N4 — `motivoCancelamento` preenchido em todo o documento CANCELADO; `observacoes`
 * nunca é sobrescrito (ADR-0039 §3).
 * Estados: proforma de RASCUNHO | ENVIADA | ACEITE; cotação SÓ de RASCUNHO (depois de
 * enviada, o caminho é «Rejeitar»). Estado não permitido ⇒ BusinessRuleError sem escrita.
 *
 * Duplo com estado do cliente estendido; `prismaBase` rebenta (a escrita tem de ser
 * auditada) — excepto em `converterProformaEmFatura`, que emite uma factura e pode
 * continuar no cliente cru.
 *
 * Revisão do #253: `cancelarProforma`, `cancelarCotacaoComercial` e
 * `converterProformaEmFatura` correm em transacção e trancam o documento com
 * `FOR UPDATE` (id + tenant) ANTES de o ler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, any>;

function corresponde(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    const v = row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      if ('equals' in c && v !== c.equals) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

type Modelo = 'proforma' | 'cotacaoComercial';

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

class Duplo {
  tabelas: Record<Modelo, Row[]> = { proforma: [], cotacaoComercial: [] };
  escritas: Array<{ modelo: Modelo; op: string; data?: Row }> = [];
  /** Ordem das trancas e leituras, para provar tranca → leitura. */
  ordem: Array<{ tipo: 'tranca'; texto: string; emTx: boolean } | { tipo: 'leitura'; modelo: Modelo }> = [];

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

  private tabela(modelo: Modelo) {
    const proibido = (op: string) => async () => {
      throw new Error(`duplo: ${modelo}.${op} proibido (a auditoria só vê escritas singulares)`);
    };
    return {
      findFirst: async (args: Row = {}) => {
        this.ordem.push({ tipo: 'leitura', modelo });
        const r = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        return r ? { ...r, linhas: r.linhas ?? [] } : null;
      },
      findUnique: async (args: Row = {}) => {
        this.ordem.push({ tipo: 'leitura', modelo });
        const r = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        return r ? { ...r } : null;
      },
      update: async (args: Row) => {
        this.escritas.push({ modelo, op: 'update', data: args.data });
        const alvo = this.tabelas[modelo].find((x) => corresponde(x, args.where));
        if (!alvo) throw new Error('duplo: P2025 registo a actualizar não existe');
        Object.assign(alvo, args.data, { updatedAt: new Date() });
        return { ...alvo };
      },
      create: proibido('create'),
      createMany: proibido('createMany'),
      updateMany: proibido('updateMany'),
      upsert: proibido('upsert'),
      delete: proibido('delete'),
      deleteMany: proibido('deleteMany'),
    };
  }

  readonly proforma = this.tabela('proforma');
  readonly cotacaoComercial = this.tabela('cotacaoComercial');

  private trancar(args: unknown[]): Row[] {
    const { texto, valores } = textoRaw(args);
    this.ordem.push({ tipo: 'tranca', texto, emTx: this.profundidade > 0 });
    const vs = valores.map(String);
    for (const m of ['proforma', 'cotacaoComercial'] as const) {
      const r = this.tabelas[m].find((x) => vs.includes(x.id) && vs.includes(x.tenantId));
      if (r) return [{ id: r.id, status: r.status }];
    }
    return [];
  }

  $queryRaw = async (...args: unknown[]) => this.trancar(args);
  $queryRawUnsafe = async (...args: unknown[]) => this.trancar(args);
  $executeRaw = async (...args: unknown[]) => this.trancar(args).length;

  $transaction = async (fn: unknown) => {
    if (typeof fn !== 'function') throw new Error('duplo: só $transaction interactiva (callback)');
    const antes = {
      proforma: this.tabelas.proforma.map((r) => ({ ...r })),
      cotacaoComercial: this.tabelas.cotacaoComercial.map((r) => ({ ...r })),
    };
    this.profundidade += 1;
    try {
      return await (fn as (tx: Duplo) => Promise<unknown>)(this);
    } catch (e) {
      this.tabelas = antes;
      throw e;
    } finally {
      this.profundidade -= 1;
    }
  };

  /** > 0 dentro de um $transaction: uma tranca fora de transacção não tranca nada. */
  profundidade = 0;
}

const h = vi.hoisted(() => ({ duplo: undefined as unknown, permitirBase: false }));

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
        if (h.permitirBase) {
          const d = h.duplo as Record<string | symbol, unknown>;
          const v = d[prop];
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(d) : v;
        }
        throw new Error(`duplo: prismaBase.${String(prop)} — a escrita vai pelo cliente estendido (auditoria)`);
      },
    },
  );
  return { prisma, prismaBase };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

import { cancelarProforma, cancelarCotacaoComercial, converterProformaEmFatura } from '../faturacao.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

const TA = 'tenant-a';
const TB = 'tenant-b';
const CTX_A = { tenantId: TA, userId: 'user-a' };
const ID_PRO = 'cpro0000000000000000000001';
const ID_COT = 'ccot0000000000000000000001';
const OBS = 'Entregar no armazém de Matola — observação do vendedor';

let d: Duplo;

function semearProforma(extra: Row = {}): Row {
  return d.semear('proforma', {
    id: ID_PRO,
    tenantId: TA,
    numero: 'PRO/2026/000004',
    status: 'RASCUNHO',
    observacoes: OBS,
    motivoCancelamento: null,
    faturaId: null,
    ...extra,
  });
}

function semearCotacao(extra: Row = {}): Row {
  return d.semear('cotacaoComercial', {
    id: ID_COT,
    tenantId: TA,
    numero: 'COT/2026/000007',
    status: 'RASCUNHO',
    observacoes: OBS,
    motivoCancelamento: null,
    proformaId: null,
    faturaId: null,
    ...extra,
  });
}

beforeEach(() => {
  d = new Duplo();
  h.duplo = d;
  h.permitirBase = false;
});

/** A primeira tranca FOR UPDATE com o id e o tenant vem antes da primeira leitura do modelo. */
function esperarTrancaAntesDaLeitura(id: string, modelo: Modelo): void {
  const tranca = d.ordem.findIndex(
    (e) => e.tipo === 'tranca' && /FOR\s+UPDATE/i.test(e.texto) && e.texto.includes(id) && e.texto.includes(TA),
  );
  const leitura = d.ordem.findIndex((e) => e.tipo === 'leitura' && e.modelo === modelo);
  expect(tranca, 'tranca FOR UPDATE com id + tenant').toBeGreaterThanOrEqual(0);
  expect(leitura, 'leitura do documento').toBeGreaterThanOrEqual(0);
  expect(tranca).toBeLessThan(leitura);
  const t = d.ordem[tranca];
  expect(t.tipo === 'tranca' && t.emTx, 'a tranca corre dentro de $transaction').toBe(true);
}

async function erroDe(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('esperava-se uma rejeição e a promessa cumpriu');
}

// ---------------------------------------------------------------------------
// Proforma
// ---------------------------------------------------------------------------

describe('cancelarProforma', () => {
  it.each(['RASCUNHO', 'ENVIADA', 'ACEITE'])(
    'N4: de %s ⇒ CANCELADA com motivoCancelamento; observacoes intacto',
    async (status) => {
      semearProforma({ status });

      await cancelarProforma(ID_PRO, 'Cliente desistiu da compra', CTX_A);

      const p = d.obter('proforma', ID_PRO);
      expect(p.status).toBe('CANCELADA');
      expect(p.motivoCancelamento).toBe('Cliente desistiu da compra');
      expect(p.observacoes).toBe(OBS);
    },
  );

  it('N4: nenhuma escrita toca em observacoes', async () => {
    semearProforma();

    await cancelarProforma(ID_PRO, 'Cliente desistiu da compra', CTX_A);

    expect(d.escritas.length).toBeGreaterThan(0);
    for (const e of d.escritas) expect(e.data ?? {}).not.toHaveProperty('observacoes');
  });

  it('N4 com observacoes vazias: o motivo não vai para observacoes', async () => {
    semearProforma({ observacoes: null });

    await cancelarProforma(ID_PRO, 'Cliente desistiu da compra', CTX_A);

    const p = d.obter('proforma', ID_PRO);
    expect(p.observacoes).toBeNull();
    expect(p.motivoCancelamento).toBe('Cliente desistiu da compra');
  });

  it.each(['CONVERTIDA', 'EXPIRADA', 'CANCELADA'])('de %s ⇒ BusinessRuleError, sem escrita', async (status) => {
    semearProforma({ status });
    const antes = d.fotografia();

    const e = await erroDe(cancelarProforma(ID_PRO, 'Cliente desistiu da compra', CTX_A));

    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(d.escritas).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });

  it('cross-tenant ⇒ NotFoundError, sem escrita', async () => {
    semearProforma({ tenantId: TB });
    const antes = d.fotografia();

    const e = await erroDe(cancelarProforma(ID_PRO, 'Cliente desistiu da compra', CTX_A));

    expect(e).toBeInstanceOf(NotFoundError);
    expect(d.escritas).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });
});

// ---------------------------------------------------------------------------
// Cotação comercial
// ---------------------------------------------------------------------------

describe('cancelarCotacaoComercial', () => {
  it('N4: de RASCUNHO ⇒ CANCELADA com motivoCancelamento; observacoes intacto', async () => {
    semearCotacao();

    await cancelarCotacaoComercial(ID_COT, 'Pedido duplicado', CTX_A);

    const c = d.obter('cotacaoComercial', ID_COT);
    expect(c.status).toBe('CANCELADA');
    expect(c.motivoCancelamento).toBe('Pedido duplicado');
    expect(c.observacoes).toBe(OBS);
    for (const e of d.escritas) expect(e.data ?? {}).not.toHaveProperty('observacoes');
  });

  it.each(['ENVIADA', 'ACEITE', 'REJEITADA', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA'])(
    'de %s ⇒ BusinessRuleError, sem escrita (depois de enviada o caminho é «Rejeitar»)',
    async (status) => {
      semearCotacao({ status });
      const antes = d.fotografia();

      const e = await erroDe(cancelarCotacaoComercial(ID_COT, 'Pedido duplicado', CTX_A));

      expect(e).toBeInstanceOf(BusinessRuleError);
      expect(d.escritas).toHaveLength(0);
      expect(d.fotografia()).toBe(antes);
    },
  );

  it('cross-tenant ⇒ NotFoundError, sem escrita', async () => {
    semearCotacao({ tenantId: TB });
    const antes = d.fotografia();

    const e = await erroDe(cancelarCotacaoComercial(ID_COT, 'Pedido duplicado', CTX_A));

    expect(e).toBeInstanceOf(NotFoundError);
    expect(d.escritas).toHaveLength(0);
    expect(d.fotografia()).toBe(antes);
  });

  it('inexistente ⇒ NotFoundError', async () => {
    const e = await erroDe(cancelarCotacaoComercial(ID_COT, 'Pedido duplicado', CTX_A));
    expect(e).toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Revisão do #253 — tranca antes da leitura
// ---------------------------------------------------------------------------

describe('tranca FOR UPDATE do documento antes da leitura', () => {
  it('cancelarProforma', async () => {
    semearProforma({ status: 'ENVIADA' });
    await cancelarProforma(ID_PRO, 'Cliente desistiu da compra', CTX_A);
    esperarTrancaAntesDaLeitura(ID_PRO, 'proforma');
  });

  it('cancelarCotacaoComercial', async () => {
    semearCotacao();
    await cancelarCotacaoComercial(ID_COT, 'Pedido duplicado', CTX_A);
    esperarTrancaAntesDaLeitura(ID_COT, 'cotacaoComercial');
  });

  it('converterProformaEmFatura (recusa de estado: a tranca vem antes da leitura na mesma)', async () => {
    // Uma proforma em RASCUNHO não se converte; o caminho da recusa basta para provar a
    // ordem sem montar numeração nem lançamento. Pode correr no cliente cru.
    h.permitirBase = true;
    semearProforma({ status: 'RASCUNHO' });

    const e = await erroDe(converterProformaEmFatura(ID_PRO, CTX_A));

    expect(e).toBeInstanceOf(BusinessRuleError);
    esperarTrancaAntesDaLeitura(ID_PRO, 'proforma');
    expect(d.escritas).toHaveLength(0);
  });
});
