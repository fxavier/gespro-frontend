import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// ---------------------------------------------------------------------------
// I7 (impedimentos), I10 (isolamento de rubricas/mapeamentos), V4 (entre
// exercícios) e o caso de I9 que TEM de lançar — nó `servico-v` do grafo dfc
// (ticket 5.3), escrito pelo verificador-fluxo-caixa ANTES de existir
// `dfc.service.ts`. Spec 22 · WS-2 · ADR-0037 com a Emenda 2026-09-25.
//
// O verificador não escreve na base. Estes casos precisam de estados que o
// seed não tem (uma conta desmapeada, um tenant sem versão, linhas de outro
// tenant, um exercício anterior). Por isso correm contra um DUPLO DE LEITURA
// (helpers/duplo-leitura-dfc.ts) que envolve `@/server/db/client`: todas as
// leituras vão à base local real e só o que o cenário manda é alterado no
// RESULTADO. Escritas através do duplo lançam.
//
// O import de `../dfc.service` é deliberado: sem o nó `servico`, o ficheiro
// rebenta na resolução — é a prova vermelha. FICHEIRO PROTEGIDO (grafo dfc):
// alterá-lo num nó feat-* é BLOCKER. NUNCA `vitest -u`.
// ---------------------------------------------------------------------------

type DRELike = { lucroLiquido: import('@prisma/client').Prisma.Decimal };

const espiao = vi.hoisted(() => ({
  ajustarDRE: null as null | ((d: DRELike) => DRELike),
  chamadasDRE: [] as Array<{ dataInicio: Date; dataFim: Date }>,
}));

vi.mock('@/server/db/client', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/server/db/client')>();
  const { envolverCliente } = await import('./helpers/duplo-leitura-dfc');
  return {
    ...orig,
    prisma: envolverCliente(orig.prisma, 'prisma'),
    prismaBase: envolverCliente(orig.prismaBase, 'prismaBase'),
  };
});

// `gerarDRE` passa inalterada, e fica registada; um caso de I9 desvia-a um cêntimo.
vi.mock('../contabilidade.service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../contabilidade.service')>();
  const gerarDRE: typeof orig.gerarDRE = async (filtro, ctx) => {
    espiao.chamadasDRE.push({ dataInicio: filtro.dataInicio, dataFim: filtro.dataFim });
    const dre = await orig.gerarDRE(filtro, ctx);
    return espiao.ajustarDRE ? (espiao.ajustarDRE(dre) as typeof dre) : dre;
  };
  return { ...orig, gerarDRE, contabilidadeService: { ...orig.contabilidadeService, gerarDRE } };
});

import { BusinessRuleError } from '@/lib/errors';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import type { FiltroDFCInput } from '@/lib/validations/fluxo-caixa';
import { ERROS_DFC, temImpedimentos } from '../dfc.interface';
import type { DFC, IDfcService, ImpedimentosDFC, ResultadoDFC } from '../dfc.interface';
import {
  contasNaoMapeadas as contasNaoMapeadasImpl,
  gerarDFC as gerarDFCImpl,
} from '../dfc.service';
import {
  compararDFC,
  compararNaoMapeadas,
  contaPorCodigo,
  fixture,
  igual,
  periodosPorCodigo,
  resolverTenantDemo,
  verificarSentinelas,
  type PeriodoSeed,
} from './helpers/dfc-golden';
import {
  MAPEAMENTO_ALHEIO_ID,
  PERIODO_SINTETICO_ID,
  RUBRICA_ALHEIA_CODIGO,
  RUBRICA_ALHEIA_ID,
  TENANT_ALHEIO,
  VERSAO_ALHEIA_ID,
  definirCenario,
} from './helpers/duplo-leitura-dfc';

const gerarDFC: IDfcService['gerarDFC'] = gerarDFCImpl;
const contasNaoMapeadas: IDfcService['contasNaoMapeadas'] = contasNaoMapeadasImpl;

