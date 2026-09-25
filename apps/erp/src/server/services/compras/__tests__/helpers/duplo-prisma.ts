/**
 * Duplo COM ESTADO do Prisma, em memória — oráculo da issue #78.
 *
 * Não prescreve a query: `findFirst`/`findUnique`/`findMany`/`count` filtram
 * pelos campos presentes em `where` (igualdade, `in`, `not`, `lt/lte/gt/gte`,
 * filtros de relação por objecto), `include`/`select` resolvem as relações
 * conhecidas, `create`/`update`/`updateMany` gravam. `$transaction(fn)` aplica
 * as escritas só se a callback não lançar (snapshot + restauro), para os testes
 * poderem afirmar «nada escrito» sem ditar a ordem das operações.
 *
 * `prisma` emula a tenant-extension (injecta `tenantId` em findFirst/findMany/
 * count/updateMany/create quando há tenant corrente — como dentro de
 * `runWithTenantContext`); `findUnique`/`update` NÃO são scoped, como na real.
 * `prismaBase` não injecta nada.
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

const CAMPOS_DECIMAL = new Set([
  'valor', 'valorOriginal', 'valorPago', 'valorRestante', 'fundoInicial', 'fundoFinal',
  'totalEntradas', 'totalSaidas', 'diferenca', 'saldoAtual', 'toleranciaValor',
]);

/** Relações conhecidas: modelo → campo → { alvo, fk (no dono ou no alvo), lista } */
const RELACOES: Record<string, Record<string, { alvo: string; fkLocal?: string; fkRemota?: string; lista?: boolean }>> = {
  contaBancaria: { contaContabil: { alvo: 'contaPGC', fkLocal: 'contaContabilId' } },
  contaPGC: { contasBancarias: { alvo: 'contaBancaria', fkRemota: 'contaContabilId', lista: true } },
  contaPagar: {
    pagamentos: { alvo: 'pagamento', fkRemota: 'contaPagarId', lista: true },
    fornecedor: { alvo: 'fornecedor', fkLocal: 'fornecedorId' },
  },
  pagamento: { contaPagar: { alvo: 'contaPagar', fkLocal: 'contaPagarId' } },
  sessaoCaixa: { movimentos: { alvo: 'movimentoCaixa', fkRemota: 'sessaoCaixaId', lista: true } },
  movimentoCaixa: { sessaoCaixa: { alvo: 'sessaoCaixa', fkLocal: 'sessaoCaixaId' } },
};

const TABELAS = [
  'contaBancaria', 'contaPGC', 'sessaoCaixa', 'movimentoCaixa', 'pagamento', 'contaPagar',
  'fornecedor', 'lancamento',
] as const;

export type NomeTabela = (typeof TABELAS)[number];

