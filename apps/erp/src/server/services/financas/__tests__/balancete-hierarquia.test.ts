// ---------------------------------------------------------------------------
// Balancete de verificação PHC — oráculo da HIERARQUIA (`hierarquizarBalancete`).
// Run balancete-phc, S2 (#281), ADR-0040 §5, contrato
// .scratch/sdlc/balancete-phc/S2-contrato.md.
//
// Escrito pelo AUTOR DO ORÁCULO antes de existir `hierarquizarBalancete`: até lá
// as chamadas rebentam — é a prova vermelha. O núcleo é montado com o
// `montarBalanceteVerificacao` REAL (S1), para provar que as duas funções
// compõem. Números apurados à mão. NUNCA `vitest -u`; um agente de
// implementação que altere este ficheiro é BLOCKER.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import {
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type BalanceteVerificacaoNucleo,
  type ContaBV,
  type LinhaHierarquica,
} from '../balancete-verificacao';

const D = (v: string) => new Prisma.Decimal(v);

function conta(
  codigo: string,
  classe: ClassePGC,
  natureza: NaturezaConta,
  nivel: number,
  mae: string | null,
  aceitaLancamento: boolean,
): ContaBV {
  return {
    id: `id-${codigo}`, codigo, nome: `Conta ${codigo}`, classe, natureza, nivel,
    contaMaeId: mae === null ? null : mae.startsWith('id-') ? mae : `id-${mae}`, aceitaLancamento,
  };
}

// Plano: até 4 níveis. Armadilhas assinaladas.
const CONTAS: ContaBV[] = [
  // Classe 1
  conta('1', 'CLASSE_1', 'DEVEDORA', 1, null, false),
  conta('11', 'CLASSE_1', 'DEVEDORA', 2, '1', false),
  conta('111', 'CLASSE_1', 'DEVEDORA', 3, '11', true),
  conta('12', 'CLASSE_1', 'DEVEDORA', 2, '1', false),
  conta('121', 'CLASSE_1', 'DEVEDORA', 3, '12', false),
  conta('1211', 'CLASSE_1', 'DEVEDORA', 4, '121', true),
  conta('1212', 'CLASSE_1', 'DEVEDORA', 4, '121', true),
  conta('13', 'CLASSE_1', 'DEVEDORA', 2, '1', false), // sem descendência com linhas ⇒ não aparece
  conta('131', 'CLASSE_1', 'DEVEDORA', 3, '12', true), // ARMADILHA: prefixo diz «13», contaMaeId diz «12»
  conta('14', 'CLASSE_1', 'DEVEDORA', 2, '1', false), // mãe cuja folha não tem movimento
  conta('141', 'CLASSE_1', 'DEVEDORA', 3, '14', true),
  // Classe 2 — mães DEVEDORAS com filhas credoras
  conta('2', 'CLASSE_2', 'DEVEDORA', 1, null, false),
  conta('21', 'CLASSE_2', 'DEVEDORA', 2, '2', false),
  conta('211', 'CLASSE_2', 'DEVEDORA', 3, '21', true),
  conta('22', 'CLASSE_2', 'CREDORA', 2, '2', false),
  conta('221', 'CLASSE_2', 'CREDORA', 3, '22', true),
  conta('24', 'CLASSE_2', 'DEVEDORA', 2, '2', false),
  conta('241', 'CLASSE_2', 'CREDORA', 3, '24', true),
  // Classe 3 — cadeia partida SEM conta de nível 1 da classe ⇒ raiz do bloco
  conta('31', 'CLASSE_3', 'DEVEDORA', 2, 'id-fantasma-3', true),
  // Classe 4 — regra S1 (b): 42 tem partidas próprias E filha
  conta('4', 'CLASSE_4', 'DEVEDORA', 1, null, false),
  conta('42', 'CLASSE_4', 'DEVEDORA', 2, '4', false),
  conta('421', 'CLASSE_4', 'DEVEDORA', 3, '42', true),
  // Classe 5 — cadeia partida COM conta de nível 1 ⇒ pendura-se em «5»
  conta('5', 'CLASSE_5', 'CREDORA', 1, null, false),
  conta('51', 'CLASSE_5', 'CREDORA', 2, 'id-fantasma-5', true),
  // Classe 6 — 4 níveis
  conta('6', 'CLASSE_6', 'DEVEDORA', 1, null, false),
  conta('61', 'CLASSE_6', 'DEVEDORA', 2, '6', false),
  conta('611', 'CLASSE_6', 'DEVEDORA', 3, '61', false),
  conta('6111', 'CLASSE_6', 'DEVEDORA', 4, '611', true),
  // Classe 7
  conta('7', 'CLASSE_7', 'CREDORA', 1, null, false),
  conta('71', 'CLASSE_7', 'CREDORA', 2, '7', false),
  conta('711', 'CLASSE_7', 'CREDORA', 3, '71', true),
  // Classe 8
  conta('8', 'CLASSE_8', 'CREDORA', 1, null, false),
  conta('81', 'CLASSE_8', 'CREDORA', 2, '8', false),
  conta('811', 'CLASSE_8', 'CREDORA', 3, '81', true),
];
// Entrada baralhada: a ordem é responsabilidade da função.
const CONTAS_BARALHADAS = [...CONTAS].reverse();

