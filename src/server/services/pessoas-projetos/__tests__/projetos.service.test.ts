import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calcularMidpoint, calcularPosicaoKanban } from '../projetos.service';
import { transitar } from '../rh.service';
import {
  TRANSICOES_PROJETO,
  TRANSICOES_TAREFA,
  TRANSICOES_MARCO,
  TRANSICOES_ORCAMENTO,
} from '../projetos.interface';
import { BusinessRuleError } from '@/lib/errors';

// ─────────────────────────────────────────────────────────────────────────────
// calcularMidpoint — chave fraccional kanban
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularMidpoint', () => {
  it('retorna valor entre a e b', () => {
    const m = calcularMidpoint('0', '1');
    expect(parseFloat(m)).toBeGreaterThan(0);
    expect(parseFloat(m)).toBeLessThan(1);
  });

  it('valor exacto para 0 e 1 é 0.5', () => {
    expect(calcularMidpoint('0', '1')).toBe('0.5');
  });

  it('midpoint de 0.5 e 1 é 0.75', () => {
    const m = parseFloat(calcularMidpoint('0.5', '1'));
    expect(m).toBeCloseTo(0.75, 5);
  });

  it('lança erro se a >= b', () => {
    expect(() => calcularMidpoint('1', '0')).toThrow();
    expect(() => calcularMidpoint('0.5', '0.5')).toThrow();
  });

  it('lança erro para posições inválidas', () => {
    expect(() => calcularMidpoint('abc', '1')).toThrow();
  });

  it('produz string não vazia', () => {
    const m = calcularMidpoint('0.1', '0.9');
    expect(m.length).toBeGreaterThan(0);
  });

  // ── Property tests ────────────────────────────────────────────────────────

  it('[property] midpoint está estritamente entre a e b', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(0.49), noNaN: true }),
        fc.float({ min: Math.fround(0.51), max: Math.fround(1), noNaN: true }),
        (a, b) => {
          const strA = String(a);
          const strB = String(b);
          const m = parseFloat(calcularMidpoint(strA, strB));
          expect(m).toBeGreaterThan(a);
          expect(m).toBeLessThan(b);
        },
      ),
    );
  });

  it('[property] inserções repetidas mantêm ordem total', () => {
    // Simula inserção de N tarefas no fim da fila e verifica ordem crescente
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (n) => {
          let ultimo = '0';
          const posicoes: string[] = [];

          for (let i = 0; i < n; i++) {
            const nova = calcularMidpoint(ultimo, String(parseFloat(ultimo) + 1));
            posicoes.push(nova);
            ultimo = nova;
          }

          // Verificar ordem estritamente crescente
          for (let i = 1; i < posicoes.length; i++) {
            expect(parseFloat(posicoes[i]!)).toBeGreaterThan(parseFloat(posicoes[i - 1]!));
          }
        },
      ),
    );
  });

  it('[property] inserção no meio mantém ordem total', () => {
    // Inserir entre dois elementos existentes e verificar a < mid < b
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        (n) => {
          // Criar n+1 posições sequenciais
          const posicoes: string[] = ['0'];
          for (let i = 0; i < n; i++) {
            const ultimo = posicoes[posicoes.length - 1]!;
            posicoes.push(calcularMidpoint(ultimo, String(parseFloat(ultimo) + 1)));
          }

          // Inserir entre posicoes[0] e posicoes[1]
          if (posicoes.length >= 2) {
            const nova = calcularMidpoint(posicoes[0]!, posicoes[1]!);
            expect(parseFloat(nova)).toBeGreaterThan(parseFloat(posicoes[0]!));
            expect(parseFloat(nova)).toBeLessThan(parseFloat(posicoes[1]!));
          }
        },
      ),
    );
  });
});

