/**
 * Oráculo da issue #258 — os estados creditáveis.
 *
 * A fonte única dos estados em que uma factura pode ser creditada é
 * `ESTADOS_FATURA_CREDITAVEL`: EMITIDA, PARCIALMENTE_PAGA, PAGA, VENCIDA — nunca
 * RASCUNHO nem CANCELADA.
 *
 * O contrato de `procurarFaturasCreditaveis(q, ctx, clienteId?)` (tenant, estados, termo,
 * top-20, campos e, desde #86/#266, o saldo creditável) vive em
 * `test/integration/procurar-faturas-creditaveis.test.ts`, contra Postgres real: o saldo
 * depende das NC da factura, e um duplo do `findMany` só afirmava sobre a forma da
 * consulta — que o saldo deixa de poder ter.
 */
import { describe, expect, it } from 'vitest';
import { ESTADOS_FATURA_CREDITAVEL } from '../faturacao.interface';

describe('ESTADOS_FATURA_CREDITAVEL', () => {
  it('são exactamente os quatro estados de uma factura emitida e não anulada', () => {
    expect([...ESTADOS_FATURA_CREDITAVEL].sort()).toEqual(
      ['EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA'].sort(),
    );
    expect(ESTADOS_FATURA_CREDITAVEL).toHaveLength(4);
    expect(ESTADOS_FATURA_CREDITAVEL).not.toContain('RASCUNHO');
    expect(ESTADOS_FATURA_CREDITAVEL).not.toContain('CANCELADA');
  });
});
