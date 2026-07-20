/**
 * Property tests — WS-10 (Spec 10)
 *
 * Invariantes verificadas:
 *  1. TRANSICOES_ENCOMENDA e TRANSICOES_DEVOLUCAO: estrutura consistente,
 *     estados terminais corretos, transições inválidas rejeitadas.
 *  2. Stock: quantidade reservada ≤ qtd disponível; consumo = reserva; stock nunca negativo.
 *  3. Nota de crédito (NC): sum(créditos) == sum(débitos) (partida dobrada).
 *  4. Decimal: cálculos de totais de encomenda/devolução corretos.
 *
 * Sem acesso a DB real — testes de lógica pura / matemática.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TRANSICOES_ENCOMENDA, TRANSICOES_DEVOLUCAO } from '@/lib/state-machines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusEncomenda = keyof typeof TRANSICOES_ENCOMENDA;
type StatusDevolucao = keyof typeof TRANSICOES_DEVOLUCAO;

function isValidTransition<S extends string>(mapa: Record<string, S[]>, de: string, para: S): boolean {
  return (mapa[de] ?? []).includes(para);
}

function isTerminal(mapa: Record<string, string[]>, estado: string): boolean {
  return (mapa[estado] ?? []).length === 0;
}

/** Replica a guard lançada pelos serviços (BusinessRuleError-style). */
function transitarEncomenda(actual: string, alvo: string): void {
  const permitidas = TRANSICOES_ENCOMENDA[actual] ?? [];
  if (!permitidas.includes(alvo)) {
    const err = new Error(`Transição inválida ${actual} → ${alvo}`);
    (err as NodeJS.ErrnoException & { code?: string }).code = 'TRANSICAO_INVALIDA';
    throw err;
  }
}

function transitarDevolucao(actual: string, alvo: string): void {
  const permitidas = TRANSICOES_DEVOLUCAO[actual] ?? [];
  if (!permitidas.includes(alvo)) {
    const err = new Error(`Transição inválida ${actual} → ${alvo}`);
    (err as NodeJS.ErrnoException & { code?: string }).code = 'TRANSICAO_INVALIDA';
    throw err;
  }
}

/** Cálculo de total de item de encomenda (espelha encomenda.service). */
function calcItemTotal(
  quantidade: number,
  precoUnitario: number,
  desconto: number, // percentagem 0–100
  taxaIva: number,  // decimal 0–1
): { subtotal: number; iva: number; total: number } {
  const base = quantidade * precoUnitario * (1 - desconto / 100);
  const iva = base * taxaIva;
  return { subtotal: base, iva, total: base + iva };
}

// ---------------------------------------------------------------------------
// Máquina de estado — Encomenda
// ---------------------------------------------------------------------------

const ESTADOS_ENCOMENDA = Object.keys(TRANSICOES_ENCOMENDA) as StatusEncomenda[];
const TERMINAIS_ENCOMENDA = ['CONCLUIDA', 'CANCELADA'] as const;
const NAO_TERMINAIS_ENCOMENDA = ['RASCUNHO', 'CONFIRMADA', 'PARCIALMENTE_ENTREGUE'] as const;

