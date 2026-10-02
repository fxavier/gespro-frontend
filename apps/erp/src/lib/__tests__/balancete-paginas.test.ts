/**
 * ORÁCULO — paginarBalancete (run balancete-phc, S6, issue #286).
 * Contrato: .scratch/sdlc/balancete-phc/S6-contrato.md §«Paginação».
 *
 * Escrito pelo AUTOR DO ORÁCULO antes de a função existir. NUNCA `vitest -u`;
 * um agente de implementação que altere este ficheiro é BLOCKER.
 *
 * Leitura literal do contrato (assumida aqui):
 *  - caminho do módulo: `@/lib/documents/balancete-paginas` (o «ex.:» do contrato);
 *  - assinatura `paginarBalancete(linhas, linhasPorPagina)` → `{ linhas, transporte, aTransportar }[]`;
 *  - «linhas que contam» = `tipo === 'CONTA'` && !agregadora && !contexto, mais
 *    `tipo === 'SINTETICA'`; SUBTOTAL_CLASSE e agregadoras não contam;
 *  - transporte = null na 1.ª página, senão = aTransportar da anterior;
 *    aTransportar = null na última, senão = transporte (0 na 1.ª) + Σ das que contam
 *    nesta página — nas seis colunas de TotaisBV;
 *  - entrada vazia: NÃO verificada (o contrato não a define — questão em aberto).
 *
 * Esclarecimentos (orquestrador, 2026-10-02, após G5 iter 1) — acrescentado:
 *  - invariante «sem filtros, Σ das linhas que contam (todas as páginas) = totais do
 *    núcleo nas 6 colunas», sobre planos de contas aleatórios bem formados (≤ 7 níveis,
 *    códigos prefixados pela mãe, uma raiz por classe), passados pelo núcleo REAL
 *    (`montarBalanceteVerificacao`) e pela hierarquia REAL (`hierarquizarBalancete`, sem opções),
 *    com e sem abertura implícita (linha sintética incluída).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Prisma, type ClassePGC } from '@prisma/client';
import {
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type ContaBV,
  type LinhaHierarquica,
  type TotaisBV,
} from '@/server/services/financas/balancete-verificacao';

const modulo = () => import('@/lib/documents/balancete-paginas');

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const CAMPOS = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;
/** Forma do resultado fixada pelo contrato (tipada aqui para não depender do módulo). */
type Pagina = { linhas: LinhaHierarquica[]; transporte: TotaisBV | null; aTransportar: TotaisBV | null };

// ---------------------------------------------------------------------------
// Fábrica de linhas
// ---------------------------------------------------------------------------

type Espécie = 'folha' | 'agregadora' | 'contexto' | 'subtotal' | 'sintetica';

let seq = 0;
function linha(especie: Espécie, valores: [string, string, string, string, string, string]): LinhaHierarquica {
  seq += 1;
  const [movD, movC, acumD, acumC, saldoDevedor, saldoCredor] = valores.map((v) => D(v)) as Decimal[];
  const base = {
    implicita: false,
    movD: movD!,
    movC: movC!,
    acumD: acumD!,
    acumC: acumC!,
    saldoDevedor: saldoDevedor!,
    saldoCredor: saldoCredor!,
    contraNatureza: false,
    classe: 'CLASSE_1' as ClassePGC,
    maeMostradaId: null,
    profundidade: 0,
  };
  const conta = {
    id: `c-${seq}`,
    codigo: String(1000 + seq),
    nome: `Conta ${seq}`,
    classe: 'CLASSE_1' as ClassePGC,
    natureza: 'DEVEDORA' as const,
    nivel: 2,
    contaMaeId: null,
    aceitaLancamento: especie === 'folha',
  };
  switch (especie) {
    case 'folha':
      return { ...base, conta, tipo: 'CONTA', nivel: 2, agregadora: false };
    case 'agregadora':
      return { ...base, conta, tipo: 'CONTA', nivel: 1, agregadora: true };
    case 'contexto':
      return { ...base, conta, tipo: 'CONTA', nivel: 2, agregadora: false, contexto: true };
    case 'subtotal':
      return { ...base, conta: null, tipo: 'SUBTOTAL_CLASSE', nivel: 1, agregadora: false };
    case 'sintetica':
      return { ...base, conta: null, implicita: true, tipo: 'SINTETICA', nivel: 2, agregadora: false, classe: 'CLASSE_8', profundidade: 1 };
  }
}

