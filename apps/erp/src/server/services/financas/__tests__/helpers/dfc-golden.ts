// ---------------------------------------------------------------------------
// Apoio da golden da DFC (nó `servico-v` do grafo dfc, ticket 5.3) — escrito
// pelo verificador-fluxo-caixa. FICHEIRO PROTEGIDO: um agente feat-* que o
// altere é BLOCKER (doutrina 00 §2; grafo dfc, «Ficheiros protegidos»).
//
// Três coisas, e só estas:
//  1. `verificarSentinelas` — o tenant demo está no estado que a fixture
//     assume? Se não, falha com «a base tem resíduos» ANTES de qualquer número.
//  2. `compararColuna` — compara uma `ColunaDFC` com a fixture, dinheiro só por
//     `Decimal.equals`, sem tolerância.
//  3. `periodosPorCodigo` / `contaPorCodigo` — traduzem os códigos legíveis da
//     fixture para os ids do seed.
// Não importa `dfc.service` (só tipos): quem falha por falta dele são os testes.
// ---------------------------------------------------------------------------
import { expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { FILTRO_LANCAMENTO_MAPA } from '../../contabilidade.service';
import type { ColunaDFC, ContaNaoMapeada, DFC, SeccaoDFC } from '../../dfc.interface';
import fixture from '../fixtures/dfc-seed-demo.json';

export { fixture };

export const D = (v: string | number) => new Prisma.Decimal(v);

export type CasoGolden = (typeof fixture.casos)[number];
type EsperadoCaso = CasoGolden['esperado'];
type SeccaoEsperada = EsperadoCaso['operacional'];

export interface PeriodoSeed {
  id: string;
  codigo: string;
  ordem: number;
  exercicioId: string;
  dataInicio: Date;
  dataFim: Date;
  estado: string;
}

/** Igualdade monetária com mensagem legível — `Decimal.equals`, nunca `number`, nunca tolerância. */
export function igual(actual: Prisma.Decimal, esperado: string, onde: string): void {
  expect(
    actual instanceof Prisma.Decimal,
    `${onde}: esperava Prisma.Decimal, veio ${typeof actual}`,
  ).toBe(true);
  expect(
    actual.equals(D(esperado)),
    `${onde}: devolveu ${actual.toFixed()}, a fixture manda ${esperado}`,
  ).toBe(true);
}

export async function resolverTenantDemo(): Promise<{ tenantId: string; userId: string }> {
  const tenant = await prismaBase.tenant.findFirst({ where: { slug: fixture.tenant } });
  if (!tenant) throw new Error('Tenant demo não encontrado. Executa pnpm db:seed primeiro.');
  const admin = await prismaBase.user.findFirst({
    where: { tenantId: tenant.id, email: 'admin@demo.mz' },
  });
  if (!admin) throw new Error('Utilizador admin@demo.mz não encontrado no tenant demo.');
  return { tenantId: tenant.id, userId: admin.id };
}

export async function periodosPorCodigo(tenantId: string): Promise<Map<string, PeriodoSeed>> {
  const periodos = await prismaBase.periodoContabil.findMany({
    where: { tenantId },
    select: {
      id: true,
      codigo: true,
      ordem: true,
      exercicioId: true,
      dataInicio: true,
      dataFim: true,
      estado: true,
    },
  });
  return new Map(periodos.map((p) => [p.codigo, p]));
}

export async function contaPorCodigo(
  tenantId: string,
  codigos: readonly string[],
): Promise<Map<string, string>> {
  const contas = await prismaBase.contaPGC.findMany({
    where: { tenantId, codigo: { in: [...codigos] } },
    select: { id: true, codigo: true },
  });
  const m = new Map(contas.map((c) => [c.codigo, c.id]));
  for (const c of codigos) {
    if (!m.has(c)) throw new Error(`A base tem resíduos: a conta ${c} não existe no tenant demo.`);
  }
  return m;
}

/**
 * O estado do tenant demo é o que a fixture assume? Falha AQUI, com mensagem
 * clara, em vez de deixar os números divergir asserções abaixo.
 */
export async function verificarSentinelas(tenantId: string): Promise<void> {
  const s = fixture.sentinelasDoSeed;

  const exercicios = await prismaBase.exercicioContabil.findMany({
    where: { tenantId },
    select: { codigo: true, anteriorId: true },
    orderBy: { codigo: 'asc' },
  });
  const periodos = await periodosPorCodigo(tenantId);
  const inicioExercicio = periodos.get('2026-01')?.dataInicio;

  const movimentoPorPeriodo: Record<string, unknown> = {};
  const contasComMovimentoPorPeriodo: Record<string, string[]> = {};
  for (const codigo of Object.keys(s.movimentoPorPeriodo)) {
    const p = periodos.get(codigo);
    if (!p) {
      movimentoPorPeriodo[codigo] = '(período em falta)';
      continue;
    }
    const filtroLanc = {
      tenantId,
      status: FILTRO_LANCAMENTO_MAPA,
      data: { gte: p.dataInicio, lte: p.dataFim },
    };
    const [lancamentos, porTipo, porConta] = await Promise.all([
      prismaBase.lancamento.count({ where: filtroLanc }),
      prismaBase.partidaLancamento.groupBy({
        by: ['tipo'],
        where: { tenantId, lancamento: filtroLanc },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      prismaBase.partidaLancamento.groupBy({
        by: ['contaId'],
        where: { tenantId, lancamento: filtroLanc },
      }),
    ]);
    const deb = porTipo.find((x) => x.tipo === 'DEBITO');
    const cred = porTipo.find((x) => x.tipo === 'CREDITO');
    movimentoPorPeriodo[codigo] = {
      lancamentos,
      partidas: porTipo.reduce((n, x) => n + x._count._all, 0),
      debitos: (deb?._sum.valor ?? D(0)).toFixed(2),
      creditos: (cred?._sum.valor ?? D(0)).toFixed(2),
    };
    const contas = await prismaBase.contaPGC.findMany({
      where: { tenantId, id: { in: porConta.map((x) => x.contaId) } },
      select: { codigo: true },
    });
    contasComMovimentoPorPeriodo[codigo] = contas.map((c) => c.codigo).sort();
  }

  const lancamentosAntesDoExercicio = inicioExercicio
    ? await prismaBase.lancamento.count({
        where: { tenantId, status: FILTRO_LANCAMENTO_MAPA, data: { lt: inicioExercicio } },
      })
    : -1;

  const [versoes, rubricasVivas, mapeamentos, mapeamentosCaixa, mapeamentosMovimento] =
    await Promise.all([
      prismaBase.versaoMapeamentoFluxo.findMany({
        where: { tenantId },
        select: { numero: true, estado: true },
        orderBy: { numero: 'asc' },
      }),
      prismaBase.rubricaFluxoCaixa.count({ where: { tenantId, deletedAt: null } }),
      prismaBase.mapeamentoContaFluxo.count({ where: { tenantId } }),
      prismaBase.mapeamentoContaFluxo.findMany({
        where: { tenantId, rubrica: { atividade: 'CAIXA', deletedAt: null } },
        select: { conta: { select: { codigo: true } } },
      }),
      prismaBase.mapeamentoContaFluxo.findMany({
        where: {
          tenantId,
          conta: { codigo: { in: Object.keys(s.mapeamento.rubricaDasContasComMovimento) } },
        },
        select: { conta: { select: { codigo: true } }, rubrica: { select: { codigo: true } } },
      }),
    ]);

  const observado = {
    exercicios: exercicios.map((e) => ({ codigo: e.codigo, temAnterior: e.anteriorId !== null })),
    periodos: periodos.size,
    periodosAbertos: [...periodos.values()].filter((p) => p.estado === 'ABERTO').length,
    lancamentosAntesDoExercicio,
    movimentoPorPeriodo,
    contasComMovimentoPorPeriodo,
    mapeamento: {
      versoes,
      rubricasVivas,
      mapeamentos,
      contasCaixa: mapeamentosCaixa.map((m) => m.conta.codigo).sort(),
      rubricaDasContasComMovimento: Object.fromEntries(
        mapeamentosMovimento
          .map((m) => [m.conta.codigo, m.rubrica.codigo] as const)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    },
  };
  const { $nota: _n1, ...contasEsperadas } = s.contasComMovimentoPorPeriodo;
  const esperado = {
    exercicios: s.exercicios,
    periodos: s.periodos,
    periodosAbertos: s.periodosAbertos,
    lancamentosAntesDoExercicio: s.lancamentosAntesDoExercicio,
    movimentoPorPeriodo: s.movimentoPorPeriodo,
    contasComMovimentoPorPeriodo: contasEsperadas,
    mapeamento: {
      ...s.mapeamento,
      rubricaDasContasComMovimento: Object.fromEntries(
        Object.entries(s.mapeamento.rubricaDasContasComMovimento).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      ),
    },
  };
  if (JSON.stringify(observado) !== JSON.stringify(esperado)) {
    throw new Error(
      'O estado do tenant demo diverge do que a golden da DFC assume — o seed foi ' +
        're-corrido noutro dia civil ou a base tem resíduos (um lançamento a mais, ' +
        'um período fechado, um mapeamento alterado). Limpa o resíduo ou RE-DERIVA ' +
        'a fixture À MÃO (docs/handoff/dfc-servico-v.md); NUNCA vitest -u.\n' +
        `observado: ${JSON.stringify(observado)}\nfixture:   ${JSON.stringify(esperado)}`,
    );
  }
}

function compararSeccao(actual: SeccaoDFC, esperada: SeccaoEsperada, onde: string): void {
  igual(actual.total, esperada.total, `${onde}.total`);
  const linhas = [...actual.rubricas].sort((a, b) =>
    a.rubrica.codigo < b.rubrica.codigo ? -1 : a.rubrica.codigo > b.rubrica.codigo ? 1 : 0,
  );
  expect(
    linhas.map((l) => l.rubrica.codigo),
    `${onde}: rubricas com movimento (as contas CAIXA e as de resultado não entram em linha nenhuma)`,
  ).toEqual(esperada.rubricas.map((r) => r.codigo));
  for (const [i, esp] of esperada.rubricas.entries()) {
    const linha = linhas[i]!;
    igual(linha.valor, esp.valor, `${onde}.${esp.codigo}.valor`);
    const contas = [...linha.contas].sort((a, b) =>
      a.conta.codigo < b.conta.codigo ? -1 : a.conta.codigo > b.conta.codigo ? 1 : 0,
    );
    expect(contas.map((c) => c.conta.codigo), `${onde}.${esp.codigo}: contas`).toEqual(
      esp.contas.map((c) => c.codigo),
    );
    for (const [j, ec] of esp.contas.entries()) {
      const c = contas[j]!;
      const aqui = `${onde}.${esp.codigo}.${ec.codigo}`;
      igual(c.saldoInicial, ec.saldoInicial, `${aqui}.saldoInicial`);
      igual(c.saldoFinal, ec.saldoFinal, `${aqui}.saldoFinal`);
      igual(c.variacao, ec.variacao, `${aqui}.variacao`);
      igual(c.efeitoCaixa, ec.efeitoCaixa, `${aqui}.efeitoCaixa`);
    }
  }
}

/** Uma coluna da DFC contra a fixture, ao cêntimo. */
export function compararColuna(
  col: ColunaDFC,
  esperado: EsperadoCaso,
  periodos: { inicio: PeriodoSeed; fim: PeriodoSeed },
  onde: string,
): void {
  expect(col.exercicio.codigo, `${onde}: exercício`).toBe(esperado.exercicio);
  expect(col.periodoInicio.id, `${onde}: periodoInicio`).toBe(periodos.inicio.id);
  expect(col.periodoFim.id, `${onde}: periodoFim`).toBe(periodos.fim.id);
  igual(col.seccoes.resultadoLiquido, esperado.resultadoLiquido, `${onde}.resultadoLiquido`);
  compararSeccao(col.seccoes.operacional, esperado.operacional, `${onde}.operacional`);
  compararSeccao(col.seccoes.investimento, esperado.investimento, `${onde}.investimento`);
  compararSeccao(col.seccoes.financiamento, esperado.financiamento, `${onde}.financiamento`);
  igual(col.seccoes.somaAtividades, esperado.somaAtividades, `${onde}.somaAtividades`);
  igual(col.caixaInicial, esperado.caixaInicial, `${onde}.caixaInicial`);
  igual(col.caixaFinal, esperado.caixaFinal, `${onde}.caixaFinal`);
  igual(col.variacaoCaixa, esperado.variacaoCaixa, `${onde}.variacaoCaixa`);
  // I6 sobre o seed: a DFC articula, ao cêntimo.
  expect(
    col.seccoes.somaAtividades.equals(col.variacaoCaixa),
    `${onde}: OP+INV+FIN (${col.seccoes.somaAtividades.toFixed()}) ≠ Δcaixa (${col.variacaoCaixa.toFixed()})`,
  ).toBe(true);
}

/** A DFC inteira (coluna N + o resto) contra um caso da fixture. */
export function compararDFC(
  dfc: DFC,
  caso: CasoGolden,
  periodos: { inicio: PeriodoSeed; fim: PeriodoSeed },
  versaoIdDoSeed: string,
): void {
  const e = caso.esperado;
  compararColuna(dfc.atual, e, periodos, caso.nome);
  // E3: sem exercício anterior, N-1 é null («—» na UI) — nunca um parcial.
  expect(dfc.homologo, `${caso.nome}: homologo`).toBe(e.homologo);
  expect(dfc.provisorio, `${caso.nome}: provisorio (todos os períodos ABERTO)`).toBe(e.provisorio);
  expect(dfc.versao.id, `${caso.nome}: versão do mapeamento é a do tenant demo`).toBe(versaoIdDoSeed);
  expect(dfc.versao.numero).toBe(e.versao.numero);
  expect(dfc.versao.estado).toBe(e.versao.estado);
  expect(dfc.avisos, `${caso.nome}: avisos (contas CAIXA 111/121/122/123 — classe 1, folhas, activas)`).toEqual(
    e.avisos,
  );
}

/** Contas não mapeadas contra a fixture: a lista COMPLETA, nem uma a mais nem uma a menos. */
export function compararNaoMapeadas(
  actual: ContaNaoMapeada[],
  esperadas: ReadonlyArray<{ codigo: string; movimento: string; saldoFinal: string }>,
  onde: string,
): void {
  const ordenadas = [...actual].sort((a, b) =>
    a.conta.codigo < b.conta.codigo ? -1 : a.conta.codigo > b.conta.codigo ? 1 : 0,
  );
  expect(ordenadas.map((c) => c.conta.codigo), `${onde}: contasNaoMapeadas`).toEqual(
    esperadas.map((c) => c.codigo),
  );
  for (const [i, e] of esperadas.entries()) {
    igual(ordenadas[i]!.movimento, e.movimento, `${onde}.${e.codigo}.movimento`);
    igual(ordenadas[i]!.saldoFinal, e.saldoFinal, `${onde}.${e.codigo}.saldoFinal`);
  }
}