const ag = (codigo: string, tipo: 'DEBITO' | 'CREDITO', v: string): AgregadoPartidaBV => ({
  contaId: `id-${codigo}`, tipo, _sum: { valor: D(v) },
});
const deb = (c: string, v: string) => ag(c, 'DEBITO', v);
const cred = (c: string, v: string) => ag(c, 'CREDITO', v);

// Cenário principal (sem histórico anterior; movimento = acumulado).
const MOV: AgregadoPartidaBV[] = [
  deb('111', '100'),
  deb('1211', '200'), cred('1211', '50'),
  deb('1212', '30'),
  deb('131', '70'),
  cred('211', '40'), // 211 DEVEDORA credora ⇒ contra natureza (núcleo)
  cred('221', '90'),
  cred('241', '25'),
  deb('42', '10'), // partidas próprias numa conta aceitaLancamento=false (S1 b)
  deb('421', '5'), cred('421', '20'), // 421 DEVEDORA credora 15 ⇒ contra natureza
  cred('51', '300'),
  deb('31', '15'),
  deb('6111', '60'),
  cred('711', '80'),
  cred('811', '10'),
];

const nucleoDe = (movimento: AgregadoPartidaBV[], anteriores: AgregadoPartidaBV[] | null = []) =>
  montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores });

const chave = (l: LinhaHierarquica) =>
  l.tipo === 'CONTA' ? l.conta!.codigo : l.tipo === 'SINTETICA' ? 'SINT' : `SUB:${l.classe.slice(-1)}`;
const chaves = (ls: LinhaHierarquica[]) => ls.map(chave);
const porCodigo = (ls: LinhaHierarquica[], c: string) => ls.find((l) => l.tipo === 'CONTA' && l.conta?.codigo === c);
const subtotal = (ls: LinhaHierarquica[], n: number) => ls.find((l) => l.tipo === 'SUBTOTAL_CLASSE' && l.classe === `CLASSE_${n}`);

