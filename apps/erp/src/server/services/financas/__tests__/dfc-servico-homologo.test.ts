import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// ---------------------------------------------------------------------------
// Teste ACESSÓRIO do nó `servico` (grafo dfc) — escrito pelo autor, fora dos
// ficheiros protegidos. Cobre o que o seed não permite à golden: a coluna N-1
// com valores (E3) e uma conta não mapeada que só se move no comparativo.
// Sem base de dados: um duplo em memória de `@/server/db/client`, e
// `gerarBalancete`/`gerarDRE` refeitas sobre um razão em memória com as
// funções PURAS reais (`montarLinhasBalancete`, `calcularLinhasDRE`).
// ---------------------------------------------------------------------------

type Tipo = 'DEBITO' | 'CREDITO';
interface Partida {
  data: Date;
  contaId: string;
  tipo: Tipo;
  valor: string;
}

const estado = vi.hoisted(() => ({
  razao: [] as Array<{ data: Date; contaId: string; tipo: 'DEBITO' | 'CREDITO'; valor: string }>,
  anteriorId: 'ex-2025' as string | null,
  mapeamentos: [] as Array<{ contaId: string; rubricaId: string }>,
  estadoPeriodos: 'ABERTO' as 'ABERTO' | 'FECHADO',
}));

const T = 't1';
const D = (v: string | number) => new Prisma.Decimal(v);
const inicioMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes - 1, 1) - 2 * 3_600_000);
const fimMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 1) - 2 * 3_600_000 - 1);

const CONTAS = [
  { id: 'c121', codigo: '121', nome: 'Depósitos à ordem', tipo: 'ATIVO', natureza: 'DEVEDORA', classe: 'CLASSE_1', aceitaLancamento: true, ativo: true },
  { id: 'c411', codigo: '411', nome: 'Clientes c/c', tipo: 'ATIVO', natureza: 'DEVEDORA', classe: 'CLASSE_4', aceitaLancamento: true, ativo: true },
  { id: 'c711', codigo: '711', nome: 'Vendas', tipo: 'RENDIMENTO', natureza: 'CREDORA', classe: 'CLASSE_7', aceitaLancamento: true, ativo: true },
  { id: 'c999', codigo: '2999', nome: 'Conta por mapear', tipo: 'ATIVO', natureza: 'DEVEDORA', classe: 'CLASSE_2', aceitaLancamento: true, ativo: true },
] as const;

const RUBRICAS = [
  { id: 'r-cx', codigo: 'CX-01', designacao: 'Caixa', atividade: 'CAIXA', sinal: 'VARIACAO', ordem: 1 },
  { id: 'r-op00', codigo: 'OP-00', designacao: 'Resultado', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 0 },
  { id: 'r-op04', codigo: 'OP-04', designacao: 'Clientes', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 4 },
];

