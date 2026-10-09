// ---------------------------------------------------------------------------
// Balancete de verificação PHC — oráculo PROPERTY-BASED da hierarquia
// (`hierarquizarBalancete`). Run balancete-phc, S2 (#281), ADR-0040 §5, contrato
// .scratch/sdlc/balancete-phc/S2-contrato.md (incl. «Esclarecimentos» e
// «Esclarecimentos 2»).
//
// Escrito pelo AUTOR DO ORÁCULO. NUNCA `vitest -u`; um agente de implementação
// que altere este ficheiro é BLOCKER.
//
// O núcleo é montado com o `montarBalanceteVerificacao` REAL (S1). Os planos são
// aleatórios e propositadamente CORROMPIDOS: órfãos, auto-ciclos, ciclos de 2 e 3,
// nível 1 com mãe, filhas de classe diferente da mãe, mães de classe sem linhas
// próprias, agregados de contas fora do plano (outro tenant).
//
//   P1  termina sem lançar (cerca contra ciclos + RangeError = falha)
//   P2  cada linha do núcleo aparece exactamente uma vez como CONTA; ≤ 1 SINTETICA,
//       existe ⇔ o núcleo tem a sintética, e vem logo antes do SUBTOTAL da classe 8;
//       ≤ 1 SUBTOTAL por classe, por ordem de classe
//   P3  Σ SUBTOTAL_CLASSE = totais do núcleo; cada SUBTOTAL = Σ das linhas do núcleo
//       da classe PRÓPRIA (+ sintética na 8)
//   P4  (só em planos BEM-FORMADOS — ver nota) estrutura em árvore e roll-up: o que
//       aparece por baixo de uma conta é o que ela soma
//   P5  saldos: nunca negativos, no máximo um não nulo, saldoD − saldoC = acumD − acumC
//   P6  nivelMaximo / apenasRazao não mudam subtotais nem os valores das linhas
//       visíveis, e escondem o que têm de esconder; uma raiz efectiva nunca
//       desaparece e a cadeia de uma raiz órfã segue o grau relativo (#298)
//   P7  pureza: o núcleo e as contas ficam intactos; duas chamadas dão o mesmo
//
// Nota sobre P4: `LinhaHierarquica.nivel` é o nível DA CONTA, que num plano
// corrompido não coincide com a profundidade a que a linha é mostrada; e o
// contrato não define sem ambiguidade a mãe efectiva em todas as formas de ciclo
// (ex.: cadeia que entra num ciclo que não a contém). Por isso P4 corre sobre um
// gerador separado de planos bem-formados (acíclicos, nivel = profundidade,
// classe = classe da raiz, mãe sempre dentro do plano), onde a profundidade se lê
// pelo `nivel` e pela ordem. Nos planos corrompidos valem P1–P3, P5–P7.
//
// Reprodução: FC_SEED=<n> fixa a semente (o fast-check imprime-a na falha);
// FC_RUNS=<n> muda o número de corridas (omissão 500).
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import {
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type BalanceteVerificacaoNucleo,
  type ContaBV,
  type LinhaBV,
  type LinhaHierarquica,
} from '../balancete-verificacao';

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

const SEMENTE = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const CORRIDAS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 500;
const PARAMS = { numRuns: CORRIDAS, ...(SEMENTE === undefined ? {} : { seed: SEMENTE }) };

const CLASSES: ClassePGC[] = [
  'CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8',
];
const COLS_VALOR = ['movD', 'movC', 'acumD', 'acumC'] as const;
type Valores = Record<(typeof COLS_VALOR)[number], Decimal>;

// ---------------------------------------------------------------------------
// Cenário (dados simples, para o contra-exemplo encolhido ser legível)
// ---------------------------------------------------------------------------

/** Mãe: null, índice de outra conta do plano (mod n), id fora do plano, ou a própria. */
type MaeSpec = null | number | 'fora' | 'propria';

