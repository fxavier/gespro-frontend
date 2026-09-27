/**
 * Oráculo da issue #137 — editar e anular um lançamento em RASCUNHO.
 *
 * Spec: `docs/agentic/issue-137/spec.md` (D1–D6, I1–I6). Prisma mockado com um
 * duplo COM ESTADO: o lançamento e as partidas vivem num armazém em memória
 * que as escritas alteram, e todas as chamadas ficam registadas por ordem
 * (`ordem`) — é assim que se prova que o estado é lido DEPOIS da tranca.
 *
 * O duplo aceita as formas razoáveis de o serviço ler (partidas por `include`
 * ou por `findMany`; estado pela linha trancada ou por `findFirst`; período por
 * `resolverPeriodo` ou directamente por id). O que NÃO aceita é o que a spec
 * proíbe: escrita em lote, `prismaBase`, `where` sem `tenantId`, `update` que
 * toque em `numero`/`diarioId`/`periodoId`/`periodoFiscal`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Duplo do Prisma
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  ordem: [] as string[],
  // lancamento
  lancamentoFindFirst: vi.fn(),
  lancamentoFindUnique: vi.fn(),
  lancamentoFindMany: vi.fn(),
  lancamentoUpdate: vi.fn(),
  lancamentoUpdateMany: vi.fn(),
  lancamentoCreate: vi.fn(),
  lancamentoCount: vi.fn(),
  // partidas
  partidaFindMany: vi.fn(),
  partidaDelete: vi.fn(),
  partidaDeleteMany: vi.fn(),
  partidaCreate: vi.fn(),
  partidaCreateMany: vi.fn(),
  partidaUpdate: vi.fn(),
  // contas / período / diário
  contaFindFirst: vi.fn(),
  contaFindMany: vi.fn(),
  periodoFindFirst: vi.fn(),
  periodoUpsert: vi.fn(),
  exercicioUpsert: vi.fn(),
  exercicioFindFirst: vi.fn(),
  diarioFindFirst: vi.fn(),
  centroCustoFindFirst: vi.fn(),
  // raw + transacções
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transactionEstendido: vi.fn(),
  transactionBase: vi.fn(),
}));

vi.mock('@/server/db/client', () => {
  const delegados = {
    lancamento: {
      findFirst: mocks.lancamentoFindFirst,
      findUnique: mocks.lancamentoFindUnique,
      findMany: mocks.lancamentoFindMany,
      update: mocks.lancamentoUpdate,
      updateMany: mocks.lancamentoUpdateMany,
      create: mocks.lancamentoCreate,
      count: mocks.lancamentoCount,
    },
    partidaLancamento: {
      findMany: mocks.partidaFindMany,
      delete: mocks.partidaDelete,
      deleteMany: mocks.partidaDeleteMany,
      create: mocks.partidaCreate,
      createMany: mocks.partidaCreateMany,
      update: mocks.partidaUpdate,
    },
    contaPGC: { findFirst: mocks.contaFindFirst, findMany: mocks.contaFindMany },
    periodoContabil: { findFirst: mocks.periodoFindFirst, upsert: mocks.periodoUpsert },
    exercicioContabil: { upsert: mocks.exercicioUpsert, findFirst: mocks.exercicioFindFirst },
    diario: { findFirst: mocks.diarioFindFirst },
    centroCusto: { findFirst: mocks.centroCustoFindFirst },
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
  };
  return {
    prisma: { ...delegados, $transaction: mocks.transactionEstendido },
    prismaBase: { $transaction: mocks.transactionBase },
  };
});

vi.mock('@/server/observability/context', () => ({
  getRequestContext: vi.fn(() => ({ requestId: 'req-test-137' })),
}));

import * as servico from '../contabilidade.service';

// As duas funções ainda não existem (RED): acedidas pelo namespace para que a
// falha seja «is not a function» no caso, e não um erro de import no ficheiro.
const editar = (input: unknown, ctx: typeof CTX) =>
  (servico as unknown as Record<string, (i: unknown, c: typeof CTX) => Promise<unknown>>)
    .editarLancamentoRascunho(input, ctx);
const anular = (input: unknown, ctx: typeof CTX) =>
  (servico as unknown as Record<string, (i: unknown, c: typeof CTX) => Promise<unknown>>)
    .anularLancamentoRascunho(input, ctx);

// ---------------------------------------------------------------------------
// Armazém em memória
// ---------------------------------------------------------------------------

const CTX = { tenantId: 'tenant-137', userId: 'user-137' };
const OUTRO_TENANT = 'tenant-outro';

const LANC_ID = 'clanc137000000000000000001';
const LANC_OUTRO_ID = 'clanc137000000000000000099';
const DIARIO_ID = 'cdiario13700000000000000001';

// 15 de Junho às 12h de Maputo → período 2026-06; 15 de Julho → 2026-07.
const DATA_JUNHO = new Date('2026-06-15T10:00:00Z');
const DATA_JUNHO_OUTRO_DIA = new Date('2026-06-28T10:00:00Z');
const DATA_JULHO = new Date('2026-07-15T10:00:00Z');

type Periodo = { id: string; codigo: string; estado: string; tenantId: string };
type Partida = {
  id: string;
  tenantId: string;
  lancamentoId: string;
  contaId: string;
  centroCustoId: string | null;
  tipo: 'DEBITO' | 'CREDITO';
  valor: Prisma.Decimal;
  historico: string | null;
};
type Lanc = {
  id: string;
  tenantId: string;
  numero: string;
  data: Date;
  diarioId: string;
  periodoId: string;
  periodoFiscal: string;
  historico: string;
  observacoes: string | null;
  valorTotal: Prisma.Decimal;
  status: string;
  motivoAnulacao: string | null;
  origem: string;
  tipo: string;
};

let lancamentos: Lanc[];
let partidas: Partida[];
let periodos: Periodo[];
let contas: { id: string; tenantId: string; codigo: string; aceitaLancamento: boolean; ativo: boolean }[];
let seqPartida: number;

function semear(opts: { status?: string; estadoPeriodo?: string } = {}) {
  periodos = [
    { id: 'per-2026-06', codigo: '2026-06', estado: opts.estadoPeriodo ?? 'ABERTO', tenantId: CTX.tenantId },
    { id: 'per-2026-07', codigo: '2026-07', estado: 'ABERTO', tenantId: CTX.tenantId },
  ];
  contas = [
    { id: 'conta-2633', tenantId: CTX.tenantId, codigo: '2633', aceitaLancamento: true, ativo: true },
    { id: 'conta-2632', tenantId: CTX.tenantId, codigo: '2632', aceitaLancamento: true, ativo: true },
    { id: 'conta-311', tenantId: CTX.tenantId, codigo: '311', aceitaLancamento: true, ativo: true },
    // conta agregadora (não-folha)
    { id: 'conta-26', tenantId: CTX.tenantId, codigo: '26', aceitaLancamento: false, ativo: true },
  ];
  lancamentos = [
    {
      id: LANC_ID,
      tenantId: CTX.tenantId,
      numero: '000007',
      data: DATA_JUNHO,
      diarioId: DIARIO_ID,
      periodoId: 'per-2026-06',
      periodoFiscal: '2026-06',
      historico: 'Reclassificação original',
      observacoes: null,
      valorTotal: new Prisma.Decimal('1000'),
      status: opts.status ?? 'RASCUNHO',
      motivoAnulacao: null,
      origem: 'MANUAL',
      tipo: 'MANUAL',
    },
    {
      id: LANC_OUTRO_ID,
      tenantId: OUTRO_TENANT,
      numero: '000001',
      data: DATA_JUNHO,
      diarioId: 'cdiario-outro',
      periodoId: 'per-outro',
      periodoFiscal: '2026-06',
      historico: 'Rascunho de outro tenant',
      observacoes: null,
      valorTotal: new Prisma.Decimal('50'),
      status: 'RASCUNHO',
      motivoAnulacao: null,
      origem: 'MANUAL',
      tipo: 'MANUAL',
    },
  ];
  partidas = [
    { id: 'part-a', tenantId: CTX.tenantId, lancamentoId: LANC_ID, contaId: 'conta-2633', centroCustoId: null, tipo: 'DEBITO', valor: new Prisma.Decimal('1000'), historico: null },
    { id: 'part-b', tenantId: CTX.tenantId, lancamentoId: LANC_ID, contaId: 'conta-2632', centroCustoId: null, tipo: 'CREDITO', valor: new Prisma.Decimal('1000'), historico: null },
    { id: 'part-x', tenantId: OUTRO_TENANT, lancamentoId: LANC_OUTRO_ID, contaId: 'conta-outro', centroCustoId: null, tipo: 'DEBITO', valor: new Prisma.Decimal('50'), historico: null },
  ];
  seqPartida = 0;
}

type Where = Record<string, unknown> | undefined;

/** Correspondência simples de `where` do Prisma (igualdade + `in`). */
function corresponde(linha: Record<string, unknown>, where: Where): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND' || k === 'OR' || k === 'NOT') continue;
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Prisma.Decimal)) {
      const f = v as Record<string, unknown>;
      if ('in' in f && !(f.in as unknown[]).includes(linha[k])) return false;
      if ('equals' in f && linha[k] !== f.equals) return false;
      continue;
    }
    if (linha[k] !== v) return false;
  }
  return true;
}

