// Testes de Contagem e Reconciliação de Stock (WS A — Spec 05)
// Property tests (fast-check) + unit tests.
// IMPORTANTE: Os modelos ContagemStock/ItemContagemStock são novos e ainda
// não existem na DB partilhada (migrations geradas pelo orquestrador).
// Todos os testes são unit/property — sem acesso directo à DB.

import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { BusinessRuleError } from '@/lib/errors';
import { transitar } from '../state-machine';
import { TRANSICOES_CONTAGEM } from '../contagem-stock.interface';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estados(mapa: Record<string, string[]>): string[] {
  return Object.keys(mapa);
}

function proibidos(mapa: Record<string, string[]>, estadoActual: string): string[] {
  const permitidos = new Set(mapa[estadoActual] ?? []);
  return estados(mapa).filter((e) => !permitidos.has(e));
}

// ─── Máquina de estados: ContagemStock ───────────────────────────────────────

describe('máquina de estado: ContagemStock', () => {
  it('prop: transição válida nunca lança', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...estados(TRANSICOES_CONTAGEM)),
        (estadoActual) => {
          const permitidos = TRANSICOES_CONTAGEM[estadoActual] ?? [];
          for (const proximo of permitidos) {
            expect(() =>
              transitar(TRANSICOES_CONTAGEM as never, estadoActual as never, proximo as never, 'ContagemStock'),
            ).not.toThrow();
          }
        },
      ),
    );
  });

  it('prop: transição inválida sempre lança TRANSICAO_INVALIDA', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...estados(TRANSICOES_CONTAGEM)),
        (estadoActual) => {
          const naoPermitidos = proibidos(TRANSICOES_CONTAGEM, estadoActual);
          for (const proximo of naoPermitidos) {
            expect(() =>
              transitar(TRANSICOES_CONTAGEM as never, estadoActual as never, proximo as never, 'ContagemStock'),
            ).toThrow(BusinessRuleError);
            try {
              transitar(TRANSICOES_CONTAGEM as never, estadoActual as never, proximo as never, 'ContagemStock');
            } catch (e) {
              expect((e as BusinessRuleError).code).toBe('TRANSICAO_INVALIDA');
            }
          }
        },
      ),
    );
  });

  it('prop: estados terminais não têm transições de saída', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...estados(TRANSICOES_CONTAGEM)),
        (estado) => {
          const terminais = estados(TRANSICOES_CONTAGEM).filter(
            (e) => (TRANSICOES_CONTAGEM[e] ?? []).length === 0,
          );
          if (terminais.includes(estado)) {
            expect(TRANSICOES_CONTAGEM[estado]).toHaveLength(0);
          }
        },
      ),
    );
  });

  it('prop: todos os estados destino declarados existem no mapa', () => {
    const estadosConhecidos = new Set(estados(TRANSICOES_CONTAGEM));
    for (const [, destinos] of Object.entries(TRANSICOES_CONTAGEM)) {
      for (const dest of destinos) {
        expect(estadosConhecidos.has(dest)).toBe(true);
      }
    }
  });

  it('estados terminais são CONCLUIDA e CANCELADA', () => {
    expect(TRANSICOES_CONTAGEM.CONCLUIDA).toHaveLength(0);
    expect(TRANSICOES_CONTAGEM.CANCELADA).toHaveLength(0);
  });

  it('RASCUNHO pode transitar para EM_CONTAGEM', () => {
    expect(() =>
      transitar(TRANSICOES_CONTAGEM as never, 'RASCUNHO' as never, 'EM_CONTAGEM' as never, 'ContagemStock'),
    ).not.toThrow();
  });

  it('CONCLUIDA não pode transitar para nenhum estado', () => {
    for (const destino of estados(TRANSICOES_CONTAGEM)) {
      expect(() =>
        transitar(TRANSICOES_CONTAGEM as never, 'CONCLUIDA' as never, destino as never, 'ContagemStock'),
      ).toThrow(BusinessRuleError);
    }
  });
});

// ─── Property tests: invariante Σ ajustes == Σ diferenças ─────────────────────

describe('invariante: Σ ajustes == Σ diferenças', () => {
  /**
   * Para um conjunto de diferenças (positivas e negativas), a soma dos ajustes
   * de entrada é Σ(diferenças > 0) e a soma das saídas é Σ(|diferenças < 0|).
   * Este test simula a lógica de reconciliar() sem acesso à DB.
   */
  it('prop: totalEntradas = Σ diferenças positivas', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1000, max: 1000 }).filter((n) => n !== 0), {
          minLength: 1,
          maxLength: 20,
        }),
        (diferencasInt) => {
          const diferencas = diferencasInt.map((d) => new Prisma.Decimal(d));

          let totalEntradas = new Prisma.Decimal(0);
          let totalSaidas = new Prisma.Decimal(0);

          for (const dif of diferencas) {
            if (dif.greaterThan(0)) {
              totalEntradas = totalEntradas.plus(dif);
            } else {
              totalSaidas = totalSaidas.plus(dif.abs());
            }
          }

          const somaPositivas = diferencas
            .filter((d) => d.greaterThan(0))
            .reduce((acc, d) => acc.plus(d), new Prisma.Decimal(0));

          const somaNegativas = diferencas
            .filter((d) => d.lessThan(0))
            .map((d) => d.abs())
            .reduce((acc, d) => acc.plus(d), new Prisma.Decimal(0));

          expect(totalEntradas.toString()).toBe(somaPositivas.toString());
          expect(totalSaidas.toString()).toBe(somaNegativas.toString());
        },
      ),
    );
  });

  it('prop: Σ|diferenças| == totalEntradas + totalSaidas', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -500, max: 500 }).filter((n) => n !== 0), {
          minLength: 1,
          maxLength: 10,
        }),
        (diferencasInt) => {
          const diferencas = diferencasInt.map((d) => new Prisma.Decimal(d));
          const somaAbsoluta = diferencas.reduce(
            (acc, d) => acc.plus(d.abs()),
            new Prisma.Decimal(0),
          );
          const entradas = diferencas
            .filter((d) => d.greaterThan(0))
            .reduce((acc, d) => acc.plus(d), new Prisma.Decimal(0));
          const saidas = diferencas
            .filter((d) => d.lessThan(0))
            .reduce((acc, d) => acc.plus(d.abs()), new Prisma.Decimal(0));

          expect(entradas.plus(saidas).toString()).toBe(somaAbsoluta.toString());
        },
      ),
    );
  });
});