const hasDB = Boolean(process.env.DATABASE_URL);

/** ≥ 1000 por propriedade — exigência do verificador. */
const NUM_RUNS = 1000;

const CONTAS_CAIXA = ['111', '121', '122', '123'] as const;
/** Contas que a propriedade de I7 pode desmapear: as 7 com movimento e 5 sem (131, 6981 e três CAIXA). */
const POOL = ['111', '121', '122', '123', '131', '411', '421', '44331', '6112', '63299', '711', '6981'] as const;

function exigirMapa(r: ResultadoDFC, onde: string): DFC {
  if (temImpedimentos(r)) {
    throw new Error(`${onde}: esperava o mapa e vieram impedimentos: ${JSON.stringify(r.impedimentos)}`);
  }
  return r;
}

function exigirImpedimentos(r: ResultadoDFC, onde: string): ImpedimentosDFC {
  expect(temImpedimentos(r), `${onde}: esperava impedimentos e saiu o mapa`).toBe(true);
  // NENHUM mapa: nem coluna N, nem N-1, nem secções — o tipo já o diz, e o objecto também.
  for (const campo of ['atual', 'homologo', 'seccoes', 'versao'] as const) {
    expect(campo in (r as object), `${onde}: a resposta com impedimentos traz «${campo}»`).toBe(false);
  }
  return r as ImpedimentosDFC;
}

function codigoDoErro(e: unknown): string | null {
  return e instanceof BusinessRuleError ? e.code : null;
}

