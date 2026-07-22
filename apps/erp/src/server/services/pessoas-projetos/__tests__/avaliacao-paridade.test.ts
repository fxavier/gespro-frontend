/**
 * Paridade TipoAvaliacao — verifica que o enum Zod e os mapas de UI estão
 * alinhados. Apanha divergências como TREZENTOS_SESSENTA vs. GRAU_360.
 */

import { describe, it, expect } from 'vitest';
import { TipoAvaliacaoEnum } from '@/lib/validations/rh';

// ---------------------------------------------------------------------------
// Mapa canónico: espelha TIPO_LABEL de rh/avaliacoes/[id]/page.tsx
// e as opções de FILTER_CONFIG em rh/avaliacoes/page.tsx.
// Actualizar aqui sempre que o enum mudar.
// ---------------------------------------------------------------------------
const TIPO_LABEL: Record<string, string> = {
  DESEMPENHO: 'Desempenho',
  COMPETENCIAS: 'Competências',
  GRAU_360: 'Avaliação 360°',
  PROBATORIO: 'Período Probatório',
};

// Opções de filtro de UI (FILTER_CONFIG tipo options)
const FILTER_TIPO_VALUES = ['DESEMPENHO', 'COMPETENCIAS', 'GRAU_360', 'PROBATORIO'] as const;

describe('TipoAvaliacao — paridade enum ↔ UI', () => {
  const enumValues = TipoAvaliacaoEnum.options as string[];

  it('não contém o valor legado TREZENTOS_SESSENTA', () => {
    expect(enumValues).not.toContain('TREZENTOS_SESSENTA');
  });

  it('contém GRAU_360 (renomeado de TREZENTOS_SESSENTA)', () => {
    expect(enumValues).toContain('GRAU_360');
  });

  it('todos os valores do enum têm etiqueta em TIPO_LABEL', () => {
    for (const val of enumValues) {
      expect(TIPO_LABEL).toHaveProperty(val);
      expect(TIPO_LABEL[val]).toBeTruthy();
    }
  });

  it('TIPO_LABEL não tem valores a mais (sem legado/obsoletos)', () => {
    for (const key of Object.keys(TIPO_LABEL)) {
      expect(enumValues).toContain(key);
    }
  });

  it('todos os valores do enum aparecem nas opções de filtro de UI', () => {
    for (const val of enumValues) {
      expect(FILTER_TIPO_VALUES as readonly string[]).toContain(val);
    }
  });

  it('opções de filtro de UI não têm valores a mais', () => {
    for (const val of FILTER_TIPO_VALUES) {
      expect(enumValues).toContain(val);
    }
  });
});
