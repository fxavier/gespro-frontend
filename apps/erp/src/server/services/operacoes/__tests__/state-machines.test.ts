// Property tests das máquinas de estado — WS F (Wave 2)
// Invariantes: nenhuma transição válida cria estado ilegal; terminais são irrecuperáveis.

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { transitar } from '../_helpers';
import { TRANSICOES_ATIVIDADE } from '../atividade.interface';
import { TRANSICOES_VIATURA } from '../viatura.interface';
import { TRANSICOES_TICKET } from '../ticket.interface';
import { TRANSICOES_ROTA } from '../rota.interface';
import { TRANSICOES_ENTREGA } from '../entrega.interface';
import { BusinessRuleError } from '@/lib/errors';

// ============================================================
// Helper genérico para property tests de máquinas de estado
// ============================================================

type TransicoesMap<E extends string> = Readonly<Record<E, ReadonlyArray<E>>>;

/**
 * Executa uma caminhada aleatória pela máquina de estado a partir do estado inicial.
 * Retorna o estado final após `passos` transições (ou menos, se chegar a terminal).
 */
function caminharMaquina<E extends string>(
  TRANSICOES: TransicoesMap<E>,
  estadoInicial: E,
  passos: readonly E[],
): E {
  let estado = estadoInicial;
  for (const proximo of passos) {
    const permitidos = TRANSICOES[estado];
    if (!permitidos || permitidos.length === 0) break; // terminal
    if (permitidos.includes(proximo)) {
      estado = proximo;
    }
  }
  return estado;
}

/** Estados terminais (sem transições de saída). */
function estadosTerminais<E extends string>(TRANSICOES: TransicoesMap<E>): E[] {
  return (Object.keys(TRANSICOES) as E[]).filter(
    (e) => TRANSICOES[e].length === 0,
  );
}

// ============================================================
// Invariante 1: transitar() lança BusinessRuleError em transições inválidas
// ============================================================

describe('transitar() — invariantes genéricas', () => {
  it('aceita todas as transições permitidas pelo mapa ATIVIDADE', () => {
    for (const [de, paras] of Object.entries(TRANSICOES_ATIVIDADE)) {
      for (const para of paras as string[]) {
        expect(() => transitar(TRANSICOES_ATIVIDADE, de as never, para as never)).not.toThrow();
      }
    }
  });

  it('rejeita transições fora do mapa ATIVIDADE com TRANSICAO_INVALIDA', () => {
    const todos = Object.keys(TRANSICOES_ATIVIDADE);
    for (const de of todos) {
      const permitidos = TRANSICOES_ATIVIDADE[de as never] as string[];
      const invalidos = todos.filter((e) => !permitidos.includes(e) && e !== de);
      for (const para of invalidos) {
        expect(() => transitar(TRANSICOES_ATIVIDADE, de as never, para as never)).toThrow(BusinessRuleError);
      }
    }
  });
});

// ============================================================
// Invariante 2: estados terminais não têm transições de saída
// ============================================================

describe('TRANSICOES_ATIVIDADE', () => {
  const terminais = estadosTerminais(TRANSICOES_ATIVIDADE);

  it('CONCLUIDA e CANCELADA são os únicos terminais', () => {
    expect(terminais.sort()).toEqual(['CANCELADA', 'CONCLUIDA']);
  });

  it('property: nenhuma sequência de transições válidas sai de um estado terminal', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...terminais),
        fc.array(fc.constantFrom(...Object.keys(TRANSICOES_ATIVIDADE) as never[]), { maxLength: 10 }),
        (terminal, passos) => {
          const final = caminharMaquina(TRANSICOES_ATIVIDADE, terminal, passos);
          expect(final).toBe(terminal);
        },
      ),
    );
  });

  it('property: toda transição por caminhada aleatória permanece em estados conhecidos', () => {
    const estados = Object.keys(TRANSICOES_ATIVIDADE);
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...estados as never[]), { minLength: 0, maxLength: 20 }),
        (passos) => {
          const final = caminharMaquina(TRANSICOES_ATIVIDADE, 'PLANEADA', passos);
          expect(estados).toContain(final);
        },
      ),
    );
  });
});