interface ContaSpec {
  codigo: string;
  classe: number; // 1..8
  natureza: 'D' | 'C';
  nivel: number; // 1..7
  mae: MaeSpec;
  aceita: boolean;
}

/** Agregado: alvo = índice no plano (mod n) ou conta de outro tenant. */
interface AgSpec {
  alvo: number | 'fora';
  tipo: 'D' | 'C';
  centimos: number | null;
}

interface Cenario {
  contas: ContaSpec[];
  movimento: AgSpec[];
  acumulado: AgSpec[];
  anteriores: AgSpec[] | null;
}

const arbAg: fc.Arbitrary<AgSpec> = fc.record({
  alvo: fc.oneof({ weight: 6, arbitrary: fc.nat(39) }, { weight: 1, arbitrary: fc.constant('fora' as const) }),
  tipo: fc.constantFrom('D' as const, 'C' as const),
  centimos: fc.oneof({ weight: 9, arbitrary: fc.nat(1_000_000) }, { weight: 1, arbitrary: fc.constant(null) }),
});

const arbAgregados = (contas: fc.Arbitrary<ContaSpec[]>): fc.Arbitrary<Cenario> =>
  fc.record({
    contas,
    movimento: fc.array(arbAg, { maxLength: 30 }),
    acumulado: fc.array(arbAg, { maxLength: 30 }),
    anteriores: fc.oneof(
      { weight: 1, arbitrary: fc.constant(null) },
      { weight: 3, arbitrary: fc.array(arbAg, { maxLength: 30 }) },
    ),
  });

const arbCodigo = fc.stringMatching(/^[0-9]{1,7}$/);
const arbClasse = fc.integer({ min: 1, max: 8 });
const arbNatureza = fc.constantFrom('D' as const, 'C' as const);

/** Plano CORROMPIDO: mães arbitrárias (árvores, órfãos, auto-ciclos, ciclos, classes trocadas). */
const arbCenarioCorrompido: fc.Arbitrary<Cenario> = arbAgregados(
  fc.uniqueArray(
    fc.record({
      codigo: arbCodigo,
      classe: arbClasse,
      natureza: arbNatureza,
      nivel: fc.integer({ min: 1, max: 7 }),
      mae: fc.oneof(
        { weight: 5, arbitrary: fc.nat(39) as fc.Arbitrary<MaeSpec> },
        { weight: 2, arbitrary: fc.constant(null) },
        { weight: 1, arbitrary: fc.constant('fora' as const) },
        { weight: 1, arbitrary: fc.constant('propria' as const) },
      ),
      aceita: fc.boolean(),
    }),
    { minLength: 1, maxLength: 40, selector: (c) => c.codigo },
  ),
);

/**
 * Plano BEM-FORMADO (para P4): a conta i só pode ter mãe j < i (acíclico), a mãe
 * está sempre no plano, nivel = profundidade (≤ 7), classe = classe da raiz,
 * nível 1 ⇔ sem mãe. `mae` aqui é índice cru, resolvido em `bemFormado`.
 */
const arbCenarioBemFormado: fc.Arbitrary<Cenario> = arbAgregados(
  fc
    .uniqueArray(
      fc.record({
        codigo: arbCodigo,
        classe: arbClasse,
        natureza: arbNatureza,
        nivel: fc.constant(1),
        mae: fc.option(fc.nat(39), { freq: 4 }) as fc.Arbitrary<MaeSpec>,
        aceita: fc.boolean(),
      }),
      { minLength: 1, maxLength: 40, selector: (c) => c.codigo },
    )
    .map(bemFormado),
);

