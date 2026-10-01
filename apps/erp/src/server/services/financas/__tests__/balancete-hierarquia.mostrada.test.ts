// ---------------------------------------------------------------------------
// Balancete de verificação PHC — oráculo dos campos `maeMostradaId` e
// `profundidade` de `hierarquizarBalancete`. Run balancete-phc, S3 (#283),
// contrato .scratch/sdlc/balancete-phc/S3-contrato.md «Esclarecimentos 2»:
//
//   maeMostradaId: id da conta da linha CONTA mostrada imediatamente acima na
//     árvore EFECTIVA — o antepassado visível mais próximo depois de
//     nivelMaximo/apenasRazao; null nas raízes, SUBTOTAL_CLASSE e SINTETICA.
//   profundidade: 0 nas raízes do bloco, +1 por cada mãe mostrada;
//     SUBTOTAL_CLASSE 0; SINTETICA 1. `nivel` continua a ser o nível próprio.
//
// Escrito pelo AUTOR DO ORÁCULO antes de os campos existirem. Os campos lêem-se
// por cast para o ficheiro compilar antes. NUNCA `vitest -u`; um agente de
// implementação que altere este ficheiro é BLOCKER.
//
// Propriedades (planos bem-formados e CORROMPIDOS, com opções aleatórias):
//   H1  SUBTOTAL/SINTETICA: mãe null, profundidade 0/1; CONTA: maeMostradaId é null
//       ou o id de uma linha CONTA ANTERIOR do mesmo bloco; profundidade = 0 na
//       raiz, profundidade(mãe) + 1 nas outras
//   H2  pré-ordem: as linhas entre a mãe e a filha são todas descendentes da mãe
//   H3  quando a cadeia DECLARADA de contaMaeId de uma conta é válida (fica no plano,
//       sem ciclos, acaba em null) a árvore efectiva é a declarada: maeMostradaId =
//       primeira conta MOSTRADA nessa cadeia (null se nenhuma)
//   H4  `nivel` continua a ser conta.nivel
//
// Reprodução: FC_SEED=<n>, FC_RUNS=<n> (omissão 300).
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
  type LinhaHierarquica,
} from '../balancete-verificacao';

const SEMENTE = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const CORRIDAS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 300;
const PARAMS = { numRuns: CORRIDAS, ...(SEMENTE === undefined ? {} : { seed: SEMENTE }) };

const CLASSES: ClassePGC[] = [
  'CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8',
];

const maeDe = (l: LinhaHierarquica): string | null | undefined =>
  (l as { maeMostradaId?: string | null }).maeMostradaId;
const profDe = (l: LinhaHierarquica): number | undefined => (l as { profundidade?: number }).profundidade;

const rotulo = (l: LinhaHierarquica) =>
  l.tipo === 'CONTA' ? l.conta!.codigo : l.tipo === 'SINTETICA' ? 'SINT' : `SUB:${l.classe.slice(-1)}`;

/** «código(mãe→profundidade)» de cada linha, para comparar de uma vez. */
const forma = (h: LinhaHierarquica[]) =>
  h.map((l) => `${rotulo(l)}<${maeDe(l) === null ? '-' : String(maeDe(l)).replace(/^id-/, '')}>${String(profDe(l))}`);

// ---------------------------------------------------------------------------
// Exemplos
// ---------------------------------------------------------------------------

const D = (v: string) => new Prisma.Decimal(v);
function conta(
  codigo: string, classe: ClassePGC, nivel: number, mae: string | null, aceita = true,
  natureza: NaturezaConta = 'DEVEDORA',
): ContaBV {
  return {
    id: `id-${codigo}`, codigo, nome: `Conta ${codigo}`, classe, natureza, nivel,
    contaMaeId: mae === null ? null : `id-${mae}`, aceitaLancamento: aceita,
  };
}
const ag = (codigo: string, tipo: 'DEBITO' | 'CREDITO', v: string): AgregadoPartidaBV => ({
  contaId: `id-${codigo}`, tipo, _sum: { valor: D(v) },
});
const nucleoDe = (contas: ContaBV[], mov: AgregadoPartidaBV[], anteriores: AgregadoPartidaBV[] = []) =>
  montarBalanceteVerificacao({ contas, movimento: mov, acumulado: mov, anteriores });