function igual(actual: unknown, esperado: string, onde: string): void {
  expect(actual instanceof Prisma.Decimal, `${onde}: esperava Prisma.Decimal`).toBe(true);
  const d = actual as Prisma.Decimal;
  expect(d.equals(D(esperado)), `${onde}: devolveu ${d.toFixed()}, esperava ${esperado}`).toBe(true);
}
type Esp = { movD?: string; movC?: string; acumD?: string; acumC?: string; saldoDevedor?: string; saldoCredor?: string };
function valores(l: LinhaHierarquica | undefined, e: Esp, onde: string): void {
  expect(l, `${onde}: linha em falta`).toBeDefined();
  igual(l!.movD, e.movD ?? '0', `${onde}.movD`);
  igual(l!.movC, e.movC ?? '0', `${onde}.movC`);
  igual(l!.acumD, e.acumD ?? '0', `${onde}.acumD`);
  igual(l!.acumC, e.acumC ?? '0', `${onde}.acumC`);
  igual(l!.saldoDevedor, e.saldoDevedor ?? '0', `${onde}.saldoDevedor`);
  igual(l!.saldoCredor, e.saldoCredor ?? '0', `${onde}.saldoCredor`);
}
const COLS = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;
function mesmosValores(a: LinhaHierarquica | undefined, b: LinhaHierarquica | undefined, onde: string): void {
  expect(a && b, `${onde}: linha em falta`).toBeTruthy();
  for (const k of COLS) expect(a![k].equals(b![k]), `${onde}.${k}: ${a![k].toFixed()} ≠ ${b![k].toFixed()}`).toBe(true);
}

const ORDEM_COMPLETA = [
  '1', '11', '111', '12', '121', '1211', '1212', '131', 'SUB:1',
  '2', '21', '211', '22', '221', '24', '241', 'SUB:2',
  '31', 'SUB:3',
  '4', '42', '421', 'SUB:4',
  '5', '51', 'SUB:5',
  '6', '61', '611', '6111', 'SUB:6',
  '7', '71', '711', 'SUB:7',
  '8', '81', '811', 'SUB:8',
];

describe('hierarquizarBalancete — árvore, ordem e presença', () => {
  it('pré-ordem por contaMaeId, filhas por código (texto), SUBTOTAL_CLASSE depois de cada bloco de classe', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS_BARALHADAS);
    expect(chaves(h)).toEqual(ORDEM_COMPLETA);
  });

  it('uma mãe só aparece com descendência com linha no núcleo (13 e 14 ficam fora; 141 sem movimento também)', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    for (const c of ['13', '14', '141']) expect(porCodigo(h, c), c).toBeUndefined();
  });

  it('tipo, nivel, classe e agregadora de cada linha', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    const nivelDe = new Map(CONTAS.map((c) => [c.codigo, c.nivel]));
    const classeDe = new Map(CONTAS.map((c) => [c.codigo, c.classe]));
    const mae = new Set(['1', '11', '12', '121', '2', '21', '22', '24', '4', '42', '5', '6', '61', '611', '7', '71', '8', '81']);
    for (const l of h) {
      if (l.tipo === 'CONTA') {
        const c = l.conta!.codigo;
        expect(l.nivel, `${c}.nivel`).toBe(nivelDe.get(c));
        expect(l.classe, `${c}.classe`).toBe(classeDe.get(c));
        expect(l.agregadora, `${c}.agregadora`).toBe(mae.has(c));
      } else if (l.tipo === 'SUBTOTAL_CLASSE') {
        expect(l.nivel, `${chave(l)}.nivel`).toBe(1);
        expect(l.contraNatureza, `${chave(l)}.contraNatureza`).toBe(false);
      }
    }
  });
});

