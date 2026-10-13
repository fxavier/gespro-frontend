// ---------------------------------------------------------------------------
// Balancete PHC — oráculo da issue #298: conta ÓRFÃ de nível acima do «Grau
// máximo» (ou com «Só contas de razão») não pode desaparecer do ecrã.
//
// Contrato (decidido pelo orquestrador, ADR-0040 §5):
//   Uma ÓRFÃ — conta sem mãe efectiva (contaMaeId null num nível > 1, ou mãe
//   fora do plano sem conta de nível 1 da classe onde se pendurar) — é a RAIZ da
//   sua cadeia partida e respeita o GRAU RELATIVO:
//       grauRelativo(c) = c.nivel − raiz.nivel + 1
//   Com «Grau máximo» k uma conta da cadeia mostra-se ⇔ grauRelativo ≤ k; a raiz
//   (grau relativo 1) mostra-se SEMPRE. Cadeias cuja raiz é de nível 1 não mudam
//   (grau relativo = nível). Com «Só contas de razão» a raiz órfã também nunca
//   desaparece. Os totais, os subtotais e as três igualdades não mudam (vêm do
//   núcleo): o «Total da classe» passa a bater com as raízes mostradas.
//
// Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
// de implementação que altere este ficheiro é BLOCKER.
//
// Exemplos (E*) e propriedades (O*):
//   O1  (planos corrompidos e com órfãs, qualquer k) todas as raízes efectivas
//       aparecem; Σ das raízes mostradas (+ sintética) = Σ subtotais = totais do núcleo
//   O2  (planos com órfãs bem-formados) contas mostradas = {c : grauRelativo(c) ≤ k};
//       maeMostradaId = antepassado mostrado mais próximo
//   O3  (planos com órfãs bem-formados) «Só razão»: raízes órfãs aparecem; cadeias
//       de raiz nível 1 continuam «só nível 2»
//
// Reprodução: FC_SEED=<n>, FC_RUNS=<n> (omissão 300).
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import {
  filtrarBalancete,
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type BalanceteVerificacaoNucleo,
  type ContaBV,
  type LinhaBV,
  type LinhaHierarquica,
} from '../balancete-verificacao';

type Decimal = Prisma.Decimal;
const D = (v: string) => new Prisma.Decimal(v);
const ZERO = D('0');

const SEMENTE = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const CORRIDAS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 300;
const PARAMS = { numRuns: CORRIDAS, ...(SEMENTE === undefined ? {} : { seed: SEMENTE }) };

const CLASSES: ClassePGC[] = [
  'CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8',
];
const COLS = ['movD', 'movC', 'acumD', 'acumC'] as const;
type Valores = Record<(typeof COLS)[number], Decimal>;

// Lidos por acesso dinâmico: o ficheiro compila e falha pelo comportamento.
const maeDe = (l: LinhaHierarquica): string | null | undefined =>
  (l as { maeMostradaId?: string | null }).maeMostradaId;
const profDe = (l: LinhaHierarquica): number | undefined => (l as { profundidade?: number }).profundidade;

const rotulo = (l: LinhaHierarquica) =>
  l.tipo === 'CONTA' ? l.conta!.codigo : l.tipo === 'SINTETICA' ? 'SINT' : `SUB:${l.classe.slice(-1)}`;
const forma = (h: LinhaHierarquica[]) =>
  h.map((l) => `${rotulo(l)}<${maeDe(l) == null ? '-' : String(maeDe(l)).replace(/^id-/, '')}>${String(profDe(l))}`);

const soma = (ls: Pick<LinhaBV, keyof Valores>[]): Valores => {
  const r: Valores = { movD: ZERO, movC: ZERO, acumD: ZERO, acumC: ZERO };
  for (const l of ls) for (const k of COLS) r[k] = r[k].plus(l[k]);
  return r;
};
function mesmos(a: Valores, b: Valores, onde: string): void {
  for (const k of COLS) expect(a[k].equals(b[k]), `${onde}.${k}: ${a[k].toFixed()} ≠ ${b[k].toFixed()}`).toBe(true);
}
const valoresDe = (l: Pick<LinhaBV, keyof Valores> | undefined): Valores => (l ? soma([l]) : soma([]));

