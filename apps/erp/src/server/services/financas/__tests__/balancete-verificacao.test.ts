// ---------------------------------------------------------------------------
// Balancete de verificação no modelo PHC — oráculo do NÚCLEO PURO
// (`montarBalanceteVerificacao`). Run balancete-phc, nó F6.S1a, issue #280,
// ADR-0040 §3–§5, contrato .scratch/sdlc/balancete-phc/S1-contrato.md.
//
// Escrito pelo AUTOR DO ORÁCULO antes de existir `../balancete-verificacao`:
// enquanto o módulo não existir, este ficheiro rebenta na resolução do import —
// é a prova vermelha. Os números esperados foram apurados À MÃO a partir das
// regras do ADR-0040, nunca da implementação. Um agente de implementação que
// altere este ficheiro é BLOCKER (doutrina 00 §2). NUNCA `vitest -u`.
//
// Plano de contas pequeno e plausível: mães (aceitaLancamento=false) e folhas
// das classes 1, 2, 4, 5, 6, 7 e 8, com nivel/contaMaeId coerentes.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import {
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type BalanceteVerificacaoNucleo,
  type ContaBV,
  type LinhaBV,
} from '../balancete-verificacao';

const D = (v: string | number) => new Prisma.Decimal(v);

function conta(
  codigo: string,
  classe: ClassePGC,
  natureza: NaturezaConta,
  nivel: number,
  contaMaeId: string | null,
  aceitaLancamento: boolean,
): ContaBV {
  return { id: `id-${codigo}`, codigo, nome: `Conta ${codigo}`, classe, natureza, nivel, contaMaeId, aceitaLancamento };
}

// Mães
const M1 = conta('1', 'CLASSE_1', 'DEVEDORA', 1, null, false);
const M11 = conta('11', 'CLASSE_1', 'DEVEDORA', 2, M1.id, false);
const M12 = conta('12', 'CLASSE_1', 'DEVEDORA', 2, M1.id, false);
const M2 = conta('2', 'CLASSE_2', 'DEVEDORA', 1, null, false);
const M21 = conta('21', 'CLASSE_2', 'DEVEDORA', 2, M2.id, false);
const M4 = conta('4', 'CLASSE_4', 'DEVEDORA', 1, null, false);
const M42 = conta('42', 'CLASSE_4', 'DEVEDORA', 2, M4.id, false);
const M5 = conta('5', 'CLASSE_5', 'CREDORA', 1, null, false);
const M6 = conta('6', 'CLASSE_6', 'DEVEDORA', 1, null, false);
const M61 = conta('61', 'CLASSE_6', 'DEVEDORA', 2, M6.id, false);
const M7 = conta('7', 'CLASSE_7', 'CREDORA', 1, null, false);
const M71 = conta('71', 'CLASSE_7', 'CREDORA', 2, M7.id, false);
const M8 = conta('8', 'CLASSE_8', 'CREDORA', 1, null, false);
const M81 = conta('81', 'CLASSE_8', 'CREDORA', 2, M8.id, false);

// Folhas
const C111 = conta('111', 'CLASSE_1', 'DEVEDORA', 3, M11.id, true); // Caixa
const C121 = conta('121', 'CLASSE_1', 'DEVEDORA', 3, M12.id, true); // Depósitos à ordem
const C211 = conta('211', 'CLASSE_2', 'DEVEDORA', 3, M21.id, true); // Clientes
const C421 = conta('421', 'CLASSE_4', 'DEVEDORA', 3, M42.id, true); // DEVEDORA de propósito (como no seed)
const C51 = conta('51', 'CLASSE_5', 'CREDORA', 2, M5.id, true); // Capital
const C6112 = conta('6112', 'CLASSE_6', 'DEVEDORA', 3, M61.id, true); // Custo das vendas
const C711 = conta('711', 'CLASSE_7', 'CREDORA', 3, M71.id, true); // Vendas
const C811 = conta('811', 'CLASSE_8', 'CREDORA', 3, M81.id, true); // Resultados transitados