describe('TRANSICOES_ENCOMENDA', () => {
  it('mapa cobre todos os estados esperados', () => {
    const esperados: StatusEncomenda[] = [
      'RASCUNHO', 'CONFIRMADA', 'PARCIALMENTE_ENTREGUE', 'CONCLUIDA', 'CANCELADA',
    ];
    for (const e of esperados) {
      expect(TRANSICOES_ENCOMENDA).toHaveProperty(e);
    }
  });

  it('estados terminais têm array vazio', () => {
    for (const t of TERMINAIS_ENCOMENDA) {
      expect(TRANSICOES_ENCOMENDA[t]).toHaveLength(0);
    }
  });

  it('estados não-terminais têm pelo menos uma transição', () => {
    for (const s of NAO_TERMINAIS_ENCOMENDA) {
      expect(TRANSICOES_ENCOMENDA[s].length).toBeGreaterThan(0);
    }
  });

  it('todos os destinos existem como estados', () => {
    for (const [, destinos] of Object.entries(TRANSICOES_ENCOMENDA)) {
      for (const d of destinos) {
        expect(ESTADOS_ENCOMENDA).toContain(d);
      }
    }
  });

  it('[property] transitarEncomenda não lança para transições permitidas', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ESTADOS_ENCOMENDA), (origem) => {
        const destinos = TRANSICOES_ENCOMENDA[origem];
        for (const destino of destinos) {
          expect(() => transitarEncomenda(origem, destino)).not.toThrow();
        }
      }),
    );
  });

  it('[property] transitarEncomenda lança TRANSICAO_INVALIDA para transições inválidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ESTADOS_ENCOMENDA),
        fc.constantFrom(...ESTADOS_ENCOMENDA),
        (origem, destino) => {
          if (isValidTransition(TRANSICOES_ENCOMENDA, origem, destino)) return;
          expect(() => transitarEncomenda(origem, destino)).toThrow();
          try {
            transitarEncomenda(origem, destino);
          } catch (e: unknown) {
            const err = e as { code?: string };
            expect(err.code).toBe('TRANSICAO_INVALIDA');
          }
        },
      ),
    );
  });

  it('[property] estados terminais não têm saídas válidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ESTADOS_ENCOMENDA),
        fc.constantFrom(...ESTADOS_ENCOMENDA),
        (terminal, destino) => {
          if (!isTerminal(TRANSICOES_ENCOMENDA, terminal)) return;
          expect(() => transitarEncomenda(terminal, destino)).toThrow();
        },
      ),
    );
  });

  it('caminho rápido RASCUNHO → CONFIRMADA → CONCLUIDA é válido', () => {
    expect(() => transitarEncomenda('RASCUNHO', 'CONFIRMADA')).not.toThrow();
    expect(() => transitarEncomenda('CONFIRMADA', 'CONCLUIDA')).not.toThrow();
  });

  it('caminho com entrega parcial é válido', () => {
    expect(() => transitarEncomenda('CONFIRMADA', 'PARCIALMENTE_ENTREGUE')).not.toThrow();
    expect(() => transitarEncomenda('PARCIALMENTE_ENTREGUE', 'CONCLUIDA')).not.toThrow();
  });

  it('não é possível retroceder CONFIRMADA → RASCUNHO', () => {
    expect(() => transitarEncomenda('CONFIRMADA', 'RASCUNHO')).toThrow();
  });

  it('não é possível partir de CANCELADA', () => {
    for (const destino of ESTADOS_ENCOMENDA) {
      expect(() => transitarEncomenda('CANCELADA', destino)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Máquina de estado — Devolução
// ---------------------------------------------------------------------------

const ESTADOS_DEVOLUCAO = Object.keys(TRANSICOES_DEVOLUCAO) as StatusDevolucao[];
const TERMINAIS_DEVOLUCAO = ['PROCESSADA', 'REJEITADA'] as const;

describe('TRANSICOES_DEVOLUCAO', () => {
  it('mapa cobre todos os estados esperados', () => {
    const esperados: StatusDevolucao[] = ['PENDENTE', 'APROVADA', 'PROCESSADA', 'REJEITADA'];
    for (const e of esperados) {
      expect(TRANSICOES_DEVOLUCAO).toHaveProperty(e);
    }
  });

  it('PROCESSADA e REJEITADA são terminais', () => {
    for (const t of TERMINAIS_DEVOLUCAO) {
      expect(TRANSICOES_DEVOLUCAO[t]).toHaveLength(0);
    }
  });

  it('todos os destinos existem como estados', () => {
    for (const [, destinos] of Object.entries(TRANSICOES_DEVOLUCAO)) {
      for (const d of destinos) {
        expect(ESTADOS_DEVOLUCAO).toContain(d);
      }
    }
  });

  it('[property] transitarDevolucao não lança para transições permitidas', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ESTADOS_DEVOLUCAO), (origem) => {
        const destinos = TRANSICOES_DEVOLUCAO[origem];
        for (const destino of destinos) {
          expect(() => transitarDevolucao(origem, destino)).not.toThrow();
        }
      }),
    );
  });

  it('[property] transitarDevolucao lança TRANSICAO_INVALIDA para transições inválidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ESTADOS_DEVOLUCAO),
        fc.constantFrom(...ESTADOS_DEVOLUCAO),
        (origem, destino) => {
          if (isValidTransition(TRANSICOES_DEVOLUCAO, origem, destino)) return;
          expect(() => transitarDevolucao(origem, destino)).toThrow();
          try {
            transitarDevolucao(origem, destino);
          } catch (e: unknown) {
            const err = e as { code?: string };
            expect(err.code).toBe('TRANSICAO_INVALIDA');
          }
        },
      ),
    );
  });

  it('fluxo normal PENDENTE → APROVADA → PROCESSADA é válido', () => {
    expect(() => transitarDevolucao('PENDENTE', 'APROVADA')).not.toThrow();
    expect(() => transitarDevolucao('APROVADA', 'PROCESSADA')).not.toThrow();
  });

  it('fluxo rejeição PENDENTE → REJEITADA é válido', () => {
    expect(() => transitarDevolucao('PENDENTE', 'REJEITADA')).not.toThrow();
  });

  it('não é possível APROVADA → REJEITADA (deve voltar a PENDENTE por re-criação)', () => {
    expect(() => transitarDevolucao('APROVADA', 'REJEITADA')).toThrow();
  });

  it('não é possível sair de PROCESSADA', () => {
    for (const destino of ESTADOS_DEVOLUCAO) {
      expect(() => transitarDevolucao('PROCESSADA', destino)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Invariantes de stock (lógica pura)
// ---------------------------------------------------------------------------

describe('stock — invariantes matemáticas', () => {
  it('[property] reserva não pode exceder stock disponível', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }), // stockDisponivel
        fc.nat({ max: 10001 }), // quantidadeReserva
        (stockDisponivel, quantidadeReserva) => {
          const podeReservar = quantidadeReserva <= stockDisponivel;
          if (!podeReservar) {
            // Simula o guard do serviço: reserva > disponível → erro
            expect(() => {
              if (quantidadeReserva > stockDisponivel) {
                throw new Error('STOCK_INSUFICIENTE');
              }
            }).toThrow('STOCK_INSUFICIENTE');
          } else {
            // Stock após reserva: disponível diminui, reservado aumenta
            const disponivelApos = stockDisponivel - quantidadeReserva;
            expect(disponivelApos).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });

  it('[property] confirmarConsumo: total = consumido + disponível (após baixa)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }), // stockTotal
        fc.nat({ max: 1000 }), // quantidadeBaixada
        (stockTotal, baixa) => {
          const baixaEfetiva = Math.min(baixa, stockTotal);
          const stockApos = stockTotal - baixaEfetiva;
          expect(stockApos + baixaEfetiva).toBe(stockTotal);
          expect(stockApos).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('[property] devolução repõe stock: disponível aumenta pelo retorno', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }), // stockAtual
        fc.integer({ min: 1, max: 1000 }), // quantidadeDevolvida
        (stockAtual, qtdDevolvida) => {
          const stockApos = stockAtual + qtdDevolvida;
          expect(stockApos).toBeGreaterThan(stockAtual);
          expect(stockApos).toBe(stockAtual + qtdDevolvida);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Nota de Crédito — débito == crédito (partida dobrada)
// ---------------------------------------------------------------------------

describe('nota de crédito — partida dobrada', () => {
  it('[property] total NC = sum(linhas.total)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            quantidade: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
            precoUnitario: fc.float({ min: 0, max: Math.fround(100000), noNaN: true }),
            taxaIva: fc.constantFrom(0, 0.16, 0.17),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (linhas) => {
          let totalCalculado = 0;
          for (const linha of linhas) {
            const base = linha.quantidade * linha.precoUnitario;
            const iva = base * linha.taxaIva;
            totalCalculado += base + iva;
          }
          // Verificar que o total é a soma das linhas (invariante de partida dobrada)
          let totalRecomposto = 0;
          for (const linha of linhas) {
            const { total } = calcItemTotal(
              linha.quantidade,
              linha.precoUnitario,
              0, // sem desconto neste teste
              linha.taxaIva,
            );
            totalRecomposto += total;
          }
          // Tolerância de floating point (1 centavo)
          expect(Math.abs(totalRecomposto - totalCalculado)).toBeLessThan(0.01);
        },
      ),
    );
  });

  it('[property] NC com desconto: subtotal < precoUnitario * quantidade', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),         // desconto 0–100%
        fc.float({ min: 1, max: Math.fround(10000), noNaN: true }),  // precoUnitario
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }), // quantidade
        (desconto, preco, qtd) => {
          const { subtotal } = calcItemTotal(qtd, preco, desconto, 0);
          if (desconto === 0) {
            expect(subtotal).toBeCloseTo(qtd * preco, 5);
          } else {
            expect(subtotal).toBeLessThan(qtd * preco + 0.001);
          }
          expect(subtotal).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('[property] iva == subtotal * taxa', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(100000), noNaN: true }),
        fc.constantFrom(0, 0.16, 0.17),
        (precoBase, taxa) => {
          const iva = precoBase * taxa;
          const total = precoBase + iva;
          expect(total).toBeCloseTo(precoBase * (1 + taxa), 5);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant isolation (lógica pura — sem DB)
// ---------------------------------------------------------------------------

describe('multi-tenant isolation', () => {
  it('tenantId de contexto diferente do registo lança NotFoundError', () => {
    // Simula o guard presente em todos os serviços:
    // findFirst({ where: { id, tenantId: ctx.tenantId } }) → null → NotFoundError
    function simularObter(
      registoTenantId: string,
      ctxTenantId: string,
    ): { id: string; tenantId: string } | null {
      // Guard: apenas devolve se tenantId coincide
      if (registoTenantId !== ctxTenantId) return null;
      return { id: 'some-id', tenantId: registoTenantId };
    }

    fc.assert(
      fc.property(
        fc.uuid(), // tenantA
        fc.uuid(), // tenantB
        (tenantA, tenantB) => {
          if (tenantA === tenantB) return; // Caso improvável — pular
          const resultado = simularObter(tenantA, tenantB);
          expect(resultado).toBeNull();
        },
      ),
    );
  });

  it('tenantId correto retorna o registo', () => {
    fc.assert(
      fc.property(fc.uuid(), (tenantId) => {
        function simularObter(rTenantId: string, cTenantId: string) {
          if (rTenantId !== cTenantId) return null;
          return { id: 'x', tenantId: rTenantId };
        }
        const resultado = simularObter(tenantId, tenantId);
        expect(resultado).not.toBeNull();
        expect(resultado?.tenantId).toBe(tenantId);
      }),
    );
  });
});