describe.skipIf(!hasDB)('DFC no serviço — I7, I10, V4 e I9 contra um duplo de leitura sobre a base local', () => {
  let ctx: { tenantId: string; userId: string };
  let periodos: Map<string, PeriodoSeed>;
  let contas: Map<string, string>;
  let versaoIdDoSeed: string;

  const P = (codigo: string): PeriodoSeed => {
    const p = periodos.get(codigo);
    if (!p) throw new Error(`Período ${codigo} não existe no tenant demo`);
    return p;
  };
  const filtro = (inicio: string, fim: string): FiltroDFCInput => ({
    periodoInicioId: P(inicio).id,
    periodoFimId: P(fim).id,
  });
  const noTenant = <T>(fn: () => Promise<T>): Promise<T> => runWithTenantContext(ctx, fn);
  const ids = (codigos: readonly string[]) => new Set(codigos.map((c) => contas.get(c)!));

  beforeAll(async () => {
    definirCenario({ tipo: 'passagem' });
    ctx = await resolverTenantDemo();
    await verificarSentinelas(ctx.tenantId); // «a base tem resíduos», antes de qualquer número
    periodos = await periodosPorCodigo(ctx.tenantId);
    contas = await contaPorCodigo(ctx.tenantId, POOL);
    const v = await prismaBase.versaoMapeamentoFluxo.findFirst({
      where: { tenantId: ctx.tenantId, numero: 1 },
      select: { id: true },
    });
    versaoIdDoSeed = v!.id;
  });

  afterEach(() => {
    definirCenario({ tipo: 'passagem' });
    espiao.ajustarDRE = null;
    espiao.chamadasDRE.length = 0;
  });

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  // -------------------------------------------------------------------------
  // I7 — conta com movimento e sem mapeamento ⇒ impedimentos, TODOS, e nenhum mapa
  // -------------------------------------------------------------------------
  describe('I7 — cobertura de mapeamento', () => {
    it('I7 — TEM de recusar: 411, 421, 44331 e 711 desmapeadas (com movimento em 2026-09) e 131 (sem) ⇒ impedimentos com a lista COMPLETA, nenhum mapa', async () => {
      const imp = fixture.impedimentos;
      definirCenario({ tipo: 'desmapear', contaIds: ids(imp.desmapear) });

      const r = exigirImpedimentos(
        await noTenant(() => gerarDFC(filtro(imp.periodoInicio, imp.periodoFim), ctx)),
        'gerarDFC',
      );
      compararNaoMapeadas(r.contasNaoMapeadas, imp.contasNaoMapeadas, 'gerarDFC');
      for (const c of r.contasNaoMapeadas) {
        expect(c.conta.id, `${c.conta.codigo}: id da conta do tenant demo`).toBe(contas.get(c.conta.codigo));
      }
      // Todas de uma vez, ao estilo do fecharPeriodo: cada conta está nas frases.
      expect(r.impedimentos.length).toBeGreaterThanOrEqual(1);
      for (const e of imp.contasNaoMapeadas) {
        expect(
          r.impedimentos.some((s) => s.includes(e.codigo)),
          `a conta ${e.codigo} não aparece em nenhum impedimento: ${JSON.stringify(r.impedimentos)}`,
        ).toBe(true);
      }

      // contasNaoMapeadas (5.2) devolve a MESMA lista, de uma vez.
      const lista = await noTenant(() => contasNaoMapeadas(filtro(imp.periodoInicio, imp.periodoFim), ctx));
      compararNaoMapeadas(lista, imp.contasNaoMapeadas, 'contasNaoMapeadas');
    });

    it('I7 [property] — qualquer subconjunto desmapeado, qualquer intervalo: contasNaoMapeadas == desmapeadas ∩ com movimento; o mapa só sai se essa interseção for vazia e sobrar ≥ 1 conta CAIXA', async () => {
      const movimentoPorPeriodo = fixture.sentinelasDoSeed.contasComMovimentoPorPeriodo as unknown as Record<
        string,
        string[]
      >;
      const meses = Array.from({ length: 9 }, (_, k) => `2026-${String(k + 1).padStart(2, '0')}`);
      // Intervalos de 2026-01..2026-09 em que TODA a conta com saldo na véspera tem
      // movimento no intervalo (2026-07 sozinho fica de fora: 63299 tem saldo e não
      // mexe). Assim a pergunta «conta com saldo mas sem movimento é impedimento?»
      // — que o contrato não fecha — não entra no oráculo.
      const intervalos = meses
        .flatMap((a, i) => meses.slice(i).map((b) => [a, b] as const))
        .filter(([a, b]) => !(a === '2026-07' && b === '2026-07'));

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...intervalos),
          fc.subarray([...POOL]),
          async ([ini, fim], desmapeadas) => {
            const S = new Set(desmapeadas);
            const M = new Set(meses.filter((m) => m >= ini && m <= fim).flatMap((m) => movimentoPorPeriodo[m]!));
            const esperadas = [...S].filter((c) => M.has(c)).sort();
            const semCaixa = CONTAS_CAIXA.every((c) => S.has(c));

            definirCenario({ tipo: 'desmapear', contaIds: ids(desmapeadas) });
            const r = await noTenant(() => gerarDFC(filtro(ini, fim), ctx));
            const onde = `${ini}..${fim} sem mapeamento para [${[...S].sort().join(', ')}]`;

            if (esperadas.length === 0 && !semCaixa) {
              const dfc = exigirMapa(r, onde);
              expect(dfc.atual.seccoes.somaAtividades.equals(dfc.atual.variacaoCaixa), `${onde}: não articula`).toBe(
                true,
              );
              return;
            }
            const imp = exigirImpedimentos(r, onde);
            expect(
              imp.contasNaoMapeadas.map((c) => c.conta.codigo).sort(),
              `${onde}: contasNaoMapeadas`,
            ).toEqual(esperadas);
            // Sem nenhuma conta CAIXA há mais um impedimento (E2), além das contas.
            expect(imp.impedimentos.length, `${onde}: impedimentos`).toBeGreaterThanOrEqual(semCaixa ? 2 : 1);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    }, 600_000);

    it('E2 — desmapear as quatro contas CAIXA ⇒ impedimento de caixa, além do de 121 (a única com movimento)', async () => {
      definirCenario({ tipo: 'desmapear', contaIds: ids(CONTAS_CAIXA) });
      const r = exigirImpedimentos(await noTenant(() => gerarDFC(filtro('2026-09', '2026-09'), ctx)), 'sem CAIXA');
      expect(r.contasNaoMapeadas.map((c) => c.conta.codigo)).toEqual(['121']);
      expect(r.impedimentos.length).toBeGreaterThanOrEqual(2);
    });

    it('E2 — desmapear só as CAIXA sem movimento (111, 122, 123) não impede nada: a caixa passa a ser 121, e o mapa é o da golden', async () => {
      definirCenario({ tipo: 'desmapear', contaIds: ids(['111', '122', '123']) });
      const caso = fixture.casos[0]!;
      const r = await noTenant(() => gerarDFC(filtro(caso.periodoInicio, caso.periodoFim), ctx));
      compararDFC(exigirMapa(r, caso.nome), caso, { inicio: P(caso.periodoInicio), fim: P(caso.periodoFim) }, versaoIdDoSeed);
    });

    it('«Mapeamento da DFC não semeado» — TEM de recusar: tenant sem versão ⇒ impedimento, contasNaoMapeadas [], nenhum mapa, sem lançar', async () => {
      definirCenario({ tipo: 'semVersao' });
      const r = exigirImpedimentos(
        await noTenant(() => gerarDFC(filtro('2026-09', '2026-09'), ctx)),
        'sem versão',
      );
      expect(
        r.impedimentos.some((s) => s.includes('Mapeamento da DFC não semeado')),
        `impedimentos: ${JSON.stringify(r.impedimentos)}`,
      ).toBe(true);
      expect(r.contasNaoMapeadas).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // I10 — rubricas, mapeamentos e versões de outro tenant nunca entram
  // -------------------------------------------------------------------------
  describe('I10 — isolamento de rubricas', () => {
    it('I10 — a base tem OUTRO tenant com uma rubrica, uma versão 99 VALIDATED e um mapeamento da 411 do demo: nada disso entra, e a DFC é a da golden', async () => {
      definirCenario({ tipo: 'linhasAlheias', tenantId: ctx.tenantId, contaId: contas.get('411')! });
      const caso = fixture.casos[0]!;
      const r = await noTenant(() => gerarDFC(filtro(caso.periodoInicio, caso.periodoFim), ctx));
      const dfc = exigirMapa(r, caso.nome);
      compararDFC(dfc, caso, { inicio: P(caso.periodoInicio), fim: P(caso.periodoFim) }, versaoIdDoSeed);
      const json = JSON.stringify(dfc);
      for (const alheio of [RUBRICA_ALHEIA_ID, RUBRICA_ALHEIA_CODIGO, VERSAO_ALHEIA_ID, MAPEAMENTO_ALHEIO_ID, TENANT_ALHEIO]) {
        expect(json.includes(alheio), `«${alheio}» (de outro tenant) entrou na DFC`).toBe(false);
      }
      const lista = await noTenant(() => contasNaoMapeadas(filtro(caso.periodoInicio, caso.periodoFim), ctx));
      expect(lista).toEqual([]);
    });

    it('I10 — TEM de recusar: o mapeamento da 411 do PRÓPRIO demo aponta para uma rubrica de outro tenant (a FK da 22b deixa) ⇒ a rubrica alheia não entra; 411 fica sem mapeamento ⇒ impedimento só com ela', async () => {
      const rubAlheia = fixture.impedimentos.rubricaAlheia;
      definirCenario({ tipo: 'rubricaAlheia', tenantId: ctx.tenantId, contaId: contas.get(rubAlheia.conta)! });
      const r = await noTenant(() => gerarDFC(filtro('2026-09', '2026-09'), ctx));
      expect(JSON.stringify(r).includes(RUBRICA_ALHEIA_CODIGO), 'a rubrica de outro tenant entrou na DFC').toBe(false);
      const imp = exigirImpedimentos(r, 'rubrica alheia');
      compararNaoMapeadas(imp.contasNaoMapeadas, rubAlheia.contasNaoMapeadas, 'rubrica alheia');
    });
  });

  // -------------------------------------------------------------------------
  // V4 — início e fim em exercícios diferentes (o seed só tem 2026: o 2025-12
  // é um período sintético do duplo, no mesmo tenant)
  // -------------------------------------------------------------------------
  describe('V4 — mesmo exercício', () => {
    it('V4 — TEM de lançar: 2025-12 → 2026-01 ⇒ DFC_ENTRE_EXERCICIOS (não INTERVALO_INVERTIDO, nem mapa)', async () => {
      definirCenario({ tipo: 'periodoSintetico', tenantId: ctx.tenantId });
      const f: FiltroDFCInput = { periodoInicioId: PERIODO_SINTETICO_ID, periodoFimId: P('2026-01').id };
      const erro = await noTenant(() => gerarDFC(f, ctx)).catch((e: unknown) => e);
      expect(codigoDoErro(erro), `veio ${String(erro)}`).toBe(ERROS_DFC.DFC_ENTRE_EXERCICIOS);
    });

    it('V4 — TEM de lançar: 2026-01 → 2025-12 ⇒ DFC_ENTRE_EXERCICIOS (o exercício decide antes da ordem)', async () => {
      definirCenario({ tipo: 'periodoSintetico', tenantId: ctx.tenantId });
      const f: FiltroDFCInput = { periodoInicioId: P('2026-01').id, periodoFimId: PERIODO_SINTETICO_ID };
      const erro = await noTenant(() => gerarDFC(f, ctx)).catch((e: unknown) => e);
      expect(codigoDoErro(erro), `veio ${String(erro)}`).toBe(ERROS_DFC.DFC_ENTRE_EXERCICIOS);
    });
  });

  // -------------------------------------------------------------------------
  // I9 — o resultado da DFC É o da gerarDRE (não um cálculo paralelo)
  // -------------------------------------------------------------------------
  describe('I9 — coerência com a DRE', () => {
    it('I9 — gerarDRE é chamada para o MESMO intervalo (início do período inicial, fim do período final) e o seu lucroLiquido abre a operacional', async () => {
      const caso = fixture.casos[2]!; // 2026-04..2026-06
      const r = await noTenant(() => gerarDFC(filtro(caso.periodoInicio, caso.periodoFim), ctx));
      const dfc = exigirMapa(r, caso.nome);
      const ini = P(caso.periodoInicio).dataInicio.getTime();
      const fim = P(caso.periodoFim).dataFim.getTime();
      expect(
        espiao.chamadasDRE.some((c) => c.dataInicio.getTime() === ini && c.dataFim.getTime() === fim),
        `gerarDRE não foi chamada para ${caso.periodoInicio}..${caso.periodoFim}; chamadas: ${JSON.stringify(espiao.chamadasDRE)}`,
      ).toBe(true);
      igual(dfc.atual.seccoes.resultadoLiquido, caso.esperado.resultadoLiquido, `${caso.nome}: resultadoLiquido`);
    });

    for (const desvio of ['0.01', '-0.01']) {
      it(`I9 — TEM de lançar: se a DRE disser ${desvio} a mais, a DFC não sai — DFC_NAO_ARTICULA com delta ${desvio} (o resultado vem MESMO da DRE)`, async () => {
        espiao.ajustarDRE = (d) => ({ ...d, lucroLiquido: d.lucroLiquido.plus(desvio) });
        const erro = await noTenant(() => gerarDFC(filtro('2026-09', '2026-09'), ctx)).catch((e: unknown) => e);
        expect(codigoDoErro(erro), `veio ${String(erro)}`).toBe(ERROS_DFC.DFC_NAO_ARTICULA);
        const details = (erro as BusinessRuleError).details as { delta: string };
        expect(details.delta).toBe(desvio);
      });
    }
  });
});
