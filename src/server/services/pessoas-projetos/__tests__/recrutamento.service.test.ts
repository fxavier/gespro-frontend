/**
 * Testes do módulo Recrutamento — spec 07.
 * Apenas lógica pura: máquinas de estado, midpoint, transições.
 * Não usa a DB real (tabelas novas inexistentes no shared DB).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BusinessRuleError } from '@/lib/errors';
import { transitar } from '../rh.service';
import {
  TRANSICOES_VAGA,
  TRANSICOES_CANDIDATURA,
  calcularMidpoint,
} from '@/lib/state-machines';

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_VAGA — invariantes da máquina de estado
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_VAGA', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_VAGA));
    for (const destinos of Object.values(TRANSICOES_VAGA)) {
      for (const d of destinos) {
        expect(estados.has(d), `Destino '${d}' não é estado conhecido`).toBe(true);
      }
    }
  });

  it('RASCUNHO pode ir para ABERTA ou CANCELADA', () => {
    expect(TRANSICOES_VAGA['RASCUNHO']).toContain('ABERTA');
    expect(TRANSICOES_VAGA['RASCUNHO']).toContain('CANCELADA');
  });

  it('ABERTA pode ir para EM_TRIAGEM, FECHADA ou CANCELADA', () => {
    expect(TRANSICOES_VAGA['ABERTA']).toContain('EM_TRIAGEM');
    expect(TRANSICOES_VAGA['ABERTA']).toContain('FECHADA');
    expect(TRANSICOES_VAGA['ABERTA']).toContain('CANCELADA');
  });

  it('FECHADA é terminal', () => {
    expect(TRANSICOES_VAGA['FECHADA']).toHaveLength(0);
  });

  it('CANCELADA é terminal', () => {
    expect(TRANSICOES_VAGA['CANCELADA']).toHaveLength(0);
  });

  it('EM_TRIAGEM pode voltar para ABERTA', () => {
    expect(TRANSICOES_VAGA['EM_TRIAGEM']).toContain('ABERTA');
  });

  it('transição RASCUNHO → ABERTA é permitida', () => {
    expect(() => transitar(TRANSICOES_VAGA, 'RASCUNHO', 'ABERTA')).not.toThrow();
  });

  it('transição ABERTA → RASCUNHO é inválida', () => {
    expect(() => transitar(TRANSICOES_VAGA, 'ABERTA', 'RASCUNHO')).toThrow(BusinessRuleError);
  });

  it('transição FECHADA → ABERTA é inválida (terminal)', () => {
    expect(() => transitar(TRANSICOES_VAGA, 'FECHADA', 'ABERTA')).toThrow(BusinessRuleError);
  });

  it('transição CANCELADA → ABERTA é inválida (terminal)', () => {
    expect(() => transitar(TRANSICOES_VAGA, 'CANCELADA', 'ABERTA')).toThrow(BusinessRuleError);
  });

  // Property: qualquer transição listada no mapa é sempre válida
  it('[property] todas as transições listadas no mapa são permitidas', () => {
    const estados = Object.keys(TRANSICOES_VAGA);
    fc.assert(
      fc.property(
        fc.constantFrom(...estados),
        (estado) => {
          const destinos = TRANSICOES_VAGA[estado] ?? [];
          for (const d of destinos) {
            expect(() => transitar(TRANSICOES_VAGA, estado, d)).not.toThrow();
          }
          return true;
        },
      ),
    );
  });

  // Property: estado desconhecido → sempre lança (filtra chaves de protótipo)
  it('[property] estado desconhecido lança BusinessRuleError', () => {
    const estadosValidos = new Set(Object.keys(TRANSICOES_VAGA));
    // Filtrar chaves de Object.prototype que retornam funções no mapa
    const protoKeys = new Set(Object.getOwnPropertyNames(Object.prototype));
    fc.assert(
      fc.property(
        fc.string().filter((s) => !estadosValidos.has(s) && s.length > 0 && !protoKeys.has(s)),
        fc.constantFrom(...Object.keys(TRANSICOES_VAGA)),
        (estadoInvalido, destino) => {
          expect(() => transitar(TRANSICOES_VAGA, estadoInvalido, destino)).toThrow(BusinessRuleError);
          return true;
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_CANDIDATURA — invariantes da máquina de estado
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_CANDIDATURA', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_CANDIDATURA));
    for (const destinos of Object.values(TRANSICOES_CANDIDATURA)) {
      for (const d of destinos) {
        expect(estados.has(d), `Destino '${d}' não é estado conhecido`).toBe(true);
      }
    }
  });

  it('RECEBIDA pode ir para TRIAGEM, REJEITADO ou DESISTIU', () => {
    expect(TRANSICOES_CANDIDATURA['RECEBIDA']).toContain('TRIAGEM');
    expect(TRANSICOES_CANDIDATURA['RECEBIDA']).toContain('REJEITADO');
    expect(TRANSICOES_CANDIDATURA['RECEBIDA']).toContain('DESISTIU');
  });

  it('PROPOSTA pode ir para CONTRATADO', () => {
    expect(TRANSICOES_CANDIDATURA['PROPOSTA']).toContain('CONTRATADO');
  });

  it('CONTRATADO é terminal', () => {
    expect(TRANSICOES_CANDIDATURA['CONTRATADO']).toHaveLength(0);
  });

  it('REJEITADO é terminal', () => {
    expect(TRANSICOES_CANDIDATURA['REJEITADO']).toHaveLength(0);
  });

  it('DESISTIU é terminal', () => {
    expect(TRANSICOES_CANDIDATURA['DESISTIU']).toHaveLength(0);
  });

  it('não é possível saltar etapas: RECEBIDA → ENTREVISTA é inválido', () => {
    expect(() => transitar(TRANSICOES_CANDIDATURA, 'RECEBIDA', 'ENTREVISTA')).toThrow(BusinessRuleError);
  });

  it('não é possível retrogradar: ENTREVISTA → RECEBIDA é inválido', () => {
    expect(() => transitar(TRANSICOES_CANDIDATURA, 'ENTREVISTA', 'RECEBIDA')).toThrow(BusinessRuleError);
  });

  it('pipeline completo é válido: RECEBIDA → TRIAGEM → ENTREVISTA → PROPOSTA → CONTRATADO', () => {
    const pipeline = ['RECEBIDA', 'TRIAGEM', 'ENTREVISTA', 'PROPOSTA', 'CONTRATADO'];
    for (let i = 0; i < pipeline.length - 1; i++) {
      expect(() => transitar(TRANSICOES_CANDIDATURA, pipeline[i], pipeline[i + 1])).not.toThrow();
    }
  });

  it('rejeição a partir de qualquer etapa intermédia é válida', () => {
    const etapasIntermedias = ['RECEBIDA', 'TRIAGEM', 'ENTREVISTA', 'PROPOSTA'];
    for (const etapa of etapasIntermedias) {
      expect(() => transitar(TRANSICOES_CANDIDATURA, etapa, 'REJEITADO')).not.toThrow();
    }
  });

  it('desistência a partir de qualquer etapa intermédia é válida', () => {
    const etapasIntermedias = ['RECEBIDA', 'TRIAGEM', 'ENTREVISTA', 'PROPOSTA'];
    for (const etapa of etapasIntermedias) {
      expect(() => transitar(TRANSICOES_CANDIDATURA, etapa, 'DESISTIU')).not.toThrow();
    }
  });

  // Property: qualquer transição listada é sempre válida
  it('[property] todas as transições listadas são permitidas', () => {
    const estados = Object.keys(TRANSICOES_CANDIDATURA);
    fc.assert(
      fc.property(
        fc.constantFrom(...estados),
        (estado) => {
          const destinos = TRANSICOES_CANDIDATURA[estado] ?? [];
          for (const d of destinos) {
            expect(() => transitar(TRANSICOES_CANDIDATURA, estado, d)).not.toThrow();
          }
          return true;
        },
      ),
    );
  });

  // Property: a máquina é determinística
  it('[property] transitar é determinístico', () => {
    const estados = Object.keys(TRANSICOES_CANDIDATURA);
    fc.assert(
      fc.property(
        fc.constantFrom(...estados),
        fc.constantFrom(...estados),
        (origem, destino) => {
          const resultado1 = (() => {
            try {
              transitar(TRANSICOES_CANDIDATURA, origem, destino);
              return 'ok';
            } catch {
              return 'erro';
            }
          })();
          const resultado2 = (() => {
            try {
              transitar(TRANSICOES_CANDIDATURA, origem, destino);
              return 'ok';
            } catch {
              return 'erro';
            }
          })();
          expect(resultado1).toBe(resultado2);
          return true;
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularMidpoint — posição fraccional kanban
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularMidpoint', () => {
  it('midpoint entre null e null é "0.5"', () => {
    expect(calcularMidpoint(null, null)).toBe('0.5');
  });

  it('midpoint entre "0" e "1" é "0.5"', () => {
    const m = parseFloat(calcularMidpoint('0', '1'));
    expect(m).toBeCloseTo(0.5, 5);
  });

  it('midpoint entre "0.5" e "1" está entre os dois', () => {
    const m = parseFloat(calcularMidpoint('0.5', '1'));
    expect(m).toBeGreaterThan(0.5);
    expect(m).toBeLessThan(1);
  });

  it('midpoint após o último item (posterior=null) é maior que anterior', () => {
    const m = parseFloat(calcularMidpoint('0.9', null));
    expect(m).toBeGreaterThan(0.9);
  });

  it('midpoint antes do primeiro item (anterior=null) é menor que posterior', () => {
    const m = parseFloat(calcularMidpoint(null, '0.3'));
    expect(m).toBeLessThan(0.3);
  });

  // Property: midpoint(a, b) está sempre estritamente entre a e b
  it('[property] midpoint está sempre entre anterior e posterior', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (x, y) => {
          const [a, b] = x < y ? [x, y] : [y, x];
          if (Math.abs(b - a) < 0.000001) return true; // muito próximos, ignorar
          const m = parseFloat(calcularMidpoint(String(a), String(b)));
          expect(m).toBeGreaterThan(a);
          expect(m).toBeLessThan(b);
          return true;
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validações Zod — schemas recrutamento
// ─────────────────────────────────────────────────────────────────────────────

describe('VagaSchema validações', () => {
  it('rejeita salário mínimo maior que máximo', async () => {
    const { VagaSchema } = await import('@/lib/validations/recrutamento');
    const result = VagaSchema.safeParse({
      titulo: 'Programador',
      descricao: 'Descrição',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      tipoContrato: 'EFECTIVO',
      salarioMin: 5000,
      salarioMax: 3000,
    });
    expect(result.success).toBe(false);
  });

  it('aceita vaga válida sem campos opcionais', async () => {
    const { VagaSchema } = await import('@/lib/validations/recrutamento');
    const result = VagaSchema.safeParse({
      titulo: 'Programador Senior',
      descricao: 'Descrição detalhada da vaga',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      tipoContrato: 'EFECTIVO',
    });
    expect(result.success).toBe(true);
  });
});

describe('CandidatoSchema validações', () => {
  it('rejeita NUIT inválido', async () => {
    const { CandidatoSchema } = await import('@/lib/validations/recrutamento');
    const result = CandidatoSchema.safeParse({
      nome: 'João Silva',
      email: 'joao@example.com',
      telefone: '84 123 4567',
      nuit: '111111111', // todos iguais — inválido
    });
    expect(result.success).toBe(false);
  });

  it('aceita candidato sem BI/NUIT', async () => {
    const { CandidatoSchema } = await import('@/lib/validations/recrutamento');
    const result = CandidatoSchema.safeParse({
      nome: 'Maria Santos',
      email: 'maria@example.com',
      telefone: '84 123 4567',
    });
    expect(result.success).toBe(true);
  });
});