function serial(v: unknown): unknown {
  if (v instanceof Prisma.Decimal) return `D:${v.toFixed()}`;
  if (Array.isArray(v)) return v.map(serial);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, serial(o[k])]));
  }
  return v;
}

const raizesMostradas = (h: LinhaHierarquica[]) => h.filter((l) => l.tipo === 'CONTA' && maeDe(l) === null);

/** Σ das raízes mostradas de cada bloco (+ sintética) = SUBTOTAL que fecha o bloco. */
function blocosReconciliam(h: LinhaHierarquica[], onde: string): void {
  let bloco: LinhaHierarquica[] = [];
  for (const l of h) {
    if (l.tipo !== 'SUBTOTAL_CLASSE') { bloco.push(l); continue; }
    const mostradas = bloco.filter((b) => (b.tipo === 'CONTA' && maeDe(b) === null) || b.tipo === 'SINTETICA');
    mesmos(soma(mostradas), valoresDe(l), `${onde} — Σ raízes mostradas vs ${rotulo(l)} (${h.map(rotulo).join(' ')})`);
    bloco = [];
  }
}

// ---------------------------------------------------------------------------
// Exemplos
// ---------------------------------------------------------------------------

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

const CONTAS: ContaBV[] = [
  // Classe 3 sem conta de nível 1: 31 tem a mãe fora do plano ⇒ cadeia partida, raiz órfã de nível 2.
  conta('31', 'CLASSE_3', 2, 'fantasma', false),
  conta('311', 'CLASSE_3', 3, '31'),
  // Classe 6: cadeia normal + duas órfãs (contaMaeId null num nível > 1).
  conta('6', 'CLASSE_6', 1, null, false),
  conta('62', 'CLASSE_6', 2, '6', false),
  conta('621', 'CLASSE_6', 3, '62'),
  conta('63299', 'CLASSE_6', 5, null), // a do demo: folha órfã de nível 5
  conta('6399', 'CLASSE_6', 4, null, false), // órfã de nível 4 com descendência
  conta('63991', 'CLASSE_6', 5, '6399', false),
  conta('639911', 'CLASSE_6', 6, '63991'),
  conta('7', 'CLASSE_7', 1, null, false, 'CREDORA'),
  conta('71', 'CLASSE_7', 2, '7', true, 'CREDORA'),
];
const MOV = [
  ag('311', 'DEBITO', '11'),
  ag('621', 'DEBITO', '100'),
  ag('63299', 'DEBITO', '30'),
  ag('639911', 'DEBITO', '7'),
  ag('71', 'CREDITO', '148'),
];
const nucleoDe = () => montarBalanceteVerificacao({ contas: CONTAS, movimento: MOV, acumulado: MOV, anteriores: [] });
const linha = (h: LinhaHierarquica[], codigo: string) => h.find((l) => l.tipo === 'CONTA' && l.conta!.codigo === codigo);

