// ---------------------------------------------------------------------------
// GOLDEN do balancete de verificação PHC — SERVIÇO (`gerarBalanceteVerificacao`)
// contra a BASE LOCAL, tenant demo. Run balancete-phc, nó F6.S1a, issue #280,
// ADR-0040, contrato .scratch/sdlc/balancete-phc/S1-contrato.md.
//
// Escrito pelo AUTOR DO ORÁCULO antes de existir `gerarBalanceteVerificacao`:
// enquanto o serviço não o exportar, a chamada rebenta — é a prova vermelha.
//
// Os números NÃO estão escritos aqui: vêm da fixture da DFC
// (`fixtures/dfc-seed-demo.json`, apurada à mão do seed de 2026-09-23 — só se LÊ,
// nunca se altera): `sentinelasDoSeed.movimentoPorPeriodo` (Σ D/C por período),
// `contasComMovimentoPorPeriodo` (folhas com partidas) e o `caixaInicial`/
// `caixaFinal` dos casos (saldo da 121, a única conta de caixa com movimento).
//
// Períodos usados: 2026-01..2026-08. A fixture também lista 2026-09, mas a base
// local tem lá um resíduo conhecido (um lançamento a mais, fora do seed) que faz
// falhar as goldens da DFC; o balancete não depende desse mês para provar nada.
// A sentinela própria abaixo confere SÓ os meses usados (por data, consulta
// independente do serviço, que selecciona por período) e falha com «a base tem
// resíduos» antes de qualquer número. `verificarSentinelas` da DFC não é usada:
// exige o mês 9 limpo.
//
// Só leituras. Sem DATABASE_URL, ou no CI (base semeada noutro dia), salta.
// NUNCA `vitest -u`. Um agente de implementação que altere este ficheiro é BLOCKER.
// ---------------------------------------------------------------------------
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { FILTRO_LANCAMENTO_MAPA, gerarBalanceteVerificacao } from '../contabilidade.service';
import { D, fixture, resolverTenantDemo } from './helpers/dfc-golden';

const hasDB = Boolean(process.env.DATABASE_URL);
const noCI = Boolean(process.env.CI);

const EXERCICIO = '2026';
const ORDENS_LIMPAS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const codigoDoPeriodo = (ordem: number) => `${EXERCICIO}-${String(ordem).padStart(2, '0')}`;

type MovSeed = { lancamentos: number; partidas: number; debitos: string; creditos: string };
const movimentoSeed = fixture.sentinelasDoSeed.movimentoPorPeriodo as Record<string, MovSeed>;
const contasSeed = fixture.sentinelasDoSeed.contasComMovimentoPorPeriodo as unknown as Record<string, string[]>;

/** Σ débitos e Σ créditos da fixture para as ordens [de..ate]. */
function somaFixture(de: number, ate: number): { d: Prisma.Decimal; c: Prisma.Decimal } {
  let d = D(0);
  let c = D(0);
  for (let o = de; o <= ate; o++) {
    const m = movimentoSeed[codigoDoPeriodo(o)];
    if (!m) throw new Error(`A fixture não tem o período ${codigoDoPeriodo(o)}`);
    d = d.plus(D(m.debitos));
    c = c.plus(D(m.creditos));
  }
  return { d, c };
}

/** Folhas com partidas em [1..ate], segundo a fixture. */
function contasFixture(ate: number): string[] {
  const s = new Set<string>();
  for (let o = 1; o <= ate; o++) for (const c of contasSeed[codigoDoPeriodo(o)] ?? []) s.add(c);
  return [...s].sort();
}

function igual(actual: unknown, esperado: Prisma.Decimal | string, onde: string): void {
  expect(actual instanceof Prisma.Decimal, `${onde}: esperava Prisma.Decimal, veio ${typeof actual}`).toBe(true);
  const e = typeof esperado === 'string' ? D(esperado) : esperado;
  expect((actual as Prisma.Decimal).equals(e), `${onde}: devolveu ${(actual as Prisma.Decimal).toFixed()}, a fixture manda ${e.toFixed()}`).toBe(true);
}