function bemFormado(specs: ContaSpec[]): ContaSpec[] {
  const out: ContaSpec[] = [];
  specs.forEach((s, i) => {
    let mae: number | null = typeof s.mae === 'number' && i > 0 ? s.mae % i : null;
    if (mae !== null && out[mae]!.nivel >= 7) mae = null;
    out.push(
      mae === null
        ? { ...s, mae: null, nivel: 1 }
        : { ...s, mae, nivel: out[mae]!.nivel + 1, classe: out[mae]!.classe },
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// Construção das entradas reais + CERCA contra ciclos
// ---------------------------------------------------------------------------

/**
 * Cada conta tem `contaMaeId` como getter que conta leituras; armado só durante a
 * chamada a `hierarquizarBalancete`. Uma implementação que não termina passa o
 * limite e lança em vez de bloquear o event loop (o timeout do vitest não
 * interrompe um `while` síncrono). Limite generoso — 20·(n+1)² + 1000 — para
 * nenhuma implementação finita e razoável (várias passagens quadráticas) o sentir.
 */
interface PlanoCercado {
  contas: ContaBV[];
  armar(): void;
  desarmar(): void;
}

function construirPlano(specs: ContaSpec[]): PlanoCercado {
  const n = specs.length;
  const limite = 20 * (n + 1) * (n + 1) + 1000;
  let leituras = 0;
  let armado = false;
  const idDe = (i: number) => `id-${specs[i]!.codigo}`;
  const contas = specs.map((s, i) => {
    const contaMaeId =
      s.mae === null ? null
        : s.mae === 'fora' ? `id-fora-${s.codigo}`
          : s.mae === 'propria' ? idDe(i)
            : idDe(s.mae % n);
    const c = {
      id: idDe(i),
      codigo: s.codigo,
      nome: `Conta ${s.codigo}`,
      classe: CLASSES[s.classe - 1]!,
      natureza: (s.natureza === 'D' ? 'DEVEDORA' : 'CREDORA') as NaturezaConta,
      nivel: s.nivel,
      aceitaLancamento: s.aceita,
    } as ContaBV;
    Object.defineProperty(c, 'contaMaeId', {
      enumerable: true,
      get() {
        if (armado && ++leituras > limite) {
          throw new Error(`cerca: contaMaeId lido mais de ${limite} vezes — ciclo não detectado`);
        }
        return contaMaeId;
      },
    });
    return c;
  });
  return {
    contas,
    armar: () => { leituras = 0; armado = true; },
    desarmar: () => { armado = false; },
  };
}

function agregados(specs: AgSpec[], contas: ContaBV[]): AgregadoPartidaBV[] {
  return specs.map((a) => ({
    contaId: a.alvo === 'fora' ? 'id-outro-tenant' : contas[a.alvo % contas.length]!.id,
    tipo: a.tipo === 'D' ? 'DEBITO' : 'CREDITO',
    _sum: { valor: a.centimos === null ? null : new Prisma.Decimal(a.centimos).dividedBy(100) },
  }));
}

function montar(c: Cenario): { plano: PlanoCercado; nucleo: BalanceteVerificacaoNucleo } {
  const plano = construirPlano(c.contas);
  const nucleo = montarBalanceteVerificacao({
    contas: plano.contas,
    movimento: agregados(c.movimento, plano.contas),
    acumulado: agregados(c.acumulado, plano.contas),
    anteriores: c.anteriores === null ? null : agregados(c.anteriores, plano.contas),
  });
  return { plano, nucleo };
}

type Opcoes = { nivelMaximo?: number; apenasRazao?: boolean };

/** Chama com a cerca armada; qualquer excepção (cerca, RangeError de recursão) é falha da propriedade. */
function hierarquizar(plano: PlanoCercado, nucleo: BalanceteVerificacaoNucleo, opcoes?: Opcoes): LinhaHierarquica[] {
  plano.armar();
  try {
    return hierarquizarBalancete(nucleo, plano.contas, opcoes);
  } catch (e) {
    const motivo = e instanceof RangeError ? `RangeError (recursão infinita?): ${e.message}` : String((e as Error).message ?? e);
    throw new Error(`hierarquizarBalancete não terminou bem — ${motivo}`);
  } finally {
    plano.desarmar();
  }
}

// ---------------------------------------------------------------------------
// Helpers de asserção
// ---------------------------------------------------------------------------

const soma = (ls: Pick<LinhaBV, keyof Valores>[]): Valores => {
  const r: Valores = { movD: ZERO, movC: ZERO, acumD: ZERO, acumC: ZERO };
  for (const l of ls) for (const k of COLS_VALOR) r[k] = r[k].plus(l[k]);
  return r;
};

function mesmos(a: Valores, b: Valores, onde: string): void {
  for (const k of COLS_VALOR) {
    expect(a[k].equals(b[k]), `${onde}.${k}: ${a[k].toFixed()} ≠ ${b[k].toFixed()}`).toBe(true);
  }
}

const rotulo = (l: LinhaHierarquica) =>
  l.tipo === 'CONTA' ? l.conta!.codigo : l.tipo === 'SINTETICA' ? 'SINT' : `SUB:${l.classe.slice(-1)}`;

/** Representação estável (Decimal → texto, chaves ordenadas) para comparar estruturas. */
function serial(v: unknown): unknown {
  if (v instanceof Prisma.Decimal) return `D:${v.toFixed()}`;
  if (Array.isArray(v)) return v.map(serial);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, serial(o[k])]));
  }
  return v;
}

