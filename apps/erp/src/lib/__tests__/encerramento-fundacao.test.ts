/**
 * Fundação do encerramento do exercício (ADR-0035, #138 — nó N2). Oráculo
 * escrito antes da implementação: plano de contas semeado e máquina de estados
 * do `ExercicioContabil`.
 *
 * O módulo é importado como namespace e cada caso confirma primeiro que a
 * exportação existe — um `undefined` chamado lança `TypeError`, e um teste que
 * só pedisse `toThrow()` passaria por isso, não pela regra.
 */
import { describe, expect, it } from 'vitest';
import planoContas from '../../../prisma/seed/data/plano-contas-pgc.json';
import * as sm from '@/lib/state-machines';
import { BusinessRuleError } from '@/lib/errors';

type ContaSemente = { codigo: string; contaMaeCodigo: string | null; aceitaLancamento: boolean };
const plano = planoContas as ContaSemente[];

function conta(codigo: string): ContaSemente | undefined {
  return plano.find((c) => c.codigo === codigo);
}
function filhas(codigo: string): string[] {
  return plano.filter((c) => c.contaMaeCodigo === codigo).map((c) => c.codigo);
}

describe('plano-contas-pgc.json — contas do encerramento (ADR-0035 §3)', () => {
  // O apuramento e a transferência do resultado lançam directamente nestas contas
  // de nível 2; sem filhas no plano, têm de aceitar lançamento.
  it.each(['59', '81', '82', '83', '88'])('%s aceita lançamento e não tem filhas', (codigo) => {
    expect(conta(codigo), `conta ${codigo} no plano`).toBeDefined();
    expect(filhas(codigo)).toEqual([]);
    expect(conta(codigo)?.aceitaLancamento).toBe(true);
  });

  it.each(['851', '852', '4411'])('%s continua folha e a aceitar lançamento', (codigo) => {
    expect(conta(codigo), `conta ${codigo} no plano`).toBeDefined();
    expect(filhas(codigo)).toEqual([]);
    expect(conta(codigo)?.aceitaLancamento).toBe(true);
  });
});

const ESTADOS = ['ABERTO', 'EM_ENCERRAMENTO', 'ENCERRADO_PROVISORIO', 'ENCERRADO'] as const;
type Estado = (typeof ESTADOS)[number];

const PERMITIDAS: ReadonlyArray<readonly [Estado, Estado]> = [
  ['ABERTO', 'ENCERRADO_PROVISORIO'],
  ['ENCERRADO_PROVISORIO', 'ABERTO'], // reabertura
  ['ENCERRADO_PROVISORIO', 'ENCERRADO'],
];

function permitida(de: Estado, para: Estado): boolean {
  return PERMITIDAS.some(([a, b]) => a === de && b === para);
}

const PARES = ESTADOS.flatMap((de) => ESTADOS.map((para) => [de, para] as const));

function transitar(de: Estado, para: Estado): unknown {
  expect(typeof sm.transitarExercicio, 'transitarExercicio exportada de @/lib/state-machines').toBe('function');
  return sm.transitarExercicio(de, para);
}

describe('máquina de estados do ExercicioContabil (ADR-0035 §1)', () => {
  it('TRANSICOES_EXERCICIO cobre exactamente os quatro estados e só as transições permitidas', () => {
    expect(sm.TRANSICOES_EXERCICIO, 'TRANSICOES_EXERCICIO exportada').toBeDefined();
    const mapa = sm.TRANSICOES_EXERCICIO as Record<string, string[]>;
    expect(Object.keys(mapa).sort()).toEqual([...ESTADOS].sort());
    for (const de of ESTADOS) {
      const esperado = PERMITIDAS.filter(([a]) => a === de).map(([, b]) => b).sort();
      expect([...mapa[de]].sort(), `alvos de ${de}`).toEqual(esperado);
    }
  });

  it('ENCERRADO é terminal e EM_ENCERRAMENTO não tem transições de nem para', () => {
    expect(sm.TRANSICOES_EXERCICIO, 'TRANSICOES_EXERCICIO exportada').toBeDefined();
    const mapa = sm.TRANSICOES_EXERCICIO as Record<string, string[]>;
    expect(mapa.ENCERRADO).toEqual([]);
    expect(mapa.EM_ENCERRAMENTO).toEqual([]);
    for (const alvos of Object.values(mapa)) expect(alvos).not.toContain('EM_ENCERRAMENTO');
  });

  it.each(PARES.filter(([de, para]) => permitida(de, para)))('%s → %s é permitida', (de, para) => {
    expect(() => transitar(de, para)).not.toThrow();
  });

  it.each(PARES.filter(([de, para]) => !permitida(de, para)))(
    '%s → %s lança BusinessRuleError TRANSICAO_INVALIDA',
    (de, para) => {
      let erro: unknown;
      expect(typeof sm.transitarExercicio, 'transitarExercicio exportada de @/lib/state-machines').toBe('function');
      try {
        transitar(de, para);
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect((erro as BusinessRuleError).code).toBe('TRANSICAO_INVALIDA');
    },
  );
});