const conta = (l: LinhaHierarquica) =>
  (l.tipo === 'CONTA' && !l.agregadora && !l.contexto) || l.tipo === 'SINTETICA';

function zero(): TotaisBV {
  return { movD: D(0), movC: D(0), acumD: D(0), acumC: D(0), saldoDevedor: D(0), saldoCredor: D(0) };
}
function somar(a: TotaisBV, linhas: LinhaHierarquica[]): TotaisBV {
  const r = { ...a };
  for (const l of linhas.filter(conta)) for (const k of CAMPOS) r[k] = r[k].plus(l[k]);
  return r;
}
/** TotaisBV como texto canónico (igualdade exacta de Decimal). */
const txt = (t: TotaisBV | null) =>
  t === null ? null : Object.fromEntries(CAMPOS.map((k) => [k, D(t[k]).toString()]));

// ---------------------------------------------------------------------------
// Exemplos
// ---------------------------------------------------------------------------

describe('paginarBalancete — exemplos', () => {
  it('cabe numa página: uma página, sem transporte nem «a transportar»', async () => {
    const { paginarBalancete } = await modulo();
    const ls = [
      linha('agregadora', ['10', '0', '10', '0', '10', '0']),
      linha('folha', ['10', '0', '10', '0', '10', '0']),
      linha('subtotal', ['10', '0', '10', '0', '10', '0']),
    ];
    const p: Pagina[] = paginarBalancete(ls, 3);
    expect(p).toHaveLength(1);
    expect(p[0]!.linhas).toEqual(ls);
    expect(p[0]!.transporte).toBeNull();
    expect(p[0]!.aTransportar).toBeNull();
    expect(paginarBalancete(ls, 50)).toHaveLength(1);
  });

  it('múltiplo exacto do tamanho: nenhuma página vazia no fim', async () => {
    const { paginarBalancete } = await modulo();
    const ls = Array.from({ length: 6 }, () => linha('folha', ['1', '0', '1', '0', '1', '0']));
    const p: Pagina[] = paginarBalancete(ls, 3);
    expect(p.map((x) => x.linhas.length)).toEqual([3, 3]);
  });

  it('7 linhas por 3: páginas 3,3,1 e transporte só das linhas que contam', async () => {
    const { paginarBalancete } = await modulo();
    const ls = [
      /* p1 */ linha('agregadora', ['900', '900', '900', '900', '900', '900']),
      /*    */ linha('folha', ['100.10', '0', '200.20', '0.05', '200.15', '0']),
      /*    */ linha('contexto', ['700', '700', '700', '700', '700', '700']),
      /* p2 */ linha('folha', ['0', '50.01', '0', '75.02', '0', '75.02']),
      /*    */ linha('subtotal', ['555', '555', '555', '555', '555', '555']),
      /*    */ linha('sintetica', ['0', '0', '3.33', '0', '3.33', '0']),
      /* p3 */ linha('folha', ['1', '2', '3', '4', '0', '1']),
    ];
    const p: Pagina[] = paginarBalancete(ls, 3);
    expect(p.map((x) => x.linhas.length)).toEqual([3, 3, 1]);

    expect(p[0]!.transporte).toBeNull();
    expect(txt(p[0]!.aTransportar)).toEqual({
      movD: '100.1', movC: '0', acumD: '200.2', acumC: '0.05', saldoDevedor: '200.15', saldoCredor: '0',
    });
    expect(txt(p[1]!.transporte)).toEqual(txt(p[0]!.aTransportar));
    expect(txt(p[1]!.aTransportar)).toEqual({
      movD: '100.1', movC: '50.01', acumD: '203.53', acumC: '75.07', saldoDevedor: '203.48', saldoCredor: '75.02',
    });
    expect(txt(p[2]!.transporte)).toEqual(txt(p[1]!.aTransportar));
    expect(p[2]!.aTransportar).toBeNull();
  });

  it('página sem linhas que contam: «a transportar» igual ao transporte', async () => {
    const { paginarBalancete } = await modulo();
    const ls = [
      linha('folha', ['5', '0', '5', '0', '5', '0']),
      linha('agregadora', ['9', '9', '9', '9', '9', '9']),
      linha('subtotal', ['9', '9', '9', '9', '9', '9']),
      linha('folha', ['1', '0', '1', '0', '1', '0']),
    ];
    const p: Pagina[] = paginarBalancete(ls, 1);
    expect(p).toHaveLength(4);
    expect(txt(p[1]!.aTransportar)).toEqual(txt(p[1]!.transporte));
    expect(txt(p[2]!.aTransportar)).toEqual(txt(p[0]!.aTransportar));
    expect(txt(p[3]!.transporte)).toEqual({
      movD: '5', movC: '0', acumD: '5', acumC: '0', saldoDevedor: '5', saldoCredor: '0',
    });
  });

  it('Decimal exacto: 0,1 + 0,2 = 0,3 e montantes de 13 dígitos sem perda', async () => {
    const { paginarBalancete } = await modulo();
    const ls = [
      linha('folha', ['0.1', '0', '9999999999999.99', '0', '0', '0']),
      linha('folha', ['0.2', '0', '0.01', '0', '0', '0']),
      linha('folha', ['0', '0', '0', '0', '0', '0']),
    ];
    const p: Pagina[] = paginarBalancete(ls, 2);
    const t = p[0]!.aTransportar!;
    expect(D(t.movD).toString()).toBe('0.3');
    expect(D(t.acumD).toString()).toBe('10000000000000');
    expect(Prisma.Decimal.isDecimal(t.movD)).toBe(true);
  });

  it('não altera a entrada (nem o array nem os valores das linhas)', async () => {
    const { paginarBalancete } = await modulo();
    const ls = [
      linha('folha', ['1.5', '0', '1.5', '0', '1.5', '0']),
      linha('sintetica', ['0', '0', '2', '0', '2', '0']),
      linha('folha', ['3', '0', '3', '0', '3', '0']),
    ];
    const antes = ls.map((l) => ({ ref: l, tipo: l.tipo, v: CAMPOS.map((k) => l[k].toString()) }));
    paginarBalancete(ls, 1);
    expect(ls).toHaveLength(antes.length);
    ls.forEach((l, i) => {
      expect(l).toBe(antes[i]!.ref);
      expect(l.tipo).toBe(antes[i]!.tipo);
      expect(CAMPOS.map((k) => l[k].toString())).toEqual(antes[i]!.v);
    });
  });
});

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