describe('hierarquizarBalancete — roll-up de D/C pela cadeia contaMaeId', () => {
  it('soma movD/movC/acumD/acumC das linhas do núcleo descendentes, por vários níveis', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    valores(porCodigo(h, '121'), { movD: '230', movC: '50', acumD: '230', acumC: '50', saldoDevedor: '180' }, '121');
    valores(porCodigo(h, '11'), { movD: '100', acumD: '100', saldoDevedor: '100' }, '11');
    valores(porCodigo(h, '6'), { movD: '60', acumD: '60', saldoDevedor: '60' }, '6 (4 níveis)');
    valores(porCodigo(h, '611'), { movD: '60', acumD: '60', saldoDevedor: '60' }, '611');
  });

  it('NUNCA por prefixo de código: 131 rola para 12 (contaMaeId), não para 13', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    // 12 = 121 (230/50) + 131 (70/0)
    valores(porCodigo(h, '12'), { movD: '300', movC: '50', acumD: '300', acumC: '50', saldoDevedor: '250' }, '12');
    valores(porCodigo(h, '1'), { movD: '400', movC: '50', acumD: '400', acumC: '50', saldoDevedor: '350' }, '1');
    expect(porCodigo(h, '13')).toBeUndefined();
  });

  it('saldo da mãe a partir do acumulado rolado: mães DEVEDORAS com filhas credoras ficam credoras, sem contraNatureza', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    const l21 = porCodigo(h, '21');
    valores(l21, { movC: '40', acumC: '40', saldoCredor: '40' }, '21');
    const l24 = porCodigo(h, '24');
    valores(l24, { movC: '25', acumC: '25', saldoCredor: '25' }, '24');
    const l2 = porCodigo(h, '2');
    valores(l2, { movC: '155', acumC: '155', saldoCredor: '155' }, '2');
    for (const l of [l21, l24, l2]) expect(l!.contraNatureza, `${l!.conta!.codigo} agregadora`).toBe(false);
  });

  it('contraNatureza vem do núcleo nas folhas (211 e 421 DEVEDORAS credoras; 221/241 CREDORAS credoras não)', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    expect(porCodigo(h, '211')!.contraNatureza).toBe(true);
    expect(porCodigo(h, '421')!.contraNatureza).toBe(true);
    expect(porCodigo(h, '221')!.contraNatureza).toBe(false);
    expect(porCodigo(h, '241')!.contraNatureza).toBe(false);
    for (const l of h.filter((x) => x.tipo === 'CONTA' && !x.conta!.aceitaLancamento && x.conta!.codigo !== '42')) {
      expect(l.contraNatureza, `${l.conta!.codigo} agregadora`).toBe(false);
    }
  });

  it('regra S1 (b): conta com partidas próprias e filhas soma as duas (42 = próprio 10/0 + 421 5/20)', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    valores(porCodigo(h, '421'), { movD: '5', movC: '20', acumD: '5', acumC: '20', saldoCredor: '15' }, '421');
    valores(porCodigo(h, '42'), { movD: '15', movC: '20', acumD: '15', acumC: '20', saldoCredor: '5' }, '42');
    valores(porCodigo(h, '4'), { movD: '15', movC: '20', acumD: '15', acumC: '20', saldoCredor: '5' }, '4');
    expect(porCodigo(h, '42')!.agregadora).toBe(true);
  });

  it('cadeia partida: pendura-se na conta de nível 1 da classe (51 sob 5); sem nível 1, fica na raiz do bloco (31)', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS);
    valores(porCodigo(h, '5'), { movC: '300', acumC: '300', saldoCredor: '300' }, '5');
    expect(porCodigo(h, '5')!.agregadora).toBe(true);
    const i = chaves(h);
    expect(i.slice(i.indexOf('5'), i.indexOf('SUB:5') + 1)).toEqual(['5', '51', 'SUB:5']);
    expect(i.slice(i.indexOf('SUB:2') + 1, i.indexOf('SUB:3') + 1)).toEqual(['31', 'SUB:3']);
    valores(subtotal(h, 3), { movD: '15', acumD: '15', saldoDevedor: '15' }, 'SUB:3');
  });
});

describe('hierarquizarBalancete — subtotais por classe', () => {
  it('SUBTOTAL_CLASSE = Σ linhas do núcleo da classe, e coincide com a linha de nível 1 quando existe', () => {
    const nucleo = nucleoDe(MOV);
    const h = hierarquizarBalancete(nucleo, CONTAS);
    const classeDe = new Map(CONTAS.map((c) => [c.id, c.classe]));
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const daClasse = nucleo.linhas.filter((l) => l.conta && classeDe.get(l.conta.id) === `CLASSE_${n}`);
      const sub = subtotal(h, n);
      expect(sub, `SUB:${n}`).toBeDefined();
      for (const k of ['movD', 'movC', 'acumD', 'acumC'] as const) {
        const soma = daClasse.reduce((s, l) => s.plus(l[k]), D('0'));
        expect(sub![k].equals(soma), `SUB:${n}.${k}`).toBe(true);
      }
      if (n !== 3) mesmosValores(sub, porCodigo(h, String(n)), `SUB:${n} = conta ${n}`);
    }
    valores(subtotal(h, 1), { movD: '400', movC: '50', acumD: '400', acumC: '50', saldoDevedor: '350' }, 'SUB:1');
    valores(subtotal(h, 2), { movC: '155', acumC: '155', saldoCredor: '155' }, 'SUB:2');
  });
});

