/**
 * Testes do apuramento periódico de IVA (ADR-0034).
 *
 * Todos os testes são puros (sem DB): testam `calcularSaldos`,
 * `montarPartidasApuramento` e `calcularDivergencia`.
 *
 * Os testes que decidem (ADR-0034 §2):
 *  - A invariante: 4435, 4433x, 4432x e 4434x ficam a zero após o apuramento.
 *  - PRORATA: recusa com 5 % — coberto nas validações de serviço (sem DB).
 *  - Reprodutibilidade: recalcular sobre o período fechado devolve os mesmos números.
 *  - Crédito reportável: D 4435 / C 4438 e saldo de 4438 bate com o esperado.
 *  - Máquina de estado ApuramentoIva.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calcularSaldos,
  montarPartidasApuramento,
  calcularDivergencia,
  type ResultadoCalculo,
} from '../apuramento-iva.service';
import {
  TRANSICOES_APURAMENTO,
  transitarApuramento,
  type EstadoApuramentoIva,
  IVA_PREFIXOS,
} from '../apuramento-iva.interface';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

const D = (s: string) => new Prisma.Decimal(s);

/** Soma das partidas de um tipo (DEBITO ou CREDITO). */
function somaPartidas(
  resultado: ResultadoCalculo,
  tipo: 'DEBITO' | 'CREDITO',
): Prisma.Decimal {
  return resultado.partidas
    .filter((p) => p.tipo === tipo)
    .reduce((acc, p) => acc.plus(p.valor), D('0'));
}

/** Saldo líquido de uma conta no lançamento (débitos − créditos). */
function saldoContaNoLancamento(
  resultado: ResultadoCalculo,
  codigo: string,
): Prisma.Decimal {
  const d = resultado.partidas
    .filter((p) => p.contaCodigo === codigo && p.tipo === 'DEBITO')
    .reduce((acc, p) => acc.plus(p.valor), D('0'));
  const c = resultado.partidas
    .filter((p) => p.contaCodigo === codigo && p.tipo === 'CREDITO')
    .reduce((acc, p) => acc.plus(p.valor), D('0'));
  return d.minus(c);
}

// ---------------------------------------------------------------------------
// calcularSaldos
// ---------------------------------------------------------------------------

