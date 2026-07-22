import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BusinessRuleError } from '@/lib/errors';
import { transitar } from '../rh.service';
import {
  TRANSICOES_COLABORADOR,
  TRANSICOES_SOLICITACAO_FERIAS,
  TRANSICOES_AUSENCIA,
  TRANSICOES_AVALIACAO,
  TRANSICOES_FORMACAO,
} from '../rh.interface';

// ─────────────────────────────────────────────────────────────────────────────
// transitar — função pura
// ─────────────────────────────────────────────────────────────────────────────

describe('transitar', () => {
  it('permite transição válida', () => {
    expect(() => transitar({ A: ['B', 'C'] }, 'A', 'B')).not.toThrow();
  });

  it('permite transição válida para terceiro estado', () => {
    expect(() => transitar({ A: ['B', 'C'] }, 'A', 'C')).not.toThrow();
  });

  it('lança BusinessRuleError para transição inválida', () => {
    expect(() => transitar({ A: ['B'] }, 'A', 'X')).toThrow(BusinessRuleError);
  });

  it('lança BusinessRuleError para estado terminal (sem saídas)', () => {
    expect(() => transitar({ A: [], B: ['A'] }, 'A', 'B')).toThrow(BusinessRuleError);
  });

  it('lança BusinessRuleError para estado desconhecido', () => {
    expect(() => transitar({ A: ['B'] }, 'INEXISTENTE', 'B')).toThrow(BusinessRuleError);
  });

  it('usa código personalizado quando fornecido', () => {
    try {
      transitar({ A: ['B'] }, 'A', 'X', 'MEU_CODIGO');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('MEU_CODIGO');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_COLABORADOR — invariantes da máquina de estado
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_COLABORADOR', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_COLABORADOR));
    for (const [, destinos] of Object.entries(TRANSICOES_COLABORADOR)) {
      for (const d of destinos) {
        expect(estados.has(d), `Destino '${d}' não é estado conhecido`).toBe(true);
      }
    }
  });

  it('ACTIVO pode transitar para INACTIVO e FERIAS', () => {
    expect(TRANSICOES_COLABORADOR['ACTIVO']).toContain('INACTIVO');
    expect(TRANSICOES_COLABORADOR['ACTIVO']).toContain('FERIAS');
  });

  it('INACTIVO é terminal (sem saídas)', () => {
    expect(TRANSICOES_COLABORADOR['INACTIVO']).toHaveLength(0);
  });

  it('FERIAS retorna para ACTIVO', () => {
    expect(TRANSICOES_COLABORADOR['FERIAS']).toContain('ACTIVO');
  });

  // Property: a máquina é determinística — transitar do mesmo estado+destino → mesmo resultado
  it('[property] transitar é determinístico', () => {
    const estados = Object.keys(TRANSICOES_COLABORADOR);
    fc.assert(
      fc.property(
        fc.constantFrom(...estados),
        (estado) => {
          const destinos = TRANSICOES_COLABORADOR[estado] ?? [];
          for (const d of destinos) {
            // Deve sempre ser permitido
            expect(() => transitar(TRANSICOES_COLABORADOR, estado, d)).not.toThrow();
          }
          return true;
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_SOLICITACAO_FERIAS
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_SOLICITACAO_FERIAS', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_SOLICITACAO_FERIAS));
    for (const destinos of Object.values(TRANSICOES_SOLICITACAO_FERIAS)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('PENDENTE pode ser aprovada, rejeitada ou cancelada', () => {
    expect(TRANSICOES_SOLICITACAO_FERIAS['PENDENTE']).toContain('APROVADA');
    expect(TRANSICOES_SOLICITACAO_FERIAS['PENDENTE']).toContain('REJEITADA');
    expect(TRANSICOES_SOLICITACAO_FERIAS['PENDENTE']).toContain('CANCELADA');
  });

  it('APROVADA pode ser cancelada (anulação pós-aprovação)', () => {
    expect(TRANSICOES_SOLICITACAO_FERIAS['APROVADA']).toContain('CANCELADA');
  });

  it('REJEITADA e CANCELADA são terminais', () => {
    expect(TRANSICOES_SOLICITACAO_FERIAS['REJEITADA']).toHaveLength(0);
    expect(TRANSICOES_SOLICITACAO_FERIAS['CANCELADA']).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_AVALIACAO
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_AVALIACAO', () => {
  it('todos os estados têm pelo menos um caminho até CONCLUIDA ou CANCELADA', () => {
    const terminais = new Set(['CONCLUIDA', 'CANCELADA']);
    for (const [estado, destinos] of Object.entries(TRANSICOES_AVALIACAO)) {
      if (terminais.has(estado)) continue;
      const atingeTerminal = destinos.some((d) => terminais.has(d) || (TRANSICOES_AVALIACAO[d] ?? []).some((dd) => terminais.has(dd)));
      expect(atingeTerminal, `Estado '${estado}' não pode atingir estado terminal`).toBe(true);
    }
  });

  it('PENDENTE → EM_ANDAMENTO → CONCLUIDA é caminho válido', () => {
    expect(() => transitar(TRANSICOES_AVALIACAO, 'PENDENTE', 'EM_ANDAMENTO')).not.toThrow();
    expect(() => transitar(TRANSICOES_AVALIACAO, 'EM_ANDAMENTO', 'CONCLUIDA')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_FORMACAO e TRANSICOES_AUSENCIA — sanidade
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_FORMACAO', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_FORMACAO));
    for (const destinos of Object.values(TRANSICOES_FORMACAO)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });
});

describe('TRANSICOES_AUSENCIA', () => {
  it('PENDENTE pode ser aprovada ou rejeitada', () => {
    expect(TRANSICOES_AUSENCIA['PENDENTE']).toContain('APROVADA');
    expect(TRANSICOES_AUSENCIA['PENDENTE']).toContain('REJEITADA');
  });

  it('APROVADA e REJEITADA são terminais', () => {
    expect(TRANSICOES_AUSENCIA['APROVADA']).toHaveLength(0);
    expect(TRANSICOES_AUSENCIA['REJEITADA']).toHaveLength(0);
  });
});