describe('hierarquizarBalancete — maeMostradaId e profundidade (exemplos)', () => {
  const contas = [
    conta('1', 'CLASSE_1', 1, null, false),
    conta('11', 'CLASSE_1', 2, '1', false),
    conta('111', 'CLASSE_1', 3, '11', false),
    conta('1111', 'CLASSE_1', 4, '111'),
    conta('12', 'CLASSE_1', 2, '1'),
    conta('5', 'CLASSE_5', 1, null, false),
    conta('51', 'CLASSE_5', 2, 'fantasma'), // cadeia partida ⇒ pendura-se em 5
    conta('6', 'CLASSE_6', 1, null, false),
    conta('69', 'CLASSE_6', 2, '6', false),
    conta('698', 'CLASSE_6', 3, '69', false),
    conta('6981', 'CLASSE_6', 4, '698'),
    conta('63299', 'CLASSE_6', 5, null), // raiz órfã de nível 5 (demo)
  ];
  const mov = [
    ag('1111', 'DEBITO', '10'), ag('12', 'DEBITO', '5'), ag('51', 'CREDITO', '15'),
    ag('6981', 'DEBITO', '7'), ag('63299', 'DEBITO', '3'),
  ];
  // 6981 em anos anteriores (classe 6) ⇒ linha sintética no bloco 8.
  const nucleo = nucleoDe(contas, mov, [ag('6981', 'DEBITO', '2')]);

  it('sem opções: mãe = mãe efectiva; profundidade pela árvore; SUB 0, SINT 1', () => {
    expect(forma(hierarquizarBalancete(nucleo, contas))).toEqual([
      '1<->0', '11<1>1', '111<11>2', '1111<111>3', '12<1>1', 'SUB:1<->0',
      '5<->0', '51<5>1', 'SUB:5<->0',
      '6<->0', '69<6>1', '698<69>2', '6981<698>3', '63299<->0', 'SUB:6<->0',
      'SINT<->1', 'SUB:8<->0',
    ]);
  });

  it('nivelMaximo 2: a mãe é o antepassado VISÍVEL mais próximo', () => {
    expect(forma(hierarquizarBalancete(nucleo, contas, { nivelMaximo: 2 }))).toEqual([
      '1<->0', '11<1>1', '12<1>1', 'SUB:1<->0',
      '5<->0', '51<5>1', 'SUB:5<->0',
      '6<->0', '69<6>1', 'SUB:6<->0',
      'SINT<->1', 'SUB:8<->0',
    ]);
  });

  it('apenasRazao: só nível 2, todas raízes (profundidade 0)', () => {
    expect(forma(hierarquizarBalancete(nucleo, contas, { apenasRazao: true }))).toEqual([
      '11<->0', '12<->0', 'SUB:1<->0', '51<->0', 'SUB:5<->0', '69<->0', 'SUB:6<->0', 'SINT<->1', 'SUB:8<->0',
    ]);
  });

  it('nível próprio intacto: 63299 mantém nivel 5 com profundidade 0', () => {
    const l = hierarquizarBalancete(nucleo, contas).find((x) => rotulo(x) === '63299')!;
    expect(l.nivel).toBe(5);
    expect(profDe(l)).toBe(0);
  });

  it('mãe escondida que salta níveis (plano corrompido): filha pendura-se no antepassado visível', () => {
    // 7 › 79 (nível 5!) › 791 (nível 2). Com nivelMaximo 3, 79 esconde-se e 791 fica sob 7.
    const cs = [conta('7', 'CLASSE_7', 1, null, false), conta('79', 'CLASSE_7', 5, '7', false), conta('791', 'CLASSE_7', 2, '79')];
    const n = nucleoDe(cs, [ag('791', 'CREDITO', '9')]);
    expect(forma(hierarquizarBalancete(n, cs))).toEqual(['7<->0', '79<7>1', '791<79>2', 'SUB:7<->0']);
    expect(forma(hierarquizarBalancete(n, cs, { nivelMaximo: 3 }))).toEqual(['7<->0', '791<7>1', 'SUB:7<->0']);
  });

  it('incluirSemMovimento: contas a zeros também com mãe e profundidade', () => {
    const cs = [conta('2', 'CLASSE_2', 1, null, false), conta('21', 'CLASSE_2', 2, '2', false), conta('211', 'CLASSE_2', 3, '21')];
    const n = nucleoDe([...cs, conta('11', 'CLASSE_1', 1, null)], [ag('11', 'DEBITO', '1')]);
    const h = hierarquizarBalancete(n, [...cs, conta('11', 'CLASSE_1', 1, null)], { incluirSemMovimento: true });
    expect(forma(h)).toEqual(['11<->0', 'SUB:1<->0', '2<->0', '21<2>1', '211<21>2']);
  });
});

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