const MAES = [M1, M11, M12, M2, M21, M4, M42, M5, M6, M61, M7, M71, M8, M81];
const FOLHAS = [C111, C121, C211, C421, C51, C6112, C711, C811];
// Ordem de entrada baralhada de propósito: a ordenação é responsabilidade do núcleo.
const CONTAS: ContaBV[] = [C711, M7, C211, M1, C6112, C51, M81, C121, M5, C811, M42, C111, M61, C421, M2, M11, M12, M21, M4, M6, M71, M8];

const ag = (c: ContaBV | string, tipo: 'DEBITO' | 'CREDITO', valor: string | null): AgregadoPartidaBV => ({
  contaId: typeof c === 'string' ? c : c.id,
  tipo,
  _sum: { valor: valor === null ? null : D(valor) },
});
const deb = (c: ContaBV | string, v: string | null) => ag(c, 'DEBITO', v);
const cred = (c: ContaBV | string, v: string | null) => ag(c, 'CREDITO', v);

/** Igualdade monetária exacta: tem de ser Prisma.Decimal e `equals`, nunca number. */
function igual(actual: unknown, esperado: string, onde: string): void {
  expect(actual instanceof Prisma.Decimal, `${onde}: esperava Prisma.Decimal, veio ${typeof actual}`).toBe(true);
  const d = actual as Prisma.Decimal;
  expect(d.equals(D(esperado)), `${onde}: devolveu ${d.toFixed()}, esperava ${esperado}`).toBe(true);
}

type Esperado = { movD?: string; movC?: string; acumD?: string; acumC?: string; saldoDevedor?: string; saldoCredor?: string };
function linhaIgual(l: LinhaBV | undefined, e: Esperado, onde: string): void {
  expect(l, `${onde}: linha em falta`).toBeDefined();
  igual(l!.movD, e.movD ?? '0', `${onde}.movD`);
  igual(l!.movC, e.movC ?? '0', `${onde}.movC`);
  igual(l!.acumD, e.acumD ?? '0', `${onde}.acumD`);
  igual(l!.acumC, e.acumC ?? '0', `${onde}.acumC`);
  igual(l!.saldoDevedor, e.saldoDevedor ?? '0', `${onde}.saldoDevedor`);
  igual(l!.saldoCredor, e.saldoCredor ?? '0', `${onde}.saldoCredor`);
}

function totaisIguais(r: BalanceteVerificacaoNucleo, e: Required<Esperado>): void {
  igual(r.totais.movD, e.movD, 'totais.movD');
  igual(r.totais.movC, e.movC, 'totais.movC');
  igual(r.totais.acumD, e.acumD, 'totais.acumD');
  igual(r.totais.acumC, e.acumC, 'totais.acumC');
  igual(r.totais.saldoDevedor, e.saldoDevedor, 'totais.saldoDevedor');
  igual(r.totais.saldoCredor, e.saldoCredor, 'totais.saldoCredor');
}

const linhaDe = (r: BalanceteVerificacaoNucleo, c: ContaBV) => r.linhas.find((l) => l.conta?.id === c.id);
const sintetica = (r: BalanceteVerificacaoNucleo) => r.linhas.filter((l) => l.conta === null);
const codigos = (r: BalanceteVerificacaoNucleo) => r.linhas.filter((l) => l.conta !== null).map((l) => l.conta!.codigo);