describe('hierarquizarBalancete — linha sintética na classe 8', () => {
  // Ano: 811 C 10 / 111 D 10. Anterior: 6111 D 40 / 111 C 40 ⇒ 111 líquido −40, R = +40.
  const ANO8 = [deb('111', '10'), cred('811', '10')];
  const ANT8 = [deb('6111', '40'), cred('111', '40')];

  it('fica dentro do bloco da classe 8, no fim, antes do SUBTOTAL; o subtotal da 8 inclui-a', () => {
    const h = hierarquizarBalancete(nucleoDe(ANO8, ANT8), CONTAS);
    expect(chaves(h)).toEqual(['1', '11', '111', 'SUB:1', '8', '81', '811', 'SINT', 'SUB:8']);
    const s = h.find((l) => l.tipo === 'SINTETICA')!;
    expect(s.conta).toBeNull();
    expect(s.classe).toBe('CLASSE_8');
    expect(s.nivel).toBe(2);
    expect(s.contraNatureza).toBe(false);
    valores(s, { acumD: '40', saldoDevedor: '40' }, 'SINT');
    // SUB:8 = 811 (mov C 10, acum C 10) + sintética (acum D 40)
    valores(subtotal(h, 8), { movC: '10', acumD: '40', acumC: '10', saldoDevedor: '30' }, 'SUB:8');
  });

  it('sem nenhuma conta da classe 8 com linha, o bloco 8 é só a sintética e o subtotal', () => {
    const h = hierarquizarBalancete(nucleoDe([deb('111', '10'), cred('711', '10')], ANT8), CONTAS);
    expect(chaves(h)).toEqual(['1', '11', '111', 'SUB:1', '7', '71', '711', 'SUB:7', 'SINT', 'SUB:8']);
    valores(subtotal(h, 8), { acumD: '40', saldoDevedor: '40' }, 'SUB:8 (só sintética)');
    expect(porCodigo(h, '8')).toBeUndefined();
  });
});