type MaeSpec = null | number | 'fora' | 'propria';
interface ContaSpec { codigo: string; classe: number; natureza: 'D' | 'C'; nivel: number; mae: MaeSpec; aceita: boolean }
interface AgSpec { alvo: number | 'fora'; tipo: 'D' | 'C'; centimos: number | null }
interface Cenario { contas: ContaSpec[]; movimento: AgSpec[]; acumulado: AgSpec[]; anteriores: AgSpec[] | null }

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
const arbCodigo = fc.stringMatching(/^[0-9]{1,5}$/);

const arbCenarioCorrompido: fc.Arbitrary<Cenario> = arbAgregados(
  fc.uniqueArray(
    fc.record({
      codigo: arbCodigo,
      classe: fc.integer({ min: 1, max: 8 }),
      natureza: fc.constantFrom('D' as const, 'C' as const),
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

const arbCenarioBemFormado: fc.Arbitrary<Cenario> = arbAgregados(
  fc
    .uniqueArray(
      fc.record({
        codigo: arbCodigo,
        classe: fc.integer({ min: 1, max: 8 }),
        natureza: fc.constantFrom('D' as const, 'C' as const),
        nivel: fc.constant(1),
        mae: fc.option(fc.nat(39), { freq: 4 }) as fc.Arbitrary<MaeSpec>,
        aceita: fc.boolean(),
      }),
      { minLength: 1, maxLength: 40, selector: (c) => c.codigo },
    )
    .map((specs) => {
      const out: ContaSpec[] = [];
      specs.forEach((s, i) => {
        let mae: number | null = typeof s.mae === 'number' && i > 0 ? s.mae % i : null;
        if (mae !== null && out[mae]!.nivel >= 7) mae = null;
        out.push(mae === null
          ? { ...s, mae: null, nivel: 1 }
          : { ...s, mae, nivel: out[mae]!.nivel + 1, classe: out[mae]!.classe });
      });
      return out;
    }),
);

function construirContas(specs: ContaSpec[]): ContaBV[] {
  const n = specs.length;
  const idDe = (i: number) => `id-${specs[i]!.codigo}`;
  return specs.map((s, i) => ({
    id: idDe(i),
    codigo: s.codigo,
    nome: `Conta ${s.codigo}`,
    classe: CLASSES[s.classe - 1]!,
    natureza: (s.natureza === 'D' ? 'DEVEDORA' : 'CREDORA') as NaturezaConta,
    nivel: s.nivel,
    contaMaeId:
      s.mae === null ? null
        : s.mae === 'fora' ? `id-fora-${s.codigo}`
          : s.mae === 'propria' ? idDe(i)
            : idDe(s.mae % n),
    aceitaLancamento: s.aceita,
  }));
}

function agregados(specs: AgSpec[], contas: ContaBV[]): AgregadoPartidaBV[] {
  return specs.map((a) => ({
    contaId: a.alvo === 'fora' ? 'id-outro-tenant' : contas[a.alvo % contas.length]!.id,
    tipo: a.tipo === 'D' ? 'DEBITO' : 'CREDITO',
    _sum: { valor: a.centimos === null ? null : new Prisma.Decimal(a.centimos).dividedBy(100) },
  }));
}

function montar(c: Cenario): { contas: ContaBV[]; nucleo: BalanceteVerificacaoNucleo } {
  const contas = construirContas(c.contas);
  const nucleo = montarBalanceteVerificacao({
    contas,
    movimento: agregados(c.movimento, contas),
    acumulado: agregados(c.acumulado, contas),
    anteriores: c.anteriores === null ? null : agregados(c.anteriores, contas),
  });
  return { contas, nucleo };
}

interface OpcoesSpec { nivelMaximo: number | null; apenasRazao: boolean; incluirSemMovimento: boolean }
const arbOpcoes: fc.Arbitrary<OpcoesSpec> = fc.record({
  nivelMaximo: fc.option(fc.integer({ min: 1, max: 7 }), { freq: 3 }),
  apenasRazao: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  incluirSemMovimento: fc.boolean(),
});
const opcoesDe = (o: OpcoesSpec) => ({
  ...(o.nivelMaximo === null ? {} : { nivelMaximo: o.nivelMaximo }),
  ...(o.apenasRazao ? { apenasRazao: true } : {}),
  ...(o.incluirSemMovimento ? { incluirSemMovimento: true } : {}),
});

const arbPlano = fc.oneof(arbCenarioBemFormado, arbCenarioCorrompido);

describe('hierarquizarBalancete — maeMostradaId e profundidade (propriedades)', () => {
  it('H1 mãe é CONTA anterior do mesmo bloco; profundidade = profundidade(mãe) + 1; SUB 0, SINT 1', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, (c, o) => {
        const { contas, nucleo } = montar(c);
        const h = hierarquizarBalancete(nucleo, contas, opcoesDe(o));
        const mapa = forma(h).join(' ');
        const indice = new Map<string, number>();
        let inicioBloco = 0;
        h.forEach((l, i) => {
          if (l.tipo !== 'CONTA') {
            expect(maeDe(l), `${rotulo(l)}.maeMostradaId: ${mapa}`).toBeNull();
            expect(profDe(l), `${rotulo(l)}.profundidade: ${mapa}`).toBe(l.tipo === 'SINTETICA' ? 1 : 0);
            if (l.tipo === 'SUBTOTAL_CLASSE') inicioBloco = i + 1;
            return;
          }
          indice.set(l.conta!.id, i);
          const m = maeDe(l);
          expect(m !== undefined, `${rotulo(l)} sem maeMostradaId: ${mapa}`).toBe(true);
          if (m === null) {
            expect(profDe(l), `${rotulo(l)} raiz com profundidade ≠ 0: ${mapa}`).toBe(0);
          } else {
            const j = indice.get(m!);
            expect(j !== undefined && j >= inicioBloco, `${rotulo(l)}: mãe ${m} não é CONTA anterior do bloco: ${mapa}`).toBe(true);
            expect(profDe(l), `${rotulo(l)}.profundidade: ${mapa}`).toBe(profDe(h[j!]!)! + 1);
          }
          expect(l.nivel, `${rotulo(l)}.nivel`).toBe(l.conta!.nivel);
        });
      }),
      PARAMS,
    );
  });

  it('H2 pré-ordem: entre a mãe e a filha só há descendentes da mãe', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, (c, o) => {
        const { contas, nucleo } = montar(c);
        const h = hierarquizarBalancete(nucleo, contas, opcoesDe(o));
        const mapa = forma(h).join(' ');
        const linhaPorId = new Map(h.filter((l) => l.tipo === 'CONTA').map((l) => [l.conta!.id, l]));
        const desce = (l: LinhaHierarquica, alvo: string): boolean => {
          let passos = 0;
          for (let m = maeDe(l); m != null; m = maeDe(linhaPorId.get(m)!)) {
            if (m === alvo) return true;
            if (++passos > h.length) return false; // ciclo nas mães mostradas ⇒ falha via H1
          }
          return false;
        };
        h.forEach((l, i) => {
          const m = l.tipo === 'CONTA' ? maeDe(l) : null;
          if (m == null) return;
          const j = h.findIndex((x) => x.tipo === 'CONTA' && x.conta!.id === m);
          for (let k = j + 1; k < i; k++) {
            expect(h[k]!.tipo === 'CONTA' && desce(h[k]!, m), `${rotulo(h[k]!)} entre ${rotulo(h[j]!)} e a filha ${rotulo(l)}: ${mapa}`).toBe(true);
          }
        });
      }),
      PARAMS,
    );
  });

  it('H3 cadeia declarada válida ⇒ maeMostradaId = primeira conta MOSTRADA nessa cadeia', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, (c, o) => {
        const { contas, nucleo } = montar(c);
        const h = hierarquizarBalancete(nucleo, contas, opcoesDe(o));
        const mapa = forma(h).join(' ');
        const porId = new Map(contas.map((k) => [k.id, k]));
        const mostradas = new Set(h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id));
        /** Cadeia declarada (sem a própria) se for válida; null se sai do plano ou cicla. */
        const cadeia = (k: ContaBV): string[] | null => {
          const vistos = new Set([k.id]);
          const out: string[] = [];
          for (let m = k.contaMaeId; m !== null; m = porId.get(m)!.contaMaeId) {
            if (!porId.has(m) || vistos.has(m)) return null;
            vistos.add(m);
            out.push(m);
          }
          return out;
        };
        for (const l of h) {
          if (l.tipo !== 'CONTA') continue;
          const ch = cadeia(l.conta!);
          if (ch === null) continue;
          // Cadeia válida ⇒ todas as arestas declaradas se mantêm na árvore efectiva (nível 1 incluído).
          const esperada = ch.find((id) => mostradas.has(id)) ?? null;
          expect(maeDe(l), `${rotulo(l)}: cadeia ${ch.join('›')}: ${mapa}`).toBe(esperada);
        }
      }),
      PARAMS,
    );
  });
});
