import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DIARIOS_INICIAIS,
  SERIES_INICIAIS,
  bootstrapContabilidade,
  bootstrapContasNaturezaNotaDebito,
  bootstrapDiarios,
  bootstrapPlanoContas,
  bootstrapRbac,
  bootstrapSeriesDocumento,
  classeEnum,
  derivarTipoConta,
  garantirCatalogoPermissoes,
  // ORÁCULO do nó `seed-v` (ticket 4.4, verificador-fluxo-caixa): AINDA NÃO
  // EXISTE. O import é deliberado — os casos «DFC — semearRubricasFluxo»
  // rebentam com «is not a function» até o nó `seed` a entregar. Alterá-los
  // num nó de autor é BLOCKER (grafo dfc, «Ficheiros protegidos»).
  semearRubricasFluxo,
} from '../tenant-bootstrap';
import { CONTA_PADRAO_NATUREZA_ND } from '@/lib/nota-debito';
import { AtividadeFluxoEnum, SinalFluxoEnum } from '@/lib/validations/fluxo-caixa';
import type {
  ContaCaixaInfo,
  InstantaneoMapeamento,
  MapeamentoContaFluxo,
  RubricaFluxoCaixa,
} from '@/server/services/financas/dfc.interface';
import { instantaneoDe, mudou } from '@/server/services/financas/mapeamento-versao.model';
import { coerenciaContasCaixa } from '@/server/services/financas/dfc.model';
import planoContasJson from '../../../../prisma/seed/data/plano-contas-pgc.json';

interface Linha {
  id: string;
  tenantId: string;
  nivel: number;
  contaMaeId: string | null;
  tipo: string;
  ano: number;
  proximoNumero: number;
  permissionId: string;
}

type ArgsCreateMany = { data: Array<Partial<Linha>> };
type ArgsUpsert = {
  where: { tenantId_nome: { tenantId: string; nome: string } };
  create: { tenantId: string; nome: string };
};

// ---------------------------------------------------------------------------
// Duplo COM ESTADO de uma tabela Prisma (para os modelos da DFC, ticket 4.4).
//
// Os mocks acima devolvem `{ count }` e esquecem os dados; a idempotência do
// seed («correr duas vezes não duplica nada») só se mede numa tabela que se
// lembra do que lá está e que faz cumprir os `@@unique` do schema: um segundo
// `createMany` sem `skipDuplicates` tem de rebentar com P2002, como na base.
// Só campos escalares (sem `connect`/`include`); `select` é ignorado (devolve a
// linha inteira, que é um superconjunto). Operadores fora dos suportados
// lançam, para que uma leitura que o duplo não entende não passe por «vazio».
// ---------------------------------------------------------------------------

type LinhaTabela = Record<string, unknown>;
type Where = Record<string, unknown>;
type OrderBy = Record<string, 'asc' | 'desc'>;
interface ArgsLeitura {
  where?: Where;
  orderBy?: OrderBy | OrderBy[];
  take?: number;
  select?: unknown;
}

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function casa(linha: LinhaTabela, where: Where | undefined, compostas: ReadonlySet<string>): boolean {
  if (!where) return true;
  for (const [campo, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (campo === 'AND' || campo === 'OR') {
      const lista = (Array.isArray(cond) ? cond : [cond]) as Where[];
      const ok = campo === 'AND' ? lista.every((w) => casa(linha, w, compostas)) : lista.some((w) => casa(linha, w, compostas));
      if (!ok) return false;
      continue;
    }
    if (campo === 'NOT') {
      if (casa(linha, cond as Where, compostas)) return false;
      continue;
    }
    if (compostas.has(campo)) {
      if (!casa(linha, cond as Where, compostas)) return false;
      continue;
    }
    if (!(campo in linha)) {
      throw new Error(`fakeTx: filtro «${campo}» desconhecido nesta tabela (relação? campo inexistente?) — só campos escalares.`);
    }
    const valor = linha[campo];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
      if (!igual(valor, cond)) return false;
      continue;
    }
    for (const [op, arg] of Object.entries(cond as Record<string, unknown>)) {
      switch (op) {
        case 'equals':
          if (!igual(valor, arg)) return false;
          break;
        case 'in':
          if (!(arg as unknown[]).some((a) => igual(valor, a))) return false;
          break;
        case 'notIn':
          if ((arg as unknown[]).some((a) => igual(valor, a))) return false;
          break;
        case 'not':
          if (igual(valor, arg)) return false;
          break;
        case 'mode':
          break;
        default:
          throw new Error(`fakeTx: operador «${op}» em «${campo}» não suportado pelo duplo.`);
      }
    }
  }
  return true;
}

