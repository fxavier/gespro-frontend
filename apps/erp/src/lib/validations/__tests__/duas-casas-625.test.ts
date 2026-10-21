/**
 * #625 — os campos monetários que usavam `.multipleOf(0.01)` mantêm, no Zod 4, o que o
 * Zod 3 aceitava: todo o n/100 passa, 0.1 + 0.2 (0.30000000000000004) e 0.001 não.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { AbrirSessaoCaixaSchema, FecharSessaoCaixaSchema } from '../caixa';
import { RegistarPagamentoFaturaSchema } from '../faturacao';

const CAMPOS: Array<[string, z.ZodType, string | null]> = [
  ['caixa · fundoInicial', AbrirSessaoCaixaSchema.shape.fundoInicial, 'Máximo 2 casas decimais'],
  ['caixa · fundoFinal', FecharSessaoCaixaSchema.shape.fundoFinal, 'Máximo 2 casas decimais'],
  ['faturação · valor do pagamento', RegistarPagamentoFaturaSchema.shape.valor, null],
];

describe.each(CAMPOS)('%s — no máximo duas casas', (_nome, schema, mensagem) => {
  it('recusa 0.1 + 0.2 e 0.001', () => {
    for (const v of [0.1 + 0.2, 0.001, 86.205]) {
      const r = schema.safeParse(v);
      expect(r.success, String(v)).toBe(false);
      if (!r.success && mensagem) expect(r.error.issues.map((i) => i.message)).toEqual([mensagem]);
    }
  });

  it('aceita todo o n/100 com n inteiro em [1, 1e9]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e9 }), (n) => {
        expect(schema.safeParse(n / 100)).toEqual({ success: true, data: n / 100 });
      }),
    );
  });
});