function periodo(ex: string, ano: number, mes: number) {
  return {
    id: `p-${ano}-${mes}`,
    tenantId: T,
    exercicioId: ex,
    ordem: mes,
    codigo: `${ano}-${String(mes).padStart(2, '0')}`,
    dataInicio: inicioMes(ano, mes),
    dataFim: fimMes(ano, mes),
    estado: estado.estadoPeriodos,
    fechadoEm: null,
    fechadoPorId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
const periodos = () => [1, 2, 3].flatMap((m) => [periodo('ex-2025', 2025, m), periodo('ex-2026', 2026, m)]);

type Where = Record<string, unknown>;
const doTenant = (w: Where) => w.tenantId === T;

vi.mock('@/server/db/client', () => {
  const fake = {
    periodoContabil: {
      findFirst: async ({ where }: { where: Where }) =>
        doTenant(where) ? (periodos().find((p) => p.id === where.id) ?? null) : null,
      findMany: async ({ where }: { where: Where }) =>
        doTenant(where) ? periodos().filter((p) => p.exercicioId === where.exercicioId) : [],
      count: async ({ where }: { where: { exercicioId: string; ordem: { gte: number; lte: number } } & Where }) =>
        periodos().filter(
          (p) =>
            p.exercicioId === where.exercicioId &&
            p.ordem >= where.ordem.gte &&
            p.ordem <= where.ordem.lte &&
            p.estado !== 'FECHADO',
        ).length,
    },
    exercicioContabil: {
      findFirst: async ({ where }: { where: Where }) => {
        if (!doTenant(where)) return null;
        if (where.id === 'ex-2026') return { id: 'ex-2026', codigo: '2026', anteriorId: estado.anteriorId };
        if (where.id === 'ex-2025') return { id: 'ex-2025', codigo: '2025', anteriorId: null };
        return null;
      },
    },
    versaoMapeamentoFluxo: {
      findFirst: async () => ({ id: 'v3', numero: 3, estado: 'VALIDATED' }),
    },
    rubricaFluxoCaixa: { findMany: async () => RUBRICAS },
    mapeamentoContaFluxo: { findMany: async () => estado.mapeamentos },
    contaPGC: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        CONTAS.filter((c) => where.id.in.includes(c.id)),
    },
  };
  return { prisma: fake, prismaBase: fake };
});

vi.mock('../contabilidade.service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../contabilidade.service')>();
  const agregar = (ini: Date, fim: Date) => {
    const soma = new Map<string, { contaId: string; tipo: Tipo; _sum: { valor: Prisma.Decimal } }>();
    for (const p of estado.razao) {
      if (p.data < ini || p.data > fim) continue;
      const k = `${p.contaId}|${p.tipo}`;
      const e = soma.get(k) ?? { contaId: p.contaId, tipo: p.tipo, _sum: { valor: new Prisma.Decimal(0) } };
      e._sum.valor = e._sum.valor.plus(p.valor);
      soma.set(k, e);
    }
    return [...soma.values()];
  };
  // Preguiçoso: a factory é içada acima das constantes do ficheiro.
  const contas = () => new Map(CONTAS.map((c) => [c.id, c]));
  return {
    ...orig,
    gerarBalancete: async (f: { dataInicio: Date; dataFim: Date; incluirZeradas: boolean }) => {
      const r = orig.montarLinhasBalancete(agregar(f.dataInicio, f.dataFim), contas() as never, f.incluirZeradas);
      return { dataInicio: f.dataInicio, dataFim: f.dataFim, ...r };
    },
    gerarDRE: async (f: { dataInicio: Date; dataFim: Date }) => ({
      dataInicio: f.dataInicio,
      dataFim: f.dataFim,
      ...orig.calcularLinhasDRE(agregar(f.dataInicio, f.dataFim), contas() as never),
    }),
  };
});

import { temImpedimentos, type DFC } from '../dfc.interface';
import { contasNaoMapeadas, gerarDFC } from '../dfc.service';

const ctx = { tenantId: T, userId: 'u1' };
const filtroJan26 = { periodoInicioId: 'p-2026-1', periodoFimId: 'p-2026-1' };

function lanc(ano: number, mes: number, debito: string, credito: string, valor: string): Partida[] {
  const data = new Date(inicioMes(ano, mes).getTime() + 10 * 86_400_000);
  return [
    { data, contaId: debito, tipo: 'DEBITO', valor },
    { data, contaId: credito, tipo: 'CREDITO', valor },
  ];
}

beforeEach(() => {
  estado.anteriorId = 'ex-2025';
  estado.estadoPeriodos = 'ABERTO';
  estado.mapeamentos = [
    { contaId: 'c121', rubricaId: 'r-cx' },
    { contaId: 'c411', rubricaId: 'r-op04' },
    { contaId: 'c711', rubricaId: 'r-op00' },
  ];
  estado.razao = [
    ...lanc(2025, 1, 'c411', 'c711', '100'),
    ...lanc(2025, 1, 'c121', 'c411', '60'),
    ...lanc(2026, 1, 'c411', 'c711', '200'),
    ...lanc(2026, 1, 'c121', 'c411', '150'),
  ];
});

function mapa(r: Awaited<ReturnType<typeof gerarDFC>>): DFC {
  if (temImpedimentos(r)) throw new Error(`impedimentos: ${JSON.stringify(r.impedimentos)}`);
  return r;
}

