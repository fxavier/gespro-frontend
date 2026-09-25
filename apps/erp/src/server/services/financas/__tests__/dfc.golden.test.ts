import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import type { FiltroDFCInput } from '@/lib/validations/fluxo-caixa';
import { gerarDRE } from '../contabilidade.service';
import { ERROS_DFC, temImpedimentos } from '../dfc.interface';
import type { DFC, IDfcService, ResultadoDFC } from '../dfc.interface';
// ---------------------------------------------------------------------------
// GOLDEN da DFC + I9 + I10 (cross-tenant) + V4 (invertido) — nó `servico-v`
// do grafo dfc (ticket 5.3), escrito pelo verificador-fluxo-caixa ANTES de
// existir `dfc.service.ts`. Spec 22 · WS-2 · ADR-0037 com a Emenda 2026-09-25.
//
// O import abaixo é deliberado: enquanto o nó `servico` não entregar
// `dfc.service.ts` com `gerarDFC` e `contasNaoMapeadas`, este ficheiro rebenta
// na resolução do import — é a prova vermelha de que o oráculo antecede a
// solução. As duas funções ficam ligadas ao contrato (`IDfcService`): uma
// assinatura divergente é erro de `tsc` aqui, sem tocar neste ficheiro.
//
// A fixture `fixtures/dfc-seed-demo.json` foi apurada À MÃO do balancete e da
// DRE existentes e da tabela de mapeamento semeada — nunca de gerarDFC. NUNCA
// `vitest -u`. FICHEIRO PROTEGIDO (grafo dfc): alterá-lo num nó feat-* é BLOCKER.
//
// Corre contra a BASE LOCAL (tenant demo), só leituras. Sem DATABASE_URL, salta.
// ---------------------------------------------------------------------------
import {
  contasNaoMapeadas as contasNaoMapeadasImpl,
  gerarDFC as gerarDFCImpl,
} from '../dfc.service';
import {
  compararDFC,
  D,
  fixture,
  igual,
  periodosPorCodigo,
  resolverTenantDemo,
  verificarSentinelas,
  type PeriodoSeed,
} from './helpers/dfc-golden';

const gerarDFC: IDfcService['gerarDFC'] = gerarDFCImpl;
const contasNaoMapeadas: IDfcService['contasNaoMapeadas'] = contasNaoMapeadasImpl;

const hasDB = Boolean(process.env.DATABASE_URL);

/** O mapa saiu (não impedimentos). Falha com a lista, se não saiu. */
function exigirMapa(r: ResultadoDFC, onde: string): DFC {
  if (temImpedimentos(r)) {
    throw new Error(`${onde}: esperava o mapa e vieram impedimentos: ${JSON.stringify(r.impedimentos)}`);
  }
  return r;
}

