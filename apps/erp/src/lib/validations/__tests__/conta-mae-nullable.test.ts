/**
 * Oráculo — issue #347, regra «desassociar».
 *
 * Na actualização de uma conta PGC, `contaMaeId: null` significa «tirar a mãe»
 * e é diferente de omitir o campo («não alterar»). O schema tem de deixar o
 * `null` passar intacto até ao serviço.
 */
import { describe, it, expect } from 'vitest';
import { AtualizarContaPGCSchema } from '../contabilidade';

const ID = '99860c43-83f7-4b41-ae1d-9e895920452a';
const MAE = 'cmryxs0ig009dwg9kurri602u';

describe('AtualizarContaPGCSchema — contaMaeId (#347)', () => {
  it('aceita contaMaeId: null e devolve null (desassociar)', () => {
    const r = AtualizarContaPGCSchema.safeParse({ id: ID, contaMaeId: null });
    expect(r.success).toBe(true);
    expect(r.success && r.data.contaMaeId).toBeNull();
    expect(r.success && 'contaMaeId' in r.data).toBe(true);
  });

  it('omitir contaMaeId continua a significar «não alterar» (fica undefined)', () => {
    const r = AtualizarContaPGCSchema.safeParse({ id: ID, nome: 'Outro nome' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.contaMaeId).toBeUndefined();
  });

  it('um id de mãe válido continua aceite', () => {
    const r = AtualizarContaPGCSchema.safeParse({ id: ID, contaMaeId: MAE });
    expect(r.success).toBe(true);
    expect(r.success && r.data.contaMaeId).toBe(MAE);
  });

  it('lixo como contaMaeId continua recusado', () => {
    expect(AtualizarContaPGCSchema.safeParse({ id: ID, contaMaeId: 'abc' }).success).toBe(false);
  });
});