function comPartidas(l: Lanc) {
  return { ...l, partidas: partidas.filter((p) => p.lancamentoId === l.id).map((p) => ({ ...p })) };
}

/** Normaliza as duas formas de `$queryRaw` (template marcado ou `Prisma.sql`). */
function lerSql(args: unknown[]): { sql: string; valores: unknown[] } {
  const a0 = args[0] as unknown;
  if (Array.isArray(a0)) return { sql: (a0 as string[]).join('?'), valores: args.slice(1) };
  const s = a0 as { strings?: string[]; values?: unknown[]; sql?: string; text?: string };
  if (s && Array.isArray(s.strings)) return { sql: s.strings.join('?'), valores: s.values ?? [] };
  return { sql: String(s?.sql ?? s?.text ?? a0), valores: (s?.values ?? args.slice(1)) as unknown[] };
}

function instalarImplementacoes() {
  const reg = (nome: string) => mocks.ordem.push(nome);

  mocks.queryRaw.mockImplementation((...args: unknown[]) => {
    const { sql, valores } = lerSql(args);
    const tranca = /FOR UPDATE/i.test(sql) ? 'FOR UPDATE' : /FOR SHARE/i.test(sql) ? 'FOR SHARE' : 'sem-tranca';
    if (/"Lancamento"/.test(sql)) {
      reg(`queryRaw:Lancamento:${tranca}`);
      const comTenant = valores.includes(CTX.tenantId);
      const linhas = lancamentos.filter(
        (l) => valores.includes(l.id) && (!comTenant || l.tenantId === CTX.tenantId),
      );
      return Promise.resolve(linhas.map((l) => ({ ...l })));
    }
    if (/"PeriodoContabil"/.test(sql)) {
      reg(`queryRaw:PeriodoContabil:${tranca}`);
      const linhas = periodos.filter(
        (p) => valores.includes(p.id) || (valores.includes(p.codigo) && valores.includes(p.tenantId)),
      );
      return Promise.resolve(linhas.map((p) => ({ id: p.id, codigo: p.codigo, estado: p.estado })));
    }
    reg(`queryRaw:outro`);
    return Promise.resolve([]);
  });
  mocks.executeRaw.mockImplementation(() => {
    reg('executeRaw');
    return Promise.resolve(0);
  });

  const lerLancamento = (nome: string) => (args: { where?: Where; include?: unknown }) => {
    reg(nome);
    const l = lancamentos.find((x) => corresponde(x as unknown as Record<string, unknown>, args?.where));
    if (!l) return Promise.resolve(null);
    return Promise.resolve(args?.include ? comPartidas(l) : { ...l });
  };
  mocks.lancamentoFindFirst.mockImplementation(lerLancamento('lancamento.findFirst'));
  mocks.lancamentoFindUnique.mockImplementation(lerLancamento('lancamento.findUnique'));
  mocks.lancamentoFindMany.mockImplementation(() => {
    reg('lancamento.findMany');
    return Promise.resolve([]);
  });
  mocks.lancamentoUpdate.mockImplementation((args: { where: Where; data: Record<string, unknown> }) => {
    reg('lancamento.update');
    const l = lancamentos.find((x) => corresponde(x as unknown as Record<string, unknown>, args.where));
    if (!l) return Promise.reject(new Error('Record to update not found.'));
    Object.assign(l, args.data);
    return Promise.resolve({ ...l });
  });
  mocks.lancamentoUpdateMany.mockImplementation(() => {
    reg('lancamento.updateMany');
    return Promise.resolve({ count: 0 });
  });
  mocks.lancamentoCreate.mockImplementation(() => {
    reg('lancamento.create');
    return Promise.resolve({});
  });
  mocks.lancamentoCount.mockImplementation(() => Promise.resolve(0));

  mocks.partidaFindMany.mockImplementation((args: { where?: Where }) => {
    reg('partida.findMany');
    return Promise.resolve(
      partidas.filter((p) => corresponde(p as unknown as Record<string, unknown>, args?.where)).map((p) => ({ ...p })),
    );
  });
  mocks.partidaDelete.mockImplementation((args: { where: Where }) => {
    reg('partida.delete');
    const i = partidas.findIndex((p) => corresponde(p as unknown as Record<string, unknown>, args.where));
    if (i < 0) return Promise.reject(new Error('Record to delete does not exist.'));
    const [removida] = partidas.splice(i, 1);
    return Promise.resolve(removida);
  });
  mocks.partidaDeleteMany.mockImplementation(() => {
    reg('partida.deleteMany');
    return Promise.resolve({ count: 0 });
  });
  mocks.partidaCreate.mockImplementation((args: { data: Record<string, unknown> }) => {
    reg('partida.create');
    const nova = { id: `part-nova-${++seqPartida}`, centroCustoId: null, historico: null, ...args.data } as Partida;
    partidas.push(nova);
    return Promise.resolve({ ...nova });
  });
  mocks.partidaCreateMany.mockImplementation(() => {
    reg('partida.createMany');
    return Promise.resolve({ count: 0 });
  });
  mocks.partidaUpdate.mockImplementation(() => {
    reg('partida.update');
    return Promise.resolve({});
  });

  mocks.contaFindFirst.mockImplementation((args: { where?: Where }) => {
    reg('conta.findFirst');
    const c = contas.find((x) => corresponde(x as unknown as Record<string, unknown>, args?.where));
    return Promise.resolve(c ? { ...c } : null);
  });
  mocks.contaFindMany.mockImplementation((args: { where?: Where }) => {
    reg('conta.findMany');
    return Promise.resolve(
      contas.filter((x) => corresponde(x as unknown as Record<string, unknown>, args?.where)).map((c) => ({ ...c })),
    );
  });

  mocks.periodoFindFirst.mockImplementation((args: { where?: Where }) => {
    reg('periodo.findFirst');
    const p = periodos.find((x) => corresponde(x as unknown as Record<string, unknown>, args?.where));
    return Promise.resolve(p ? { id: p.id, codigo: p.codigo, estado: p.estado } : null);
  });
  mocks.periodoUpsert.mockResolvedValue({});
  mocks.exercicioUpsert.mockResolvedValue({ id: 'ex-2026' });
  mocks.exercicioFindFirst.mockResolvedValue(null);
  mocks.diarioFindFirst.mockImplementation(() =>
    Promise.resolve({ id: DIARIO_ID, tenantId: CTX.tenantId, ativo: true }),
  );
  mocks.centroCustoFindFirst.mockResolvedValue(null);

  // O cliente estendido e o cru chamam o callback com o MESMO tx (os delegados
  // do duplo) — o que distingue um do outro é qual `$transaction` foi chamado.
  const tx = {
    lancamento: {
      findFirst: mocks.lancamentoFindFirst,
      findUnique: mocks.lancamentoFindUnique,
      findMany: mocks.lancamentoFindMany,
      update: mocks.lancamentoUpdate,
      updateMany: mocks.lancamentoUpdateMany,
      create: mocks.lancamentoCreate,
      count: mocks.lancamentoCount,
    },
    partidaLancamento: {
      findMany: mocks.partidaFindMany,
      delete: mocks.partidaDelete,
      deleteMany: mocks.partidaDeleteMany,
      create: mocks.partidaCreate,
      createMany: mocks.partidaCreateMany,
      update: mocks.partidaUpdate,
    },
    contaPGC: { findFirst: mocks.contaFindFirst, findMany: mocks.contaFindMany },
    periodoContabil: { findFirst: mocks.periodoFindFirst, upsert: mocks.periodoUpsert },
    exercicioContabil: { upsert: mocks.exercicioUpsert, findFirst: mocks.exercicioFindFirst },
    diario: { findFirst: mocks.diarioFindFirst },
    centroCusto: { findFirst: mocks.centroCustoFindFirst },
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
  };
  mocks.transactionEstendido.mockImplementation((cb: (t: unknown) => Promise<unknown>) => {
    reg('prisma.$transaction');
    return cb(tx);
  });
  mocks.transactionBase.mockImplementation((cb: (t: unknown) => Promise<unknown>) => {
    reg('prismaBase.$transaction');
    return cb(tx);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ordem.length = 0;
  semear();
  instalarImplementacoes();
});

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

/** Contrato: CriarLancamento sem diarioId/origem/documentoOrigem*, mais id. */
function entradaEditar(sobre: Record<string, unknown> = {}) {
  return {
    id: LANC_ID,
    data: DATA_JUNHO_OUTRO_DIA,
    historico: 'Reclassificação corrigida',
    observacoes: 'Valor revisto',
    partidas: [
      { contaId: 'conta-2633', tipo: 'DEBITO', valor: 1500 },
      { contaId: 'conta-2632', tipo: 'CREDITO', valor: 1000 },
      { contaId: 'conta-311', tipo: 'CREDITO', valor: 500 },
    ],
    ...sobre,
  };
}

const entradaAnular = (sobre: Record<string, unknown> = {}) => ({
  id: LANC_ID,
  motivo: 'Lançado em duplicado',
  ...sobre,
});

async function esperarCodigo(p: Promise<unknown>, codigo: string) {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro, `esperava BusinessRuleError ${codigo}`).toBeInstanceOf(BusinessRuleError);
  expect((erro as BusinessRuleError).code).toBe(codigo);
}