function ordenar(linhas: LinhaTabela[], orderBy?: OrderBy | OrderBy[]): LinhaTabela[] {
  if (!orderBy) return linhas;
  const criterios = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...linhas].sort((a, b) => {
    for (const [campo, sentido] of criterios) {
      const x = a[campo] as number | string;
      const y = b[campo] as number | string;
      if (x === y) continue;
      const r = x < y ? -1 : 1;
      return sentido === 'desc' ? -r : r;
    }
    return 0;
  });
}

function p2002(campos: readonly string[]) {
  return Object.assign(new Error(`Unique constraint failed on the fields: (${campos.join(',')})`), { code: 'P2002' });
}

function tabela(prefixo: string, unicos: readonly (readonly string[])[], omissao: () => LinhaTabela = () => ({})) {
  const linhas: LinhaTabela[] = [];
  const compostas = new Set(unicos.map((u) => u.join('_')));
  let seq = 0;

  const filtrar = (where?: Where) => linhas.filter((l) => casa(l, where, compostas));
  const inserir = (dados: LinhaTabela, skipDuplicates = false): LinhaTabela | null => {
    seq += 1;
    const agora = new Date();
    // `undefined` é «não fornecido» no Prisma: não pode apagar a omissão.
    const fornecidos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined));
    // Id por omissão NÃO é uuid de propósito: o teste 6 exige ids atribuídos pelo bootstrap.
    const linha: LinhaTabela = { id: `${prefixo}-${seq}`, createdAt: agora, updatedAt: agora, ...omissao(), ...fornecidos };
    const violado = unicos.find((campos) => linhas.some((e) => campos.every((c) => igual(e[c], linha[c]))));
    if (violado) {
      if (skipDuplicates) return null;
      throw p2002(violado);
    }
    linhas.push(linha);
    return linha;
  };
  const primeira = (args: ArgsLeitura = {}) => ordenar(filtrar(args.where), args.orderBy)[0] ?? null;

  return {
    linhas,
    createMany: vi.fn(async ({ data, skipDuplicates }: { data: LinhaTabela | LinhaTabela[]; skipDuplicates?: boolean }) => {
      const lista = Array.isArray(data) ? data : [data];
      return { count: lista.filter((d) => inserir(d, skipDuplicates) !== null).length };
    }),
    createManyAndReturn: vi.fn(async ({ data, skipDuplicates }: { data: LinhaTabela | LinhaTabela[]; skipDuplicates?: boolean }) => {
      const lista = Array.isArray(data) ? data : [data];
      return lista.map((d) => inserir(d, skipDuplicates)).filter((l): l is LinhaTabela => l !== null);
    }),
    create: vi.fn(async ({ data }: { data: LinhaTabela }) => inserir(data)),
    findMany: vi.fn(async (args: ArgsLeitura = {}) => {
      const r = ordenar(filtrar(args.where), args.orderBy);
      return args.take === undefined ? r : r.slice(0, args.take);
    }),
    findFirst: vi.fn(async (args: ArgsLeitura = {}) => primeira(args)),
    findUnique: vi.fn(async (args: ArgsLeitura) => primeira(args)),
    count: vi.fn(async (args: ArgsLeitura = {}) => filtrar(args.where).length),
    aggregate: vi.fn(async (args: ArgsLeitura & { _max?: Record<string, true>; _count?: unknown }) => {
      const ls = filtrar(args.where);
      const r: LinhaTabela = {};
      if (args._max) {
        r._max = Object.fromEntries(
          Object.keys(args._max).map((k) => [k, ls.length === 0 ? null : Math.max(...ls.map((l) => l[k] as number))]),
        );
      }
      if (args._count !== undefined) r._count = ls.length;
      return r;
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: Where; create: LinhaTabela; update: LinhaTabela }) => {
      const existente = primeira({ where });
      if (existente) {
        Object.assign(existente, update, { updatedAt: new Date() });
        return existente;
      }
      return inserir(create);
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: LinhaTabela }) => {
      const existente = primeira({ where });
      if (!existente) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      Object.assign(existente, data, { updatedAt: new Date() });
      return existente;
    }),
    updateMany: vi.fn(async ({ where, data }: { where?: Where; data: LinhaTabela }) => {
      const alvo = filtrar(where);
      for (const l of alvo) Object.assign(l, data, { updatedAt: new Date() });
      return { count: alvo.length };
    }),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      const existente = primeira({ where });
      if (!existente) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
      linhas.splice(linhas.indexOf(existente), 1);
      return existente;
    }),
    deleteMany: vi.fn(async ({ where }: { where?: Where } = {}) => {
      const alvo = filtrar(where);
      for (const l of alvo) linhas.splice(linhas.indexOf(l), 1);
      return { count: alvo.length };
    }),
  };
}

type Tabela = ReturnType<typeof tabela>;