function falharResiduos(detalhe: string): never {
  throw new Error(
    'A base tem resíduos: o tenant demo diverge da fixture dfc-seed-demo.json nos meses que a golden do ' +
      'balancete usa (2026-01..2026-08). Limpa o resíduo ou re-semeia; NUNCA vitest -u.\n' + detalhe,
  );
}

/** Sentinela própria — só os meses usados, por DATA (independente do serviço). */
async function verificarMesesLimpos(tenantId: string, exercicioId: string): Promise<void> {
  const exercicios = await prismaBase.exercicioContabil.findMany({ where: { tenantId }, select: { codigo: true, anteriorId: true } });
  const esperadoEx = fixture.sentinelasDoSeed.exercicios;
  const observadoEx = exercicios.map((e) => ({ codigo: e.codigo, temAnterior: e.anteriorId !== null }));
  if (JSON.stringify(observadoEx) !== JSON.stringify(esperadoEx)) {
    falharResiduos(`exercícios: observado ${JSON.stringify(observadoEx)}, fixture ${JSON.stringify(esperadoEx)}`);
  }
  const periodos = await prismaBase.periodoContabil.findMany({
    where: { tenantId, exercicioId },
    select: { codigo: true, ordem: true, dataInicio: true, dataFim: true },
  });
  const inicio = periodos.find((p) => p.ordem === 1);
  if (!inicio) falharResiduos('o exercício 2026 não tem período 1');
  const antes = await prismaBase.lancamento.count({
    where: { tenantId, status: FILTRO_LANCAMENTO_MAPA, data: { lt: inicio.dataInicio } },
  });
  if (antes !== fixture.sentinelasDoSeed.lancamentosAntesDoExercicio) {
    falharResiduos(`lançamentos antes do exercício: ${antes}, fixture ${fixture.sentinelasDoSeed.lancamentosAntesDoExercicio}`);
  }
  const divergencias: string[] = [];
  for (const ordem of ORDENS_LIMPAS) {
    const codigo = codigoDoPeriodo(ordem);
    const p = periodos.find((x) => x.ordem === ordem);
    if (!p) {
      divergencias.push(`${codigo}: período em falta`);
      continue;
    }
    const filtroLanc = { tenantId, status: FILTRO_LANCAMENTO_MAPA, data: { gte: p.dataInicio, lte: p.dataFim } };
    const [lancamentos, porTipo, porConta] = await Promise.all([
      prismaBase.lancamento.count({ where: filtroLanc }),
      prismaBase.partidaLancamento.groupBy({ by: ['tipo'], where: { tenantId, lancamento: filtroLanc }, _sum: { valor: true } }),
      prismaBase.partidaLancamento.groupBy({ by: ['contaId'], where: { tenantId, lancamento: filtroLanc } }),
    ]);
    const deb = porTipo.find((x) => x.tipo === 'DEBITO')?._sum.valor ?? D(0);
    const cre = porTipo.find((x) => x.tipo === 'CREDITO')?._sum.valor ?? D(0);
    const contas = await prismaBase.contaPGC.findMany({
      where: { tenantId, id: { in: porConta.map((x) => x.contaId) } },
      select: { codigo: true },
    });
    const m = movimentoSeed[codigo]!;
    const obsContas = contas.map((c) => c.codigo).sort();
    if (lancamentos !== m.lancamentos || !deb.equals(D(m.debitos)) || !cre.equals(D(m.creditos))) {
      divergencias.push(`${codigo}: observado ${lancamentos} lanç. D ${deb.toFixed(2)} C ${cre.toFixed(2)}; fixture ${JSON.stringify(m)}`);
    }
    if (JSON.stringify(obsContas) !== JSON.stringify(contasSeed[codigo])) {
      divergencias.push(`${codigo}: contas ${JSON.stringify(obsContas)}; fixture ${JSON.stringify(contasSeed[codigo])}`);
    }
  }
  if (divergencias.length > 0) falharResiduos(divergencias.join('\n'));
}