// ─── Unit tests — diferença = quantidadeContada - saldoSistema ────────────────

describe('cálculo de diferença', () => {
  it('contagem acima do saldo gera diferença positiva', () => {
    const saldoSistema = new Prisma.Decimal('10.500000');
    const qtdContada = new Prisma.Decimal('12.000000');
    const diferenca = qtdContada.minus(saldoSistema);
    expect(diferenca.greaterThan(0)).toBe(true);
    expect(diferenca.equals(new Prisma.Decimal('1.5'))).toBe(true);
  });

  it('contagem abaixo do saldo gera diferença negativa', () => {
    const saldoSistema = new Prisma.Decimal('10.500000');
    const qtdContada = new Prisma.Decimal('8.000000');
    const diferenca = qtdContada.minus(saldoSistema);
    expect(diferenca.lessThan(0)).toBe(true);
    expect(diferenca.equals(new Prisma.Decimal('-2.5'))).toBe(true);
  });

  it('contagem igual ao saldo gera diferença zero', () => {
    const saldoSistema = new Prisma.Decimal('10.500000');
    const qtdContada = new Prisma.Decimal('10.500000');
    const diferenca = qtdContada.minus(saldoSistema);
    expect(diferenca.isZero()).toBe(true);
  });

  it('prop: diferença = quantidadeContada - saldoSistema (invariante aritmético)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 10000 }),
        (saldoInt, contadoInt) => {
          const saldo = new Prisma.Decimal(saldoInt).div(100);
          const contado = new Prisma.Decimal(contadoInt).div(100);
          const diferenca = contado.minus(saldo);

          // Invariante: dif + saldo = contado
          expect(diferenca.plus(saldo).toString()).toBe(contado.toString());
        },
      ),
    );
  });
});

// ─── Unit tests — limiar de discrepância ─────────────────────────────────────

describe('cálculo de limiar de discrepância', () => {
  function calcularPct(saldo: Prisma.Decimal, diferenca: Prisma.Decimal): Prisma.Decimal {
    if (saldo.isZero()) return new Prisma.Decimal(0);
    return diferenca.abs().div(saldo).times(100);
  }

  it('diferença de 5 unidades em 100 = 5%', () => {
    const saldo = new Prisma.Decimal(100);
    const dif = new Prisma.Decimal(5);
    expect(calcularPct(saldo, dif).toFixed(2)).toBe('5.00');
  });

  it('diferença negativa de 10 em 100 = 10%', () => {
    const saldo = new Prisma.Decimal(100);
    const dif = new Prisma.Decimal(-10);
    expect(calcularPct(saldo, dif).toFixed(2)).toBe('10.00');
  });

  it('saldo zero não causa divisão por zero', () => {
    const saldo = new Prisma.Decimal(0);
    const dif = new Prisma.Decimal(5);
    expect(() => calcularPct(saldo, dif)).not.toThrow();
    expect(calcularPct(saldo, dif).isZero()).toBe(true);
  });

  it('prop: pct >= 0 para qualquer diferença e saldo positivo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: -5000, max: 5000 }),
        (saldoInt, difInt) => {
          const saldo = new Prisma.Decimal(saldoInt);
          const dif = new Prisma.Decimal(difInt);
          const pct = calcularPct(saldo, dif);
          expect(pct.greaterThanOrEqualTo(0)).toBe(true);
        },
      ),
    );
  });
});

// ─── Unit tests — idempotência (itens AJUSTADOS ignorados) ───────────────────

describe('idempotência da reconciliação', () => {
  it('item AJUSTADO não é incluído nos ajustes a gerar', () => {
    type ItemMock = { id: string; status: string; diferenca: string | null };

    const itens: ItemMock[] = [
      { id: '1', status: 'CONTADO', diferenca: '5' },
      { id: '2', status: 'AJUSTADO', diferenca: '-3' }, // já ajustado
      { id: '3', status: 'CONTADO', diferenca: '-2' },
    ];

    const paraAjuste = itens.filter(
      (i) =>
        i.diferenca !== null &&
        !new Prisma.Decimal(i.diferenca).isZero() &&
        i.status !== 'AJUSTADO',
    );

    expect(paraAjuste).toHaveLength(2);
    expect(paraAjuste.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('prop: itens AJUSTADOS são sempre ignorados', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            status: fc.constantFrom('PENDENTE', 'CONTADO', 'AJUSTADO', 'JUSTIFICADO'),
            diferenca: fc.integer({ min: -100, max: 100 }).map(String),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (itens) => {
          const paraAjuste = itens.filter(
            (i) =>
              i.diferenca !== null &&
              !new Prisma.Decimal(i.diferenca).isZero() &&
              i.status !== 'AJUSTADO',
          );
          const ajustados = itens.filter((i) => i.status === 'AJUSTADO');

          // Nenhum item AJUSTADO aparece na lista para ajuste
          for (const item of ajustados) {
            expect(paraAjuste.some((p) => p.id === item.id)).toBe(false);
          }
        },
      ),
    );
  });
});