/** Invariantes de forma que valem para QUALQUER saída do núcleo. */
function invariantesDeForma(r: BalanceteVerificacaoNucleo): void {
  for (const l of r.linhas) {
    const onde = l.conta?.codigo ?? '(sintética)';
    // Saldo repartido: nunca negativo, nunca dos dois lados.
    expect(l.saldoDevedor.isNegative(), `${onde}: saldoDevedor negativo`).toBe(false);
    expect(l.saldoCredor.isNegative(), `${onde}: saldoCredor negativo`).toBe(false);
    expect(l.saldoDevedor.isZero() || l.saldoCredor.isZero(), `${onde}: saldo dos dois lados`).toBe(true);
    // saldo = acumD − acumC
    expect(l.saldoDevedor.minus(l.saldoCredor).equals(l.acumD.minus(l.acumC)), `${onde}: saldo ≠ acumD − acumC`).toBe(true);
    // Conta real nunca é implícita. (S1 iter 2, decisão (b): uma conta de `contas` com
    // aceitaLancamento=false que TENHA agregados aparece — mães sem partidas continuam fora.)
    if (l.conta) {
      expect(l.implicita, `${onde}: conta real marcada implícita`).toBe(false);
    } else {
      expect(l.implicita, 'linha sem conta tem de ser a sintética (implicita=true)').toBe(true);
      expect(l.contraNatureza, 'a sintética nunca é contra natureza').toBe(false);
    }
  }
  // Totais = soma das linhas (folhas + sintética), coluna a coluna.
  const soma = (k: keyof Pick<LinhaBV, 'movD' | 'movC' | 'acumD' | 'acumC' | 'saldoDevedor' | 'saldoCredor'>) =>
    r.linhas.reduce((s, l) => s.plus(l[k]), D(0));
  for (const k of ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const) {
    expect(r.totais[k].equals(soma(k)), `totais.${k} ≠ Σ linhas.${k}`).toBe(true);
  }
  // As igualdades são as do Decimal sobre os totais.
  expect(r.equilibrio.movimento).toBe(r.totais.movD.equals(r.totais.movC));
  expect(r.equilibrio.acumulado).toBe(r.totais.acumD.equals(r.totais.acumC));
  expect(r.equilibrio.saldo).toBe(r.totais.saldoDevedor.equals(r.totais.saldoCredor));
  // A flag da sintética corresponde à sua existência.
  expect(r.temResultadosAnterioresPorEncerrar).toBe(sintetica(r).length === 1);
  expect(sintetica(r).length).toBeLessThanOrEqual(1);
}

// Exercício simples: venda 1000 (121 / 711) e custo 400 (6112 / 121).
const ANO_SIMPLES: AgregadoPartidaBV[] = [deb(C121, '1000'), cred(C711, '1000'), deb(C6112, '400'), cred(C121, '400')];

describe('montarBalanceteVerificacao — só folhas, ordenação, somas', () => {
  it('lista só folhas com movimento, ordenadas por código (lexicográfico do PGC), sem mães', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO_SIMPLES, acumulado: ANO_SIMPLES, anteriores: [] });
    invariantesDeForma(r);
    expect(codigos(r)).toEqual(['121', '6112', '711']);
    for (const m of MAES) expect(linhaDe(r, m), `mãe ${m.codigo} não entra no S1`).toBeUndefined();
    expect(sintetica(r)).toHaveLength(0);
  });

  it('ordena por código como texto, hierárquico (51 depois de 421 e antes de 6112 — numérico poria 51 primeiro)', () => {
    const movimento = [
      deb(C111, '1'), deb(C121, '1'), deb(C211, '1'), deb(C421, '1'),
      cred(C51, '1'), deb(C6112, '1'), cred(C711, '1'), cred(C811, '2'),
    ];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [] });
    invariantesDeForma(r);
    expect(codigos(r)).toEqual(FOLHAS.map((f) => f.codigo).sort());
    expect(codigos(r)).toEqual(['111', '121', '211', '421', '51', '6112', '711', '811']);
  });

  it('soma movD/movC do movimento e acumD/acumC do acumulado, e reparte o saldo', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO_SIMPLES, acumulado: ANO_SIMPLES, anteriores: [] });
    linhaIgual(linhaDe(r, C121), { movD: '1000', movC: '400', acumD: '1000', acumC: '400', saldoDevedor: '600' }, '121');
    linhaIgual(linhaDe(r, C6112), { movD: '400', acumD: '400', saldoDevedor: '400' }, '6112');
    linhaIgual(linhaDe(r, C711), { movC: '1000', acumC: '1000', saldoCredor: '1000' }, '711');
    totaisIguais(r, { movD: '1400', movC: '1400', acumD: '1400', acumC: '1400', saldoDevedor: '1000', saldoCredor: '1000' });
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
    expect(r.temAberturaImplicita).toBe(false);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(false);
  });

  it('o movimento é o do intervalo e o acumulado o de 1..final: uma folha sem movimento no intervalo aparece pelo acumulado', () => {
    // Períodos 1..final: o ano simples. Intervalo [inicial..final]: só uma venda de 200.
    const movimento = [deb(C121, '200'), cred(C711, '200')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: ANO_SIMPLES, anteriores: [] });
    invariantesDeForma(r);
    expect(codigos(r)).toEqual(['121', '6112', '711']);
    linhaIgual(linhaDe(r, C121), { movD: '200', acumD: '1000', acumC: '400', saldoDevedor: '600' }, '121');
    linhaIgual(linhaDe(r, C6112), { acumD: '400', saldoDevedor: '400' }, '6112 (só acumulado)');
    linhaIgual(linhaDe(r, C711), { movC: '200', acumC: '1000', saldoCredor: '1000' }, '711');
    totaisIguais(r, { movD: '200', movC: '200', acumD: '1400', acumC: '1400', saldoDevedor: '1000', saldoCredor: '1000' });
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('trata a soma nula do groupBy como zero', () => {
    const movimento = [deb(C121, '100'), cred(C121, null), cred(C711, '100'), deb(C711, null)];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [] });
    invariantesDeForma(r);
    linhaIgual(linhaDe(r, C121), { movD: '100', acumD: '100', saldoDevedor: '100' }, '121');
    linhaIgual(linhaDe(r, C711), { movC: '100', acumC: '100', saldoCredor: '100' }, '711');
  });
});

