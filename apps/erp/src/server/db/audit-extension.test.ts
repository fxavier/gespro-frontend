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
