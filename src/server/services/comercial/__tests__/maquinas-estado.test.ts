/**
 * Property tests — máquinas de estado WS C
 * Testa TRANSICOES_VENDA, TRANSICOES_SESSAO_POS, TRANSICOES_COMISSAO com fast-check.
 *
 * Invariantes verificadas:
 *  1. Todos os estados estão no mapa (map é total sobre o tipo)
 *  2. Estados terminais têm array vazio
 *  3. transitarVenda / transitarSessaoPOS / transitarComissao lança BusinessRuleError
 *     para transições inválidas e nunca lança para transições válidas
 *  4. Nenhum estado pode ser atingido a partir de um estado terminal
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  TRANSICOES_VENDA,
  transitarVenda,
  TRANSICOES_SESSAO_POS,
  transitarSessaoPOS,
} from '../venda.interface';
import {
  TRANSICOES_COMISSAO,
  transitarComissao,
} from '../comissao.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_VENDA = Object.keys(TRANSICOES_VENDA) as (keyof typeof TRANSICOES_VENDA)[];
const STATUS_POS = Object.keys(TRANSICOES_SESSAO_POS) as (keyof typeof TRANSICOES_SESSAO_POS)[];
const STATUS_COMISSAO = Object.keys(TRANSICOES_COMISSAO) as (keyof typeof TRANSICOES_COMISSAO)[];

function isTerminal<T extends string>(mapa: Record<T, T[]>, estado: T): boolean {
  return mapa[estado].length === 0;
}

function isValidTransition<T extends string>(mapa: Record<T, T[]>, de: T, para: T): boolean {
  return mapa[de].includes(para);
}

// ---------------------------------------------------------------------------
// Venda — mapa total e estados terminais
// ---------------------------------------------------------------------------

describe('TRANSICOES_VENDA', () => {
  it('o mapa cobre todos os estados do tipo', () => {
    const esperados: (keyof typeof TRANSICOES_VENDA)[] = [
      'RASCUNHO', 'PENDENTE', 'CONFIRMADA', 'EM_PREPARACAO',
      'FATURADA', 'CONCLUIDA', 'CANCELADA', 'DEVOLVIDA',
    ];
    for (const e of esperados) {
      expect(TRANSICOES_VENDA).toHaveProperty(e);
    }
  });

  it('estados terminais têm array vazio', () => {
    const terminais = ['CONCLUIDA', 'CANCELADA', 'DEVOLVIDA'] as const;
    for (const t of terminais) {
      expect(TRANSICOES_VENDA[t]).toHaveLength(0);
    }
  });

  it('estados não-terminais têm pelo menos uma transição', () => {
    const naoTerminais = ['RASCUNHO', 'PENDENTE', 'CONFIRMADA', 'EM_PREPARACAO', 'FATURADA'] as const;
    for (const s of naoTerminais) {
      expect(TRANSICOES_VENDA[s].length).toBeGreaterThan(0);
    }
  });

  it('[property] transitarVenda nunca lança para transições permitidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_VENDA),
        (origem) => {
          const destinos = TRANSICOES_VENDA[origem];
          for (const destino of destinos) {
            expect(() => transitarVenda(origem, destino)).not.toThrow();
          }
        },
      ),
    );
  });

  it('[property] transitarVenda lança BusinessRuleError para transições inválidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_VENDA),
        fc.constantFrom(...STATUS_VENDA),
        (origem, destino) => {
          if (isValidTransition(TRANSICOES_VENDA, origem, destino)) return; // pular válidas
          expect(() => transitarVenda(origem, destino)).toThrow();
          try {
            transitarVenda(origem, destino);
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
        fc.constantFrom(...STATUS_VENDA),
        fc.constantFrom(...STATUS_VENDA),
        (terminal, destino) => {
          if (!isTerminal(TRANSICOES_VENDA, terminal)) return;
          expect(() => transitarVenda(terminal, destino)).toThrow();
        },
      ),
    );
  });

  it('POS caminho rápido PENDENTE → FATURADA → CONCLUIDA é válido', () => {
    expect(() => transitarVenda('PENDENTE', 'FATURADA')).not.toThrow();
    expect(() => transitarVenda('FATURADA', 'CONCLUIDA')).not.toThrow();
  });

  it('Encomenda caminho completo é válido', () => {
    const caminho: [keyof typeof TRANSICOES_VENDA, keyof typeof TRANSICOES_VENDA][] = [
      ['RASCUNHO', 'PENDENTE'],
      ['PENDENTE', 'CONFIRMADA'],
      ['CONFIRMADA', 'EM_PREPARACAO'],
      ['EM_PREPARACAO', 'FATURADA'],
      ['FATURADA', 'CONCLUIDA'],
    ];
    for (const [de, para] of caminho) {
      expect(() => transitarVenda(de, para)).not.toThrow();
    }
  });

  it('não é possível ir para RASCUNHO a partir de qualquer estado', () => {
    for (const estado of STATUS_VENDA) {
      if (estado === 'RASCUNHO') continue;
      expect(() => transitarVenda(estado, 'RASCUNHO')).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// SessaoPOS
// ---------------------------------------------------------------------------

describe('TRANSICOES_SESSAO_POS', () => {
  it('o mapa cobre todos os estados', () => {
    const esperados: (keyof typeof TRANSICOES_SESSAO_POS)[] = ['ABERTA', 'FECHADA', 'SUSPENSA'];
    for (const e of esperados) {
      expect(TRANSICOES_SESSAO_POS).toHaveProperty(e);
    }
  });

  it('FECHADA é estado terminal', () => {
    expect(TRANSICOES_SESSAO_POS.FECHADA).toHaveLength(0);
  });

  it('[property] transitarSessaoPOS nunca lança para transições permitidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_POS),
        (origem) => {
          const destinos = TRANSICOES_SESSAO_POS[origem];
          for (const destino of destinos) {
            expect(() => transitarSessaoPOS(origem, destino)).not.toThrow();
          }
        },
      ),
    );
  });

  it('[property] transitarSessaoPOS lança para transições inválidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_POS),
        fc.constantFrom(...STATUS_POS),
        (origem, destino) => {
          if (isValidTransition(TRANSICOES_SESSAO_POS, origem, destino)) return;
          expect(() => transitarSessaoPOS(origem, destino)).toThrow();
        },
      ),
    );
  });

  it('ciclo ABERTA → SUSPENSA → ABERTA é válido', () => {
    expect(() => transitarSessaoPOS('ABERTA', 'SUSPENSA')).not.toThrow();
    expect(() => transitarSessaoPOS('SUSPENSA', 'ABERTA')).not.toThrow();
  });

  it('não é possível reabrir sessão FECHADA', () => {
    for (const destino of STATUS_POS) {
      expect(() => transitarSessaoPOS('FECHADA', destino)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Comissao
// ---------------------------------------------------------------------------

describe('TRANSICOES_COMISSAO', () => {
  it('o mapa cobre todos os estados', () => {
    const esperados: (keyof typeof TRANSICOES_COMISSAO)[] = [
      'PENDENTE', 'APROVADA', 'PAGA', 'CANCELADA',
    ];
    for (const e of esperados) {
      expect(TRANSICOES_COMISSAO).toHaveProperty(e);
    }
  });

  it('PAGA e CANCELADA são terminais', () => {
    expect(TRANSICOES_COMISSAO.PAGA).toHaveLength(0);
    expect(TRANSICOES_COMISSAO.CANCELADA).toHaveLength(0);
  });

  it('[property] transitarComissao nunca lança para transições permitidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_COMISSAO),
        (origem) => {
          const destinos = TRANSICOES_COMISSAO[origem];
          for (const destino of destinos) {
            expect(() => transitarComissao(origem, destino)).not.toThrow();
          }
        },
      ),
    );
  });

  it('[property] transitarComissao lança para transições inválidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_COMISSAO),
        fc.constantFrom(...STATUS_COMISSAO),
        (origem, destino) => {
          if (isValidTransition(TRANSICOES_COMISSAO, origem, destino)) return;
          expect(() => transitarComissao(origem, destino)).toThrow();
          try {
            transitarComissao(origem, destino);
          } catch (e: unknown) {
            const err = e as { code?: string };
            expect(err.code).toBe('TRANSICAO_INVALIDA');
          }
        },
      ),
    );
  });

  it('fluxo normal PENDENTE → APROVADA → PAGA é válido', () => {
    expect(() => transitarComissao('PENDENTE', 'APROVADA')).not.toThrow();
    expect(() => transitarComissao('APROVADA', 'PAGA')).not.toThrow();
  });

  it('não é possível PAGA → CANCELADA', () => {
    expect(() => transitarComissao('PAGA', 'CANCELADA')).toThrow();
  });

  it('não é possível PENDENTE → PAGA (deve passar por APROVADA)', () => {
    expect(() => transitarComissao('PENDENTE', 'PAGA')).toThrow();
  });
});