describe('montarBalanceteVerificacao — saldo repartido e contra natureza', () => {
  it('saldo nulo: a folha aparece (há acumulado) com devedor e credor ambos a zero', () => {
    const movimento = [deb(C211, '500'), cred(C711, '500'), deb(C121, '500'), cred(C211, '500')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [] });
    invariantesDeForma(r);
    const l = linhaDe(r, C211);
    linhaIgual(l, { movD: '500', movC: '500', acumD: '500', acumC: '500' }, '211');
    expect(l!.contraNatureza).toBe(false);
  });

  it('assinala contra natureza: DEVEDORA com saldo credor e CREDORA com saldo devedor; nunca no lado da natureza', () => {
    const movimento = [
      deb(C121, '300'), cred(C421, '300'), // 421 DEVEDORA fica credora
      deb(C711, '50'), cred(C121, '50'), // 711 CREDORA fica devedora
      deb(C111, '80'), cred(C51, '80'), // 111 DEVEDORA devedora; 51 CREDORA credora
    ];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [] });
    invariantesDeForma(r);
    const l421 = linhaDe(r, C421)!;
    linhaIgual(l421, { movC: '300', acumC: '300', saldoCredor: '300' }, '421');
    expect(l421.contraNatureza, '421 DEVEDORA com saldo credor').toBe(true);
    const l711 = linhaDe(r, C711)!;
    linhaIgual(l711, { movD: '50', acumD: '50', saldoDevedor: '50' }, '711');
    expect(l711.contraNatureza, '711 CREDORA com saldo devedor').toBe(true);
    expect(linhaDe(r, C111)!.contraNatureza, '111 DEVEDORA devedora').toBe(false);
    expect(linhaDe(r, C51)!.contraNatureza, '51 CREDORA credora').toBe(false);
    expect(linhaDe(r, C121)!.contraNatureza, '121 DEVEDORA devedora (250)').toBe(false);
    linhaIgual(linhaDe(r, C121), { movD: '300', movC: '50', acumD: '300', acumC: '50', saldoDevedor: '250' }, '121');
  });
});

