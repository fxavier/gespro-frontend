/**
 * Oráculo S2 (C, parte pura) — Consumidor Final e série Factura-Recibo (ADR-0041 §1, §2; issue #306).
 *
 * O comportamento na base (bootstrap cria o cliente técnico e a série) vive em
 * test/integration/venda-pos-documento.test.ts. Aqui fixam-se as constantes que o
 * resto do sistema lê. Escrito antes da implementação; o implementador não o altera.
 */
import { describe, it, expect } from 'vitest';
import { CLIENTE_CONSUMIDOR_FINAL } from '@/lib/consumidor-final';
import { ROTULO_TIPO_SERIE } from '@/lib/series-documento';
import { SERIES_INICIAIS } from '@/server/provisioning/tenant-bootstrap';

describe('Consumidor Final — cliente técnico (ADR-0041 §2)', () => {
  it('código CF-000000, NUIT 999999999, nome «Consumidor Final»', () => {
    expect(CLIENTE_CONSUMIDOR_FINAL).toMatchObject({
      codigo: 'CF-000000',
      nuit: '999999999',
      nome: 'Consumidor Final',
    });
  });
});

describe('Série FATURA_RECIBO (ADR-0041 §1)', () => {
  it('é uma das séries iniciais de todo o tenant, com prefixo FR', () => {
    expect(SERIES_INICIAIS).toContainEqual({ tipo: 'FATURA_RECIBO', prefixo: 'FR' });
  });

  it('o rótulo do documento é «Factura-Recibo»', () => {
    expect((ROTULO_TIPO_SERIE as Record<string, string>).FATURA_RECIBO).toBe('Factura-Recibo');
  });
});