describe('gerarDFC — comparativo N-1 homólogo (E3)', () => {
  it('com exercício anterior, a coluna N-1 é o mesmo período do ano anterior, com os saldos de lá, e articula', async () => {
    const dfc = mapa(await gerarDFC(filtroJan26, ctx));

    expect(dfc.atual.periodoInicio.codigo).toBe('2026-01');
    expect(dfc.atual.seccoes.resultadoLiquido.equals(D(200))).toBe(true);
    expect(dfc.atual.caixaInicial.equals(D(60))).toBe(true);
    expect(dfc.atual.caixaFinal.equals(D(210))).toBe(true);
    expect(dfc.atual.seccoes.operacional.total.equals(D(150))).toBe(true);
    const c411 = dfc.atual.seccoes.operacional.rubricas[0]!.contas[0]!;
    expect([c411.saldoInicial, c411.saldoFinal, c411.efeitoCaixa].map((d) => d.toFixed())).toEqual(['40', '90', '-50']);

    const h = dfc.homologo!;
    expect(h).not.toBeNull();
    expect(h.exercicio.codigo).toBe('2025');
    expect([h.periodoInicio.codigo, h.periodoFim.codigo]).toEqual(['2025-01', '2025-01']);
    expect(h.seccoes.resultadoLiquido.equals(D(100))).toBe(true);
    expect(h.caixaInicial.equals(D(0))).toBe(true);
    expect(h.variacaoCaixa.equals(D(60))).toBe(true);
    expect(h.seccoes.somaAtividades.equals(h.variacaoCaixa)).toBe(true);

    expect(dfc.versao).toEqual({ id: 'v3', numero: 3, estado: 'VALIDATED' });
    expect(dfc.provisorio).toBe(true);
  });

  it('sem exercício anterior, N-1 é null («—»), nunca um parcial', async () => {
    estado.anteriorId = null;
    const dfc = mapa(await gerarDFC(filtroJan26, ctx));
    expect(dfc.homologo).toBeNull();
  });

  it('todos os períodos FECHADOS ⇒ não é provisório', async () => {
    estado.estadoPeriodos = 'FECHADO';
    expect(mapa(await gerarDFC(filtroJan26, ctx)).provisorio).toBe(false);
  });

  it('conta sem mapeamento que só se move no N-1 ⇒ impedimento (o comparativo não articularia), com os valores do N-1', async () => {
    estado.razao.push(...lanc(2025, 1, 'c999', 'c121', '10'));
    const r = await gerarDFC(filtroJan26, ctx);
    expect(temImpedimentos(r)).toBe(true);
    if (!temImpedimentos(r)) return;
    expect(r.contasNaoMapeadas.map((c) => [c.conta.codigo, c.movimento.toFixed(), c.saldoFinal.toFixed()])).toEqual([
      ['2999', '10', '10'],
    ]);
    expect(r.impedimentos).toHaveLength(1);
    expect(r.impedimentos[0]).toContain('2999');
    expect(r.impedimentos[0]).toContain('comparativo N-1');
    expect('atual' in r).toBe(false);

    // MINOR-1: os valores são do N-1, e o contrato di-lo.
    expect(r.contasNaoMapeadas.map((c) => c.comparativo)).toEqual([true]);

    const lista = await contasNaoMapeadas(filtroJan26, ctx);
    expect(lista.map((c) => c.conta.codigo)).toEqual(['2999']);
    expect(lista.map((c) => c.comparativo)).toEqual([true]);
  });

  it('conta sem mapeamento que se move no N e no N-1 aparece uma vez, com os valores do N e comparativo false', async () => {
    estado.razao.push(...lanc(2025, 1, 'c999', 'c121', '10'));
    estado.razao.push(...lanc(2026, 1, 'c999', 'c121', '7'));
    const r = await gerarDFC(filtroJan26, ctx);
    expect(temImpedimentos(r)).toBe(true);
    if (!temImpedimentos(r)) return;
    expect(r.contasNaoMapeadas.map((c) => [c.conta.codigo, c.movimento.toFixed(), c.comparativo])).toEqual([
      ['2999', '7', false],
    ]);
    expect(r.impedimentos[0]).not.toContain('comparativo N-1');
  });

  it('conta sem mapeamento com saldo mas SEM movimento no intervalo não impede (variação zero)', async () => {
    estado.razao.push(...lanc(2025, 6, 'c999', 'c121', '10')); // fora de 2025-01 e antes de 2026-01
    estado.anteriorId = null;
    const dfc = mapa(await gerarDFC(filtroJan26, ctx));
    expect(dfc.atual.seccoes.somaAtividades.equals(dfc.atual.variacaoCaixa)).toBe(true);
  });
});