describe('montarBalanceteVerificacao — abertura implícita (ADR-0040 §4)', () => {
  // Histórico anterior ao exercício, equilibrado: ΣD = 5000+200+700 = 5900 = 1000+3000+200+1700 = ΣC.
  //   121  D 5000 C 1000 → líquido +4000 (devedor)
  //   51   C 3000        → líquido −3000 (credor) — sem movimento no ano
  //   211  D 200  C 200  → líquido 0 — sem movimento no ano ⇒ não aparece
  //   6112 D 700         → classes 6/7: R = 700 − 1700 = −1000 ⇒ sintética com acumC 1000
  //   711  C 1700
  const ANTERIORES: AgregadoPartidaBV[] = [
    deb(C121, '5000'), cred(C121, '1000'), cred(C51, '3000'),
    deb(C211, '200'), cred(C211, '200'), deb(C6112, '700'), cred(C711, '1700'),
  ];
  const ANO: AgregadoPartidaBV[] = [deb(C121, '100'), cred(C711, '100')];

  it('classes 1–5: o LÍQUIDO anterior entra no acumulado do lado certo (não os D/C brutos); o movimento não muda', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO, acumulado: ANO, anteriores: ANTERIORES });
    invariantesDeForma(r);
    // 121: 100 do ano + 4000 líquidos — NUNCA 5100/1000.
    linhaIgual(linhaDe(r, C121), { movD: '100', acumD: '4100', saldoDevedor: '4100' }, '121');
    // 51: só saldo anterior, sem movimento no ano — aparece na mesma.
    linhaIgual(linhaDe(r, C51), { acumC: '3000', saldoCredor: '3000' }, '51');
    // 211: líquido anterior zero e sem movimento — não aparece.
    expect(linhaDe(r, C211)).toBeUndefined();
    expect(r.temAberturaImplicita).toBe(true);
  });

  it('classes 6/7: o líquido anterior NÃO entra conta a conta — vai para UMA linha sintética no fim, do lado certo', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO, acumulado: ANO, anteriores: ANTERIORES });
    invariantesDeForma(r);
    // 6112 só tinha histórico anterior ⇒ não aparece.
    expect(linhaDe(r, C6112), '6112 não recebe o anterior conta a conta').toBeUndefined();
    // 711 só com o ano: sem os 1700 anteriores.
    linhaIgual(linhaDe(r, C711), { movC: '100', acumC: '100', saldoCredor: '100' }, '711');
    const s = sintetica(r);
    expect(s).toHaveLength(1);
    expect(s[0]!.conta).toBeNull();
    expect(s[0]!.implicita).toBe(true);
    expect(s[0]!.contraNatureza).toBe(false);
    linhaIgual(s[0], { acumC: '1000', saldoCredor: '1000' }, 'sintética (R = −1000)');
    expect(r.linhas.at(-1), 'a sintética fica no fim (depois da classe 8)').toBe(s[0]);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(true);
    expect(codigos(r)).toEqual(['121', '51', '711']);
  });

  it('com histórico anterior e 6/7 por encerrar, as três igualdades fecham graças à sintética; totais = folhas + sintética', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO, acumulado: ANO, anteriores: ANTERIORES });
    invariantesDeForma(r);
    // acumD: 121 4100 · acumC: 51 3000 + 711 100 + sintética 1000
    totaisIguais(r, { movD: '100', movC: '100', acumD: '4100', acumC: '4100', saldoDevedor: '4100', saldoCredor: '4100' });
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('resultado anterior positivo (prejuízo por encerrar): sintética a débito; conta de balanço em crédito fica contra natureza', () => {
    // Ano anterior: gasto de 1000 pago pelo banco. 121 líquido −1000; R = +1000.
    const anteriores = [deb(C6112, '1000'), cred(C121, '1000')];
    const ano = [deb(C121, '2000'), cred(C711, '2000')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ano, acumulado: ano, anteriores });
    invariantesDeForma(r);
    linhaIgual(linhaDe(r, C121), { movD: '2000', acumD: '2000', acumC: '1000', saldoDevedor: '1000' }, '121');
    linhaIgual(sintetica(r)[0], { acumD: '1000', saldoDevedor: '1000' }, 'sintética (R = +1000)');
    totaisIguais(r, { movD: '2000', movC: '2000', acumD: '3000', acumC: '3000', saldoDevedor: '2000', saldoCredor: '2000' });
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });

    // Só histórico: 121 fica credora (DEVEDORA ⇒ contra natureza).
    const r2 = montarBalanceteVerificacao({ contas: CONTAS, movimento: [], acumulado: [], anteriores });
    invariantesDeForma(r2);
    const l = linhaDe(r2, C121)!;
    linhaIgual(l, { acumC: '1000', saldoCredor: '1000' }, '121 só com anterior');
    expect(l.contraNatureza).toBe(true);
    expect(r2.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('classe 8 entra conta a conta (como as de balanço), não na sintética', () => {
    const anteriores = [deb(C121, '500'), cred(C811, '500')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: [], acumulado: [], anteriores });
    invariantesDeForma(r);
    linhaIgual(linhaDe(r, C811), { acumC: '500', saldoCredor: '500' }, '811');
    linhaIgual(linhaDe(r, C121), { acumD: '500', saldoDevedor: '500' }, '121');
    expect(sintetica(r)).toHaveLength(0);
    expect(r.temAberturaImplicita).toBe(true);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(false);
    totaisIguais(r, { movD: '0', movC: '0', acumD: '500', acumC: '500', saldoDevedor: '500', saldoCredor: '500' });
  });

  it('classes 6/7 anteriores que se anulam (R = 0) não criam a sintética', () => {
    const anteriores = [deb(C6112, '500'), cred(C711, '500')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO, acumulado: ANO, anteriores });
    invariantesDeForma(r);
    expect(sintetica(r)).toHaveLength(0);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(false);
    expect(linhaDe(r, C6112)).toBeUndefined();
    linhaIgual(linhaDe(r, C711), { movC: '100', acumC: '100', saldoCredor: '100' }, '711');
  });

  it('anteriores = null (o exercício tem lançamentos no diário AB): nenhuma abertura, nenhuma sintética', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO, acumulado: ANO, anteriores: null });
    invariantesDeForma(r);
    linhaIgual(linhaDe(r, C121), { movD: '100', acumD: '100', saldoDevedor: '100' }, '121 sem abertura');
    expect(linhaDe(r, C51), '51 só tinha anterior — sem abertura não aparece').toBeUndefined();
    expect(sintetica(r)).toHaveLength(0);
    expect(r.temAberturaImplicita).toBe(false);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(false);
    expect(codigos(r)).toEqual(['121', '711']);
    totaisIguais(r, { movD: '100', movC: '100', acumD: '100', acumC: '100', saldoDevedor: '100', saldoCredor: '100' });
  });

  it('anteriores = [] (sem histórico): nenhuma abertura aplicada', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO, acumulado: ANO, anteriores: [] });
    invariantesDeForma(r);
    expect(r.temAberturaImplicita).toBe(false);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(false);
  });
});