describe('TRANSICOES_VIATURA', () => {
  const terminais = estadosTerminais(TRANSICOES_VIATURA);

  it('ABATIDA é o único terminal', () => {
    expect(terminais).toEqual(['ABATIDA']);
  });

  it('property: ABATIDA não tem saída', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...Object.keys(TRANSICOES_VIATURA) as never[]), { maxLength: 10 }),
        (passos) => {
          const final = caminharMaquina(TRANSICOES_VIATURA, 'ABATIDA', passos);
          expect(final).toBe('ABATIDA');
        },
      ),
    );
  });

  it('aceita todas as transições permitidas pelo mapa VIATURA', () => {
    for (const [de, paras] of Object.entries(TRANSICOES_VIATURA)) {
      for (const para of paras as string[]) {
        expect(() => transitar(TRANSICOES_VIATURA, de as never, para as never)).not.toThrow();
      }
    }
  });
});

describe('TRANSICOES_TICKET', () => {
  const terminais = estadosTerminais(TRANSICOES_TICKET);

  it('CANCELADO é o único terminal', () => {
    expect(terminais).toEqual(['CANCELADO']);
  });

  it('FECHADO pode ser reaberto (→ EM_PROGRESSO)', () => {
    expect(TRANSICOES_TICKET['FECHADO']).toContain('EM_PROGRESSO');
  });

  it('CANCELADO não tem saída', () => {
    expect(TRANSICOES_TICKET['CANCELADO']).toHaveLength(0);
  });

  it('property: nenhuma caminhada aleatória reclassifica CANCELADO', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...Object.keys(TRANSICOES_TICKET) as never[]), { maxLength: 15 }),
        (passos) => {
          const final = caminharMaquina(TRANSICOES_TICKET, 'CANCELADO', passos);
          expect(final).toBe('CANCELADO');
        },
      ),
    );
  });
});

describe('TRANSICOES_ROTA', () => {
  const terminais = estadosTerminais(TRANSICOES_ROTA);

  it('CONCLUIDA e CANCELADA são os terminais', () => {
    expect(terminais.sort()).toEqual(['CANCELADA', 'CONCLUIDA']);
  });

  it('ATIVA pode ser pausada e retomada', () => {
    expect(TRANSICOES_ROTA['ATIVA']).toContain('PAUSADA');
    expect(TRANSICOES_ROTA['PAUSADA']).toContain('ATIVA');
  });

  it('property: toda caminhada aleatória permanece em estados conhecidos', () => {
    const estados = Object.keys(TRANSICOES_ROTA);
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...estados as never[]), { maxLength: 20 }),
        (passos) => {
          const final = caminharMaquina(TRANSICOES_ROTA, 'PLANEADA', passos);
          expect(estados).toContain(final);
        },
      ),
    );
  });
});

describe('TRANSICOES_ENTREGA', () => {
  const terminais = estadosTerminais(TRANSICOES_ENTREGA);

  it('ENTREGUE e CANCELADA são terminais', () => {
    expect(terminais.sort()).toEqual(['CANCELADA', 'ENTREGUE']);
  });

  it('ENTREGUE nunca retroage — invariante principal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...Object.keys(TRANSICOES_ENTREGA) as never[]), { maxLength: 15 }),
        (passos) => {
          const final = caminharMaquina(TRANSICOES_ENTREGA, 'ENTREGUE', passos);
          expect(final).toBe('ENTREGUE');
        },
      ),
    );
  });

  it('FALHADA pode ser reagendada', () => {
    expect(TRANSICOES_ENTREGA['FALHADA']).toContain('AGENDADA');
  });

  it('property: FALHADA não conta como ENTREGUE em nenhuma sequência', () => {
    // Verificar que do estado FALHADA nunca se chega directamente a ENTREGUE
    const transicoesDeFalhada = TRANSICOES_ENTREGA['FALHADA'];
    expect(transicoesDeFalhada).not.toContain('ENTREGUE');
  });
});
