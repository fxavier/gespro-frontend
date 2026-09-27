/**
 * ORÁCULO da issue #140, ticket T3 (verificador). Serviço das regras de
 * sugestão de lançamento, com Prisma mockado. Contrato em
 * docs/agentic/issue-140/tickets.md (T3).
 *
 * O duplo é uma tabela em memória por modelo que HONRA o `where` (igualdade e
 * `in`/`not`/`notIn`) e o `orderBy`: assim tanto «findFirst com o filtro todo»
 * como «findFirst por id e verificar em JS» são implementações válidas, e o que
 * se afirma é o comportamento — mais, nos argumentos, que toda a leitura leva
 * o `tenantId` do contexto (os `findUnique`/`update` não são scoped pela
 * extensão; CLAUDE.md, «Multi-tenancy»).
 *
 * Invariantes:
 * - contrapartida: ContaPGC do tenant, folha e activa → senão CONTRAPARTIDA_INVALIDA;
 * - contrapartida ≠ contaContabilId de qualquer conta bancária do tenant → senão CONTRAPARTIDA_E_CONTA_BANCO;
 * - conta bancária e regra de outro tenant → NotFoundError (404, nunca 403);
 * - activar/desactivar no estado em que já está não escreve;
 * - escritas singulares (`create`/`update`), nunca `updateMany`/`upsert`
 *   (a audit-extension só vê as singulares);
 * - não existe eliminar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

type Where = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  const casa = (linha: Record<string, unknown>, where?: Record<string, unknown>): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([campo, cond]) => {
      if (cond === undefined) return true;
      if (campo === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((w) => casa(linha, w as Record<string, unknown>));
      if (campo === 'OR') return (cond as Record<string, unknown>[]).some((w) => casa(linha, w));
      if (campo === 'NOT') return !casa(linha, cond as Record<string, unknown>);
      if (!(campo in linha)) throw new Error(`duplo: filtro «${campo}» não existe no modelo`);
      const v = linha[campo];
      if (cond === null || typeof cond !== 'object') return v === cond;
      return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
        if (op === 'equals') return v === arg;
        if (op === 'in') return (arg as unknown[]).includes(v);
        if (op === 'notIn') return !(arg as unknown[]).includes(v);
        if (op === 'not') return v !== arg;
        throw new Error(`duplo: operador «${op}» não suportado`);
      });
    });
  };
  const ordenar = (ls: Record<string, unknown>[], orderBy?: unknown) => {
    if (!orderBy) return ls;
    const crit = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o as object));
    return [...ls].sort((a, b) => {
      for (const [c, s] of crit) {
        const x = a[c] as number;
        const y = b[c] as number;
        if (x === y) continue;
        const r = x < y ? -1 : 1;
        return s === 'desc' ? -r : r;
      }
      return 0;
    });
  };
  const modelo = (prefixo: string) => {
    const linhas: Record<string, unknown>[] = [];
    let seq = 0;
    const filtrar = (a: { where?: Record<string, unknown>; orderBy?: unknown } = {}) =>
      ordenar(linhas.filter((l) => casa(l, a.where)), a.orderBy);
    return {
      linhas,
      findFirst: vi.fn(async (a: { where?: Record<string, unknown>; orderBy?: unknown } = {}) => (filtrar(a)[0] ? { ...filtrar(a)[0] } : null)),
      findUnique: vi.fn(async (a: { where?: Record<string, unknown> } = {}) => (filtrar(a)[0] ? { ...filtrar(a)[0] } : null)),
      findMany: vi.fn(async (a: { where?: Record<string, unknown>; orderBy?: unknown; take?: number } = {}) => {
        const r = filtrar(a).map((l) => ({ ...l }));
        return a.take === undefined ? r : r.slice(0, a.take);
      }),
      count: vi.fn(async (a: { where?: Record<string, unknown> } = {}) => filtrar(a).length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const l = { id: `${prefixo}-novo-${seq}`, ativo: true, contaBancariaId: null, descricao: null, prioridade: 100, ...data };
        linhas.push(l);
        return { ...l };
      }),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const l = linhas.find((x) => casa(x, where));
        if (!l) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        Object.assign(l, data);
        return { ...l };
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      upsert: vi.fn(async () => null),
      delete: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    };
  };
  const db = {
    regraSugestaoLancamento: modelo('regra'),
    contaPGC: modelo('pgc'),
    contaBancaria: modelo('cb'),
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
  };
  return { db };
});

vi.mock('server-only', () => ({}));
vi.mock('@/server/db/client', () => ({
  prisma: { ...mocks.db, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.db) },
  prismaBase: { ...mocks.db, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.db) },
}));

import * as servico from '../regras-sugestao.service';
import {
  activarRegraSugestao,
  criarRegraSugestao,
  desactivarRegraSugestao,
  editarRegraSugestao,
  listarRegrasSugestao,
  obterRegraSugestao,
} from '../regras-sugestao.service';

const db = mocks.db;
const ctx = { tenantId: 'tenant-a', userId: 'user-1' };
const MODELOS = ['regraSugestaoLancamento', 'contaPGC', 'contaBancaria'] as const;

// Contas PGC: uuid, como as do tenant-bootstrap.
const PGC_6981 = '11111111-1111-4111-8111-111111111111';
const PGC_698_MAE = '22222222-2222-4222-8222-222222222222';
const PGC_6989_INACTIVA = '33333333-3333-4333-8333-333333333333';
const PGC_121_BANCO = '44444444-4444-4444-8444-444444444444';
const PGC_6981_OUTRO = '55555555-5555-4555-8555-555555555555';
const PGC_122_BANCO_INACTIVO = '66666666-6666-4666-8666-666666666666';

const CB_A = 'cmcontabancariaaaaaaaaaaaa';
const CB_A2 = 'cmcontabancariaa2aaaaaaaaa';
const CB_B = 'cmcontabancariabbbbbbbbbbb';

const REGRA_ACTIVA = 'cmregraactivaaaaaaaaaaaaaa';
const REGRA_INACTIVA = 'cmregrainactivaaaaaaaaaaaa';
const REGRA_OUTRO = 'cmregraoutrotenantbbbbbbbb';

function semear() {
  const pgc = db.contaPGC.linhas;
  pgc.length = 0;
  pgc.push(
    { id: PGC_6981, tenantId: 'tenant-a', codigo: '6981', nome: 'Serviços bancários', aceitaLancamento: true, ativo: true },
    { id: PGC_698_MAE, tenantId: 'tenant-a', codigo: '698', nome: 'Outros gastos financeiros', aceitaLancamento: false, ativo: true },
    { id: PGC_6989_INACTIVA, tenantId: 'tenant-a', codigo: '6989', nome: 'Outros', aceitaLancamento: true, ativo: false },
    { id: PGC_121_BANCO, tenantId: 'tenant-a', codigo: '121', nome: 'BCI', aceitaLancamento: true, ativo: true },
    { id: PGC_122_BANCO_INACTIVO, tenantId: 'tenant-a', codigo: '122', nome: 'BIM', aceitaLancamento: true, ativo: true },
    { id: PGC_6981_OUTRO, tenantId: 'tenant-b', codigo: '6981', nome: 'Serviços bancários', aceitaLancamento: true, ativo: true },
  );
  const cb = db.contaBancaria.linhas;
  cb.length = 0;
  cb.push(
    { id: CB_A, tenantId: 'tenant-a', banco: 'BCI', numeroConta: '0001', contaContabilId: PGC_121_BANCO, ativo: true },
    // Uma conta bancária INACTIVA continua a ter a sua conta PGC: não pode ser contrapartida.
    { id: CB_A2, tenantId: 'tenant-a', banco: 'BIM', numeroConta: '0002', contaContabilId: PGC_122_BANCO_INACTIVO, ativo: false },
    { id: CB_B, tenantId: 'tenant-b', banco: 'Absa', numeroConta: '9999', contaContabilId: 'pgc-do-b', ativo: true },
  );
  const rg = db.regraSugestaoLancamento.linhas;
  rg.length = 0;
  rg.push(
    {
      id: REGRA_INACTIVA, tenantId: 'tenant-a', contaBancariaId: CB_A, padrao: 'JUROS', natureza: 'DEBITO',
      contaContrapartidaId: PGC_6981, descricao: null, prioridade: 1, ativo: false,
    },
    {
      id: REGRA_ACTIVA, tenantId: 'tenant-a', contaBancariaId: null, padrao: 'COMISSAO|TAXA', natureza: 'CREDITO',
      contaContrapartidaId: PGC_6981, descricao: 'Comissões', prioridade: 100, ativo: true,
    },
    {
      id: REGRA_OUTRO, tenantId: 'tenant-b', contaBancariaId: null, padrao: 'X', natureza: 'CREDITO',
      contaContrapartidaId: PGC_6981_OUTRO, descricao: null, prioridade: 5, ativo: true,
    },
  );
}

const INPUT = {
  contaBancariaId: null as string | null,
  padrao: 'SELO',
  natureza: 'CREDITO' as const,
  contaContrapartidaId: PGC_6981,
  descricao: 'Imposto de selo',
  prioridade: 50,
};

type Chamada = [{ where?: Where } | undefined];

/** Todas as leituras feitas aos três modelos levam o tenant do contexto no `where`. */
function afirmarLeiturasComTenant() {
  let total = 0;
  for (const m of MODELOS) {
    for (const metodo of ['findFirst', 'findUnique', 'findMany', 'count'] as const) {
      for (const [args] of db[m][metodo].mock.calls as unknown as Chamada[]) {
        total += 1;
        expect(JSON.stringify(args?.where ?? {}), `${m}.${metodo} sem tenantId`).toContain('"tenantId":"tenant-a"');
      }
    }
  }
  return total;
}