describe('hierarquizarBalancete — grau máximo e contas de razão', () => {
  it('nivelMaximo 2: esconde CONTA de nível > 2; as mães mantêm os valores; agregadora false se todas as filhas ficaram escondidas', () => {
    const nucleo = nucleoDe(MOV);
    const todas = hierarquizarBalancete(nucleo, CONTAS);
    const h = hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 });
    expect(chaves(h)).toEqual([
      '1', '11', '12', 'SUB:1',
      '2', '21', '22', '24', 'SUB:2',
      '31', 'SUB:3',
      '4', '42', 'SUB:4',
      '5', '51', 'SUB:5',
      '6', '61', 'SUB:6',
      '7', '71', 'SUB:7',
      '8', '81', 'SUB:8',
    ]);
    for (const c of ['1', '12', '42', '2', '6']) mesmosValores(porCodigo(h, c), porCodigo(todas, c), `${c} com nivelMaximo 2`);
    for (const c of ['1', '2', '4', '5', '6', '7', '8']) expect(porCodigo(h, c)!.agregadora, `${c} tem filhas visíveis`).toBe(true);
    for (const c of ['11', '12', '21', '22', '24', '42', '61', '71', '81']) {
      expect(porCodigo(h, c)!.agregadora, `${c}: filhas todas escondidas`).toBe(false);
    }
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) mesmosValores(subtotal(h, n), subtotal(todas, n), `SUB:${n}`);
  });

  it('nivelMaximo 1: só contas de nível 1 e subtotais; a sintética mantém-se', () => {
    const h = hierarquizarBalancete(nucleoDe(MOV), CONTAS, { nivelMaximo: 1 });
    expect(chaves(h)).toEqual(['1', 'SUB:1', '2', 'SUB:2', 'SUB:3', '4', 'SUB:4', '5', 'SUB:5', '6', 'SUB:6', '7', 'SUB:7', '8', 'SUB:8']);
    for (const l of h.filter((x) => x.tipo === 'CONTA')) expect(l.agregadora, chave(l)).toBe(false);

    const h8 = hierarquizarBalancete(
      nucleoDe([deb('111', '10'), cred('811', '10')], [deb('6111', '40'), cred('111', '40')]),
      CONTAS,
      { nivelMaximo: 1 },
    );
    expect(chaves(h8)).toEqual(['1', 'SUB:1', '8', 'SINT', 'SUB:8']);
  });

  it('apenasRazao: só CONTA de nível 2 + sintética + subtotais, e ganha a nivelMaximo', () => {
    const esperado = [
      '11', '12', 'SUB:1',
      '21', '22', '24', 'SUB:2',
      '31', 'SUB:3',
      '42', 'SUB:4',
      '51', 'SUB:5',
      '61', 'SUB:6',
      '71', 'SUB:7',
      '81', 'SUB:8',
    ];
    const nucleo = nucleoDe(MOV);
    const todas = hierarquizarBalancete(nucleo, CONTAS);
    const h = hierarquizarBalancete(nucleo, CONTAS, { apenasRazao: true });
    expect(chaves(h)).toEqual(esperado);
    expect(chaves(hierarquizarBalancete(nucleo, CONTAS, { apenasRazao: true, nivelMaximo: 1 }))).toEqual(esperado);
    expect(chaves(hierarquizarBalancete(nucleo, CONTAS, { apenasRazao: true, nivelMaximo: 7 }))).toEqual(esperado);
    for (const c of ['12', '21', '42', '61']) mesmosValores(porCodigo(h, c), porCodigo(todas, c), `${c} em razão`);
    for (const l of h.filter((x) => x.tipo === 'CONTA')) expect(l.agregadora, `${chave(l)}: filhas escondidas`).toBe(false);

    const h8 = hierarquizarBalancete(
      nucleoDe([deb('111', '10'), cred('811', '10')], [deb('6111', '40'), cred('111', '40')]),
      CONTAS,
      { apenasRazao: true },
    );
    expect(chaves(h8)).toEqual(['11', 'SUB:1', '81', 'SINT', 'SUB:8']);
  });
});

describe('hierarquizarBalancete — não toca no núcleo', () => {
  it('totais, igualdades e linhas do núcleo ficam iguais; duas chamadas dão o mesmo resultado', () => {
    const nucleo: BalanceteVerificacaoNucleo = nucleoDe(MOV);
    const antes = {
      totais: Object.fromEntries(COLS.map((k) => [k, nucleo.totais[k].toFixed()])),
      equilibrio: { ...nucleo.equilibrio },
      linhas: nucleo.linhas.map((l) => [l.conta?.codigo ?? null, ...COLS.map((k) => l[k].toFixed())]),
    };
    const a = hierarquizarBalancete(nucleo, CONTAS);
    const b = hierarquizarBalancete(nucleo, CONTAS, { nivelMaximo: 2 });
    const c = hierarquizarBalancete(nucleo, CONTAS);
    const depois = {
      totais: Object.fromEntries(COLS.map((k) => [k, nucleo.totais[k].toFixed()])),
      equilibrio: { ...nucleo.equilibrio },
      linhas: nucleo.linhas.map((l) => [l.conta?.codigo ?? null, ...COLS.map((k) => l[k].toFixed())]),
    };
    expect(depois).toEqual(antes);
    expect(b.length).toBeLessThan(a.length);
    expect(chaves(c)).toEqual(chaves(a));
    for (let i = 0; i < a.length; i++) mesmosValores(c[i], a[i], `chamada repetida, linha ${chave(a[i]!)}`);
  });
});