describe.skipIf(!hasDB || noCI)('balancete de verificação PHC — golden do serviço (tenant demo, base local)', () => {
  let ctx: { tenantId: string; userId: string };
  let exercicioId: string;

  const gerar = (periodoInicial: number, periodoFinal: number, incluir13 = false) =>
    runWithTenantContext(ctx, () =>
      gerarBalanceteVerificacao({ exercicioId, periodoInicial, periodoFinal, incluir13 }, ctx),
    );

  beforeAll(async () => {
    ctx = await resolverTenantDemo();
    const ex = await prismaBase.exercicioContabil.findFirst({
      where: { tenantId: ctx.tenantId, codigo: EXERCICIO },
      select: { id: true },
    });
    if (!ex) throw new Error(`O tenant demo não tem o exercício ${EXERCICIO}. Executa pnpm db:seed.`);
    exercicioId = ex.id;
    await verificarMesesLimpos(ctx.tenantId, exercicioId);
  });

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it('devolve o exercício e o intervalo pedidos', async () => {
    const r = await gerar(3, 6);
    expect(r.exercicio.id).toBe(exercicioId);
    expect(r.exercicio.codigo).toBe(EXERCICIO);
    expect(r.periodoInicial).toBe(3);
    expect(r.periodoFinal).toBe(6);
    expect(r.incluir13).toBe(false);
  });

  it('em TODOS os 36 intervalos [p..q] ⊆ 1..8: movimento = Σ fixture p..q, acumulado = Σ fixture 1..q, e as três igualdades fecham', async () => {
    for (const q of ORDENS_LIMPAS) {
      for (let p = 1; p <= q; p++) {
        const onde = `[${p}..${q}]`;
        const r = await gerar(p, q);
        const mov = somaFixture(p, q);
        const acum = somaFixture(1, q);
        igual(r.totais.movD, mov.d, `${onde} totais.movD`);
        igual(r.totais.movC, mov.c, `${onde} totais.movC`);
        igual(r.totais.acumD, acum.d, `${onde} totais.acumD`);
        igual(r.totais.acumC, acum.c, `${onde} totais.acumC`);
        expect(r.equilibrio, onde).toEqual({ movimento: true, acumulado: true, saldo: true });
        igual(r.totais.saldoDevedor, r.totais.saldoCredor, `${onde} Σ saldo devedor = Σ saldo credor`);
      }
    }
  });

  it('o demo não tem histórico anterior: sem abertura implícita e sem linha sintética', async () => {
    expect(fixture.sentinelasDoSeed.lancamentosAntesDoExercicio).toBe(0);
    for (const q of [1, 5, 8]) {
      const r = await gerar(1, q);
      expect(r.temAberturaImplicita, `[1..${q}]`).toBe(false);
      expect(r.temResultadosAnterioresPorEncerrar, `[1..${q}]`).toBe(false);
      expect(r.linhas.every((l) => l.conta !== null && l.implicita === false), `[1..${q}] sem sintética`).toBe(true);
    }
  });

  it('as linhas são exactamente as folhas com partidas em 1..q (fixture), por código, mesmo quando o intervalo é só o último mês', async () => {
    for (const q of [1, 5, 6, 8]) {
      for (const p of [1, q]) {
        const r = await gerar(p, q);
        expect(r.linhas.map((l) => l.conta?.codigo), `[${p}..${q}]`).toEqual(contasFixture(q));
        expect(r.linhas.every((l) => l.conta!.aceitaLancamento), `[${p}..${q}] só folhas`).toBe(true);
      }
    }
  });

  it('121 (depósitos à ordem) tem saldo DEVEDOR igual à caixa da fixture em 31/03, 30/06 e 31/08', async () => {
    const casoTrimestre = fixture.casos.find((c) => c.periodoInicio === '2026-04' && c.periodoFim === '2026-06');
    const casoSetembro = fixture.casos.find((c) => c.periodoInicio === '2026-09' && c.periodoFim === '2026-09');
    if (!casoTrimestre || !casoSetembro) throw new Error('A fixture da DFC já não tem os casos trimestre 04..06 e mês 09');
    const esperados: Array<[number, string]> = [
      [3, casoTrimestre.esperado.caixaInicial], // véspera de 2026-04
      [6, casoTrimestre.esperado.caixaFinal],
      [8, casoSetembro.esperado.caixaInicial], // véspera de 2026-09
    ];
    for (const [q, caixa] of esperados) {
      const r = await gerar(q, q);
      const l = r.linhas.find((x) => x.conta?.codigo === '121');
      expect(l, `[${q}..${q}] linha 121`).toBeDefined();
      igual(l!.saldoDevedor, caixa, `[${q}..${q}] 121.saldoDevedor`);
      igual(l!.saldoCredor, '0', `[${q}..${q}] 121.saldoCredor`);
      igual(l!.saldoDevedor.minus(l!.saldoCredor), l!.acumD.minus(l!.acumC), `[${q}..${q}] 121 saldo = acumD − acumC`);
      expect(l!.contraNatureza).toBe(false);
    }
  });

  it('711 (vendas, CREDORA) tem saldo credor; nenhuma linha tem saldo dos dois lados nem negativo', async () => {
    const r = await gerar(1, 8);
    const l711 = r.linhas.find((x) => x.conta?.codigo === '711');
    expect(l711).toBeDefined();
    expect(l711!.saldoCredor.greaterThan(0)).toBe(true);
    igual(l711!.saldoDevedor, '0', '711.saldoDevedor');
    expect(l711!.contraNatureza).toBe(false);
    for (const l of r.linhas) {
      expect(l.saldoDevedor.isNegative() || l.saldoCredor.isNegative(), l.conta!.codigo).toBe(false);
      expect(l.saldoDevedor.isZero() || l.saldoCredor.isZero(), l.conta!.codigo).toBe(true);
    }
  });

  // S1 iter 2, decisão (a) (ledger RUN.md ## Changes, 2026-10-01): inicial > final ⇒ inicial = final, com eco.
  it('(a) periodoInicial 9 > periodoFinal 3 ⇒ inicial = final = 3 (eco), movimento só do período 3, acumulado 1..3', async () => {
    const r = await gerar(9, 3);
    expect(r.periodoInicial).toBe(3);
    expect(r.periodoFinal).toBe(3);
    const mov = somaFixture(3, 3);
    const acum = somaFixture(1, 3);
    igual(r.totais.movD, mov.d, '[9→3] totais.movD');
    igual(r.totais.movC, mov.c, '[9→3] totais.movC');
    igual(r.totais.acumD, acum.d, '[9→3] totais.acumD');
    igual(r.totais.acumC, acum.c, '[9→3] totais.acumC');
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('(a) {13, 13} sem incluir13 ⇒ o 13 vira 12 nos dois extremos (eco 12, 12) e o movimento é o do 12', async () => {
    const r = await gerar(13, 13, false);
    expect(r.periodoInicial).toBe(12);
    expect(r.periodoFinal).toBe(12);
    expect(r.incluir13).toBe(false);
    const b = await gerar(12, 12, false);
    for (const k of ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const) {
      igual(r.totais[k], b.totais[k], `totais.${k} ({13,13} sem incluir13 = {12,12})`);
    }
  });

  it('sem incluir13, pedir o período final 13 é o mesmo que pedir o 12', async () => {
    const a = await gerar(1, 13, false);
    const b = await gerar(1, 12, false);
    for (const k of ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const) {
      igual(a.totais[k], b.totais[k], `totais.${k} (13 sem incluir13 = 12)`);
    }
    expect(a.linhas.map((l) => l.conta?.codigo)).toEqual(b.linhas.map((l) => l.conta?.codigo));
  });
});