describe('montarBalanceteVerificacao — igualdades detectam desequilíbrio', () => {
  it('movimento desequilibrado: as três igualdades falham', () => {
    const movimento = [deb(C121, '100')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [] });
    invariantesDeForma(r);
    expect(r.equilibrio).toEqual({ movimento: false, acumulado: false, saldo: false });
  });

  it('movimento equilibrado mas acumulado não: só o movimento fecha', () => {
    const movimento = [deb(C121, '100'), cred(C711, '100')];
    const acumulado = [deb(C121, '150'), cred(C711, '100')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado, anteriores: [] });
    invariantesDeForma(r);
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: false, saldo: false });
  });

  it('histórico anterior desequilibrado: acumulado e saldo falham, movimento fecha', () => {
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ANO_SIMPLES, acumulado: ANO_SIMPLES, anteriores: [deb(C121, '100')] });
    invariantesDeForma(r);
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: false, saldo: false });
  });
});

describe('montarBalanceteVerificacao — guarda multi-tenant', () => {
  it('descarta agregados de contas que não estão em `contas` (outro tenant) — em movimento, acumulado e anteriores', () => {
    const alheia = 'id-de-outro-tenant';
    const movimento = [...ANO_SIMPLES, deb(alheia, '999')];
    const acumulado = [...ANO_SIMPLES, deb(alheia, '999')];
    const anteriores = [cred(alheia, '777')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado, anteriores });
    invariantesDeForma(r);
    expect(r.linhas.some((l) => l.conta?.id === alheia)).toBe(false);
    expect(codigos(r)).toEqual(['121', '6112', '711']);
    expect(sintetica(r)).toHaveLength(0);
    totaisIguais(r, { movD: '1400', movC: '1400', acumD: '1400', acumC: '1400', saldoDevedor: '1000', saldoCredor: '1000' });
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });
});

