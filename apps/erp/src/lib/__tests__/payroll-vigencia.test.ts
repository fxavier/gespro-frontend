/**
 * Oráculo unidade — issue #158: contrato do módulo src/lib/payroll-vigencia.ts
 *
 * ESTADO ESPERADO: RED — o módulo ainda não existe. O erro é de import
 * (Cannot find module) e não de lógica. Quando o implementador criar
 * apps/erp/src/lib/payroll-vigencia.ts com as três funções abaixo, todos
 * estes testes devem tornar-se GREEN sem qualquer alteração neste ficheiro.
 *
 * Contrato público do módulo (client-safe, sem 'server-only'):
 *   inicioDeVigencia(ano, mes): string
 *     → 'aaaa-mm-01' com mês zero-padded (mes 1-12)
 *   percentagemParaFraccao(p): number
 *     → p / 100 sem ruído de vírgula flutuante (3 → 0.03, 4.5 → 0.045)
 *   fraccaoParaPercentagem(f): number
 *     → f * 100 sem ruído de vírgula flutuante (0.03 → 3, 0.32 → 32)
 *
 * AC5/D1: a string produzida por inicioDeVigencia(a, m) deve ser aceite pelo
 * TabelaINSSSchema e CriarEscaloesIRPSSchema via z.coerce.date, e o
 * getTime() do Date resultante deve ser igual a Date.UTC(a, m-1, 1).
 * Isto garante que a vigência criada pelo formulário coincide com a
 * dataReferência que obterTabelasVigentes usa para resolver o mês M
 * (Date.UTC(ano, mes-1, 1)), sem depender do fuso do processo.
 */

import { describe, it, expect } from 'vitest';
import {
  inicioDeVigencia,
  percentagemParaFraccao,
  fraccaoParaPercentagem,
  // RED (D6): parseDecimalPt ainda não está exportada — o import falha aqui.
  parseDecimalPt,
} from '@/lib/payroll-vigencia';
import { TabelaINSSSchema, CriarEscaloesIRPSSchema } from '@/lib/validations/payroll';

describe('inicioDeVigencia(ano, mes)', () => {
  it.each([
    [2024, 1, '2024-01-01'],
    [2024, 12, '2024-12-01'],
    [2099, 1, '2099-01-01'],
    [2025, 6, '2025-06-01'],
    [2025, 10, '2025-10-01'],
  ])('(%i, %i) → %s', (ano, mes, esperado) => {
    expect(inicioDeVigencia(ano, mes)).toBe(esperado);
  });
});

describe('AC5/D1 — vigenciaInicio produzida = referência UTC do mês', () => {
  it.each([
    [2024, 1],
    [2024, 12],
    [2099, 1],
    [2025, 6],
  ])('TabelaINSSSchema: ano=%i mes=%i', (ano, mes) => {
    const parsed = TabelaINSSSchema.parse({
      vigenciaInicio: inicioDeVigencia(ano, mes),
      taxaTrabalhador: 0.03,
      taxaEntidade: 0.04,
    });
    expect(parsed.vigenciaInicio.getTime()).toBe(Date.UTC(ano, mes - 1, 1));
  });

  it.each([[2024, 1], [2099, 1]])(
    'CriarEscaloesIRPSSchema: ano=%i mes=%i',
    (ano, mes) => {
      const parsed = CriarEscaloesIRPSSchema.parse({
        vigenciaInicio: inicioDeVigencia(ano, mes),
        escaloes: [
          {
            ordem: 1,
            limiteInferior: 0,
            limiteSuperior: null,
            taxa: 0.1,
            parcelaAbater: 0,
            numeroDependentes: 0,
          },
        ],
      });
      expect(parsed.vigenciaInicio.getTime()).toBe(Date.UTC(ano, mes - 1, 1));
    },
  );
});

describe('percentagemParaFraccao(p)', () => {
  it.each([
    [3, 0.03],
    [4, 0.04],
    [4.5, 0.045],
    [7, 0.07],
    [0.1, 0.001],
    [32, 0.32],
    [10, 0.1],
    [25, 0.25],
  ])('%f → %f', (p, f) => {
    expect(percentagemParaFraccao(p)).toBeCloseTo(f, 6);
  });
});

describe('fraccaoParaPercentagem(f)', () => {
  it.each([
    [0.03, 3],
    [0.04, 4],
    [0.045, 4.5],
    [0.07, 7],
    [0.001, 0.1],
    [0.32, 32],
    [0.1, 10],
  ])('%f → %f', (f, p) => {
    expect(fraccaoParaPercentagem(f)).toBeCloseTo(p, 6);
  });
});

describe('round-trip percentagem ↔ fracção', () => {
  it.each([3, 4, 4.5, 7, 0.1, 32, 10, 25])('%f', (p) => {
    expect(fraccaoParaPercentagem(percentagemParaFraccao(p))).toBeCloseTo(p, 6);
  });
});

// ─── D6: parseDecimalPt ───────────────────────────────────────────────────────
//
// Contrato: trims e remove espaços internos; aceita /^\d+([.,]\d{1,2})?$/;
// converte vírgula decimal em ponto; retorna null em qualquer outro caso.
// Sem ruído de vírgula flutuante nos casos documentados (toBe, não toBeCloseTo).

describe('parseDecimalPt — valores válidos → number', () => {
  it.each([
    ['50000,50', 50000.5],
    ['50000.50', 50000.5],
    ['3500',     3500],
    ['0,1',      0.1],
    [' 3500 ',   3500],
    ['1 000,50', 1000.5],
  ])('%j → %f', (s, esperado) => {
    expect(parseDecimalPt(s)).toBe(esperado);
  });
});

describe('parseDecimalPt — sem ruído de vírgula flutuante (toBe exacto)', () => {
  it('0,1 === 0.1',             () => expect(parseDecimalPt('0,1')).toBe(0.1));
  it('20250,35 === 20250.35',   () => expect(parseDecimalPt('20250,35')).toBe(20250.35));
});

describe('parseDecimalPt — valores inválidos → null', () => {
  it.each([
    ['',            'vazio'],
    ['50.000,50',   'separador de milhar'],
    ['1.234.567,89','múltiplos pontos'],
    ['-5',          'negativo'],
    ['abc',         'letras'],
    ['abc123',      'letras+dígitos'],
    ['1e3',         'notação científica'],
    ['12,34,56',    'duas vírgulas'],
    ['12345,678',   '3 casas decimais'],
    [',5',          'começa com vírgula'],
    ['5,',          'termina com vírgula'],
  ])('%j (%s)', (s) => {
    expect(parseDecimalPt(s)).toBeNull();
  });
});