describe.skipIf(!hasDB)('DFC do seed demo — golden, I9, I10, V4 (contra a base local)', () => {
  let ctx: { tenantId: string; userId: string };
  let periodos: Map<string, PeriodoSeed>;
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
  const noTenant = <T>(fn: () => Promise<T>, c = ctx): Promise<T> => runWithTenantContext(c, fn);

  beforeAll(async () => {
    ctx = await resolverTenantDemo();
    await verificarSentinelas(ctx.tenantId); // «a base tem resíduos», antes de qualquer número
    periodos = await periodosPorCodigo(ctx.tenantId);
    const v = await prismaBase.versaoMapeamentoFluxo.findFirst({
      where: { tenantId: ctx.tenantId, numero: 1 },
      select: { id: true },
    });
    versaoIdDoSeed = v!.id;
  });

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  // -------------------------------------------------------------------------
  // Golden — bate ao cêntimo, e articula (I6 sobre o seed)
  // -------------------------------------------------------------------------
  describe('golden — dfc-seed-demo.json', () => {
    for (const caso of fixture.casos) {
      it(`${caso.nome}: bate ao cêntimo com a derivação manual, e articula`, async () => {
        const r = await noTenant(() => gerarDFC(filtro(caso.periodoInicio, caso.periodoFim), ctx));
        const dfc = exigirMapa(r, caso.nome);
        compararDFC(
          dfc,
          caso,
          { inicio: P(caso.periodoInicio), fim: P(caso.periodoFim) },
          versaoIdDoSeed,
        );
      });
    }

    it('I7 sobre o seed: cobertura completa — contasNaoMapeadas é [] em todos os intervalos da fixture', async () => {
      for (const caso of fixture.casos) {
        const lista = await noTenant(() =>
          contasNaoMapeadas(filtro(caso.periodoInicio, caso.periodoFim), ctx),
        );
        expect(lista, caso.nome).toEqual([]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // I9 — o resultado que abre a operacional é o lucroLiquido da DRE
  // -------------------------------------------------------------------------
  describe('I9 — coerência com a DRE', () => {
    it('I9: em TODOS os 91 intervalos do exercício (13 × 14 / 2, exaustivo), resultadoLiquido == gerarDRE(...).lucroLiquido ao cêntimo, e o mapa articula', async () => {
      // Exaustivo sobre o domínio finito (i ≤ j em 1..13) — domina uma amostra
      // aleatória. Inclui o 13.º período (instante único) e 2026-10 (onde a base
      // local tem um lançamento manual em 123/6981: a DFC tem de o apanhar tal
      // como a DRE o apanha).
      const ordenados = [...periodos.values()].sort((a, b) => a.ordem - b.ordem);
      expect(ordenados).toHaveLength(13);
      let intervalos = 0;
      for (let i = 0; i < ordenados.length; i++) {
        for (let j = i; j < ordenados.length; j++) {
          const ini = ordenados[i]!;
          const fim = ordenados[j]!;
          const onde = `${ini.codigo}..${fim.codigo}`;
          const [r, dre] = await noTenant(() =>
            Promise.all([
              gerarDFC({ periodoInicioId: ini.id, periodoFimId: fim.id }, ctx),
              gerarDRE({ dataInicio: ini.dataInicio, dataFim: fim.dataFim }, ctx),
            ]),
          );
          const dfc = exigirMapa(r, onde);
          expect(
            dfc.atual.seccoes.resultadoLiquido.equals(dre.lucroLiquido),
            `${onde}: resultadoLiquido ${dfc.atual.seccoes.resultadoLiquido.toFixed()} ≠ DRE ${dre.lucroLiquido.toFixed()}`,
          ).toBe(true);
          // O resultado ABRE a operacional: está dentro do total dela.
          const semResultado = dfc.atual.seccoes.operacional.rubricas.reduce(
            (acc, l) => acc.plus(l.valor),
            D(0),
          );
          expect(
            dfc.atual.seccoes.operacional.total.equals(semResultado.plus(dre.lucroLiquido)),
            `${onde}: operacional.total ≠ resultado + Σ linhas`,
          ).toBe(true);
          expect(
            dfc.atual.seccoes.somaAtividades.equals(dfc.atual.variacaoCaixa),
            `${onde}: não articula`,
          ).toBe(true);
          intervalos++;
        }
      }
      expect(intervalos).toBe(91);
    }, 120_000);

    it('I9 na golden: os três resultados da fixture são os da DRE do mesmo intervalo (a fixture não inventa o resultado)', async () => {
      for (const caso of fixture.casos) {
        const dre = await noTenant(() =>
          gerarDRE(
            { dataInicio: P(caso.periodoInicio).dataInicio, dataFim: P(caso.periodoFim).dataFim },
            ctx,
          ),
        );
        igual(dre.lucroLiquido, caso.esperado.resultadoLiquido, `${caso.nome}: DRE.lucroLiquido`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // I10 — isolamento: períodos de outro tenant ⇒ NotFoundError
  // -------------------------------------------------------------------------
  describe('I10 — isolamento multi-tenant', () => {
    // Um tenant que não é o dono dos períodos. A base local só tem o demo; um
    // ctx de outro tenant é exactamente o ponto de vista de «outro tenant»:
    // para ele, os períodos do demo não existem. Nada se escreve.
    const alheio = { tenantId: 'tenant-alheio-i10-servico-v', userId: 'utilizador-alheio-i10' };

    it('I10 — TEM de lançar: gerarDFC com os dois períodos de outro tenant ⇒ NotFoundError (404, nunca 403 nem mapa)', async () => {
      const f = filtro('2026-01', '2026-09');
      await expect(noTenant(() => gerarDFC(f, alheio), alheio)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('I10 — TEM de lançar: basta UM dos períodos ser alheio (início de outro tenant, fim inexistente)', async () => {
      const f: FiltroDFCInput = { periodoInicioId: P('2026-09').id, periodoFimId: 'periodo-inexistente-i10' };
      await expect(noTenant(() => gerarDFC(f, ctx))).rejects.toBeInstanceOf(NotFoundError);
      const g: FiltroDFCInput = { periodoInicioId: 'periodo-inexistente-i10', periodoFimId: P('2026-09').id };
      await expect(noTenant(() => gerarDFC(g, ctx))).rejects.toBeInstanceOf(NotFoundError);
    });

    it('I10 — TEM de lançar: contasNaoMapeadas com períodos de outro tenant ⇒ NotFoundError', async () => {
      const f = filtro('2026-09', '2026-09');
      await expect(noTenant(() => contasNaoMapeadas(f, alheio), alheio)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // V4 (parte que a base local permite: um só exercício) — ENTRE_EXERCICIOS
  // está no ficheiro do duplo, porque o seed não tem exercício anterior.
  // -------------------------------------------------------------------------
  describe('V4 — limites do intervalo', () => {
    it('TEM de lançar: fim anterior ao início no mesmo exercício ⇒ DFC_INTERVALO_INVERTIDO, sem mapa', async () => {
      const erro = await noTenant(() => gerarDFC(filtro('2026-09', '2026-04'), ctx)).catch(
        (e: unknown) => e,
      );
      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect((erro as BusinessRuleError).code).toBe(ERROS_DFC.DFC_INTERVALO_INVERTIDO);
    });

    it('um só período (início == fim) é um intervalo válido — incluindo o 13.º', async () => {
      const r = await noTenant(() => gerarDFC(filtro('2026-13', '2026-13'), ctx));
      const dfc = exigirMapa(r, '2026-13');
      expect(dfc.atual.periodoInicio.id).toBe(P('2026-13').id);
      expect(dfc.atual.seccoes.somaAtividades.equals(dfc.atual.variacaoCaixa)).toBe(true);
    });
  });
});
