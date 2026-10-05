import { describe, it, expect } from 'vitest';
import { AUDIT_MODELS, CRITICAL_ENTITIES } from './audit-extension';

describe('audit-extension constants', () => {
  it('AUDIT_MODELS inclui User e Role', () => {
    expect(AUDIT_MODELS.has('User')).toBe(true);
    expect(AUDIT_MODELS.has('Role')).toBe(true);
    expect(AUDIT_MODELS.has('Permission')).toBe(true);
  });

  it('CRITICAL_ENTITIES é um subconjunto de AUDIT_MODELS', () => {
    for (const entity of CRITICAL_ENTITIES) {
      expect(AUDIT_MODELS.has(entity)).toBe(true);
    }
  });

  it('CRITICAL_ENTITIES inclui User e Role', () => {
    expect(CRITICAL_ENTITIES.has('User')).toBe(true);
    expect(CRITICAL_ENTITIES.has('Role')).toBe(true);
  });
});

describe('audit-extension — lançamentos (#137, D5)', () => {
  it('AUDIT_MODELS inclui Lancamento e PartidaLancamento', () => {
    // Editar e anular um rascunho escrevem pelo cliente estendido, com escritas
    // singulares: sem estes dois modelos no conjunto, nada disso fica no trilho.
    expect(AUDIT_MODELS.has('Lancamento')).toBe(true);
    expect(AUDIT_MODELS.has('PartidaLancamento')).toBe(true);
  });
});

describe('audit-extension — encerramento do exercício (ADR-0035, #138)', () => {
  it.each(['ExercicioContabil', 'EncerramentoExercicio', 'ReaberturaExercicio'])(
    '%s está em AUDIT_MODELS e em CRITICAL_ENTITIES',
    (modelo) => {
      expect(AUDIT_MODELS.has(modelo)).toBe(true);
      expect(CRITICAL_ENTITIES.has(modelo)).toBe(true);
    },
  );
});