const centimos = fc.integer({ min: 0, max: 99_999_999_999 }).map((c) => D(c).div(100).toString());
const arbLinha = fc
  .tuple(
    fc.constantFrom<Espécie>('folha', 'folha', 'folha', 'agregadora', 'contexto', 'subtotal', 'sintetica'),
    fc.tuple(centimos, centimos, centimos, centimos, centimos, centimos),
  )
  .map(([e, v]) => linha(e, v));

describe('paginarBalancete — propriedades', () => {
  it('tamanho ≤ N, sem páginas vazias, ordem e unicidade, transporte encadeado e consistente com o total', async () => {
    const { paginarBalancete } = await modulo();
    fc.assert(
      fc.property(fc.array(arbLinha, { minLength: 1, maxLength: 60 }), fc.integer({ min: 1, max: 15 }), (ls, n) => {
        const copia = ls.map((l) => CAMPOS.map((k) => l[k].toString()).join('|'));
        const p: Pagina[] = paginarBalancete(ls, n);

        // forma
        expect(p.length).toBe(Math.ceil(ls.length / n));
        for (const pg of p) {
          expect(pg.linhas.length).toBeGreaterThan(0);
          expect(pg.linhas.length).toBeLessThanOrEqual(n);
        }
        // ordem preservada, cada linha exactamente uma vez
        const todas = p.flatMap((pg) => pg.linhas);
        expect(todas).toHaveLength(ls.length);
        todas.forEach((l, i) => expect(l).toEqual(ls[i]));

        // transporte / a transportar
        let acc = zero();
        p.forEach((pg, i) => {
          if (i === 0) expect(pg.transporte).toBeNull();
          else expect(txt(pg.transporte)).toEqual(txt(p[i - 1]!.aTransportar));
          acc = somar(acc, pg.linhas);
          if (i === p.length - 1) expect(pg.aTransportar).toBeNull();
          else expect(txt(pg.aTransportar)).toEqual(txt(acc));
        });

        // consistência: último transporte + linhas que contam da última = Σ de todas as que contam
        const ultima = p[p.length - 1]!;
        const total = somar(zero(), ls);
        expect(txt(somar(ultima.transporte ?? zero(), ultima.linhas))).toEqual(txt(total));

        // entrada intacta
        expect(ls.map((l) => CAMPOS.map((k) => l[k].toString()).join('|'))).toEqual(copia);
      }),
      { numRuns: Number(process.env.FC_RUNS ?? 300) },
    );
  });
});

