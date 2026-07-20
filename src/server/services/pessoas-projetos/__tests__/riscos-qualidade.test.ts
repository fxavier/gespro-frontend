import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BusinessRuleError } from '@/lib/errors';
import { transitar } from '../rh.service';
import { calcularSeveridade, classificarSeveridade } from '../risco.service';
import { TRANSICOES_RISCO, TRANSICOES_QUALIDADE } from '@/lib/state-machines';

// ─────────────────────────────────────────────────────────────────────────────
// calcularSeveridade — função pura, testes de propriedade
// ─────────────────────────────────────────────────────────────────────────────

const PROBS = ['BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA'] as const;
const IMPACTOS = ['BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO'] as const;

describe('calcularSeveridade', () => {
  it('resultado está sempre entre 1 e 16', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PROBS),
        fc.constantFrom(...IMPACTOS),
        (prob, impacto) => {
          const s = calcularSeveridade(prob, impacto);
          return s >= 1 && s <= 16;
        },
      ),
    );
  });

  it('é monótona: prob maior → severidade maior (impacto fixo)', () => {
    // BAIXA(1) < MEDIA(2) < ALTA(3) < MUITO_ALTA(4)
    const impacto = 'ALTO';
    const [a, b, c, d] = PROBS.map((p) => calcularSeveridade(p, impacto));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
  });

  it('é monótona: impacto maior → severidade maior (prob fixa)', () => {
    const prob = 'ALTA';
    const [a, b, c, d] = IMPACTOS.map((i) => calcularSeveridade(prob, i));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
  });

  it('mínimo: BAIXA × BAIXO = 1', () => {
    expect(calcularSeveridade('BAIXA', 'BAIXO')).toBe(1);
  });

  it('máximo: MUITO_ALTA × MUITO_ALTO = 16', () => {
    expect(calcularSeveridade('MUITO_ALTA', 'MUITO_ALTO')).toBe(16);
  });

  it('lança BusinessRuleError para probabilidade inválida', () => {
    expect(() => calcularSeveridade('INVALIDA', 'BAIXO')).toThrow(BusinessRuleError);
  });

  it('lança BusinessRuleError para impacto inválido', () => {
    expect(() => calcularSeveridade('BAIXA', 'INVALIDO')).toThrow(BusinessRuleError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classificarSeveridade
// ─────────────────────────────────────────────────────────────────────────────

describe('classificarSeveridade', () => {
  it('1-2 → BAIXO', () => {
    expect(classificarSeveridade(1)).toBe('BAIXO');
    expect(classificarSeveridade(2)).toBe('BAIXO');
  });

  it('3-6 → MEDIO', () => {
    expect(classificarSeveridade(3)).toBe('MEDIO');
    expect(classificarSeveridade(6)).toBe('MEDIO');
  });

  it('7-12 → ALTO', () => {
    expect(classificarSeveridade(7)).toBe('ALTO');
    expect(classificarSeveridade(12)).toBe('ALTO');
  });

  it('13-16 → CRITICO', () => {
    expect(classificarSeveridade(13)).toBe('CRITICO');
    expect(classificarSeveridade(16)).toBe('CRITICO');
  });

  it('toda a gama 1-16 mapeia para uma das 4 categorias', () => {
    const valid = new Set(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']);
    for (let s = 1; s <= 16; s++) {
      expect(valid).toContain(classificarSeveridade(s));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_RISCO — máquina de estado
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_RISCO', () => {
  it('IDENTIFICADO pode transitar para EM_MITIGACAO', () => {
    expect(() => transitar(TRANSICOES_RISCO, 'IDENTIFICADO', 'EM_MITIGACAO')).not.toThrow();
  });

  it('IDENTIFICADO pode transitar para FECHADO', () => {
    expect(() => transitar(TRANSICOES_RISCO, 'IDENTIFICADO', 'FECHADO')).not.toThrow();
  });

  it('IDENTIFICADO pode transitar para MATERIALIZADO', () => {
    expect(() => transitar(TRANSICOES_RISCO, 'IDENTIFICADO', 'MATERIALIZADO')).not.toThrow();
  });

  it('FECHADO é estado terminal — sem saídas', () => {
    expect(() => transitar(TRANSICOES_RISCO, 'FECHADO', 'IDENTIFICADO')).toThrow(BusinessRuleError);
  });

  it('MATERIALIZADO pode re-abrir para EM_MITIGACAO', () => {
    expect(() => transitar(TRANSICOES_RISCO, 'MATERIALIZADO', 'EM_MITIGACAO')).not.toThrow();
  });

  it('transição inválida lança BusinessRuleError', () => {
    expect(() => transitar(TRANSICOES_RISCO, 'EM_MITIGACAO', 'IDENTIFICADO')).not.toThrow();
    // IDENTIFICADO → IDENTIFICADO (self-loop) → inválido
    expect(() => transitar(TRANSICOES_RISCO, 'FECHADO', 'MATERIALIZADO')).toThrow(BusinessRuleError);
  });

  it('todos os estados definidos têm pelo menos uma entrada no mapa', () => {
    const estados = Object.keys(TRANSICOES_RISCO);
    expect(estados).toContain('IDENTIFICADO');
    expect(estados).toContain('EM_MITIGACAO');
    expect(estados).toContain('FECHADO');
    expect(estados).toContain('MATERIALIZADO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_QUALIDADE — máquina de estado
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_QUALIDADE', () => {
  it('ABERTA pode transitar para EM_ANALISE', () => {
    expect(() => transitar(TRANSICOES_QUALIDADE, 'ABERTA', 'EM_ANALISE')).not.toThrow();
  });

  it('ABERTA pode transitar para FECHADA', () => {
    expect(() => transitar(TRANSICOES_QUALIDADE, 'ABERTA', 'FECHADA')).not.toThrow();
  });

  it('EM_ANALISE pode resolver', () => {
    expect(() => transitar(TRANSICOES_QUALIDADE, 'EM_ANALISE', 'RESOLVIDA')).not.toThrow();
  });

  it('RESOLVIDA pode fechar', () => {
    expect(() => transitar(TRANSICOES_QUALIDADE, 'RESOLVIDA', 'FECHADA')).not.toThrow();
  });

  it('FECHADA é estado terminal', () => {
    expect(() => transitar(TRANSICOES_QUALIDADE, 'FECHADA', 'ABERTA')).toThrow(BusinessRuleError);
  });

  it('EM_ANALISE não pode saltar para ABERTA', () => {
    expect(() => transitar(TRANSICOES_QUALIDADE, 'EM_ANALISE', 'ABERTA')).toThrow(BusinessRuleError);
  });

  it('todos os estados definidos têm pelo menos uma entrada no mapa', () => {
    const estados = Object.keys(TRANSICOES_QUALIDADE);
    expect(estados).toContain('ABERTA');
    expect(estados).toContain('EM_ANALISE');
    expect(estados).toContain('RESOLVIDA');
    expect(estados).toContain('FECHADA');
  });
});