function normalizarDecimais(data: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    if (CAMPOS_DECIMAL.has(k) && v != null && (typeof v === 'number' || typeof v === 'string' || Prisma.Decimal.isDecimal(v))) {
      out[k] = new Prisma.Decimal(String(v));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function valorComparavel(v: any): any {
  if (v instanceof Date) return v.getTime();
  if (Prisma.Decimal.isDecimal(v)) return Number(v.toString());
  return v;
}

const OPERADORES = new Set(['equals', 'in', 'notIn', 'not', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'mode']);

export class DuploPrisma {
  tabelas: Record<string, Row[]>;
  /** tenant corrente para a emulação da tenant-extension em `prisma` */
  tenantAtual: string | undefined;
  /** contagem de escritas efectivamente aplicadas (commit) */
  escritas = 0;

  constructor() {
    this.tabelas = Object.fromEntries(TABELAS.map((t) => [t, [] as Row[]]));
  }

  // ------------------------------------------------------------------ util

  semear(tabela: NomeTabela, linha: Row): Row {
    const r = normalizarDecimais({ id: randomUUID(), ...linha });
    this.tabelas[tabela].push(r);
    return r;
  }

  linhas(tabela: NomeTabela): Row[] {
    return this.tabelas[tabela];
  }

  private corresponde(modelo: string, row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (k === 'AND') {
        const arr = Array.isArray(cond) ? cond : [cond];
        if (!arr.every((w) => this.corresponde(modelo, row, w))) return false;
        continue;
      }
      if (k === 'OR') {
        if (!(cond as Row[]).some((w) => this.corresponde(modelo, row, w))) return false;
        continue;
      }
      if (k === 'NOT') {
        const arr = Array.isArray(cond) ? cond : [cond];
        if (arr.some((w) => this.corresponde(modelo, row, w))) return false;
        continue;
      }
      const rel = RELACOES[modelo]?.[k];
      if (rel && cond !== null && typeof cond === 'object') {
        const rels = this.resolverRelacao(modelo, row, k);
        if (rel.lista) {
          const lista = rels as Row[];
          if ('some' in cond && !lista.some((r) => this.corresponde(rel.alvo, r, cond.some))) return false;
          if ('every' in cond && !lista.every((r) => this.corresponde(rel.alvo, r, cond.every))) return false;
          if ('none' in cond && lista.some((r) => this.corresponde(rel.alvo, r, cond.none))) return false;
        } else {
          const alvo = rels as Row | null;
          const filtro = 'is' in cond ? cond.is : cond;
          if (!alvo || !this.corresponde(rel.alvo, alvo, filtro)) return false;
        }
        continue;
      }
      const v = row[k];
      if (
        cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Prisma.Decimal.isDecimal(cond) &&
        Object.keys(cond).some((op) => OPERADORES.has(op))
      ) {
        const c = cond as Row;
        const vv = valorComparavel(v);
        if ('equals' in c && vv !== valorComparavel(c.equals)) return false;
        if ('in' in c && !(c.in as any[]).map(valorComparavel).includes(vv)) return false;
        if ('notIn' in c && (c.notIn as any[]).map(valorComparavel).includes(vv)) return false;
        if ('not' in c) {
          if (c.not !== null && typeof c.not === 'object' && !(c.not instanceof Date)) {
            if (this.corresponde(modelo, row, { [k]: c.not })) return false;
          } else if (vv === valorComparavel(c.not)) return false;
        }
        if ('lt' in c && !(vv < valorComparavel(c.lt))) return false;
        if ('lte' in c && !(vv <= valorComparavel(c.lte))) return false;
        if ('gt' in c && !(vv > valorComparavel(c.gt))) return false;
        if ('gte' in c && !(vv >= valorComparavel(c.gte))) return false;
        if ('contains' in c && !String(v ?? '').includes(c.contains)) return false;
        if ('startsWith' in c && !String(v ?? '').startsWith(c.startsWith)) return false;
        continue;
      }
      if (valorComparavel(v ?? null) !== valorComparavel(cond)) return false;
    }
    return true;
  }

  private resolverRelacao(modelo: string, row: Row, campo: string): Row | Row[] | null {
    const rel = RELACOES[modelo]?.[campo];
    if (!rel) return null;
    const alvo = this.tabelas[rel.alvo];
    if (rel.fkLocal) return alvo.find((r) => r.id === row[rel.fkLocal!]) ?? null;
    return alvo.filter((r) => r[rel.fkRemota!] === row.id);
  }

  /** include/select: devolve a linha completa (superset) + relações pedidas. */
  private projectar(modelo: string, row: Row, args: Row | undefined): Row {
    const out: Row = { ...row };
    const spec = { ...(args?.include ?? {}), ...(args?.select ?? {}) } as Row;
    for (const [campo, sub] of Object.entries(spec)) {
      if (!sub) continue;
      const rel = RELACOES[modelo]?.[campo];
      if (!rel) continue;
      const subArgs = typeof sub === 'object' ? (sub as Row) : undefined;
      const valor = this.resolverRelacao(modelo, row, campo);
      if (Array.isArray(valor)) {
        out[campo] = valor
          .filter((r) => this.corresponde(rel.alvo, r, subArgs?.where))
          .map((r) => this.projectar(rel.alvo, r, subArgs));
      } else {
        out[campo] = valor ? this.projectar(rel.alvo, valor, subArgs) : null;
      }
    }
    return out;
  }

  private aplicarUpdate(row: Row, data: Row): void {
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Prisma.Decimal.isDecimal(v)) {
        const atual = row[k];
        if ('increment' in v || 'decrement' in v) {
          const delta = new Prisma.Decimal(String(v.increment ?? 0)).minus(new Prisma.Decimal(String(v.decrement ?? 0)));
          const novo = new Prisma.Decimal(String(atual ?? 0)).plus(delta);
          row[k] = CAMPOS_DECIMAL.has(k) ? novo : Number(novo.toString());
          continue;
        }
        if ('set' in v) { row[k] = v.set; continue; }
        // escrita aninhada de relação: ignorada pelo duplo
        continue;
      }
      row[k] = CAMPOS_DECIMAL.has(k) && v != null ? new Prisma.Decimal(String(v)) : v;
    }
    row.updatedAt = new Date();
  }

  private whereComTenant(where: Row | undefined, escopado: boolean): Row | undefined {
    if (!escopado || !this.tenantAtual) return where;
    return { ...(where ?? {}), tenantId: this.tenantAtual };
  }

  // ------------------------------------------------------------------ delegados

  private delegado(modelo: string, escopado: boolean) {
    const self = this;
    const tabela = () => self.tabelas[modelo];
    const findMany = async (args: Row = {}) => {
      const where = self.whereComTenant(args.where, escopado);
      let rows = tabela().filter((r) => self.corresponde(modelo, r, where));
      if (args.orderBy) {
        const ords = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        rows = [...rows].sort((a, b) => {
          for (const o of ords) {
            const [[campo, dir]] = Object.entries(o as Row);
            const va = valorComparavel(a[campo]);
            const vb = valorComparavel(b[campo]);
            if (va < vb) return dir === 'desc' ? 1 : -1;
            if (va > vb) return dir === 'desc' ? -1 : 1;
          }
          return 0;
        });
      }
      if (typeof args.skip === 'number') rows = rows.slice(args.skip);
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((r) => self.projectar(modelo, r, args));
    };
    const findFirst = async (args: Row = {}) => (await findMany({ ...args, take: 1 }))[0] ?? null;
    const findUnique = async (args: Row = {}) => {
      // NÃO scoped (como a tenant-extension real)
      const r = tabela().find((row) => self.corresponde(modelo, row, args.where));
      return r ? self.projectar(modelo, r, args) : null;
    };
    const naoEncontrado = () => Object.assign(new Error(`${modelo}: registo não encontrado`), { code: 'P2025' });
    return {
      findMany,
      findFirst,
      findUnique,
      findFirstOrThrow: async (args: Row = {}) => { const r = await findFirst(args); if (!r) throw naoEncontrado(); return r; },
      findUniqueOrThrow: async (args: Row = {}) => { const r = await findUnique(args); if (!r) throw naoEncontrado(); return r; },
      count: async (args: Row = {}) => (await findMany({ where: args.where })).length,
      create: async (args: Row) => {
        const base: Row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
        if (modelo === 'movimentoCaixa') base.dataMovimento = new Date();
        if (escopado && self.tenantAtual) base.tenantId = self.tenantAtual;
        const row = normalizarDecimais({ ...base, ...args.data });
        tabela().push(row);
        self.escritas++;
        return self.projectar(modelo, row, args);
      },
      update: async (args: Row) => {
        const row = tabela().find((r) => self.corresponde(modelo, r, args.where));
        if (!row) throw naoEncontrado();
        self.aplicarUpdate(row, args.data);
        self.escritas++;
        return self.projectar(modelo, row, args);
      },
      updateMany: async (args: Row) => {
        const where = self.whereComTenant(args.where, escopado);
        const rows = tabela().filter((r) => self.corresponde(modelo, r, where));
        for (const r of rows) self.aplicarUpdate(r, args.data);
        self.escritas += rows.length;
        return { count: rows.length };
      },
    };
  }

  private cliente(escopado: boolean): any {
    const self = this;
    const c: any = {};
    for (const t of TABELAS) c[t] = this.delegado(t, escopado);
    c.$transaction = async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const snapshot = structuredCloneTabelas(self.tabelas);
      const escritasAntes = self.escritas;
      try {
        return await arg(c);
      } catch (e) {
        self.tabelas = snapshot;
        self.escritas = escritasAntes;
        throw e;
      }
    };
    c.$queryRaw = async () => [];
    c.$executeRaw = async () => 0;
    c.$queryRawUnsafe = async () => [];
    c.$executeRawUnsafe = async () => 0;
    return c;
  }

  /** Cliente estendido (emula a tenant-extension). */
  get prisma(): any { return this.cliente(true); }
  /** Cliente cru. */
  get prismaBase(): any { return this.cliente(false); }
}

function structuredCloneTabelas(t: Record<string, Row[]>): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(t)) {
    out[k] = rows.map((r) => {
      const c: Row = {};
      for (const [f, v] of Object.entries(r)) {
        c[f] = Prisma.Decimal.isDecimal(v) ? new Prisma.Decimal(v.toString()) : v instanceof Date ? new Date(v) : v;
      }
      return c;
    });
  }
  return out;
}

/** Soma de partidas de um tipo, como Decimal. */
export function somaPartidas(partidas: Array<{ tipo: string; valor: unknown }>, tipo: 'DEBITO' | 'CREDITO'): Prisma.Decimal {
  return partidas
    .filter((p) => p.tipo === tipo)
    .reduce((acc, p) => acc.plus(new Prisma.Decimal(String(p.valor))), new Prisma.Decimal(0));
}