// ---------------------------------------------------------------------------
// Esclarecimentos 2026-10-02 — Σ das linhas que contam = totais do núcleo
// ---------------------------------------------------------------------------

const CLASSES_PLANO: ClassePGC[] = ['CLASSE_1', 'CLASSE_2', 'CLASSE_6', 'CLASSE_7'];

/** Plano bem formado: uma raiz por classe, filhas com código = código da mãe + dígito, ≤ 7 níveis, ≤ 9 filhas. */
function planoDe(sementes: number[]): ContaBV[] {
  const contas: ContaBV[] = [];
  const filhas = new Map<string, number>();
  sementes.forEach((s, i) => {
    const classe = CLASSES_PLANO[s % CLASSES_PLANO.length]!;
    const raiz = contas.find((c) => c.classe === classe && c.nivel === 1);
    if (!raiz) {
      contas.push({
        id: `p-${i}`, codigo: classe.slice(-1), nome: `Raiz ${classe}`, classe,
        natureza: classe === 'CLASSE_7' ? 'CREDORA' : 'DEVEDORA', nivel: 1, contaMaeId: null, aceitaLancamento: true,
      });
      return;
    }
    const candidatas = contas.filter((c) => c.classe === classe && c.nivel < 7 && (filhas.get(c.id) ?? 0) < 9);
    if (candidatas.length === 0) return;
    const mae = candidatas[Math.floor(s / CLASSES_PLANO.length) % candidatas.length]!;
    const k = (filhas.get(mae.id) ?? 0) + 1;
    filhas.set(mae.id, k);
    contas.push({
      id: `p-${i}`, codigo: `${mae.codigo}${k}`, nome: `Conta ${mae.codigo}${k}`, classe,
      natureza: mae.natureza, nivel: mae.nivel + 1, contaMaeId: mae.id, aceitaLancamento: true,
    });
  });
  return contas.map((c) => ({ ...c, aceitaLancamento: !filhas.has(c.id) }));
}

const centimosPos = fc.integer({ min: 0, max: 9_999_999_999 });
const arbPlano = fc.record({
  sementes: fc.array(fc.nat({ max: 10_000 }), { minLength: 1, maxLength: 50 }),
  valores: fc.array(fc.tuple(centimosPos, centimosPos, centimosPos, centimosPos, centimosPos, centimosPos), { minLength: 1, maxLength: 50 }),
  comAbertura: fc.boolean(),
  n: fc.integer({ min: 1, max: 12 }),
});

describe('paginarBalancete — sem filtros, Σ das linhas que contam = totais do núcleo', () => {
  it('em planos aleatórios bem formados (núcleo e hierarquia reais), nas 6 colunas', async () => {
    const { paginarBalancete } = await modulo();
    fc.assert(
      fc.property(arbPlano, ({ sementes, valores, comAbertura, n }) => {
        const contas = planoDe(sementes);
        const folhas = contas.filter((c) => c.aceitaLancamento);
        const movimento: AgregadoPartidaBV[] = [];
        const acumulado: AgregadoPartidaBV[] = [];
        const anteriores: AgregadoPartidaBV[] = [];
        const ag = (contaId: string, tipo: 'DEBITO' | 'CREDITO', c: number): AgregadoPartidaBV => ({
          contaId, tipo, _sum: { valor: D(c).div(100) },
        });
        folhas.forEach((f, j) => {
          const [md, mc, ad, ac, nd, nc] = valores[j % valores.length]!;
          movimento.push(ag(f.id, 'DEBITO', md), ag(f.id, 'CREDITO', mc));
          acumulado.push(ag(f.id, 'DEBITO', md + ad), ag(f.id, 'CREDITO', mc + ac));
          if (comAbertura && j % 2 === 0) anteriores.push(ag(f.id, 'DEBITO', nd), ag(f.id, 'CREDITO', nc));
        });
        const nucleo = montarBalanceteVerificacao({ contas, movimento, acumulado, anteriores: comAbertura ? anteriores : null });
        const linhas = hierarquizarBalancete(nucleo, contas);
        const p: Pagina[] = paginarBalancete(linhas, n);

        const soma = somar(zero(), p.flatMap((pg) => pg.linhas));
        expect(txt(soma)).toEqual(txt(nucleo.totais));
        const ultima = p[p.length - 1]!;
        expect(txt(somar(ultima.transporte ?? zero(), ultima.linhas))).toEqual(txt(nucleo.totais));
      }),
      { numRuns: Number(process.env.FC_RUNS ?? 300) },
    );
  });
});