describe('montarBalanceteVerificacao — exactidão decimal', () => {
  it('0.1 + 0.2 = 0.3 exactamente, nos totais e nas igualdades (sem passar por float)', () => {
    const movimento = [deb(C111, '0.1'), deb(C121, '0.2'), cred(C711, '0.3')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [] });
    invariantesDeForma(r);
    expect(r.totais.movD.toString()).toBe('0.3');
    expect(r.totais.acumD.toString()).toBe('0.3');
    expect(r.totais.saldoDevedor.toString()).toBe('0.3');
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('abertura implícita com cêntimos: líquido exacto e sintética exacta', () => {
    // 121 D 0.3 C 0.1 → +0.2 ; 711 C 0.7 + 6112 D 0.5 → R = −0.2
    const anteriores = [deb(C121, '0.3'), cred(C121, '0.1'), deb(C6112, '0.5'), cred(C711, '0.7')];
    const ano = [deb(C121, '0.1'), cred(C711, '0.1')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: ano, acumulado: ano, anteriores });
    invariantesDeForma(r);
    expect(linhaDe(r, C121)!.acumD.toString()).toBe('0.3');
    expect(linhaDe(r, C121)!.saldoDevedor.toString()).toBe('0.3');
    expect(sintetica(r)[0]!.acumC.toString()).toBe('0.2');
    expect(r.totais.acumD.toString()).toBe('0.3');
    expect(r.totais.acumC.toString()).toBe('0.3');
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });
});

// ---------------------------------------------------------------------------
// S1 iter 2 (ledger RUN.md ## Changes, 2026-10-01) — acrescentado depois da
// revisão G5, pelo mesmo autor do oráculo.
// ---------------------------------------------------------------------------
describe('montarBalanceteVerificacao — S1 iter 2', () => {
  it('(b) conta com aceitaLancamento=false MAS com agregados aparece e conta nos totais (senão «desequilibrado» sem causa visível)', () => {
    // 42 é mãe no plano (aceitaLancamento=false) e, por um dado anómalo, tem partidas.
    const movimento = [deb(M42, '100'), cred(C711, '100')];
    const anteriores = [deb(M42, '50'), cred(C51, '50')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores });
    invariantesDeForma(r);
    // Ordem por código como texto: '42' < '51' < '711'.
    expect(codigos(r)).toEqual(['42', '51', '711']);
    // Classe 4: o líquido anterior entra conta a conta, como em qualquer conta de balanço.
    linhaIgual(linhaDe(r, M42), { movD: '100', acumD: '150', saldoDevedor: '150' }, '42 (mãe com agregados)');
    totaisIguais(r, { movD: '100', movC: '100', acumD: '150', acumC: '150', saldoDevedor: '150', saldoCredor: '150' });
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
    // Mães SEM agregados continuam fora.
    for (const m of MAES.filter((x) => x.id !== M42.id)) expect(linhaDe(r, m), `mãe ${m.codigo}`).toBeUndefined();
  });

  it('(b) a guarda multi-tenant mantém-se: ids fora de `contas` continuam descartados, mesmo ao lado de uma mãe com agregados', () => {
    const movimento = [deb(M42, '100'), cred(C711, '100'), deb('id-de-outro-tenant', '999')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento, acumulado: movimento, anteriores: [cred('id-de-outro-tenant', '1')] });
    invariantesDeForma(r);
    expect(codigos(r)).toEqual(['42', '711']);
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('temAberturaImplicita é true com a sintética — incluindo quando ela é o ÚNICO saldo anterior aplicado (só 6/7)', () => {
    // Histórico equilibrado: 6112 D 300, 811 D 200 / 711 C 500 ⇒ R = −200 (sintética) e 811 +200.
    const ant = [deb(C6112, '300'), cred(C711, '500'), deb(C811, '200')];
    const r = montarBalanceteVerificacao({ contas: CONTAS, movimento: [], acumulado: [], anteriores: ant });
    invariantesDeForma(r);
    linhaIgual(sintetica(r)[0], { acumC: '200', saldoCredor: '200' }, 'sintética');
    linhaIgual(linhaDe(r, C811), { acumD: '200', saldoDevedor: '200' }, '811');
    expect(r.temAberturaImplicita).toBe(true);

    // Variante sem nenhuma conta 1–5/8 com líquido ≠ 0: anterior só 6/7, desequilibrado de propósito.
    const r2 = montarBalanceteVerificacao({ contas: CONTAS, movimento: [], acumulado: [], anteriores: [deb(C6112, '300')] });
    invariantesDeForma(r2);
    expect(r2.linhas.filter((l) => l.conta !== null)).toHaveLength(0);
    linhaIgual(sintetica(r2)[0], { acumD: '300', saldoDevedor: '300' }, 'sintética (só 6/7)');
    expect(r2.temAberturaImplicita, 'ledger 2026-10-01: true sempre que algum saldo anterior entra, incl. só a sintética').toBe(true);
  });
});