describe('calcularPosicaoKanban', () => {
  it('inserir no início (sem antes)', () => {
    const pos = calcularPosicaoKanban(undefined, '0.5');
    expect(parseFloat(pos)).toBeLessThan(0.5);
  });

  it('inserir no fim (sem depois)', () => {
    const pos = calcularPosicaoKanban('0.5', undefined);
    expect(parseFloat(pos)).toBeGreaterThan(0.5);
  });

  it('inserir entre dois elementos', () => {
    const pos = calcularPosicaoKanban('0.2', '0.8');
    expect(parseFloat(pos)).toBeGreaterThan(0.2);
    expect(parseFloat(pos)).toBeLessThan(0.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_PROJETO
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_PROJETO', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_PROJETO));
    for (const destinos of Object.values(TRANSICOES_PROJETO)) {
      for (const d of destinos) {
        expect(estados.has(d), `Destino desconhecido: ${d}`).toBe(true);
      }
    }
  });

  it('PLANEAMENTO → EM_ANDAMENTO é válido', () => {
    expect(() => transitar(TRANSICOES_PROJETO, 'PLANEAMENTO', 'EM_ANDAMENTO')).not.toThrow();
  });

  it('ARQUIVADO é terminal', () => {
    expect(TRANSICOES_PROJETO['ARQUIVADO']).toHaveLength(0);
  });

  it('CONCLUIDO e CANCELADO chegam a ARQUIVADO', () => {
    expect(TRANSICOES_PROJETO['CONCLUIDO']).toContain('ARQUIVADO');
    expect(TRANSICOES_PROJETO['CANCELADO']).toContain('ARQUIVADO');
  });

  it('não permite ir de ARQUIVADO para qualquer estado', () => {
    expect(() => transitar(TRANSICOES_PROJETO, 'ARQUIVADO', 'PLANEAMENTO')).toThrow(BusinessRuleError);
  });

  // Property: todos os estados não-terminais têm pelo menos uma saída
  it('[property] estados não-terminais têm pelo menos uma saída', () => {
    const terminais = new Set(['ARQUIVADO']);
    for (const [estado, destinos] of Object.entries(TRANSICOES_PROJETO)) {
      if (!terminais.has(estado)) {
        expect(destinos.length, `Estado '${estado}' sem saída`).toBeGreaterThan(0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_TAREFA — kanban
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_TAREFA', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_TAREFA));
    for (const destinos of Object.values(TRANSICOES_TAREFA)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('fluxo normal A_FAZER → EM_PROGRESSO → CONCLUIDA', () => {
    expect(() => transitar(TRANSICOES_TAREFA, 'A_FAZER', 'EM_PROGRESSO')).not.toThrow();
    expect(() => transitar(TRANSICOES_TAREFA, 'EM_PROGRESSO', 'CONCLUIDA')).not.toThrow();
  });

  it('revisão: EM_PROGRESSO → EM_REVISAO → EM_PROGRESSO (ciclo)', () => {
    expect(() => transitar(TRANSICOES_TAREFA, 'EM_PROGRESSO', 'EM_REVISAO')).not.toThrow();
    expect(() => transitar(TRANSICOES_TAREFA, 'EM_REVISAO', 'EM_PROGRESSO')).not.toThrow();
  });

  it('BLOQUEADA não pode ir directamente para CONCLUIDA', () => {
    expect(() => transitar(TRANSICOES_TAREFA, 'BLOQUEADA', 'CONCLUIDA')).toThrow(BusinessRuleError);
  });

  it('CONCLUIDA e CANCELADA são terminais', () => {
    expect(TRANSICOES_TAREFA['CONCLUIDA']).toHaveLength(0);
    expect(TRANSICOES_TAREFA['CANCELADA']).toHaveLength(0);
  });

  it('BLOQUEADA pode ir para A_FAZER ou EM_PROGRESSO', () => {
    expect(TRANSICOES_TAREFA['BLOQUEADA']).toContain('A_FAZER');
    expect(TRANSICOES_TAREFA['BLOQUEADA']).toContain('EM_PROGRESSO');
  });

  // Property: qualquer sequência de transições válidas é possível
  it('[property] todas as transições listadas são permitidas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(TRANSICOES_TAREFA)),
        (estado) => {
          const destinos = TRANSICOES_TAREFA[estado] ?? [];
          for (const d of destinos) {
            expect(() => transitar(TRANSICOES_TAREFA, estado, d)).not.toThrow();
          }
          return true;
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_MARCO
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_MARCO', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_MARCO));
    for (const destinos of Object.values(TRANSICOES_MARCO)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('caminho de atraso: PENDENTE → ATRASADO → CONCLUIDO', () => {
    expect(() => transitar(TRANSICOES_MARCO, 'PENDENTE', 'ATRASADO')).not.toThrow();
    expect(() => transitar(TRANSICOES_MARCO, 'ATRASADO', 'CONCLUIDO')).not.toThrow();
  });

  it('CONCLUIDO é terminal', () => {
    expect(TRANSICOES_MARCO['CONCLUIDO']).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_ORCAMENTO
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_ORCAMENTO', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_ORCAMENTO));
    for (const destinos of Object.values(TRANSICOES_ORCAMENTO)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('RASCUNHO → APROVADO é válido (aprovação directa)', () => {
    expect(() => transitar(TRANSICOES_ORCAMENTO, 'RASCUNHO', 'APROVADO')).not.toThrow();
  });

  it('APROVADO é terminal', () => {
    expect(TRANSICOES_ORCAMENTO['APROVADO']).toHaveLength(0);
  });

  it('REJEITADO → RASCUNHO (revisão possível)', () => {
    expect(TRANSICOES_ORCAMENTO['REJEITADO']).toContain('RASCUNHO');
  });
});