function escritasRegra() {
  return db.regraSugestaoLancamento.create.mock.calls.length + db.regraSugestaoLancamento.update.mock.calls.length;
}

beforeEach(() => {
  vi.clearAllMocks();
  semear();
});

afterEach(() => {
  // Nunca escritas em massa nem upsert (a audit-extension não as vê) e nunca eliminação.
  for (const m of MODELOS) {
    expect(db[m].updateMany, `${m}.updateMany`).not.toHaveBeenCalled();
    expect(db[m].upsert, `${m}.upsert`).not.toHaveBeenCalled();
    expect(db[m].createMany, `${m}.createMany`).not.toHaveBeenCalled();
    expect(db[m].delete, `${m}.delete`).not.toHaveBeenCalled();
    expect(db[m].deleteMany, `${m}.deleteMany`).not.toHaveBeenCalled();
  }
  // O serviço só escreve em RegraSugestaoLancamento.
  for (const m of ['contaPGC', 'contaBancaria'] as const) {
    expect(db[m].create).not.toHaveBeenCalled();
    expect(db[m].update).not.toHaveBeenCalled();
  }
  expect(db.$executeRaw).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------

describe('superfície do serviço', () => {
  it('não existe eliminar regra (só desactivar/activar)', () => {
    const nomes = Object.keys(servico);
    expect(nomes.filter((n) => /elimin|apag|remov|delet|exclu/i.test(n))).toEqual([]);
  });
});

describe('listarRegrasSugestao', () => {
  it('só as do tenant, activas primeiro e por prioridade ascendente', async () => {
    const r = await listarRegrasSugestao(ctx);
    expect(r.map((x) => x.id)).toEqual([REGRA_ACTIVA, REGRA_INACTIVA]);
    expect(afirmarLeiturasComTenant()).toBeGreaterThan(0);
  });

  it('resolve a conta bancária e a contrapartida por consulta (FK escalares)', async () => {
    const r = await listarRegrasSugestao(ctx);
    const inactiva = r.find((x) => x.id === REGRA_INACTIVA)!;
    expect(inactiva.contaBancaria).toMatchObject({ banco: 'BCI', numeroConta: '0001' });
    expect(inactiva.contaContrapartida).toMatchObject({ codigo: '6981', nome: 'Serviços bancários' });
    const activa = r.find((x) => x.id === REGRA_ACTIVA)!;
    expect(activa.contaBancaria ?? null).toBeNull();
    expect(activa.contaContrapartida).toMatchObject({ codigo: '6981' });
    // FK escalares: nada de include/relações.
    for (const [args] of db.regraSugestaoLancamento.findMany.mock.calls as unknown as [Record<string, unknown>][]) {
      expect(args).not.toHaveProperty('include');
    }
    afirmarLeiturasComTenant();
  });
});

describe('obterRegraSugestao', () => {
  it('devolve a regra do tenant', async () => {
    const r = await obterRegraSugestao(REGRA_ACTIVA, ctx);
    expect(r).toMatchObject({ id: REGRA_ACTIVA, padrao: 'COMISSAO|TAXA' });
    afirmarLeiturasComTenant();
  });

  it('null para regra de outro tenant ou inexistente', async () => {
    await expect(obterRegraSugestao(REGRA_OUTRO, ctx)).resolves.toBeNull();
    await expect(obterRegraSugestao('cmnaoexisteaaaaaaaaaaaaaaa', ctx)).resolves.toBeNull();
    afirmarLeiturasComTenant();
  });
});

describe('criarRegraSugestao', () => {
  it('cria com tenantId do contexto por `create` singular', async () => {
    await criarRegraSugestao(INPUT, ctx);
    expect(db.regraSugestaoLancamento.create).toHaveBeenCalledTimes(1);
    const { data } = db.regraSugestaoLancamento.create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: 'tenant-a',
      contaBancariaId: null,
      padrao: 'SELO',
      natureza: 'CREDITO',
      contaContrapartidaId: PGC_6981,
      prioridade: 50,
    });
    afirmarLeiturasComTenant();
  });

  it('com conta bancária do tenant: aceita', async () => {
    await criarRegraSugestao({ ...INPUT, contaBancariaId: CB_A }, ctx);
    expect(db.regraSugestaoLancamento.create.mock.calls[0][0].data).toMatchObject({ contaBancariaId: CB_A });
    afirmarLeiturasComTenant();
  });

  it('conta bancária de outro tenant → NotFoundError, sem escrever', async () => {
    await expect(criarRegraSugestao({ ...INPUT, contaBancariaId: CB_B }, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
    afirmarLeiturasComTenant();
  });

  it('conta bancária inexistente → NotFoundError', async () => {
    await expect(
      criarRegraSugestao({ ...INPUT, contaBancariaId: 'cmnaoexisteaaaaaaaaaaaaaaa' }, ctx),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
  });

  it.each([
    ['inexistente', '77777777-7777-4777-8777-777777777777'],
    ['não folha (agregadora)', PGC_698_MAE],
    ['inactiva', PGC_6989_INACTIVA],
    ['de outro tenant', PGC_6981_OUTRO],
  ])('contrapartida %s → CONTRAPARTIDA_INVALIDA, sem escrever', async (_rotulo, conta) => {
    const p = criarRegraSugestao({ ...INPUT, contaContrapartidaId: conta }, ctx);
    await expect(p).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(p).rejects.toMatchObject({ code: 'CONTRAPARTIDA_INVALIDA' });
    expect(escritasRegra()).toBe(0);
    afirmarLeiturasComTenant();
  });

  it('contrapartida = conta PGC de uma conta bancária → CONTRAPARTIDA_E_CONTA_BANCO', async () => {
    const p = criarRegraSugestao({ ...INPUT, contaContrapartidaId: PGC_121_BANCO }, ctx);
    await expect(p).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(p).rejects.toMatchObject({ code: 'CONTRAPARTIDA_E_CONTA_BANCO' });
    expect(escritasRegra()).toBe(0);
    afirmarLeiturasComTenant();
  });

  it('a regra vale para QUALQUER conta bancária do tenant, também a inactiva e não só a da regra', async () => {
    await expect(
      criarRegraSugestao({ ...INPUT, contaBancariaId: CB_A, contaContrapartidaId: PGC_122_BANCO_INACTIVO }, ctx),
    ).rejects.toMatchObject({ code: 'CONTRAPARTIDA_E_CONTA_BANCO' });
    expect(escritasRegra()).toBe(0);
  });

  it('a conta PGC de uma conta bancária de OUTRO tenant não conta', async () => {
    // A 6981 do tenant-a não é conta de banco de ninguém do tenant-a: passa.
    db.contaBancaria.linhas.push({
      id: 'cmcontabancariab2bbbbbbbbb', tenantId: 'tenant-b', banco: 'X', numeroConta: '1', contaContabilId: PGC_6981, ativo: true,
    });
    await criarRegraSugestao(INPUT, ctx);
    expect(db.regraSugestaoLancamento.create).toHaveBeenCalledTimes(1);
    afirmarLeiturasComTenant();
  });
});

describe('editarRegraSugestao', () => {
  it('actualiza a regra do tenant por `update` singular', async () => {
    await editarRegraSugestao({ ...INPUT, id: REGRA_ACTIVA, prioridade: 7 }, ctx);
    expect(db.regraSugestaoLancamento.update).toHaveBeenCalledTimes(1);
    const args = db.regraSugestaoLancamento.update.mock.calls[0][0];
    expect(JSON.stringify(args.where)).toContain(REGRA_ACTIVA);
    expect(args.data).toMatchObject({ padrao: 'SELO', prioridade: 7, contaContrapartidaId: PGC_6981 });
    // O tenant nunca muda por edição.
    expect(args.data.tenantId === undefined || args.data.tenantId === 'tenant-a').toBe(true);
    expect(db.regraSugestaoLancamento.linhas.find((l) => l.id === REGRA_ACTIVA)).toMatchObject({ prioridade: 7 });
    afirmarLeiturasComTenant();
  });

  it('regra de outro tenant → NotFoundError, sem escrever', async () => {
    await expect(editarRegraSugestao({ ...INPUT, id: REGRA_OUTRO }, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
    expect(db.regraSugestaoLancamento.linhas.find((l) => l.id === REGRA_OUTRO)).toMatchObject({ padrao: 'X' });
    afirmarLeiturasComTenant();
  });

  it('regra inexistente → NotFoundError', async () => {
    await expect(
      editarRegraSugestao({ ...INPUT, id: 'cmnaoexisteaaaaaaaaaaaaaaa' }, ctx),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
  });

  it('valida a contrapartida como no criar', async () => {
    await expect(
      editarRegraSugestao({ ...INPUT, id: REGRA_ACTIVA, contaContrapartidaId: PGC_698_MAE }, ctx),
    ).rejects.toMatchObject({ code: 'CONTRAPARTIDA_INVALIDA' });
    await expect(
      editarRegraSugestao({ ...INPUT, id: REGRA_ACTIVA, contaContrapartidaId: PGC_121_BANCO }, ctx),
    ).rejects.toMatchObject({ code: 'CONTRAPARTIDA_E_CONTA_BANCO' });
    expect(escritasRegra()).toBe(0);
    afirmarLeiturasComTenant();
  });

  it('conta bancária de outro tenant → NotFoundError', async () => {
    await expect(
      editarRegraSugestao({ ...INPUT, id: REGRA_ACTIVA, contaBancariaId: CB_B }, ctx),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
  });
});

describe('activarRegraSugestao / desactivarRegraSugestao', () => {
  it('desactivar uma activa escreve ativo=false por `update` singular', async () => {
    await desactivarRegraSugestao(REGRA_ACTIVA, ctx);
    expect(db.regraSugestaoLancamento.update).toHaveBeenCalledTimes(1);
    expect(db.regraSugestaoLancamento.update.mock.calls[0][0].data).toMatchObject({ ativo: false });
    expect(db.regraSugestaoLancamento.linhas.find((l) => l.id === REGRA_ACTIVA)).toMatchObject({ ativo: false });
    afirmarLeiturasComTenant();
  });

  it('activar uma inactiva escreve ativo=true', async () => {
    await activarRegraSugestao(REGRA_INACTIVA, ctx);
    expect(db.regraSugestaoLancamento.update).toHaveBeenCalledTimes(1);
    expect(db.regraSugestaoLancamento.update.mock.calls[0][0].data).toMatchObject({ ativo: true });
    afirmarLeiturasComTenant();
  });

  it('activar uma já activa devolve a regra sem escrever', async () => {
    const r = await activarRegraSugestao(REGRA_ACTIVA, ctx);
    expect(r).toMatchObject({ id: REGRA_ACTIVA, ativo: true });
    expect(db.regraSugestaoLancamento.update).not.toHaveBeenCalled();
  });

  it('desactivar uma já inactiva devolve a regra sem escrever', async () => {
    const r = await desactivarRegraSugestao(REGRA_INACTIVA, ctx);
    expect(r).toMatchObject({ id: REGRA_INACTIVA, ativo: false });
    expect(db.regraSugestaoLancamento.update).not.toHaveBeenCalled();
  });

  it('regra de outro tenant → NotFoundError nos dois sentidos, sem escrever', async () => {
    await expect(activarRegraSugestao(REGRA_OUTRO, ctx)).rejects.toBeInstanceOf(NotFoundError);
    await expect(desactivarRegraSugestao(REGRA_OUTRO, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
    expect(db.regraSugestaoLancamento.linhas.find((l) => l.id === REGRA_OUTRO)).toMatchObject({ ativo: true });
    afirmarLeiturasComTenant();
  });

  it('regra inexistente → NotFoundError', async () => {
    await expect(activarRegraSugestao('cmnaoexisteaaaaaaaaaaaaaaa', ctx)).rejects.toBeInstanceOf(NotFoundError);
    await expect(desactivarRegraSugestao('cmnaoexisteaaaaaaaaaaaaaaa', ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(escritasRegra()).toBe(0);
  });
});

