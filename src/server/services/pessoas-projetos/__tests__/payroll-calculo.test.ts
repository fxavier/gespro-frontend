/**
 * Testes do motor de cálculo de folha salarial (Spec 06) — módulo crítico.
 *
 * Golden tests: validam o IRPS contra a tabela progressiva do art. 54 do CIRPS
 * (Lei 20/2013) mensalizada (limites e parcelas anuais ÷ 12) e o INSS contra a
 * taxa contributiva oficial (trabalhador 3% / entidade 4% — Lei 4/2007,
 * Decreto 51/2017; https://www.inss.gov.mz/taxa-contributiva-tco/).
 *
 * Property tests (fast-check): invariantes da skill fiscalidade-mz.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';
import {
  arredondar2,
  calcularIRPS,
  calcularPayroll,
  calcularDescontoFalta,
  valorizarHorasExtras,
  type EntradaCalculoPayroll,
  type EscalaoIRPSVigente,
  type TabelaINSSVigente,
} from '../payroll-calculo';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas de teste — espelham o seed (prisma/seed/payroll.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** INSS: trabalhador 3%, entidade 4%, sem teto. */
const TABELA_INSS: TabelaINSSVigente = {
  taxaTrabalhador: D('0.03'),
  taxaEntidade: D('0.04'),
  tetoIncidencia: null,
};

/**
 * IRPS mensal (tabela anual do art. 54 do CIRPS ÷ 12):
 * anual: até 42.000 → 10% (0) · até 168.000 → 15% (2.100) · até 504.000 → 20%
 * (10.500) · até 1.512.000 → 25% (35.700) · acima → 32% (141.540).
 */
const ESCALOES_IRPS: EscalaoIRPSVigente[] = [
  { ordem: 1, limiteInferior: D(0), limiteSuperior: D(3500), taxa: D('0.10'), parcelaAbater: D(0) },
  { ordem: 2, limiteInferior: D(3500), limiteSuperior: D(14000), taxa: D('0.15'), parcelaAbater: D(175) },
  { ordem: 3, limiteInferior: D(14000), limiteSuperior: D(42000), taxa: D('0.20'), parcelaAbater: D(875) },
  { ordem: 4, limiteInferior: D(42000), limiteSuperior: D(126000), taxa: D('0.25'), parcelaAbater: D(2975) },
  { ordem: 5, limiteInferior: D(126000), limiteSuperior: null, taxa: D('0.32'), parcelaAbater: D(11795) },
];

function entradaBase(overrides?: Partial<EntradaCalculoPayroll>): EntradaCalculoPayroll {
  return {
    salarioBase: D(45000),
    subsidios: { alimentacao: D(0), transporte: D(0), habitacao: D(0), outros: D(0) },
    variaveis: { horasExtras: D(0), comissoes: D(0), bonus: D(0), outros: D(0) },
    descontosDiversos: [],
    tabelaInss: TABELA_INSS,
    escaloesIrps: ESCALOES_IRPS,
    ...overrides,
  };
}

/** Gera um valor monetário Decimal com 2 casas a partir de cêntimos. */
const arbCentimos = (max: number) => fc.integer({ min: 0, max }).map((c) => D(c).div(100));

// ─────────────────────────────────────────────────────────────────────────────
// arredondar2
// ─────────────────────────────────────────────────────────────────────────────