const escritas = () => [
  ...mocks.lancamentoUpdate.mock.calls,
  ...mocks.lancamentoUpdateMany.mock.calls,
  ...mocks.lancamentoCreate.mock.calls,
  ...mocks.partidaDelete.mock.calls,
  ...mocks.partidaDeleteMany.mock.calls,
  ...mocks.partidaCreate.mock.calls,
  ...mocks.partidaCreateMany.mock.calls,
  ...mocks.partidaUpdate.mock.calls,
];

const CAMPOS_IMUTAVEIS = ['numero', 'diarioId', 'periodoId', 'periodoFiscal', 'tenantId', 'criadoPorId'] as const;

// ---------------------------------------------------------------------------
// I1 — só RASCUNHO, estado lido sob tranca
// ---------------------------------------------------------------------------

describe('I1 — só RASCUNHO se edita ou anula', () => {
  for (const status of ['LANCADO', 'ESTORNADO', 'ANULADO']) {
    it(`editar um ${status} → LANCAMENTO_NAO_RASCUNHO, sem escrita`, async () => {
      semear({ status });
      await esperarCodigo(editar(entradaEditar(), CTX), 'LANCAMENTO_NAO_RASCUNHO');
      expect(escritas()).toHaveLength(0);
    });

    it(`anular um ${status} → LANCAMENTO_NAO_RASCUNHO, sem escrita`, async () => {
      semear({ status });
      await esperarCodigo(anular(entradaAnular(), CTX), 'LANCAMENTO_NAO_RASCUNHO');
      expect(escritas()).toHaveLength(0);
    });
  }

  for (const [nome, chamar] of [
    ['editar', () => editar(entradaEditar(), CTX)],
    ['anular', () => anular(entradaAnular(), CTX)],
  ] as const) {
    it(`${nome}: a linha do lançamento é trancada FOR UPDATE ANTES de o estado ser lido`, async () => {
      await chamar();
      const tranca = mocks.ordem.indexOf('queryRaw:Lancamento:FOR UPDATE');
      expect(tranca, `ordem: ${mocks.ordem.join(' → ')}`).toBeGreaterThanOrEqual(0);
      const leitura = mocks.ordem.findIndex(
        (o) => o === 'lancamento.findFirst' || o === 'lancamento.findUnique',
      );
      if (leitura >= 0) expect(tranca, `ordem: ${mocks.ordem.join(' → ')}`).toBeLessThan(leitura);
      // e dentro da transacção
      expect(mocks.ordem.indexOf('prisma.$transaction')).toBeLessThan(tranca);
    });

    it(`${nome}: a tranca do lançamento leva o tenantId do contexto`, async () => {
      await chamar();
      const trancas = mocks.queryRaw.mock.calls
        .map((c) => lerSql(c))
        .filter((q) => /"Lancamento"/.test(q.sql) && /FOR UPDATE/i.test(q.sql));
      expect(trancas.length).toBeGreaterThan(0);
      for (const q of trancas) {
        expect(q.valores).toContain(LANC_ID);
        expect(q.valores).toContain(CTX.tenantId);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// I2 — partidas equilibradas, contas folha do tenant
// ---------------------------------------------------------------------------

describe('I2 — equilíbrio e contas', () => {
  it('partidas desequilibradas → PARTIDAS_DESEQUILIBRADAS', async () => {
    const entrada = entradaEditar({
      partidas: [
        { contaId: 'conta-2633', tipo: 'DEBITO', valor: 1500 },
        { contaId: 'conta-2632', tipo: 'CREDITO', valor: 1499.99 },
      ],
    });
    await esperarCodigo(editar(entrada, CTX), 'PARTIDAS_DESEQUILIBRADAS');
  });

  it('conta que não aceita lançamento → CONTA_NAO_ACEITA_LANCAMENTO', async () => {
    const entrada = entradaEditar({
      partidas: [
        { contaId: 'conta-26', tipo: 'DEBITO', valor: 1000 },
        { contaId: 'conta-2632', tipo: 'CREDITO', valor: 1000 },
      ],
    });
    await esperarCodigo(editar(entrada, CTX), 'CONTA_NAO_ACEITA_LANCAMENTO');
  });

  it('as contas são procuradas no tenant do contexto', async () => {
    await editar(entradaEditar(), CTX);
    const wheres = [
      ...mocks.contaFindFirst.mock.calls.map((c) => c[0]?.where),
      ...mocks.contaFindMany.mock.calls.map((c) => c[0]?.where),
    ];
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w?.tenantId).toBe(CTX.tenantId);
  });
});

// ---------------------------------------------------------------------------
// I3 — mesmo período, e ABERTO
// ---------------------------------------------------------------------------

describe('I3 — período', () => {
  it('editar com data noutro período → LANCAMENTO_MUDA_PERIODO, sem escrita', async () => {
    await esperarCodigo(editar(entradaEditar({ data: DATA_JULHO }), CTX), 'LANCAMENTO_MUDA_PERIODO');
    expect(escritas()).toHaveLength(0);
  });

  it('editar com data noutro dia do MESMO período é aceite', async () => {
    await expect(editar(entradaEditar({ data: DATA_JUNHO_OUTRO_DIA }), CTX)).resolves.toBeTruthy();
    const dados = mocks.lancamentoUpdate.mock.calls.map((c) => c[0].data);
    expect(dados.some((d) => d.data instanceof Date && d.data.getTime() === DATA_JUNHO_OUTRO_DIA.getTime())).toBe(true);
  });

  it('editar num período não ABERTO → PERIODO_FECHADO', async () => {
    semear({ estadoPeriodo: 'FECHADO' });
    await esperarCodigo(editar(entradaEditar({ data: DATA_JUNHO }), CTX), 'PERIODO_FECHADO');
    expect(escritas()).toHaveLength(0);
  });

  it('anular num período não ABERTO → PERIODO_FECHADO', async () => {
    semear({ estadoPeriodo: 'FECHADO' });
    await esperarCodigo(anular(entradaAnular(), CTX), 'PERIODO_FECHADO');
    expect(escritas()).toHaveLength(0);
  });

  it('editar tranca o período (FOR SHARE) antes de escrever', async () => {
    await editar(entradaEditar(), CTX);
    const trancaPeriodo = mocks.ordem.findIndex((o) => /^queryRaw:PeriodoContabil:FOR (SHARE|UPDATE)$/.test(o));
    expect(trancaPeriodo, `ordem: ${mocks.ordem.join(' → ')}`).toBeGreaterThanOrEqual(0);
    const primeiraEscrita = mocks.ordem.findIndex((o) => /\.(update|delete|create)/.test(o));
    expect(trancaPeriodo).toBeLessThan(primeiraEscrita);
  });
});

// ---------------------------------------------------------------------------
// I4 — numeração e âncoras intactas
// ---------------------------------------------------------------------------

describe('I4 — número, diário e período nunca mudam', () => {
  it('editar: nenhum update do lançamento toca em numero/diarioId/periodoId/periodoFiscal', async () => {
    await editar(entradaEditar(), CTX);
    expect(mocks.lancamentoUpdate).toHaveBeenCalled();
    for (const [args] of mocks.lancamentoUpdate.mock.calls) {
      for (const campo of CAMPOS_IMUTAVEIS) expect(args.data).not.toHaveProperty(campo);
    }
    const l = lancamentos.find((x) => x.id === LANC_ID)!;
    expect(l.numero).toBe('000007');
    expect(l.diarioId).toBe(DIARIO_ID);
    expect(l.periodoId).toBe('per-2026-06');
    expect(l.periodoFiscal).toBe('2026-06');
  });

  it('editar ignora um diarioId que venha no input (o schema não o tem, o serviço não o usa)', async () => {
    await editar(entradaEditar({ diarioId: 'cdiariooutro000000000000001', numero: '999999' }), CTX);
    for (const [args] of mocks.lancamentoUpdate.mock.calls) {
      for (const campo of CAMPOS_IMUTAVEIS) expect(args.data).not.toHaveProperty(campo);
    }
  });

  it('anular: o update não toca em numero/diarioId/periodoId/periodoFiscal', async () => {
    await anular(entradaAnular(), CTX);
    for (const [args] of mocks.lancamentoUpdate.mock.calls) {
      for (const campo of CAMPOS_IMUTAVEIS) expect(args.data).not.toHaveProperty(campo);
    }
  });

  it('editar não muda o estado (continua RASCUNHO)', async () => {
    await editar(entradaEditar(), CTX);
    for (const [args] of mocks.lancamentoUpdate.mock.calls) {
      if ('status' in args.data) expect(args.data.status).toBe('RASCUNHO');
    }
    expect(lancamentos.find((x) => x.id === LANC_ID)!.status).toBe('RASCUNHO');
  });

  it('um anulado continua a contar para a numeração: o criar conta por diário+período SEM filtrar estado', async () => {
    // Regressão a trancar: `proximoNumeroLancamento` conta todos os lançamentos
    // do diário no período. Um filtro de estado que excluísse ANULADO reutilizaria
    // o número de um anulado.
    mocks.lancamentoCreate.mockImplementation((args: { data: Record<string, unknown> }) => {
      mocks.ordem.push('lancamento.create');
      return Promise.resolve({ id: 'clancnovo0000000000000001', ...args.data });
    });
    await servico.criarLancamento(
      {
        data: DATA_JUNHO,
        diarioId: DIARIO_ID,
        origem: 'MANUAL',
        historico: 'Novo',
        partidas: [
          { contaId: 'conta-2633', tipo: 'DEBITO', valor: 10 },
          { contaId: 'conta-2632', tipo: 'CREDITO', valor: 10 },
        ],
      } as Parameters<typeof servico.criarLancamento>[0],
      CTX,
    );
    expect(mocks.lancamentoCount).toHaveBeenCalled();
    for (const [args] of mocks.lancamentoCount.mock.calls) {
      expect(args.where).not.toHaveProperty('status');
    }
  });
});

// ---------------------------------------------------------------------------
// I6 — multi-tenant
// ---------------------------------------------------------------------------

describe('I6 — multi-tenant', () => {
  for (const [nome, chamar] of [
    ['editar', (id: string) => editar(entradaEditar({ id }), CTX)],
    ['anular', (id: string) => anular(entradaAnular({ id }), CTX)],
  ] as const) {
    it(`${nome}: lançamento de OUTRO tenant → NotFoundError, sem escrita`, async () => {
      await expect(chamar(LANC_OUTRO_ID)).rejects.toBeInstanceOf(NotFoundError);
      expect(escritas()).toHaveLength(0);
      expect(lancamentos.find((l) => l.id === LANC_OUTRO_ID)!.status).toBe('RASCUNHO');
    });

    it(`${nome}: lançamento inexistente → NotFoundError`, async () => {
      await expect(chamar('cinexistente00000000000001')).rejects.toBeInstanceOf(NotFoundError);
      expect(escritas()).toHaveLength(0);
    });

    it(`${nome}: todos os where (leituras e escritas) levam o tenantId do contexto`, async () => {
      await chamar(LANC_ID);
      const chamadas = [
        ...mocks.lancamentoFindFirst.mock.calls,
        ...mocks.lancamentoFindUnique.mock.calls,
        ...mocks.lancamentoUpdate.mock.calls,
        ...mocks.partidaFindMany.mock.calls,
        ...mocks.partidaDelete.mock.calls,
        ...mocks.partidaUpdate.mock.calls,
        ...mocks.contaFindFirst.mock.calls,
        ...mocks.contaFindMany.mock.calls,
        ...mocks.periodoFindFirst.mock.calls,
      ];
      expect(chamadas.length).toBeGreaterThan(0);
      for (const [args] of chamadas) {
        expect(args?.where?.tenantId, JSON.stringify(args?.where)).toBe(CTX.tenantId);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Editar — o que escreve e como
// ---------------------------------------------------------------------------

describe('editarLancamentoRascunho — escritas', () => {
  it('escreve pelo cliente ESTENDIDO (prisma.$transaction), nunca pelo prismaBase', async () => {
    await editar(entradaEditar(), CTX);
    expect(mocks.transactionEstendido).toHaveBeenCalledTimes(1);
    expect(mocks.transactionBase).not.toHaveBeenCalled();
  });

  it('substitui as partidas com escritas SINGULARES: um delete por partida antiga, um create por nova', async () => {
    await editar(entradaEditar(), CTX);
    expect(mocks.partidaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.partidaCreateMany).not.toHaveBeenCalled();

    expect(mocks.partidaDelete).toHaveBeenCalledTimes(2);
    const apagadas = mocks.partidaDelete.mock.calls.map((c) => c[0].where.id).sort();
    expect(apagadas).toEqual(['part-a', 'part-b']);

    expect(mocks.partidaCreate).toHaveBeenCalledTimes(3);
    for (const [args] of mocks.partidaCreate.mock.calls) {
      expect(args.data.tenantId).toBe(CTX.tenantId);
      expect(args.data.lancamentoId).toBe(LANC_ID);
    }

    // Estado final: só as três partidas novas, com os valores pedidos.
    const finais = partidas.filter((p) => p.lancamentoId === LANC_ID);
    expect(finais).toHaveLength(3);
    const soma = (tipo: 'DEBITO' | 'CREDITO') =>
      finais
        .filter((p) => p.tipo === tipo)
        .reduce((a, p) => a.plus(new Prisma.Decimal(p.valor.toString())), new Prisma.Decimal(0));
    expect(soma('DEBITO').equals(new Prisma.Decimal('1500'))).toBe(true);
    expect(soma('CREDITO').equals(new Prisma.Decimal('1500'))).toBe(true);
    const c311 = finais.find((p) => p.contaId === 'conta-311')!;
    expect(c311.tipo).toBe('CREDITO');
    expect(new Prisma.Decimal(c311.valor.toString()).equals(new Prisma.Decimal('500'))).toBe(true);
  });

  it('não toca nas partidas de outro lançamento', async () => {
    await editar(entradaEditar(), CTX);
    expect(partidas.find((p) => p.id === 'part-x')).toBeDefined();
  });

  it('actualiza o cabeçalho (histórico, observações, data) e recalcula valorTotal = Σ débitos', async () => {
    await editar(entradaEditar(), CTX);
    const l = lancamentos.find((x) => x.id === LANC_ID)!;
    expect(l.historico).toBe('Reclassificação corrigida');
    expect(l.observacoes).toBe('Valor revisto');
    expect(l.data.getTime()).toBe(DATA_JUNHO_OUTRO_DIA.getTime());
    expect(new Prisma.Decimal(l.valorTotal.toString()).equals(new Prisma.Decimal('1500'))).toBe(true);
    for (const [args] of mocks.lancamentoUpdate.mock.calls) {
      expect(args.where.id).toBe(LANC_ID);
    }
  });

  it('devolve o lançamento com as partidas novas', async () => {
    const r = (await editar(entradaEditar(), CTX)) as { id: string; numero: string; partidas?: unknown[] };
    expect(r.id).toBe(LANC_ID);
    expect(r.numero).toBe('000007');
    expect(r.partidas).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Anular — o que escreve e como
// ---------------------------------------------------------------------------

describe('anularLancamentoRascunho — escritas', () => {
  it('UM update singular para ANULADO com o motivo; partidas intactas', async () => {
    await anular(entradaAnular(), CTX);
    expect(mocks.lancamentoUpdate).toHaveBeenCalledTimes(1);
    const [args] = mocks.lancamentoUpdate.mock.calls[0];
    expect(args.where.id).toBe(LANC_ID);
    expect(args.data.status).toBe('ANULADO');
    expect(args.data.motivoAnulacao).toBe('Lançado em duplicado');
    expect(mocks.lancamentoUpdateMany).not.toHaveBeenCalled();
    expect(mocks.partidaDelete).not.toHaveBeenCalled();
    expect(mocks.partidaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.partidaCreate).not.toHaveBeenCalled();
    expect(partidas.filter((p) => p.lancamentoId === LANC_ID)).toHaveLength(2);
  });

  it('a linha fica (sem hard delete), com o mesmo número', async () => {
    const r = (await anular(entradaAnular(), CTX)) as { id: string; status: string; numero: string };
    const l = lancamentos.find((x) => x.id === LANC_ID)!;
    expect(l.status).toBe('ANULADO');
    expect(l.numero).toBe('000007');
    expect(r.id).toBe(LANC_ID);
    expect(r.status).toBe('ANULADO');
  });

  it('escreve pelo cliente ESTENDIDO (prisma.$transaction), nunca pelo prismaBase', async () => {
    await anular(entradaAnular(), CTX);
    expect(mocks.transactionEstendido).toHaveBeenCalledTimes(1);
    expect(mocks.transactionBase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listarLancamentos — anulados escondidos por omissão (D6)
// ---------------------------------------------------------------------------

type FiltroStatus = unknown;

/** Avalia se um filtro Prisma de `status` (e um `NOT` de topo) deixa passar `s`. */
function admite(where: Record<string, unknown>, s: string): boolean {
  const avaliar = (f: FiltroStatus): boolean => {
    if (f === undefined) return true;
    if (typeof f === 'string') return f === s;
    const o = f as Record<string, unknown>;
    if ('equals' in o && o.equals !== s) return false;
    if ('in' in o && !(o.in as string[]).includes(s)) return false;
    if ('notIn' in o && (o.notIn as string[]).includes(s)) return false;
    if ('not' in o) {
      const n = o.not;
      if (typeof n === 'string' && n === s) return false;
      if (n && typeof n === 'object' && avaliar(n)) return false;
    }
    return true;
  };
  if (!avaliar(where.status)) return false;
  const nots = where.NOT === undefined ? [] : Array.isArray(where.NOT) ? where.NOT : [where.NOT];
  for (const n of nots as Record<string, unknown>[]) {
    if (n.status !== undefined && avaliar(n.status)) return false;
  }
  const ands = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
  for (const a of ands as Record<string, unknown>[]) if (!admite(a, s)) return false;
  return true;
}

describe('listarLancamentos — ANULADO escondido por omissão', () => {
  const whereDaChamada = () => mocks.lancamentoFindMany.mock.calls[0][0].where as Record<string, unknown>;

  it('sem filtro de estado: exclui ANULADO e mantém RASCUNHO, LANCADO e ESTORNADO', async () => {
    await servico.listarLancamentos({ take: 25 } as Parameters<typeof servico.listarLancamentos>[0], CTX);
    const where = whereDaChamada();
    expect(where.tenantId).toBe(CTX.tenantId);
    expect(admite(where, 'ANULADO'), JSON.stringify(where)).toBe(false);
    for (const s of ['RASCUNHO', 'LANCADO', 'ESTORNADO']) {
      expect(admite(where, s), `${s}: ${JSON.stringify(where)}`).toBe(true);
    }
  });

  it("com status: 'ANULADO' filtra por ele (e só por ele)", async () => {
    await servico.listarLancamentos(
      { take: 25, status: 'ANULADO' } as unknown as Parameters<typeof servico.listarLancamentos>[0],
      CTX,
    );
    const where = whereDaChamada();
    expect(admite(where, 'ANULADO'), JSON.stringify(where)).toBe(true);
    for (const s of ['RASCUNHO', 'LANCADO', 'ESTORNADO']) expect(admite(where, s)).toBe(false);
  });

  it("com status: 'LANCADO' continua a filtrar por LANCADO", async () => {
    await servico.listarLancamentos(
      { take: 25, status: 'LANCADO' } as Parameters<typeof servico.listarLancamentos>[0],
      CTX,
    );
    const where = whereDaChamada();
    expect(admite(where, 'LANCADO')).toBe(true);
    expect(admite(where, 'ANULADO')).toBe(false);
    expect(admite(where, 'RASCUNHO')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I5 — ANULADO fora de tudo o que tem efeito (regressões a trancar)
// ---------------------------------------------------------------------------

describe('I5 — ANULADO fora dos mapas', () => {
  it('FILTRO_LANCAMENTO_MAPA continua a lista explícita LANCADO+ESTORNADO', () => {
    expect(servico.FILTRO_LANCAMENTO_MAPA).toEqual({ in: ['LANCADO', 'ESTORNADO'] });
  });
});