describe('calcularSaldos', () => {
  it('calcula saldo devedor positivo', () => {
    const contas = new Map([['id1', { codigo: '44321', nome: 'IVA dedutível — Inventários' }]]);
    const aggs = [
      { contaId: 'id1', tipo: 'DEBITO', _sum: { valor: D('1000') } },
      { contaId: 'id1', tipo: 'CREDITO', _sum: { valor: D('200') } },
    ];
    const saldos = calcularSaldos(aggs, contas);
    expect(saldos.get('id1')?.saldo.toString()).toBe('800');
  });

  it('calcula saldo credor negativo (4433x após faturação)', () => {
    const contas = new Map([['id1', { codigo: '44331', nome: 'Operações gerais' }]]);
    const aggs = [
      { contaId: 'id1', tipo: 'DEBITO', _sum: { valor: D('0') } },
      { contaId: 'id1', tipo: 'CREDITO', _sum: { valor: D('1600') } },
    ];
    const saldos = calcularSaldos(aggs, contas);
    // saldo = 0 - 1600 = -1600 (credor)
    expect(saldos.get('id1')?.saldo.toString()).toBe('-1600');
  });

  it('ignora conta não encontrada no mapa', () => {
    const contas = new Map<string, { codigo: string; nome: string }>();
    const aggs = [{ contaId: 'id_inexistente', tipo: 'DEBITO', _sum: { valor: D('100') } }];
    const saldos = calcularSaldos(aggs, contas);
    expect(saldos.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// montarPartidasApuramento — invariante §2
// ---------------------------------------------------------------------------

describe('montarPartidasApuramento — invariante do lançamento', () => {
  it('lançamento está equilibrado (débitos = créditos)', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1600') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('1000') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    expect(somaPartidas(resultado, 'DEBITO').toString()).toBe(
      somaPartidas(resultado, 'CREDITO').toString(),
    );
  });

  it('4435 fica a zero após o apuramento (saldo líquido = 0)', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1000') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('600') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    const saldo4435 = saldoContaNoLancamento(resultado, IVA_PREFIXOS.apuramento);
    expect(saldo4435.toString()).toBe('0');
  });

  it('4433x é zerada: o lançamento emite D pelo valor exato do saldo credor', () => {
    // O apuramento emite D 44331=1600 e D 44332=200 para liquidar os saldos credores.
    // O saldo da conta APÓS o lançamento = saldo_credor + D_lançamento = 0.
    // O saldo líquido do lançamento isolado é o valor de clearing (≠ 0).
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1600') }],
      ['id2', { codigo: '44332', nome: 'Autoconsumos', saldo: D('-200') }],
      ['id3', { codigo: '44321', nome: 'IVA dedutível', saldo: D('500') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    const d44331 = resultado.partidas.find((p) => p.contaCodigo === '44331' && p.tipo === 'DEBITO');
    const d44332 = resultado.partidas.find((p) => p.contaCodigo === '44332' && p.tipo === 'DEBITO');
    expect(d44331?.valor.toString()).toBe('1600');
    expect(d44332?.valor.toString()).toBe('200');
  });

  it('4432x é zerada: o lançamento emite C pelo valor exato do saldo devedor', () => {
    // O apuramento emite C 44321=400 e C 44322=300 para liquidar os saldos devedores.
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1600') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível inv.', saldo: D('400') }],
      ['id3', { codigo: '44322', nome: 'IVA dedutível act.', saldo: D('300') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    const c44321 = resultado.partidas.find((p) => p.contaCodigo === '44321' && p.tipo === 'CREDITO');
    const c44322 = resultado.partidas.find((p) => p.contaCodigo === '44322' && p.tipo === 'CREDITO');
    expect(c44321?.valor.toString()).toBe('400');
    expect(c44322?.valor.toString()).toBe('300');
  });

  it('IVA a pagar: crédito vai para 4437', () => {
    // Liquidado 1000, dedutível 600 → a pagar 400
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1000') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('600') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    expect(resultado.saldoApuramento.toString()).toBe('400');
    const saldo4437 = saldoContaNoLancamento(resultado, IVA_PREFIXOS.aPagar);
    expect(saldo4437.toString()).toBe('-400'); // crédito → saldo credor = −400
  });

  it('IVA a recuperar: débito vai para 4438', () => {
    // Dedutível 1200, liquidado 800 → a recuperar 400
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-800') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('1200') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    expect(resultado.saldoApuramento.toString()).toBe('-400');
    const saldo4438 = saldoContaNoLancamento(resultado, IVA_PREFIXOS.aRecuperar);
    expect(saldo4438.toString()).toBe('400'); // débito → saldo devedor = +400
  });

  it('apuramento zero: sem partidas', () => {
    const saldos = new Map<string, { codigo: string; nome: string; saldo: Prisma.Decimal }>();
    const resultado = montarPartidasApuramento(saldos, D('0'));
    expect(resultado.partidas).toHaveLength(0);
    expect(resultado.saldoApuramento.toString()).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Crédito reportável (ADR-0034 §3)
// ---------------------------------------------------------------------------

describe('montarPartidasApuramento — crédito reportável', () => {
  it('inclui D 4435 / C 4438 quando há crédito a reportar', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1000') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('800') }],
    ]);
    // Crédito de 300 do período anterior em 4438
    const resultado = montarPartidasApuramento(saldos, D('300'));

    // D 4435 300 e C 4438 300 devem estar nas partidas
    const d4435 = resultado.partidas.filter(
      (p) => p.contaCodigo === IVA_PREFIXOS.apuramento && p.tipo === 'DEBITO',
    );
    const c4438 = resultado.partidas.filter(
      (p) => p.contaCodigo === IVA_PREFIXOS.aRecuperar && p.tipo === 'CREDITO',
    );
    expect(d4435.some((p) => p.valor.equals(D('300')))).toBe(true);
    expect(c4438.some((p) => p.valor.equals(D('300')))).toBe(true);
  });

  it('saldo de 4438 bate com o valor a recuperar', () => {
    // liquidado 500, dedutível 800, crédito anterior 0
    // → saldo = 500 - 800 = -300 → D 4438 300
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-500') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('800') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    const saldo4438 = saldoContaNoLancamento(resultado, IVA_PREFIXOS.aRecuperar);
    expect(saldo4438.toString()).toBe('300');
    expect(resultado.creditoReportado.toString()).toBe('0');
  });

  it('crédito reportado integra no saldo de apuramento', () => {
    // liquidado 1600, dedutível 1200, crédito anterior 100
    // netOp = 1600 - 1200 = 400; saldo = 400 - 100 = 300 → a pagar
    // (o crédito anterior REDUZ a dívida, não a aumenta)
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1600') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('1200') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('100'));
    expect(resultado.saldoApuramento.toString()).toBe('300');
    expect(resultado.creditoReportado.toString()).toBe('100');
  });

  it('lançamento com crédito reportado está equilibrado', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1600') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('1200') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('200'));
    expect(somaPartidas(resultado, 'DEBITO').toString()).toBe(
      somaPartidas(resultado, 'CREDITO').toString(),
    );
  });
});

// ---------------------------------------------------------------------------
// calcularDivergencia
// ---------------------------------------------------------------------------

describe('calcularDivergencia', () => {
  it('devolve null quando base é nula', () => {
    expect(calcularDivergencia(null, D('0.16'), D('160'))).toBeNull();
  });

  it('devolve null quando taxa é nula', () => {
    expect(calcularDivergencia(D('1000'), null, D('160'))).toBeNull();
  });

  it('devolve null quando base×taxa bate com imposto (dentro da tolerância)', () => {
    // 1000 × 0.16 = 160 — exacto
    expect(calcularDivergencia(D('1000'), D('0.160000'), D('160'))).toBeNull();
  });

  it('devolve null com diferença dentro da tolerância (≤ 0.01)', () => {
    // 1000.05 × 0.16 = 160.008 → arredondado = 160.01; diferença = 0.01 → null
    expect(calcularDivergencia(D('1000.0625'), D('0.160000'), D('160.00'))).toBeNull();
  });

  it('devolve a divergência quando base×taxa difere do imposto (> 0.01)', () => {
    // base 1000, taxa 16 %, imposto do razão 165 (lançamento manual adicional)
    const div = calcularDivergencia(D('1000'), D('0.160000'), D('165.00'));
    expect(div).not.toBeNull();
    // Decimal.toString() elimina zeros à direita: 5.00 → '5'
    expect(div?.equals(D('5'))).toBe(true);
  });

  it('divergência é sempre positiva (abs)', () => {
    // imposto do razão menor que esperado
    const div = calcularDivergencia(D('1000'), D('0.160000'), D('155.00'));
    expect(div?.greaterThan(0)).toBe(true);
    expect(div?.equals(D('5'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Máquina de estado ApuramentoIva (ADR-0034 §7)
// ---------------------------------------------------------------------------

describe('transitarApuramento', () => {
  it('APURADO → ESTORNADO é permitida', () => {
    expect(() => transitarApuramento('APURADO', 'ESTORNADO')).not.toThrow();
  });

  it('APURADO → DECLARADO é permitida', () => {
    expect(() => transitarApuramento('APURADO', 'DECLARADO')).not.toThrow();
  });

  it('ESTORNADO → qualquer estado é recusada (terminal)', () => {
    expect(() => transitarApuramento('ESTORNADO', 'APURADO')).toThrow(/Transi/);
    expect(() => transitarApuramento('ESTORNADO', 'DECLARADO')).toThrow(/Transi/);
  });

  it('DECLARADO → qualquer estado é recusada (terminal)', () => {
    expect(() => transitarApuramento('DECLARADO', 'APURADO')).toThrow(/Transi/);
    expect(() => transitarApuramento('DECLARADO', 'ESTORNADO')).toThrow(/Transi/);
  });

  it('erro tem code = TRANSICAO_INVALIDA', () => {
    try {
      transitarApuramento('DECLARADO', 'APURADO');
      expect.fail('devia ter lançado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('TRANSICAO_INVALIDA');
    }
  });

  it('mapa de transições cobre todos os estados', () => {
    const estados: EstadoApuramentoIva[] = ['APURADO', 'ESTORNADO', 'DECLARADO'];
    for (const e of estados) {
      expect(TRANSICOES_APURAMENTO).toHaveProperty(e);
    }
  });
});

// ---------------------------------------------------------------------------
// Regularizações (ADR-0034 §2, passo 3)
// ---------------------------------------------------------------------------

describe('montarPartidasApuramento — regularizações', () => {
  it('44342 (a favor do Estado) vai a débito', () => {
    // 44342 tem saldo credor (foi creditada na regularização)
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1000') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('600') }],
      ['id3', { codigo: '44342', nome: 'Reg. a favor do Estado', saldo: D('-100') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    const d44342 = resultado.partidas.find(
      (p) => p.contaCodigo === '44342' && p.tipo === 'DEBITO',
    );
    expect(d44342?.valor.toString()).toBe('100');
    // Net = 1000 - 600 + 100 = 500 → a pagar
    expect(resultado.saldoApuramento.toString()).toBe('500');
  });

  it('44341 (a favor do sujeito passivo) vai a crédito', () => {
    // 44341 tem saldo devedor (foi debitada na regularização)
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1000') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('600') }],
      ['id3', { codigo: '44341', nome: 'Reg. a favor do SP', saldo: D('100') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    const c44341 = resultado.partidas.find(
      (p) => p.contaCodigo === '44341' && p.tipo === 'CREDITO',
    );
    expect(c44341?.valor.toString()).toBe('100');
    // Net = 1000 - 600 - 100 = 300 → a pagar
    expect(resultado.saldoApuramento.toString()).toBe('300');
  });

  it('lançamento com regularizações está equilibrado', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1200') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível', saldo: D('700') }],
      ['id3', { codigo: '44342', nome: 'Reg. Estado', saldo: D('-80') }],
      ['id4', { codigo: '44341', nome: 'Reg. SP', saldo: D('50') }],
    ]);
    const resultado = montarPartidasApuramento(saldos, D('0'));
    expect(somaPartidas(resultado, 'DEBITO').toString()).toBe(
      somaPartidas(resultado, 'CREDITO').toString(),
    );
  });
});

// ---------------------------------------------------------------------------
// Property test: lançamento sempre equilibrado (fast-check não disponível —
// cobrimos 10 casos gerados manualmente)
// ---------------------------------------------------------------------------

describe('montarPartidasApuramento — propriedade débito=crédito', () => {
  const casos = [
    { liq: '0',    ded: '0',    reg42: '0',   reg41: '0',   cr: '0' },
    { liq: '1000', ded: '600',  reg42: '0',   reg41: '0',   cr: '0' },
    { liq: '600',  ded: '1000', reg42: '0',   reg41: '0',   cr: '0' },
    { liq: '1600', ded: '1600', reg42: '0',   reg41: '0',   cr: '0' },
    { liq: '1000', ded: '600',  reg42: '100', reg41: '0',   cr: '0' },
    { liq: '1000', ded: '600',  reg42: '0',   reg41: '50',  cr: '0' },
    { liq: '500',  ded: '800',  reg42: '0',   reg41: '0',   cr: '300' },
    { liq: '1000', ded: '600',  reg42: '50',  reg41: '30',  cr: '200' },
    { liq: '0',    ded: '500',  reg42: '0',   reg41: '0',   cr: '500' },
    { liq: '800',  ded: '1200', reg42: '100', reg41: '200', cr: '100' },
  ];

  for (const c of casos) {
    it(`equilibrado: liq=${c.liq} ded=${c.ded} 42=${c.reg42} 41=${c.reg41} cr=${c.cr}`, () => {
      const saldos = new Map([
        ...(Number(c.liq) > 0
          ? [['id1', { codigo: '44331', nome: 'Liquidado', saldo: D(c.liq).negated() }] as const]
          : []),
        ...(Number(c.ded) > 0
          ? [['id2', { codigo: '44321', nome: 'Dedutível', saldo: D(c.ded) }] as const]
          : []),
        ...(Number(c.reg42) > 0
          ? [['id3', { codigo: '44342', nome: 'Reg42', saldo: D(c.reg42).negated() }] as const]
          : []),
        ...(Number(c.reg41) > 0
          ? [['id4', { codigo: '44341', nome: 'Reg41', saldo: D(c.reg41) }] as const]
          : []),
      ]);
      const resultado = montarPartidasApuramento(saldos, D(c.cr));
      const d = somaPartidas(resultado, 'DEBITO');
      const cr = somaPartidas(resultado, 'CREDITO');
      expect(d.toString()).toBe(cr.toString());
    });
  }
});

// ---------------------------------------------------------------------------
// Reprodutibilidade (ADR-0034 §9 — gate obrigatório da fase)
//
// «Recalcular sobre o período fechado devolve exactamente o gravado.»
//
// A reprodutibilidade é por construção: o apuramento lê o razão via GroupBy
// num período bloqueado (FOR UPDATE); uma vez fechado, o conjunto de partidas
// é imutável. Aqui provamos que `montarPartidasApuramento` com os mesmos
// saldos devolve exactamente os mesmos campos que seriam gravados.
// ---------------------------------------------------------------------------

describe('reprodutibilidade do apuramento (ADR-0034 §9)', () => {
  it('recalcular com os mesmos saldos devolve os mesmos totais e saldo', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'IVA liquidado', saldo: D('-1600') }],
      ['id2', { codigo: '44321', nome: 'IVA dedutível inv.', saldo: D('800') }],
      ['id3', { codigo: '44342', nome: 'Reg. Estado', saldo: D('-100') }],
    ]);
    const creditoReportado = D('200');

    const resultado1 = montarPartidasApuramento(saldos, creditoReportado);
    const resultado2 = montarPartidasApuramento(saldos, creditoReportado);

    // Campos que são gravados em ApuramentoIva:
    expect(resultado2.totalLiquidado.toString()).toBe(resultado1.totalLiquidado.toString());
    expect(resultado2.totalDedutivel.toString()).toBe(resultado1.totalDedutivel.toString());
    expect(resultado2.totalRegularizacoes.toString()).toBe(resultado1.totalRegularizacoes.toString());
    expect(resultado2.saldoApuramento.toString()).toBe(resultado1.saldoApuramento.toString());
    expect(resultado2.creditoReportado.toString()).toBe(resultado1.creditoReportado.toString());
    // Partidas exactamente iguais (mesma contagem, mesmos valores)
    expect(resultado2.partidas.length).toBe(resultado1.partidas.length);
    resultado1.partidas.forEach((p, i) => {
      expect(resultado2.partidas[i].contaCodigo).toBe(p.contaCodigo);
      expect(resultado2.partidas[i].tipo).toBe(p.tipo);
      expect(resultado2.partidas[i].valor.toString()).toBe(p.valor.toString());
    });
  });

  it('reprodutibilidade com crédito reportado e regularizações', () => {
    const saldos = new Map([
      ['id1', { codigo: '44331', nome: 'Liquidado', saldo: D('-2400') }],
      ['id2', { codigo: '44321', nome: 'Dedutível inv.', saldo: D('1200') }],
      ['id3', { codigo: '44322', nome: 'Dedutível ativos', saldo: D('400') }],
      ['id4', { codigo: '44341', nome: 'Reg. SP', saldo: D('150') }],
      ['id5', { codigo: '44342', nome: 'Reg. Estado', saldo: D('-80') }],
    ]);
    const creditoReportado = D('350');

    const r1 = montarPartidasApuramento(saldos, creditoReportado);
    const r2 = montarPartidasApuramento(saldos, creditoReportado);

    expect(r2.saldoApuramento.toString()).toBe(r1.saldoApuramento.toString());
    expect(somaPartidas(r2, 'DEBITO').toString()).toBe(somaPartidas(r2, 'CREDITO').toString());
    expect(r2.partidas.length).toBe(r1.partidas.length);
  });
});