describe('arredondar2', () => {
  it('arredonda a 2 casas HALF_UP', () => {
    expect(arredondar2(D('1.005')).toString()).toBe('1.01');
    expect(arredondar2(D('1.004')).toString()).toBe('1');
    expect(arredondar2(D('2.675')).toString()).toBe('2.68');
    expect(arredondar2(D('-1.005')).toString()).toBe('-1.01');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularIRPS — golden tests (≥3 escalões contra a tabela oficial)
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularIRPS — golden (tabela art. 54 CIRPS mensalizada)', () => {
  it('escalão 1 (10%): base 3.000 → 300.00', () => {
    expect(calcularIRPS(D(3000), ESCALOES_IRPS).toString()).toBe('300');
  });

  it('escalão 2 (15% − 175): base 10.000 → 1.325.00', () => {
    expect(calcularIRPS(D(10000), ESCALOES_IRPS).toString()).toBe('1325');
  });

  it('escalão 3 (20% − 875): base 20.000 → 3.125.00', () => {
    expect(calcularIRPS(D(20000), ESCALOES_IRPS).toString()).toBe('3125');
  });

  it('escalão 4 (25% − 2.975): base 50.000 → 9.525.00', () => {
    expect(calcularIRPS(D(50000), ESCALOES_IRPS).toString()).toBe('9525');
  });

  it('escalão 5 (32% − 11.795): base 150.000 → 36.205.00', () => {
    expect(calcularIRPS(D(150000), ESCALOES_IRPS).toString()).toBe('36205');
  });

  it('é contínuo nas fronteiras dos escalões', () => {
    // Nas fronteiras, as fórmulas dos dois escalões coincidem
    expect(calcularIRPS(D(3500), ESCALOES_IRPS).toString()).toBe('350');
    expect(calcularIRPS(D(14000), ESCALOES_IRPS).toString()).toBe('1925');
    expect(calcularIRPS(D(42000), ESCALOES_IRPS).toString()).toBe('7525');
    expect(calcularIRPS(D(126000), ESCALOES_IRPS).toString()).toBe('28525');
  });

  it('base 0 ou negativa → 0', () => {
    expect(calcularIRPS(D(0), ESCALOES_IRPS).isZero()).toBe(true);
    expect(calcularIRPS(D(-100), ESCALOES_IRPS).isZero()).toBe(true);
  });

  it('nunca devolve imposto negativo (parcela > base × taxa)', () => {
    const escaloes: EscalaoIRPSVigente[] = [
      { ordem: 1, limiteInferior: D(0), limiteSuperior: null, taxa: D('0.10'), parcelaAbater: D(1000) },
    ];
    expect(calcularIRPS(D(100), escaloes).isZero()).toBe(true);
  });

  it('sem escalões → BusinessRuleError TABELA_IRPS_EM_FALTA', () => {
    expect(() => calcularIRPS(D(1000), [])).toThrow(BusinessRuleError);
    try {
      calcularIRPS(D(1000), []);
    } catch (e) {
      expect((e as BusinessRuleError).code).toBe('TABELA_IRPS_EM_FALTA');
    }
  });

  it('[property] monótono não-decrescente na base tributável', () => {
    fc.assert(
      fc.property(arbCentimos(50_000_000), arbCentimos(50_000_000), (a, b) => {
        const [menor, maior] = a.lte(b) ? [a, b] : [b, a];
        const irpsMenor = calcularIRPS(menor, ESCALOES_IRPS);
        const irpsMaior = calcularIRPS(maior, ESCALOES_IRPS);
        expect(irpsMenor.lte(irpsMaior)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('[property] imposto ≤ base × taxa máxima e ≥ 0', () => {
    fc.assert(
      fc.property(arbCentimos(50_000_000), (base) => {
        const irps = calcularIRPS(base, ESCALOES_IRPS);
        expect(irps.gte(0)).toBe(true);
        expect(irps.lte(base.times('0.32'))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// valorizarHorasExtras / calcularDescontoFalta
// ─────────────────────────────────────────────────────────────────────────────

describe('valorizarHorasExtras', () => {
  it('208h mensais + majoração 50% por omissão: 20.800 MT, 10h → 1.500.00', () => {
    // valorHora = 20800/208 = 100; 10h × 100 × 1.5 = 1500
    expect(valorizarHorasExtras(D(20800), D(10)).toString()).toBe('1500');
  });

  it('majoração configurável (100%)', () => {
    expect(valorizarHorasExtras(D(20800), D(10), { majoracao: D(1) }).toString()).toBe('2000');
  });

  it('0 horas → 0', () => {
    expect(valorizarHorasExtras(D(20800), D(0)).isZero()).toBe(true);
  });
});

describe('calcularDescontoFalta', () => {
  it('mês comercial de 30 dias: 30.000 MT, 2 dias → 2.000.00', () => {
    expect(calcularDescontoFalta(D(30000), 2).toString()).toBe('2000');
  });
  it('0 dias → 0', () => {
    expect(calcularDescontoFalta(D(30000), 0).isZero()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularPayroll — golden tests
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularPayroll — golden', () => {
  it('caso completo: base 45.000 + subsídios 5.000 (INSS 3%/4%, IRPS escalão 4)', () => {
    const r = calcularPayroll(
      entradaBase({
        subsidios: { alimentacao: D(3000), transporte: D(2000), habitacao: D(0), outros: D(0) },
      }),
    );
    expect(r.bruto.toString()).toBe('50000');
    expect(r.baseInss.toString()).toBe('50000');
    expect(r.inssTrabalhador.toString()).toBe('1500'); // 3%
    expect(r.inssEntidade.toString()).toBe('2000'); // 4% — encargo, não desconto
    expect(r.baseIrps.toString()).toBe('48500');
    expect(r.irps.toString()).toBe('9150'); // 48.500×0.25 − 2.975
    expect(r.liquido.toString()).toBe('39350'); // 50.000 − 1.500 − 9.150
    expect(r.custoTotalEntidade.toString()).toBe('52000'); // bruto + INSS entidade
  });

  it('teto de incidência INSS limita a base', () => {
    const r = calcularPayroll(
      entradaBase({
        tabelaInss: { ...TABELA_INSS, tetoIncidencia: D(40000) },
      }),
    );
    expect(r.baseInss.toString()).toBe('40000');
    expect(r.inssTrabalhador.toString()).toBe('1200'); // 3% de 40.000
    expect(r.inssEntidade.toString()).toBe('1600'); // 4% de 40.000
  });

  it('descontos diversos entram no líquido e nas linhas', () => {
    const r = calcularPayroll(
      entradaBase({
        descontosDiversos: [
          { natureza: 'FALTA', descricao: 'Faltas (1 dia)', valor: D(1500) },
          { natureza: 'ADIANTAMENTO', descricao: 'Adiantamento salarial', valor: D(5000) },
        ],
      }),
    );
    expect(r.outrosDescontos.toString()).toBe('6500');
    expect(
      r.liquido.eq(r.bruto.minus(r.inssTrabalhador).minus(r.irps).minus(D(6500))),
    ).toBe(true);
    const naturezas = r.linhas.filter((l) => l.tipo === 'DESCONTO').map((l) => l.natureza);
    expect(naturezas).toContain('FALTA');
    expect(naturezas).toContain('ADIANTAMENTO');
  });

  it('linhas: proventos com valor 0 são omitidos; soma proventos = bruto', () => {
    const r = calcularPayroll(entradaBase());
    const proventos = r.linhas.filter((l) => l.tipo === 'PROVENTO');
    expect(proventos).toHaveLength(1); // apenas salário base
    const soma = proventos.reduce((s, l) => s.plus(l.valor), D(0));
    expect(soma.eq(r.bruto)).toBe(true);
  });

  it('soma dos descontos das linhas = INSS + IRPS + outros', () => {
    const r = calcularPayroll(
      entradaBase({
        descontosDiversos: [{ natureza: 'OUTRO', descricao: 'Penhora judicial', valor: D(750) }],
      }),
    );
    const somaDescontos = r.linhas
      .filter((l) => l.tipo === 'DESCONTO')
      .reduce((s, l) => s.plus(l.valor), D(0));
    expect(somaDescontos.eq(r.inssTrabalhador.plus(r.irps).plus(r.outrosDescontos))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularPayroll — property tests (invariantes fiscalidade-mz)
// ─────────────────────────────────────────────────────────────────────────────

const arbEntrada = fc
  .record({
    salarioBase: arbCentimos(20_000_000), // até 200.000,00 MT
    alimentacao: arbCentimos(1_000_000),
    transporte: arbCentimos(1_000_000),
    habitacao: arbCentimos(1_000_000),
    subOutros: arbCentimos(1_000_000),
    horasExtras: arbCentimos(1_000_000),
    comissoes: arbCentimos(2_000_000),
    bonus: arbCentimos(1_000_000),
    varOutros: arbCentimos(1_000_000),
    descontos: fc.array(
      fc.record({
        natureza: fc.constantFrom('FALTA', 'ADIANTAMENTO', 'PENHORA', 'OUTRO') as fc.Arbitrary<
          'FALTA' | 'ADIANTAMENTO' | 'PENHORA' | 'OUTRO'
        >,
        valor: arbCentimos(500_000),
      }),
      { maxLength: 4 },
    ),
  })
  .map(
    (v): EntradaCalculoPayroll =>
      entradaBase({
        salarioBase: v.salarioBase,
        subsidios: {
          alimentacao: v.alimentacao,
          transporte: v.transporte,
          habitacao: v.habitacao,
          outros: v.subOutros,
        },
        variaveis: {
          horasExtras: v.horasExtras,
          comissoes: v.comissoes,
          bonus: v.bonus,
          outros: v.varOutros,
        },
        descontosDiversos: v.descontos.map((d, i) => ({
          natureza: d.natureza,
          descricao: `Desconto ${i + 1}`,
          valor: d.valor,
        })),
      }),
  );

describe('calcularPayroll — propriedades', () => {
  it('[property] liquido = bruto − inssTrabalhador − irps − outrosDescontos (identidade exacta)', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularPayroll(e);
        expect(
          r.liquido.eq(r.bruto.minus(r.inssTrabalhador).minus(r.irps).minus(r.outrosDescontos)),
        ).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('[property] inssTrabalhador = arredondar2(baseInss × 3%) e inssEntidade = arredondar2(baseInss × 4%)', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularPayroll(e);
        expect(r.inssTrabalhador.eq(arredondar2(r.baseInss.times('0.03')))).toBe(true);
        expect(r.inssEntidade.eq(arredondar2(r.baseInss.times('0.04')))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('[property] sem descontos diversos, o líquido nunca é negativo', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularPayroll({ ...e, descontosDiversos: [] });
        expect(r.liquido.gte(0)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('[property] todos os valores monetários têm no máximo 2 casas decimais', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularPayroll(e);
        for (const v of [r.bruto, r.inssTrabalhador, r.inssEntidade, r.irps, r.outrosDescontos, r.liquido, r.custoTotalEntidade]) {
          expect(v.decimalPlaces()).toBeLessThanOrEqual(2);
        }
        for (const l of r.linhas) {
          expect(l.valor.decimalPlaces()).toBeLessThanOrEqual(2);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('[property] custoTotalEntidade = bruto + inssEntidade ≥ bruto', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularPayroll(e);
        expect(r.custoTotalEntidade.eq(r.bruto.plus(r.inssEntidade))).toBe(true);
        expect(r.custoTotalEntidade.gte(r.bruto)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('[property] soma das linhas de proventos = bruto e soma das linhas de descontos = total de descontos', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularPayroll(e);
        const proventos = r.linhas
          .filter((l) => l.tipo === 'PROVENTO')
          .reduce((s, l) => s.plus(l.valor), D(0));
        const descontos = r.linhas
          .filter((l) => l.tipo === 'DESCONTO')
          .reduce((s, l) => s.plus(l.valor), D(0));
        expect(proventos.eq(r.bruto)).toBe(true);
        expect(descontos.eq(r.inssTrabalhador.plus(r.irps).plus(r.outrosDescontos))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