const linhasNucleoComConta = (n: BalanceteVerificacaoNucleo) => n.linhas.filter((l) => l.conta !== null);
const sinteticaDo = (n: BalanceteVerificacaoNucleo) => n.linhas.find((l) => l.conta === null);

function subtotalEsperado(nucleo: BalanceteVerificacaoNucleo, classe: ClassePGC): Valores {
  const linhas: LinhaBV[] = linhasNucleoComConta(nucleo).filter((l) => l.conta!.classe === classe);
  const s = sinteticaDo(nucleo);
  if (classe === 'CLASSE_8' && s) linhas.push(s);
  return soma(linhas);
}

function valoresDe(l: LinhaHierarquica | LinhaBV | undefined): Valores {
  return l ? { movD: l.movD, movC: l.movC, acumD: l.acumD, acumC: l.acumC } : soma([]);
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('hierarquizarBalancete — propriedades (planos aleatórios e corrompidos)', () => {
  it('P1 termina sem lançar, com e sem opções', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioCorrompido, fc.integer({ min: 1, max: 7 }), (c, k) => {
        const { plano, nucleo } = montar(c);
        hierarquizar(plano, nucleo);
        hierarquizar(plano, nucleo, { nivelMaximo: k });
        hierarquizar(plano, nucleo, { apenasRazao: true });
      }),
      PARAMS,
    );
  });

  it('P2 cada linha do núcleo aparece uma vez como CONTA; sintética e subtotais bem colocados', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioCorrompido, (c) => {
        const { plano, nucleo } = montar(c);
        const h = hierarquizar(plano, nucleo);
        const idsConta = h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id);
        expect(new Set(idsConta).size, `conta repetida: ${h.map(rotulo).join(' ')}`).toBe(idsConta.length);
        const presentes = new Set(idsConta);
        for (const l of linhasNucleoComConta(nucleo)) {
          expect(presentes.has(l.conta!.id), `linha do núcleo ${l.conta!.codigo} em falta: ${h.map(rotulo).join(' ')}`).toBe(true);
        }

        const sint = h.filter((l) => l.tipo === 'SINTETICA');
        expect(sint.length, 'mais de uma SINTETICA').toBeLessThanOrEqual(1);
        expect(sint.length === 1, 'SINTETICA existe ⇔ núcleo tem sintética').toBe(nucleo.temResultadosAnterioresPorEncerrar);
        if (sint.length === 1) {
          const i = h.indexOf(sint[0]!);
          const seguinte = h[i + 1];
          expect(seguinte?.tipo === 'SUBTOTAL_CLASSE' && seguinte.classe === 'CLASSE_8', 'SINTETICA logo antes do SUB:8').toBe(true);
        }

        const subs = h.filter((l) => l.tipo === 'SUBTOTAL_CLASSE').map((l) => CLASSES.indexOf(l.classe));
        for (let i = 1; i < subs.length; i++) {
          expect(subs[i]! > subs[i - 1]!, `subtotais fora de ordem ou repetidos: ${h.map(rotulo).join(' ')}`).toBe(true);
        }
      }),
      PARAMS,
    );
  });

  it('P3 Σ subtotais = totais do núcleo; cada subtotal = Σ das linhas do núcleo da sua classe (+ sintética na 8)', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioCorrompido, (c) => {
        const { plano, nucleo } = montar(c);
        const h = hierarquizar(plano, nucleo);
        const subs = h.filter((l) => l.tipo === 'SUBTOTAL_CLASSE');
        mesmos(soma(subs), valoresDe(nucleo.totais as unknown as LinhaBV), 'Σ subtotais vs totais');
        for (const classe of CLASSES) {
          const linha = subs.find((l) => l.classe === classe);
          mesmos(valoresDe(linha), subtotalEsperado(nucleo, classe), `SUB:${classe.slice(-1)}`);
        }
      }),
      PARAMS,
    );
  });

  it('P4 (plano bem-formado) árvore em pré-ordem e roll-up: o que aparece por baixo de uma conta é o que ela soma', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioBemFormado, (c) => {
        const { plano, nucleo } = montar(c);
        const h = hierarquizar(plano, nucleo);
        const mapa = h.map(rotulo).join(' ');
        const contaPorId = new Map(plano.contas.map((k) => [k.id, k]));
        const doNucleo = new Map(linhasNucleoComConta(nucleo).map((l) => [l.conta!.id, l]));

        // Contas mostradas = linhas do núcleo + todas as suas mães (cadeia contaMaeId).
        const esperadas = new Set<string>();
        for (const id of doNucleo.keys()) {
          for (let cur: string | null = id; cur !== null; cur = contaPorId.get(cur)!.contaMaeId) esperadas.add(cur);
        }
        const mostradas = h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id);
        expect(new Set(mostradas), `contas mostradas: ${mapa}`).toEqual(esperadas);

        // Blocos por classe crescente; cada linha CONTA é da classe do bloco que o SUBTOTAL fecha.
        let bloco: LinhaHierarquica[] = [];
        for (const l of h) {
          if (l.tipo !== 'SUBTOTAL_CLASSE') { bloco.push(l); continue; }
          for (const b of bloco) expect(b.classe, `linha ${rotulo(b)} fora do bloco ${l.classe}: ${mapa}`).toBe(l.classe);
          bloco = [];
        }
        expect(bloco.length, `linhas depois do último subtotal: ${mapa}`).toBe(0);

        const filhasPorMae = new Map<string, string[]>();
        h.forEach((l, i) => {
          if (l.tipo !== 'CONTA') return;
          const conta = l.conta!;
          const n = l.nivel;
          expect(n, `nivel da linha ${conta.codigo}`).toBe(conta.nivel);

          // Mãe = CONTA anterior mais próxima com nível n−1, sem subtotal pelo meio.
          let mae: string | null = null;
          for (let j = i - 1; j >= 0 && h[j]!.tipo === 'CONTA'; j--) {
            if (h[j]!.nivel < n) { mae = h[j]!.nivel === n - 1 ? h[j]!.conta!.id : 'nivel-errado'; break; }
          }
          expect(mae, `mãe mostrada de ${conta.codigo}: ${mapa}`).toBe(conta.contaMaeId);
          const chaveMae = mae ?? `raiz:${l.classe}`;
          filhasPorMae.set(chaveMae, [...(filhasPorMae.get(chaveMae) ?? []), conta.codigo]);

          // Descendentes mostrados = linhas CONTA contíguas seguintes com nível maior.
          const desc: LinhaHierarquica[] = [];
          for (let j = i + 1; j < h.length && h[j]!.tipo === 'CONTA' && h[j]!.nivel > n; j++) desc.push(h[j]!);
          const esperado = soma([
            ...(doNucleo.has(conta.id) ? [doNucleo.get(conta.id)!] : []),
            ...desc.filter((d) => doNucleo.has(d.conta!.id)).map((d) => doNucleo.get(d.conta!.id)!),
          ]);
          mesmos(valoresDe(l), esperado, `roll-up de ${conta.codigo} (${mapa})`);
          expect(l.agregadora, `agregadora de ${conta.codigo}`).toBe(desc.length > 0);
          expect(l.contraNatureza, `contraNatureza de ${conta.codigo}`).toBe(
            desc.length > 0 ? false : doNucleo.get(conta.id)!.contraNatureza,
          );
          expect(l.implicita, `implicita de ${conta.codigo}`).toBe(false);
        });

        // Irmãs por código (texto).
        for (const [mae, codigos] of filhasPorMae) {
          expect(codigos, `ordem das filhas de ${mae}: ${mapa}`).toEqual([...codigos].sort());
        }
      }),
      PARAMS,
    );
  });

  it('P5 saldos: nunca negativos, no máximo um não nulo, saldoDevedor − saldoCredor = acumD − acumC', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioCorrompido, fc.option(fc.integer({ min: 1, max: 7 })), (c, k) => {
        const { plano, nucleo } = montar(c);
        const h = hierarquizar(plano, nucleo, k === null ? undefined : { nivelMaximo: k });
        for (const l of h) {
          const onde = rotulo(l);
          expect(l.saldoDevedor.isNegative() && !l.saldoDevedor.isZero(), `${onde}: saldoDevedor negativo`).toBe(false);
          expect(l.saldoCredor.isNegative() && !l.saldoCredor.isZero(), `${onde}: saldoCredor negativo`).toBe(false);
          expect(!l.saldoDevedor.isZero() && !l.saldoCredor.isZero(), `${onde}: os dois saldos não nulos`).toBe(false);
          expect(
            l.saldoDevedor.minus(l.saldoCredor).equals(l.acumD.minus(l.acumC)),
            `${onde}: saldo ${l.saldoDevedor.toFixed()}/${l.saldoCredor.toFixed()} vs acum ${l.acumD.toFixed()}/${l.acumC.toFixed()}`,
          ).toBe(true);
        }
      }),
      PARAMS,
    );
  });

  it('P6 nivelMaximo e apenasRazao: subtotais e valores visíveis inalterados; nada acima do grau; razão só nível 2', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(
        arbCenarioCorrompido,
        fc.integer({ min: 1, max: 7 }),
        fc.boolean(),
        (c, k, razao) => {
          const { plano, nucleo } = montar(c);
          const base = hierarquizar(plano, nucleo);
          const h = hierarquizar(plano, nucleo, { nivelMaximo: k, apenasRazao: razao });
          const naoConta = (ls: LinhaHierarquica[]) => ls.filter((l) => l.tipo !== 'CONTA');
          expect(serial(naoConta(h)), 'subtotais/sintética mudaram com as opções').toEqual(serial(naoConta(base)));

          const baseId = new Map(base.filter((l) => l.tipo === 'CONTA').map((l) => [l.conta!.id, l]));
          // #298: a árvore efectiva lê-se da base (sem opções tudo passa ⇒ maeMostradaId = mãe
          // efectiva). Uma raiz efectiva de nível > 1 é ÓRFÃ: o grau dela e da sua cadeia é
          // RELATIVO (o oráculo exacto está em balancete-orfa-grau-298.test.ts); as cadeias de
          // raiz de nível 1 mantêm a regra absoluta abaixo, sem relaxamento.
          const raizDe = (id: string): LinhaHierarquica => {
            let r = baseId.get(id)!;
            for (let passos = 0; r.maeMostradaId !== null && passos <= baseId.size; passos++) r = baseId.get(r.maeMostradaId)!;
            return r;
          };
          const naCadeiaNivel1 = (id: string) => raizDe(id).nivel === 1;
          for (const l of h.filter((x) => x.tipo === 'CONTA')) {
            const b = baseId.get(l.conta!.id);
            expect(b, `${l.conta!.codigo} aparece com opções mas não sem elas`).toBeDefined();
            if (naCadeiaNivel1(l.conta!.id)) {
              if (razao) expect(l.nivel, `apenasRazao mostra ${l.conta!.codigo} de nível ${l.nivel}`).toBe(2);
              else expect(l.nivel, `nivelMaximo ${k} mostra ${l.conta!.codigo}`).toBeLessThanOrEqual(k);
            }
            mesmos(valoresDe(l), valoresDe(b), `${l.conta!.codigo} com opções`);
          }
          // Esconder não inventa nem perde: tudo o que é visível sem opções e passa o filtro continua lá.
          const ids = new Set(h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id));
          for (const b of baseId.values()) {
            const raiz = raizDe(b.conta!.id);
            // Grau relativo ≤ nível próprio, por isso «nível ≤ k» obriga em qualquer cadeia.
            const passa = razao ? b.nivel === 2 && raiz.nivel === 1 : b.nivel <= k;
            if (passa) expect(ids.has(b.conta!.id), `${b.conta!.codigo} desapareceu com as opções`).toBe(true);
            // #298: uma raiz (órfã ou não) nunca desaparece com «Grau máximo»; a órfã nem com «Só razão».
            if (raiz === b && (!razao || b.nivel > 1)) {
              expect(ids.has(b.conta!.id), `raiz ${b.conta!.codigo} (nível ${b.nivel}) desapareceu com as opções`).toBe(true);
            }
          }
        },
      ),
      PARAMS,
    );
  });

  it('P7 pura: núcleo e contas intactos; duas chamadas iguais', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioCorrompido, fc.option(fc.integer({ min: 1, max: 7 })), (c, k) => {
        const { plano, nucleo } = montar(c);
        const opcoes = k === null ? undefined : { nivelMaximo: k };
        const antesNucleo = serial(nucleo);
        const antesContas = serial(plano.contas);
        const a = hierarquizar(plano, nucleo, opcoes);
        expect(serial(nucleo), 'núcleo alterado').toEqual(antesNucleo);
        expect(serial(plano.contas), 'contas alteradas').toEqual(antesContas);
        const b = hierarquizar(plano, nucleo, opcoes);
        expect(serial(b), 'segunda chamada difere').toEqual(serial(a));
      }),
      PARAMS,
    );
  });
});