// ---------------------------------------------------------------------------
// Revisão G5 do S2 (2026-10-01) — planos de contas defeituosos. Acrescentado pelo
// autor do oráculo.
//
// CERCA contra ciclos: um ciclo em contaMaeId pode pôr a função num `while`
// síncrono infinito, que o timeout do vitest NÃO interrompe (o event loop fica
// bloqueado e a corrida inteira pendura). Por isso as contas destes cenários são
// cópias com `contaMaeId` como getter que conta as leituras e lança ao passar de
// LIMITE_LEITURAS — um ciclo vira um erro rápido em vez de pendurar. Uma
// implementação que leia contaMaeId um número limitado de vezes nunca o sente.
// (Se a implementação copiar as contas com spread, a cerca deixa de actuar:
// a cópia lê o getter uma vez.) O timeout por teste fica como segunda rede.
// ---------------------------------------------------------------------------
const LIMITE_LEITURAS = 10_000;
function comCerca(contas: ContaBV[]): ContaBV[] {
  let leituras = 0;
  return contas.map((c) => {
    const { contaMaeId, ...resto } = c;
    const copia = { ...resto } as ContaBV;
    Object.defineProperty(copia, 'contaMaeId', {
      enumerable: true,
      get() {
        leituras += 1;
        if (leituras > LIMITE_LEITURAS) {
          throw new Error(`cerca: contaMaeId lido mais de ${LIMITE_LEITURAS} vezes — ciclo não detectado`);
        }
        return contaMaeId;
      },
    });
    return copia;
  });
}
const trocar = (base: ContaBV[], codigo: string, muda: Partial<ContaBV>): ContaBV[] =>
  base.map((c) => (c.codigo === codigo ? { ...c, ...muda } : c));

/** INVARIANTE (sem nivelMaximo/apenasRazao): cada linha do núcleo com conta aparece exactamente uma vez como CONTA. */
function cadaLinhaDoNucleoUmaVez(nucleo: BalanceteVerificacaoNucleo, h: LinhaHierarquica[], onde: string): void {
  const ids = h.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id);
  expect(new Set(ids).size, `${onde}: conta repetida na hierarquia`).toBe(ids.length);
  for (const l of nucleo.linhas) {
    if (!l.conta) continue;
    const n = ids.filter((id) => id === l.conta!.id).length;
    expect(n, `${onde}: linha do núcleo ${l.conta.codigo} aparece ${n} vezes`).toBe(1);
  }
  expect(h.filter((l) => l.tipo === 'SINTETICA').length, `${onde}: sintética`).toBe(nucleo.linhas.some((l) => l.conta === null) ? 1 : 0);
}

/** Linhas do bloco de uma classe: do fim do subtotal anterior até ao SUBTOTAL dessa classe. */
function bloco(h: LinhaHierarquica[], n: number): string[] {
  const k = chaves(h);
  const fim = k.indexOf(`SUB:${n}`);
  let ini = fim - 1;
  while (ini >= 0 && !k[ini]!.startsWith('SUB:')) ini--;
  return k.slice(ini + 1, fim + 1);
}

describe('hierarquizarBalancete — invariante: cada linha do núcleo exactamente uma vez', () => {
  const ANO8 = [deb('111', '10'), cred('811', '10')];
  const ANT8 = [deb('6111', '40'), cred('111', '40')];
  const cenarios: Array<[string, BalanceteVerificacaoNucleo]> = [
    ['principal', nucleoDe(MOV)],
    ['sintética com classe 8', nucleoDe(ANO8, ANT8)],
    ['só sintética na classe 8', nucleoDe([deb('111', '10'), cred('711', '10')], ANT8)],
  ];
  for (const [nome, nucleo] of cenarios) {
    it(`cenário ${nome}`, () => {
      cadaLinhaDoNucleoUmaVez(nucleo, hierarquizarBalancete(nucleo, CONTAS_BARALHADAS), nome);
    });
  }
});