/** O bootstrap escreve pelo cliente Prisma; SQL cru é um INSERT fora do duplo. */
function semSqlCru(nome: string) {
  return vi.fn(() => {
    throw new Error(`fakeTx: ${nome} chamado — o bootstrap não escreve SQL cru.`);
  });
}

function fakeTx() {
  const createMany = () =>
    vi.fn(async ({ data }: ArgsCreateMany) => ({ count: data.length }));
  return {
    // Modelos da DFC (migração 22b) — com estado e com os @@unique do schema,
    // para o caso `bootstrapContabilidade` existente continuar a correr quando
    // o seed passar a ser chamado, e para os casos do ticket 4.4.
    rubricaFluxoCaixa: tabela('rub', [['tenantId', 'codigo']], () => ({ ativo: true, deletedAt: null })),
    mapeamentoContaFluxo: tabela('map', [['tenantId', 'contaId']]),
    versaoMapeamentoFluxo: tabela('ver', [['tenantId', 'numero']], () => ({
      estado: 'PENDING',
      validadoPorId: null,
      validadoEm: null,
      observacao: null,
    })),
    $executeRaw: semSqlCru('$executeRaw'),
    $executeRawUnsafe: semSqlCru('$executeRawUnsafe'),
    $queryRaw: semSqlCru('$queryRaw'),
    $queryRawUnsafe: semSqlCru('$queryRawUnsafe'),
    contaPGC: {
      createMany: createMany(),
      // O plano semeado tem as três contas por omissão das naturezas de ND.
      findMany: vi.fn(async () => [
        { id: 'c711', codigo: '711', classe: 'CLASSE_7' },
        { id: 'c781', codigo: '781', classe: 'CLASSE_7' },
        { id: 'c769', codigo: '769', classe: 'CLASSE_7' },
      ]),
    },
    contaNaturezaNotaDebito: {
      createMany: vi.fn(async ({ data }: { data: unknown[]; skipDuplicates?: boolean }) => ({ count: data.length })),
    },
    diario: { createMany: createMany() },
    serieDocumento: { createMany: createMany() },
    permission: {
      createMany: vi.fn(async (_args: ArgsCreateMany) => ({ count: 0 })),
      findMany: vi.fn(async () => [{ id: 'p1', code: 'faturacao:ver' }]),
    },
    role: {
      upsert: vi.fn(async ({ create }: ArgsUpsert) => ({
        id: `role-${create.nome}`,
        nome: create.nome,
      })),
    },
    rolePermission: { createMany: vi.fn(async (_args: ArgsCreateMany) => ({ count: 1 })) },
  };
}

let tx: ReturnType<typeof fakeTx>;

beforeEach(() => {
  tx = fakeTx();
});

describe('derivação do plano PGC-NIRF', () => {
  it('mapeia a classe para o enum SCREAMING_SNAKE', () => {
    expect(classeEnum(1)).toBe('CLASSE_1');
    expect(classeEnum(8)).toBe('CLASSE_8');
  });

  it('deriva o tipo de conta pelas classes 5–8 e pela natureza nas classes 1–4', () => {
    expect(derivarTipoConta(5, 'CREDORA')).toBe('CAPITAL_PROPRIO');
    expect(derivarTipoConta(6, 'DEVEDORA')).toBe('GASTO');
    expect(derivarTipoConta(7, 'CREDORA')).toBe('RENDIMENTO');
    expect(derivarTipoConta(8, 'CREDORA')).toBe('RESULTADO');
    expect(derivarTipoConta(1, 'DEVEDORA')).toBe('ATIVO');
    expect(derivarTipoConta(2, 'CREDORA')).toBe('PASSIVO');
  });
});

describe('bootstrapPlanoContas', () => {
  it('cria o plano completo com tenantId explícito em cada linha', async () => {
    const total = await bootstrapPlanoContas(tx as never, 'tenant-1');

    expect(total).toBeGreaterThan(400); // 504 contas no PGC-NIRF
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    expect(linhas.every((l) => l.tenantId === 'tenant-1')).toBe(true);
  });

  it('insere por nível ascendente — a mãe existe antes da subconta (FK auto-referencial)', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const niveis = tx.contaPGC.createMany.mock.calls.map((c) => c[0].data[0].nivel as number);
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b));
  });

  it('resolve contaMaeId para ids já emitidos, nunca para códigos', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    const ids = new Set(linhas.map((l) => l.id));

    // A hierarquia tem mesmo de existir. O `for` abaixo passa à mesma se TODAS
    // as contas ficarem órfãs — foi o que quase aconteceu ao renomear a chave
    // `contaMaeCodigo` no JSON: um nome trocado não dá erro de compilação,
    // deixa só o plano inteiro plano.
    const comMae = linhas.filter((l) => l.contaMaeId);
    expect(comMae.length).toBeGreaterThan(400);

    for (const l of linhas) {
      if (l.contaMaeId) expect(ids.has(l.contaMaeId)).toBe(true);
    }
  });

  it('gera ids distintos para cada conta', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(linhas.length);
  });
});