// ---------------------------------------------------------------------------
// Exemplos (G5 iter 3, 2026-10-01) — dois MINOR fixados em casos concretos.
// ---------------------------------------------------------------------------

describe('hierarquizarBalancete — exemplos (G5 iter 3)', () => {
  const D = (v: string) => new Prisma.Decimal(v);
  const conta = (codigo: string, nivel: number, mae: string | null, natureza: NaturezaConta = 'DEVEDORA'): ContaBV => ({
    id: `id-${codigo}`, codigo, nome: `Conta ${codigo}`, classe: 'CLASSE_1', natureza, nivel,
    contaMaeId: mae, aceitaLancamento: true,
  });
  const ag = (codigo: string, tipo: 'DEBITO' | 'CREDITO', v: string): AgregadoPartidaBV => ({
    contaId: `id-${codigo}`, tipo, _sum: { valor: D(v) },
  });
  const linha = (h: LinhaHierarquica[], codigo: string) => h.find((l) => l.tipo === 'CONTA' && l.conta!.codigo === codigo);
  const nucleoDe = (contas: ContaBV[], mov: AgregadoPartidaBV[]) =>
    montarBalanceteVerificacao({ contas, movimento: mov, acumulado: mov, anteriores: [] });

  it('E1 conta de nível 1 com contaMaeId fora do plano é RAIZ do bloco, mesmo havendo outra conta de nível 1 da classe', { timeout: 2000 }, () => {
    // «Esclarecimentos 2»: nível 1 com mãe fora da lista é raiz do seu bloco.
    const contas = [conta('1', 1, null), conta('11', 2, 'id-1'), conta('19', 1, 'id-fora-do-plano')];
    const mov = [ag('11', 'DEBITO', '100'), ag('19', 'DEBITO', '30')];
    const h = hierarquizarBalancete(nucleoDe(contas, mov), contas);
    // Raízes por código: «1» (com 11) e depois «19», ambas no topo do bloco.
    expect(h.map(rotulo)).toEqual(['1', '11', '19', 'SUB:1']);
    // «1» só soma 11 — 19 não está na sua descendência.
    mesmos(valoresDe(linha(h, '1')), { movD: D('100'), movC: ZERO, acumD: D('100'), acumC: ZERO }, '1');
    expect(linha(h, '1')!.saldoDevedor.equals(D('100')), '1.saldoDevedor').toBe(true);
    mesmos(valoresDe(linha(h, '19')), { movD: D('30'), movC: ZERO, acumD: D('30'), acumC: ZERO }, '19');
    expect(linha(h, '19')!.agregadora, '19 não é agregadora').toBe(false);
    expect(linha(h, '19')!.nivel, '19 mostrada como nível 1').toBe(1);
  });

  it('E2 contraNatureza segue o saldo MOSTRADO (roll-up) numa conta não agregadora com linha própria e filhas escondidas', { timeout: 2000 }, () => {
    // 11 DEVEDORA com partidas próprias (C10, regra S1 b) e filha 111 (D50).
    // Núcleo: 11 credor 10 ⇒ contra natureza no núcleo. Com nivelMaximo 2, 111 fica
    // escondida, 11 deixa de ser agregadora e mostra o roll-up: devedor 40 ⇒ NÃO
    // está contra a natureza. Regra: em linha CONTA não agregadora,
    // contraNatureza = (DEVEDORA ∧ saldoCredor mostrado > 0) ∨ (CREDORA ∧ saldoDevedor mostrado > 0);
    // em agregadora, false.
    const contas = [conta('1', 1, null), conta('11', 2, 'id-1'), conta('111', 3, 'id-11')];
    const mov = [ag('11', 'CREDITO', '10'), ag('111', 'DEBITO', '50')];
    const nucleo = nucleoDe(contas, mov);
    expect(nucleo.linhas.find((l) => l.conta?.codigo === '11')!.contraNatureza, 'premissa: 11 contra natureza no núcleo').toBe(true);

    const h = hierarquizarBalancete(nucleo, contas, { nivelMaximo: 2 });
    expect(h.map(rotulo)).toEqual(['1', '11', 'SUB:1']);
    const l11 = linha(h, '11')!;
    mesmos(valoresDe(l11), { movD: D('50'), movC: D('10'), acumD: D('50'), acumC: D('10') }, '11');
    expect(l11.saldoDevedor.equals(D('40')), `11.saldoDevedor ${l11.saldoDevedor.toFixed()}`).toBe(true);
    expect(l11.saldoCredor.isZero(), '11.saldoCredor').toBe(true);
    expect(l11.agregadora, '11 sem filhas visíveis não é agregadora').toBe(false);
    expect(l11.contraNatureza, '11 mostra devedor 40 numa conta DEVEDORA ⇒ não está contra a natureza').toBe(false);
    expect(linha(h, '1')!.contraNatureza, '1 agregadora ⇒ false').toBe(false);
  });
});