describe('hierarquizarBalancete — planos defeituosos (G5)', () => {
  it('(1) ciclo em contaMaeId (11 → 111 → 11) termina e é tratado como cadeia partida: 111 pendura-se no nível 1 da classe', { timeout: 2000 }, () => {
    const plano = comCerca(trocar(CONTAS, '11', { contaMaeId: 'id-111' }));
    const mov = [deb('111', '100'), deb('1211', '50'), cred('711', '150')];
    const nucleo = montarBalanceteVerificacao({ contas: plano, movimento: mov, acumulado: mov, anteriores: [] });
    const h = hierarquizarBalancete(nucleo, plano);
    cadaLinhaDoNucleoUmaVez(nucleo, h, 'ciclo');
    // 111 sob «1» directamente; 11 (preso no ciclo, sem outra descendência) não aparece.
    expect(bloco(h, 1)).toEqual(['1', '111', '12', '121', '1211', 'SUB:1']);
    valores(porCodigo(h, '111'), { movD: '100', acumD: '100', saldoDevedor: '100' }, '111');
    valores(subtotal(h, 1), { movD: '150', acumD: '150', saldoDevedor: '150' }, 'SUB:1');
    mesmosValores(porCodigo(h, '1'), subtotal(h, 1), '1 = SUB:1');
    igual(nucleo.totais.movD, '150', 'totais.movD');
    expect(nucleo.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('(2) conta de nível 1 com contaMaeId para fora da lista não vira filha de si própria: o bloco aparece com as linhas', { timeout: 2000 }, () => {
    const plano = comCerca(trocar(CONTAS, '1', { contaMaeId: 'id-fantasma-raiz' }));
    const nucleo = montarBalanceteVerificacao({ contas: plano, movimento: MOV, acumulado: MOV, anteriores: [] });
    const h = hierarquizarBalancete(nucleo, plano);
    cadaLinhaDoNucleoUmaVez(nucleo, h, 'nível 1 órfão');
    expect(chaves(h)).toEqual(ORDEM_COMPLETA);
    // Sem dupla contagem no próprio «1».
    valores(porCodigo(h, '1'), { movD: '400', movC: '50', acumD: '400', acumC: '50', saldoDevedor: '350' }, '1');
    mesmosValores(porCodigo(h, '1'), subtotal(h, 1), '1 = SUB:1');
  });

  it('(3a) filha com classe diferente da mãe (121 CLASSE_2 sob 12 CLASSE_1) segue a árvore: fica no bloco da mãe efectiva', { timeout: 2000 }, () => {
    const plano = comCerca(trocar(CONTAS, '121', { classe: 'CLASSE_2' }));
    const nucleo = montarBalanceteVerificacao({ contas: plano, movimento: MOV, acumulado: MOV, anteriores: [] });
    const h = hierarquizarBalancete(nucleo, plano);
    cadaLinhaDoNucleoUmaVez(nucleo, h, 'classe trocada');
    expect(bloco(h, 1)).toEqual(['1', '11', '111', '12', '121', '1211', '1212', '131', 'SUB:1']);
    valores(porCodigo(h, '12'), { movD: '300', movC: '50', acumD: '300', acumC: '50', saldoDevedor: '250' }, '12');
    valores(porCodigo(h, '121'), { movD: '230', movC: '50', acumD: '230', acumC: '50', saldoDevedor: '180' }, '121');
  });

  it('(3b) conta de nível 1 com mãe (7 sob 6): nenhuma linha do núcleo se perde nem se repete', { timeout: 2000 }, () => {
    const plano = comCerca(trocar(CONTAS, '7', { contaMaeId: 'id-6' }));
    const nucleo = montarBalanceteVerificacao({ contas: plano, movimento: MOV, acumulado: MOV, anteriores: [] });
    const h = hierarquizarBalancete(nucleo, plano);
    cadaLinhaDoNucleoUmaVez(nucleo, h, 'nível 1 com mãe');
    expect(porCodigo(h, '711'), '711').toBeDefined();
  });
});