describe('diários e séries', () => {
  it('cria os 9 diários contabilísticos com tenantId', async () => {
    const n = await bootstrapDiarios(tx as never, 'tenant-1');
    expect(n).toBe(DIARIOS_INICIAIS.length);
    const data = tx.diario.createMany.mock.calls[0][0].data;
    expect(data.every((d) => d.tenantId === 'tenant-1')).toBe(true);
  });

  it('cria uma série por tipo de documento, para o ano indicado', async () => {
    const n = await bootstrapSeriesDocumento(tx as never, 'tenant-1', 2030);
    expect(n).toBe(SERIES_INICIAIS.length);
    const data = tx.serieDocumento.createMany.mock.calls[0][0].data;

    // Cada tipo que um serviço pede tem de estar aqui: sem série, a operação
    // inteira falha dentro da transacção. Foi o que aconteceu às encomendas,
    // às devoluções e às contagens de stock — o enum cresceu, a lista não.
    const tipos = new Set(data.map((s) => (s as { tipo: string }).tipo));
    for (const obrigatorio of [
      'FATURA',
      'VENDA',
      'SESSAO_CAIXA',
      'ENCOMENDA',
      'NOTA_DEVOLUCAO',
      'CONTAGEM_STOCK',
      'PAGAMENTO',
    ]) {
      expect(tipos).toContain(obrigatorio);
    }
    // Prefixos distintos, senão a chave @@unique([tenantId, tipo, ano, prefixo])
    // deixa passar mas o utilizador vê dois documentos com a mesma cara.
    const prefixos = data.map((s) => (s as { prefixo: string }).prefixo);
    expect(new Set(prefixos).size).toBe(prefixos.length);
    expect(data.every((s) => s.ano === 2030)).toBe(true);
    expect(data.every((s) => s.proximoNumero === 1)).toBe(true);
    expect(data.every((s) => s.tenantId === 'tenant-1')).toBe(true);
  });

  it('inclui a série de FATURA (sem ela não se emite nada)', async () => {
    await bootstrapSeriesDocumento(tx as never, 'tenant-1');
    const data = tx.serieDocumento.createMany.mock.calls[0][0].data;
    expect(data.map((s) => s.tipo)).toContain('FATURA');
  });

  it('bootstrapContabilidade encadeia os três passos', async () => {
    const r = await bootstrapContabilidade(tx as never, 'tenant-1');
    expect(r.contas).toBeGreaterThan(0);
    expect(r.diarios).toBe(DIARIOS_INICIAIS.length);
    expect(r.series).toBe(SERIES_INICIAIS.length);
    expect(tx.contaNaturezaNotaDebito.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('conta de crédito por natureza de ND (ADR-0039 §1)', () => {
  it('semeia ACERTO_PRECO→711, JUROS_MORA→781, PENALIZACAO→769, pelo id da conta do tenant', async () => {
    const n = await bootstrapContasNaturezaNotaDebito(tx as never, 'tenant-1');
    const args = tx.contaNaturezaNotaDebito.createMany.mock.calls[0][0];
    expect(n).toBe(3);
    expect(args.skipDuplicates).toBe(true); // não substitui o que o tenant já escolheu
    expect(args.data).toEqual([
      { tenantId: 'tenant-1', natureza: 'ACERTO_PRECO', contaId: 'c711' },
      { tenantId: 'tenant-1', natureza: 'JUROS_MORA', contaId: 'c781' },
      { tenantId: 'tenant-1', natureza: 'PENALIZACAO', contaId: 'c769' },
    ]);
    const where = (tx.contaPGC.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ tenantId: 'tenant-1', aceitaLancamento: true, ativo: true });
  });

  it('DESPESAS_REPERCUTIDAS e OUTRO ficam sem omissão (escolhe-se no acto)', () => {
    expect(Object.keys(CONTA_PADRAO_NATUREZA_ND)).not.toContain('DESPESAS_REPERCUTIDAS');
    expect(Object.keys(CONTA_PADRAO_NATUREZA_ND)).not.toContain('OUTRO');
  });

  it('conta em falta no plano do tenant → a natureza fica sem linha, nunca com uma conta inventada', async () => {
    tx.contaPGC.findMany.mockResolvedValueOnce([{ id: 'c711', codigo: '711', classe: 'CLASSE_7' }]);
    await bootstrapContasNaturezaNotaDebito(tx as never, 'tenant-1');
    expect(tx.contaNaturezaNotaDebito.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: 'tenant-1', natureza: 'ACERTO_PRECO', contaId: 'c711' },
    ]);
  });

  it('conta com o código certo mas classe errada (plano divergente) → também fica sem linha', async () => {
    tx.contaPGC.findMany.mockResolvedValueOnce([
      { id: 'c711', codigo: '711', classe: 'CLASSE_7' },
      { id: 'c781', codigo: '781', classe: 'CLASSE_6' },
    ]);
    await bootstrapContasNaturezaNotaDebito(tx as never, 'tenant-1');
    expect((tx.contaNaturezaNotaDebito.createMany.mock.calls[0][0].data as Array<{ natureza: string }>).map((l) => l.natureza))
      .toEqual(['ACERTO_PRECO']);
  });
});

describe('catálogo global de permissões', () => {
  it('garantirCatalogoPermissoes escreve o catálogo com skipDuplicates', async () => {
    await garantirCatalogoPermissoes(tx as never);
    const args = tx.permission.createMany.mock.calls[0][0] as unknown as {
      data: unknown[];
      skipDuplicates: boolean;
    };
    expect(args.skipDuplicates).toBe(true);
    expect(args.data.length).toBeGreaterThan(100);
  });
});

describe('bootstrapRbac', () => {
  it('NÃO escreve o catálogo global dentro da transacção do tenant', async () => {
    // MAJOR-8: Permission.code é único e global; dois provisionamentos
    // concorrentes a escrever as mesmas ~400 linhas dentro das suas transacções
    // bloqueiam-se no mesmo índice, com deadlock possível num endpoint público.
    await bootstrapRbac(tx as never, 'tenant-1');
    expect(tx.permission.createMany).not.toHaveBeenCalled();
    expect(tx.permission.findMany).toHaveBeenCalled();
  });

  it('cria os roles de sistema do tenant e devolve-os', async () => {
    const roles = await bootstrapRbac(tx as never, 'tenant-1');
    expect(roles.map((r) => r.nome)).toContain('ADMIN');
    for (const call of tx.role.upsert.mock.calls) {
      expect(call[0].create.tenantId).toBe('tenant-1');
      expect(call[0].where.tenantId_nome.tenantId).toBe('tenant-1');
    }
  });

  it('só liga permissões que existem no catálogo', async () => {
    await bootstrapRbac(tx as never, 'tenant-1');
    const ligacoes = tx.rolePermission.createMany.mock.calls.flatMap((c) => c[0].data);
    expect(ligacoes.every((l) => l.permissionId === 'p1')).toBe(true);
  });
});

describe('plano-contas-pgc.json — natureza das classes', () => {
  // O ficheiro tinha as classes 6 e 7 trocadas: 145 contas de gasto marcadas
  // `CREDORA` e 87 de rendimento `DEVEDORA`. O `montarLinhasBalancete` usa a
  // natureza para dar sinal ao saldo, por isso o balancete mostrava a receita
  // em negativo e a DRE herdava o erro. Isto tranca a correcção: o ficheiro é
  // gerado, e uma regeneração podia voltar a invertê-las em silêncio.
  const contas: Array<{ codigo: string; classe: number; natureza: string }> =
    require('../../../../prisma/seed/data/plano-contas-pgc.json');

  it('gasta-se a débito: toda a classe 6 é DEVEDORA', () => {
    const erradas = contas.filter((c) => c.classe === 6 && c.natureza !== 'DEVEDORA');
    expect(erradas.map((c) => c.codigo)).toEqual([]);
  });

  it('ganha-se a crédito: toda a classe 7 é CREDORA', () => {
    const erradas = contas.filter((c) => c.classe === 7 && c.natureza !== 'CREDORA');
    expect(erradas.map((c) => c.codigo)).toEqual([]);
  });

  it('a natureza não altera o tipo das classes 5–8 — só o sinal do saldo', () => {
    expect(derivarTipoConta(6, 'DEVEDORA')).toBe('GASTO');
    expect(derivarTipoConta(7, 'CREDORA')).toBe('RENDIMENTO');
  });
});

// ===========================================================================
// ORÁCULO do nó `seed-v` (ticket 4.4) — spec 22 · WS-2 · ADR-0037 §2, §3, E1,
// E2, I7, I10, V1. Escrito pelo verificador ANTES de `semearRubricasFluxo`
// existir; tem de ficar vermelho até o nó `seed` a entregar.
//
// Nada aqui depende do CONTEÚDO de `rubricas-fluxo-caixa.json` (isso é o
// parecer do contabilista, ticket 11): só das propriedades que o seed tem de
// satisfazer seja qual for a tabela. As contas de caixa deduzem-se pela
// actividade da rubrica (E2), nunca por prefixo de código.
// ===========================================================================

interface ContaPlanoJSON {
  codigo: string;
  classe: number;
  aceitaLancamento: boolean;
}

/** As folhas do plano canónico, deduplicadas como o `bootstrapPlanoContas` faz (5611/5612 repetem-se). */
function folhasDoPlano(): ContaPlanoJSON[] {
  const vistos = new Set<string>();
  const folhas: ContaPlanoJSON[] = [];
  for (const c of planoContasJson as ContaPlanoJSON[]) {
    if (vistos.has(c.codigo)) continue;
    vistos.add(c.codigo);
    if (c.aceitaLancamento) folhas.push(c);
  }
  return folhas;
}

/** Um `fakeTx` cujo plano de contas se LEMBRA do que o bootstrap escreveu (ids uuid reais). */
function fakeTxComPlano() {
  return {
    ...fakeTx(),
    contaPGC: tabela('pgc', [['tenantId', 'codigo']], () => ({ ativo: true })),
  };
}
type TxComPlano = ReturnType<typeof fakeTxComPlano>;

const doTenant = (t: Tabela, tenantId: string) => t.linhas.filter((l) => l.tenantId === tenantId);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function semear(tx: TxComPlano, tenantId: string): Promise<void> {
  await bootstrapPlanoContas(tx as never, tenantId);
  await semearRubricasFluxo(tx as never, tenantId);
}

/** As contas mapeadas a rubricas `CAIXA` do tenant, na forma que `coerenciaContasCaixa` recebe. */
function contasCaixaDe(tx: TxComPlano, tenantId: string): ContaCaixaInfo[] {
  const rubricasCaixa = new Set(
    doTenant(tx.rubricaFluxoCaixa, tenantId)
      .filter((r) => r.atividade === 'CAIXA' && r.deletedAt === null)
      .map((r) => r.id as string),
  );
  const contaPorId = new Map(doTenant(tx.contaPGC, tenantId).map((c) => [c.id as string, c]));
  return doTenant(tx.mapeamentoContaFluxo, tenantId)
    .filter((m) => rubricasCaixa.has(m.rubricaId as string))
    .map((m) => {
      const c = contaPorId.get(m.contaId as string);
      if (!c) throw new Error(`mapeamento para conta desconhecida ${String(m.contaId)}`);
      return {
        id: c.id as string,
        codigo: c.codigo as string,
        nome: c.nome as string,
        classe: c.classe as ContaCaixaInfo['classe'],
        aceitaLancamento: c.aceitaLancamento as boolean,
        ativo: c.ativo as boolean,
      };
    });
}

describe('DFC — semearRubricasFluxo (ticket 4.4)', () => {
  const T1 = 'tenant-1';
  const T2 = 'tenant-2';
  let tx: TxComPlano;

  beforeEach(() => {
    tx = fakeTxComPlano();
  });

  it('I7 sobre o seed: toda a conta folha do plano fica com exactamente UM mapeamento; nenhuma agregadora; nenhuma rubrica inexistente', async () => {
    await semear(tx, T1);

    const contas = doTenant(tx.contaPGC, T1);
    const folhas = contas.filter((c) => c.aceitaLancamento === true && c.ativo === true);
    const agregadoras = contas.filter((c) => c.aceitaLancamento === false);
    // O plano canónico tem 435 folhas e 68 agregadoras; se o JSON mudar, muda aqui também.
    expect(folhas.length).toBe(folhasDoPlano().length);
    expect(agregadoras.length).toBeGreaterThan(0);

    const mapeamentos = doTenant(tx.mapeamentoContaFluxo, T1);
    const porConta = new Map<string, number>();
    for (const m of mapeamentos) porConta.set(m.contaId as string, (porConta.get(m.contaId as string) ?? 0) + 1);

    // Cobertura: nenhuma folha sem mapeamento (a lista de códigos em falta é a mensagem).
    const semMapeamento = folhas.filter((c) => !porConta.has(c.id as string)).map((c) => c.codigo);
    expect(semMapeamento).toEqual([]);
    // Exactamente um: uma conta em duas rubricas contaria em duas actividades (§2).
    const repetidas = folhas.filter((c) => (porConta.get(c.id as string) ?? 0) !== 1).map((c) => c.codigo);
    expect(repetidas).toEqual([]);
    // Nenhuma agregadora e nenhum id fora do plano do tenant.
    const idsFolhas = new Set(folhas.map((c) => c.id as string));
    const foraDasFolhas = mapeamentos.filter((m) => !idsFolhas.has(m.contaId as string)).map((m) => m.contaId);
    expect(foraDasFolhas).toEqual([]);
    expect(mapeamentos.length).toBe(folhas.length);

    // Toda a rubrica referida existe, é do tenant e está viva.
    const rubricasVivas = new Set(
      doTenant(tx.rubricaFluxoCaixa, T1)
        .filter((r) => r.deletedAt === null)
        .map((r) => r.id as string),
    );
    const rubricasPenduradas = mapeamentos.filter((m) => !rubricasVivas.has(m.rubricaId as string)).map((m) => m.rubricaId);
    expect(rubricasPenduradas).toEqual([]);
  });

  it('idempotência: correr duas vezes não duplica rubricas, mapeamentos nem versões (o duplo faz cumprir os @@unique)', async () => {
    await semear(tx, T1);
    const antes = {
      rubricas: doTenant(tx.rubricaFluxoCaixa, T1).length,
      mapeamentos: doTenant(tx.mapeamentoContaFluxo, T1).length,
      versoes: doTenant(tx.versaoMapeamentoFluxo, T1).length,
    };
    expect(antes.rubricas).toBeGreaterThan(0);
    expect(antes.versoes).toBe(1);

    // Um segundo `createMany` sem `skipDuplicates` rebenta aqui com P2002, como na base.
    await semearRubricasFluxo(tx as never, T1);

    expect({
      rubricas: doTenant(tx.rubricaFluxoCaixa, T1).length,
      mapeamentos: doTenant(tx.mapeamentoContaFluxo, T1).length,
      versoes: doTenant(tx.versaoMapeamentoFluxo, T1).length,
    }).toEqual(antes);
    expect(doTenant(tx.versaoMapeamentoFluxo, T1).map((v) => v.numero)).toEqual([1]);
  });

  it('idempotência: não sobrepõe o que o tenant já reconfigurou, nem cria versão por si (o seed não é uma escrita do mapeamento)', async () => {
    await semear(tx, T1);
    const rubricas = doTenant(tx.rubricaFluxoCaixa, T1);
    expect(rubricas.length).toBeGreaterThan(1);

    // O tenant moveu uma conta para outra rubrica (escrita do futuro nó `config`)
    // e essa escrita criou a versão 2 (V2). Simulado directamente no duplo.
    const movido = doTenant(tx.mapeamentoContaFluxo, T1)[0];
    const outraRubrica = rubricas.find((r) => r.id !== movido.rubricaId);
    if (!outraRubrica) throw new Error('precisa de duas rubricas');
    movido.rubricaId = outraRubrica.id;
    await tx.versaoMapeamentoFluxo.create({ data: { tenantId: T1, numero: 2, instantaneo: { rubricas: [], mapeamentos: [] } } });

    await semearRubricasFluxo(tx as never, T1);

    const depois = doTenant(tx.mapeamentoContaFluxo, T1).find((m) => m.contaId === movido.contaId);
    expect(depois?.rubricaId).toBe(outraRubrica.id);
    expect(doTenant(tx.mapeamentoContaFluxo, T1).filter((m) => m.contaId === movido.contaId)).toHaveLength(1);
    expect(doTenant(tx.versaoMapeamentoFluxo, T1).map((v) => v.numero).sort()).toEqual([1, 2]);
    expect(doTenant(tx.rubricaFluxoCaixa, T1)).toHaveLength(rubricas.length);
  });

  it('versão 1: exactamente uma, numero 1, PENDING, por validar — e o instantâneo é igual ao elemento (V1) ao mapeamento vivo', async () => {
    await semear(tx, T1);

    const versoes = doTenant(tx.versaoMapeamentoFluxo, T1);
    expect(versoes).toHaveLength(1);
    const [v1] = versoes;
    expect(v1).toMatchObject({ tenantId: T1, numero: 1, estado: 'PENDING', validadoPorId: null, validadoEm: null });

    const rubricas = doTenant(tx.rubricaFluxoCaixa, T1) as unknown as RubricaFluxoCaixa[];
    const mapeamentos = doTenant(tx.mapeamentoContaFluxo, T1) as unknown as MapeamentoContaFluxo[];
    // `instantaneoDe` LANÇA se o seed repetir uma conta ou apontar para rubrica não viva.
    const vivo = instantaneoDe(rubricas, mapeamentos);
    expect(vivo.rubricas.length).toBe(rubricas.length);
    expect(vivo.mapeamentos.length).toBe(mapeamentos.length);
    expect(mapeamentos.length).toBeGreaterThan(0);

    const gravado = v1.instantaneo as InstantaneoMapeamento;
    expect(gravado).toEqual(vivo);
    expect(mudou(gravado, vivo)).toBe(false);
    // É o campo `Json` do Prisma: tem de sobreviver a uma ida e volta sem perder nada.
    expect(JSON.parse(JSON.stringify(gravado))).toEqual(vivo);
  });

  it('coerência de caixa (E2): há pelo menos uma conta CAIXA e coerenciaContasCaixa não devolve impedimentos', async () => {
    await semear(tx, T1);
    const contasCaixa = contasCaixaDe(tx, T1);
    expect(contasCaixa.length).toBeGreaterThan(0);
    expect(coerenciaContasCaixa(contasCaixa).impedimentos).toEqual([]);
  });

  it('coerência de caixa (E2): a configuração por omissão não nasce com avisos (folhas activas da classe 1)', async () => {
    await semear(tx, T1);
    const { avisos } = coerenciaContasCaixa(contasCaixaDe(tx, T1));
    expect(avisos.map((a) => `${a.codigo} ${a.conta.codigo}`)).toEqual([]);
  });

  it('bootstrapContabilidade semeia as rubricas: um tenant novo nasce com o mapeamento e a versão 1', async () => {
    await bootstrapContabilidade(tx as never, T1);

    const folhas = doTenant(tx.contaPGC, T1).filter((c) => c.aceitaLancamento === true);
    expect(doTenant(tx.rubricaFluxoCaixa, T1).length).toBeGreaterThan(0);
    expect(doTenant(tx.mapeamentoContaFluxo, T1)).toHaveLength(folhas.length);
    expect(doTenant(tx.versaoMapeamentoFluxo, T1).map((v) => [v.numero, v.estado])).toEqual([[1, 'PENDING']]);
  });

  it('escritas: rubricas SISTEMA, activas, com tenantId explícito e id uuid atribuído pelo bootstrap; enums válidos; sem SQL cru', async () => {
    await semear(tx, T1);

    const rubricas = doTenant(tx.rubricaFluxoCaixa, T1);
    expect(rubricas.length).toBeGreaterThan(0);
    for (const r of rubricas) {
      expect(r.origem).toBe('SISTEMA');
      expect(r.tenantId).toBe(T1);
      expect(r.ativo).toBe(true);
      expect(r.deletedAt).toBeNull();
      // O duplo atribui `rub-n` a quem não traz id: um uuid aqui só pode vir do bootstrap.
      expect(r.id).toMatch(UUID);
      expect(AtividadeFluxoEnum.options).toContain(r.atividade);
      expect(SinalFluxoEnum.options).toContain(r.sinal);
      expect(Number.isInteger(r.ordem)).toBe(true);
      expect(typeof r.codigo === 'string' && r.codigo.length > 0).toBe(true);
      expect(typeof r.designacao === 'string' && r.designacao.length > 0).toBe(true);
    }
    // Todas as actividades do mapa têm rubrica onde cair — e a CAIXA, sem a qual não há Δcaixa.
    const atividades = new Set(rubricas.map((r) => r.atividade));
    expect([...AtividadeFluxoEnum.options].filter((a) => !atividades.has(a))).toEqual([]);

    for (const m of doTenant(tx.mapeamentoContaFluxo, T1)) expect(m.tenantId).toBe(T1);
    for (const v of doTenant(tx.versaoMapeamentoFluxo, T1)) expect(v.tenantId).toBe(T1);

    // Nenhum INSERT fora do cliente: o duplo rebenta se for chamado, e confirma-se que não foi.
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('isolamento (I10): dois tenants no mesmo cliente cru — cada mapeamento aponta para conta e rubrica do PRÓPRIO tenant', async () => {
    await semear(tx, T1);
    await semear(tx, T2);

    for (const t of [T1, T2]) {
      const contas = new Set(doTenant(tx.contaPGC, t).map((c) => c.id as string));
      const rubricas = new Set(doTenant(tx.rubricaFluxoCaixa, t).map((r) => r.id as string));
      const mapeamentos = doTenant(tx.mapeamentoContaFluxo, t);
      expect(mapeamentos.length).toBe(folhasDoPlano().length);
      expect(mapeamentos.filter((m) => !contas.has(m.contaId as string))).toEqual([]);
      expect(mapeamentos.filter((m) => !rubricas.has(m.rubricaId as string))).toEqual([]);
      expect(doTenant(tx.versaoMapeamentoFluxo, t).map((v) => v.numero)).toEqual([1]);
    }
    // As FKs da 22b não são tenant-scoped: os ids das rubricas têm de ser distintos por tenant.
    const ids1 = new Set(doTenant(tx.rubricaFluxoCaixa, T1).map((r) => r.id));
    expect(doTenant(tx.rubricaFluxoCaixa, T2).filter((r) => ids1.has(r.id))).toEqual([]);
  });

  it('TEM de lançar: sem plano de contas no tenant, o seed recusa e não deixa a versão 1 para trás', async () => {
    // Fora de ordem (antes do `bootstrapPlanoContas`) o seed não tem folhas para
    // mapear. Gravar a versão 1 com zero mapeamentos seria a armadilha: a
    // idempotência por «a versão 1 já existe» deixava o tenant sem mapeamento
    // para sempre, e a DFC só o diria como impedimento em todas as contas.
    await expect(semearRubricasFluxo(tx as never, T1)).rejects.toThrow(/plano/i);
    expect(doTenant(tx.versaoMapeamentoFluxo, T1)).toEqual([]);
  });
});
