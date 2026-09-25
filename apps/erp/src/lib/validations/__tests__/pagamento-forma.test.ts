/**
 * Oráculo da issue #78 — T6: CreatePagamentoSchema.
 *
 * formaPagamento é enum fechado: TRANSFERENCIA_BANCARIA, CHEQUE, M-PESA, E-MOLA, NUMERARIO.
 * contaBancariaId obrigatório para toda a forma que não seja NUMERARIO; contaBancariaId e
 * contaPagarId validados com idEntidade() (aceitam uuid e cuid).
 */
import { describe, it, expect } from 'vitest';
import { CreatePagamentoSchema } from '../compras';

const CUID = 'cmryxs0ig009dwg9kurri602u';
const UUID = '99860c43-83f7-4b41-ae1d-9e895920452a';
const UUID_BANCO = '1c7d9a5e-2f4b-4c1e-9a0b-3d5e6f7a8b9c';

const base = {
  contaPagarId: CUID,
  dataPagamento: '2026-09-20',
  valor: 100,
};

const NAO_NUMERARIO = ['TRANSFERENCIA_BANCARIA', 'CHEQUE', 'M-PESA', 'E-MOLA'] as const;

describe('T6 — CreatePagamentoSchema', () => {
  it.each(NAO_NUMERARIO)('%s sem contaBancariaId é recusado', (forma) => {
    const r = CreatePagamentoSchema.safeParse({ ...base, formaPagamento: forma });
    expect(r.success).toBe(false);
  });

  it.each(['TRF', 'Transferência', 'numerario', 'MPESA', ''])(
    'forma fora do enum (%j) é recusada, mesmo com conta bancária',
    (forma) => {
      const r = CreatePagamentoSchema.safeParse({ ...base, formaPagamento: forma, contaBancariaId: UUID_BANCO });
      expect(r.success).toBe(false);
    },
  );

  it.each(NAO_NUMERARIO)('%s com contaBancariaId e contaPagarId em uuid passa', (forma) => {
    const r = CreatePagamentoSchema.safeParse({
      ...base, contaPagarId: UUID, formaPagamento: forma, contaBancariaId: UUID_BANCO,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).contaBancariaId).toBe(UUID_BANCO);
      expect(r.data.formaPagamento).toBe(forma);
    }
  });

  it('contaBancariaId em cuid também passa', () => {
    const r = CreatePagamentoSchema.safeParse({
      ...base, formaPagamento: 'CHEQUE', contaBancariaId: CUID,
    });
    expect(r.success).toBe(true);
  });

  it('contaBancariaId que não é id é recusado', () => {
    const r = CreatePagamentoSchema.safeParse({
      ...base, formaPagamento: 'CHEQUE', contaBancariaId: 'conta-do-banco',
    });
    expect(r.success).toBe(false);
  });

  it('NUMERARIO sem contaBancariaId passa (contaPagarId cuid)', () => {
    const r = CreatePagamentoSchema.safeParse({ ...base, formaPagamento: 'NUMERARIO' });
    expect(r.success).toBe(true);
  });

  it('NUMERARIO com contaPagarId em uuid passa', () => {
    const r = CreatePagamentoSchema.safeParse({ ...base, contaPagarId: UUID, formaPagamento: 'NUMERARIO' });
    expect(r.success).toBe(true);
  });
});