describe('#298 — órfã acima do «Grau máximo» (exemplos)', () => {
  const nucleo = nucleoDe();
  const base = hierarquizarBalancete(nucleo, CONTAS);

  it('premissa: sem opções as três órfãs são raízes do seu bloco', () => {
    expect(forma(base)).toEqual([
      '31<->0', '311<31>1', 'SUB:3<->0',
      '6<->0', '62<6>1', '621<62>2', '63299<->0', '6399<->0', '63991<6399>1', '639911<63991>2', 'SUB:6<->0',
      '7<->0', '71<7>1', 'SUB:7<->0',
    ]);
  });

  it('E1 (o caso do demo) nivel=2: 63299 de nível 5 aparece como raiz, com o seu valor', () => {
    const h = hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 });
    const l = linha(h, '63299');
    expect(l, `63299 desapareceu: ${h.map(rotulo).join(' ')}`).toBeDefined();
    expect(maeDe(l!), '63299.maeMostradaId').toBeNull();
    expect(profDe(l!), '63299.profundidade').toBe(0);
    expect(l!.nivel, 'o nível próprio não muda').toBe(5);
    mesmos(valoresDe(l), { movD: D('30'), movC: ZERO, acumD: D('30'), acumC: ZERO }, '63299');
    expect(l!.saldoDevedor.equals(D('30')), '63299.saldoDevedor').toBe(true);
  });

  it('E2 grau relativo: a raiz órfã conta como grau 1 e as filhas descem a partir dela', () => {
    expect(forma(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 1 }))).toEqual([
      '31<->0', 'SUB:3<->0',
      '6<->0', '63299<->0', '6399<->0', 'SUB:6<->0',
      '7<->0', 'SUB:7<->0',
    ]);
    expect(forma(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 }))).toEqual([
      '31<->0', '311<31>1', 'SUB:3<->0',
      '6<->0', '62<6>1', '63299<->0', '6399<->0', '63991<6399>1', 'SUB:6<->0',
      '7<->0', '71<7>1', 'SUB:7<->0',
    ]);
    for (const k of [3, 4, 5, 6, 7]) {
      expect(forma(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: k })), `nivel=${k}`).toEqual(forma(base));
    }
  });

  it('E3 valores das linhas visíveis = os de sem opções; agregadora só com filhas mostradas', () => {
    const baseId = new Map(base.filter((l) => l.tipo === 'CONTA').map((l) => [l.conta!.codigo, l]));
    for (const k of [1, 2, 3]) {
      const h = hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: k });
      for (const l of h.filter((x) => x.tipo === 'CONTA')) mesmos(valoresDe(l), valoresDe(baseId.get(l.conta!.codigo)), `${rotulo(l)} nivel=${k}`);
    }
    expect(linha(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 1 }), '6399')!.agregadora).toBe(false);
    expect(linha(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 }), '6399')!.agregadora).toBe(true);
    mesmos(valoresDe(linha(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 1 }), '6399')), soma([{ movD: D('7'), movC: ZERO, acumD: D('7'), acumC: ZERO }]), '6399 nivel=1');
  });

  it('E4 o «Total da classe» bate com as raízes mostradas, para todo o grau e para «Só razão»', () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7]) blocosReconciliam(hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: k }), `nivel=${k}`);
    blocosReconciliam(hierarquizarBalancete(nucleo, CONTAS, { apenasRazao: true }), 'razao=1');
    // E no conjunto: Σ raízes mostradas = totais do núcleo.
    const h = hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 });
    mesmos(soma(raizesMostradas(h)), valoresDe(nucleo.totais), 'Σ raízes nivel=2 vs totais do núcleo');
  });

  it('E5 «Só contas de razão»: as raízes órfãs nunca desaparecem; a cadeia de nível 1 continua só nível 2', () => {
    const h = hierarquizarBalancete(nucleo, CONTAS, { apenasRazao: true });
    const cods = new Set(h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.codigo));
    for (const c of ['31', '63299', '6399', '62', '71']) expect(cods.has(c), `${c} em falta: ${[...cods].join(' ')}`).toBe(true);
    for (const c of ['6', '621', '7']) expect(cods.has(c), `${c} não é de razão: ${[...cods].join(' ')}`).toBe(false);
    for (const c of ['31', '63299', '6399', '62', '71']) expect(maeDe(linha(h, c)!), `${c} raiz em razão`).toBeNull();
  });

  it('E6 totais, subtotais e as três igualdades não mudam (vêm do núcleo)', () => {
    const antes = serial(nucleo);
    const naoConta = (ls: LinhaHierarquica[]) => serial(ls.filter((l) => l.tipo !== 'CONTA'));
    for (const o of [{ nivelMaximo: 1 }, { nivelMaximo: 2 }, { apenasRazao: true }, { nivelMaximo: 2, incluirSemMovimento: true }]) {
      const h = hierarquizarBalancete(nucleo, CONTAS, o);
      expect(naoConta(h), JSON.stringify(o)).toEqual(naoConta(base));
    }
    expect(serial(nucleo), 'núcleo alterado').toEqual(antes);
    expect(nucleo.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('E7 filtrarBalancete sobre nivel=2: a órfã responde aos filtros como qualquer raiz', () => {
    const h = hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 });
    const r = (s: LinhaHierarquica[]) => s.map((l) => `${rotulo(l)}${(l as { contexto?: boolean }).contexto ? '*' : ''}`);
    expect(r(filtrarBalancete(h, { classe: 'CLASSE_6' }))).toEqual(['6', '62', '63299', '6399', '63991', 'SUB:6']);
    expect(r(filtrarBalancete(h, { pesquisa: '63299' }))).toEqual(['63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { pesquisa: '63991' }))).toEqual(['6399*', '63991', 'SUB:6']);
    expect(r(filtrarBalancete(h, { excluir: ['6'] }))).toEqual(['31', '311', 'SUB:3', '63299', '6399', '63991', 'SUB:6', '7', '71', 'SUB:7']);
    expect(r(filtrarBalancete(h, { apenasComSaldo: true, classe: 'CLASSE_3' }))).toEqual(['31', '311', 'SUB:3']);
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
const arbCodigo = fc.stringMatching(/^[0-9]{1,6}$/);

/** Plano CORROMPIDO: mães arbitrárias (órfãs de qualquer nível, auto-ciclos, ciclos, mães fora do plano). */
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

/**
 * Plano bem-formado COM ÓRFÃS: acíclico, mãe sempre no plano ou null, classe = da
 * raiz, nível = nível da mãe + 1 — mas a raiz pode ser de nível 1..5 (órfã se > 1).
 * Aqui o grau relativo pelo nível coincide com a profundidade na árvore.
 */
const arbCenarioComOrfas: fc.Arbitrary<Cenario> = arbAgregados(
  fc
    .uniqueArray(
      fc.record({
        codigo: arbCodigo,
        classe: fc.integer({ min: 1, max: 8 }),
        natureza: fc.constantFrom('D' as const, 'C' as const),
        nivel: fc.oneof({ weight: 2, arbitrary: fc.constant(1) }, { weight: 3, arbitrary: fc.integer({ min: 2, max: 5 }) }),
        mae: fc.option(fc.nat(39), { freq: 3 }) as fc.Arbitrary<MaeSpec>,
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
          ? { ...s, mae: null }
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

/**
 * Árvore efectiva lida da hierarquia SEM opções (aí tudo passa o filtro, logo a
 * maeMostradaId é a mãe efectiva): raiz de cada conta presente.
 */
function arvoreBase(base: LinhaHierarquica[]) {
  const linhaPorId = new Map(base.filter((l) => l.tipo === 'CONTA').map((l) => [l.conta!.id, l]));
  const maeEf = (id: string) => maeDe(linhaPorId.get(id)!) ?? null;
  const raizDe = (id: string): string => {
    let r = id;
    for (let m = maeEf(id), passos = 0; m !== null && passos <= linhaPorId.size; m = maeEf(m), passos++) r = m;
    return r;
  };
  return { linhaPorId, maeEf, raizDe };
}

const arbPlano = fc.oneof(arbCenarioComOrfas, arbCenarioCorrompido);

describe('#298 — órfã acima do «Grau máximo» (propriedades)', () => {
  it('O1 todas as raízes efectivas aparecem; Σ raízes mostradas (+ sintética) = Σ subtotais = totais', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, fc.integer({ min: 1, max: 7 }), fc.boolean(), (c, k, zeradas) => {
        const { contas, nucleo } = montar(c);
        const opcoesZ = zeradas ? { incluirSemMovimento: true } : {};
        const base = hierarquizarBalancete(nucleo, contas, opcoesZ);
        const h = hierarquizarBalancete(nucleo, contas, { nivelMaximo: k, ...opcoesZ });
        const mapa = `nivel=${k} | base ${forma(base).join(' ')} | h ${forma(h).join(' ')}`;
        const ids = new Set(h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id));
        for (const r of raizesMostradas(base)) {
          expect(ids.has(r.conta!.id), `raiz ${r.conta!.codigo} (nível ${r.nivel}) desapareceu: ${mapa}`).toBe(true);
        }
        const sint = h.filter((l) => l.tipo === 'SINTETICA');
        const subs = h.filter((l) => l.tipo === 'SUBTOTAL_CLASSE');
        mesmos(soma([...raizesMostradas(h), ...sint]), soma(subs), `Σ raízes mostradas vs Σ subtotais (${mapa})`);
        mesmos(soma(subs), valoresDe(nucleo.totais), 'Σ subtotais vs totais do núcleo');
      }),
      PARAMS,
    );
  });

  it('O2 (com órfãs, bem-formado) mostradas = {grauRelativo ≤ k}; mãe = antepassado mostrado mais próximo; blocos reconciliam', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioComOrfas, fc.integer({ min: 1, max: 7 }), (c, k) => {
        const { contas, nucleo } = montar(c);
        const base = hierarquizarBalancete(nucleo, contas);
        const h = hierarquizarBalancete(nucleo, contas, { nivelMaximo: k });
        const { linhaPorId, maeEf, raizDe } = arvoreBase(base);
        const mapa = `nivel=${k} | base ${forma(base).join(' ')} | h ${forma(h).join(' ')}`;
        const grau = (id: string) => linhaPorId.get(id)!.nivel - linhaPorId.get(raizDe(id))!.nivel + 1;
        const esperadas = new Set([...linhaPorId.keys()].filter((id) => grau(id) <= k));
        const mostradas = h.filter((l) => l.tipo === 'CONTA');
        expect(new Set(mostradas.map((l) => l.conta!.id)), `contas mostradas: ${mapa}`).toEqual(esperadas);
        for (const l of mostradas) {
          let esperada: string | null = null;
          for (let m = maeEf(l.conta!.id); m !== null; m = maeEf(m)) if (esperadas.has(m)) { esperada = m; break; }
          expect(maeDe(l), `${rotulo(l)}.maeMostradaId: ${mapa}`).toBe(esperada);
          mesmos(valoresDe(l), valoresDe(linhaPorId.get(l.conta!.id)), `${rotulo(l)} (${mapa})`);
        }
        blocosReconciliam(h, mapa);
      }),
      PARAMS,
    );
  });

  it('O3 (com órfãs, bem-formado) «Só razão»: raízes órfãs aparecem; cadeias de raiz nível 1 só nível 2', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbCenarioComOrfas, (c) => {
        const { contas, nucleo } = montar(c);
        const base = hierarquizarBalancete(nucleo, contas);
        const h = hierarquizarBalancete(nucleo, contas, { apenasRazao: true });
        const { linhaPorId, raizDe } = arvoreBase(base);
        const mapa = `razao | base ${forma(base).join(' ')} | h ${forma(h).join(' ')}`;
        const ids = new Set(h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id));
        for (const [id, l] of linhaPorId) {
          const raiz = linhaPorId.get(raizDe(id))!;
          if (raiz.nivel === 1) {
            expect(ids.has(id), `${rotulo(l)} (cadeia de nível 1): ${mapa}`).toBe(l.nivel === 2);
          } else if (id === raiz.conta!.id) {
            expect(ids.has(id), `raiz órfã ${rotulo(l)} (nível ${l.nivel}) desapareceu: ${mapa}`).toBe(true);
            expect(maeDe(h.find((x) => x.tipo === 'CONTA' && x.conta!.id === id)!), `${rotulo(l)} raiz`).toBeNull();
          }
        }
      }),
      PARAMS,
    );
  });
});
