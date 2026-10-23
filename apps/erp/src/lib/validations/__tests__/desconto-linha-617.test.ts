/**
 * Oráculo #617 — o desconto de uma linha (valor, não percentagem) nunca excede a linha
 * (quantidade × preço unitário). Antes, `desconto` só era `nonnegative()` e a linha nascia com
 * subtotal negativo (0,5 × 22,59 − 17,97 = −6,68), que chegava à factura emitida.
 *
 * Fronteira em cêntimos: o limite é q·p exacto (Decimal), não q·p arredondado — 0,5 × 22,59 =
 * 11,295 aceita 11,29 e recusa 11,30.
 */
import { describe, it, expect } from 'vitest';
import { LinhaDocumentoSchema, EmitirFaturaSchema, CriarProformaSchema } from '@/lib/validations/faturacao';

const MSG = 'O desconto não pode exceder o valor da linha (quantidade × preço).';
const linha = (quantidade: number, precoUnitario: number, desconto: number) => ({
  descricao: 'Artigo',
  quantidade,
  precoUnitario,
  desconto,
  taxaIva: 0.16,
});
type R = { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } };
const issues = (r: R) => (r.error?.issues ?? []).map((i) => [i.path, i.message]);

describe('LinhaDocumentoSchema · desconto ≤ quantidade × preço (#617)', () => {
  it('desconto = q·p é aceite e a linha fica a zero', () => {
    const r = LinhaDocumentoSchema.parse(linha(3, 7.15, 21.45));
    expect([r.subtotal, r.ivaItem, r.total]).toEqual([0, 0, 0]);
  });

  it('desconto > q·p é recusado no path desconto, com a mensagem pt-PT', () => {
    expect(issues(LinhaDocumentoSchema.safeParse(linha(3, 7.15, 21.46)))).toEqual([[['desconto'], MSG]]);
  });

  it('o caso da issue (0,5 × 22,59 − 17,97) é recusado', () => {
    expect(issues(LinhaDocumentoSchema.safeParse(linha(0.5, 22.59, 17.97)))).toEqual([[['desconto'], MSG]]);
  });

  it('fronteira em cêntimos: q·p = 11,295 aceita 11,29 e recusa 11,30', () => {
    const ok = LinhaDocumentoSchema.parse(linha(0.5, 22.59, 11.29));
    expect(ok.subtotal).toBe(0.01); // 0,005 meio para cima
    expect(issues(LinhaDocumentoSchema.safeParse(linha(0.5, 22.59, 11.3)))).toEqual([[['desconto'], MSG]]);
  });

  it('linha sem desconto mantém os totais de sempre', () => {
    expect(LinhaDocumentoSchema.parse(linha(0.5, 22.59, 0))).toMatchObject({ subtotal: 11.3, ivaItem: 1.81, total: 13.11 });
  });

  it('na factura o erro aparece na linha certa (linhas.1.desconto)', () => {
    const r = EmitirFaturaSchema.safeParse({
      clienteId: 'c1',
      dataEmissao: '2026-10-01',
      dataVencimento: '2026-10-31',
      linhas: [linha(1, 100, 10), linha(2, 5, 10.01)],
    });
    expect(issues(r)).toEqual([[['linhas', 1, 'desconto'], MSG]]);
  });

  it('na proforma (mesma linha) também recusa', () => {
    const r = CriarProformaSchema.safeParse({
      clienteId: 'c1',
      dataEmissao: '2026-10-01',
      dataValidade: '2026-10-31',
      linhas: [linha(1, 10, 10.5)],
    });
    expect(issues(r)).toEqual([[['linhas', 0, 'desconto'], MSG]]);
  });
});
