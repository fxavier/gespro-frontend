/**
 * Oráculo da issue #77 — T1: a fonte única da taxa de IVA (`src/lib/iva.ts`).
 *
 * O defeito: `Number(l.taxaIva) || 0.16` — o 0 é falsy e uma linha isenta era
 * gravada a 16%. A regra que este ficheiro tranca: 0 é uma taxa como outra
 * qualquer (sai 0, não «falta de valor»), e NENHUMA entrada inválida é
 * convertida silenciosamente na taxa normal.
 */
import { describe, expect, it } from 'vitest';
import {
  lerTaxaIva,
  taxaIvaSchema,
  TAXAS_IVA,
  TAXA_IVA_NORMAL,
  ROTULOS_TAXA_IVA,
  MENSAGEM_TAXA_IVA_INVALIDA,
} from '@/lib/iva';

const ACEITES: Array<[unknown, number]> = [
  [0, 0],
  ['0', 0],
  [0.16, 0.16],
  ['0.16', 0.16],
];

const RECUSADAS: unknown[] = ['', ' ', undefined, null, NaN, 'abc', 0.17, 0.05, 1, -0.16];

const descrever = (v: unknown) =>
  typeof v === 'string' ? JSON.stringify(v) : Number.isNaN(v) ? 'NaN' : String(v);

describe('constantes de IVA', () => {
  it('as taxas legais são exactamente 0 e 0.16, e a normal é 0.16', () => {
    expect([...TAXAS_IVA]).toEqual([0, 0.16]);
    expect(TAXA_IVA_NORMAL).toBe(0.16);
  });

  it('rótulos e mensagem são os decididos', () => {
    expect(ROTULOS_TAXA_IVA).toEqual({ '0': '0% (isento)', '0.16': '16%' });
    expect(MENSAGEM_TAXA_IVA_INVALIDA).toBe('Taxa de IVA inválida — use 0.16 (16%) ou 0 (isento)');
  });
});

describe('lerTaxaIva', () => {
  it.each(ACEITES)('aceita %s e devolve exactamente %s', (entrada, esperado) => {
    const lida = lerTaxaIva(entrada);
    expect(Object.is(lida, esperado)).toBe(true);
  });

  it('0 continua 0 — não é tratado como «sem valor»', () => {
    expect(Object.is(lerTaxaIva(0), 0)).toBe(true);
    expect(Object.is(lerTaxaIva('0'), 0)).toBe(true);
  });

  it('aceita string numérica com espaços à volta (trim)', () => {
    expect(lerTaxaIva(' 0.16 ')).toBe(0.16);
    expect(Object.is(lerTaxaIva(' 0 '), 0)).toBe(true);
  });

  it.each(RECUSADAS.map((v) => [descrever(v), v]))('recusa %s (lança Error)', (_rotulo, entrada) => {
    expect(() => lerTaxaIva(entrada)).toThrow(Error);
    // A recusa tem de ser da taxa — um esqueleto que lança para tudo não conta.
    expect(() => lerTaxaIva(entrada)).not.toThrow('por implementar');
  });

  it('nenhuma entrada recusada devolve 0.16 (nunca há omissão silenciosa)', () => {
    for (const entrada of RECUSADAS) {
      let devolvido: unknown = '<lançou>';
      try {
        devolvido = lerTaxaIva(entrada);
      } catch (e) {
        // Tem de ser a recusa da taxa, não um esqueleto por implementar.
        expect((e as Error).message).not.toBe('por implementar');
      }
      expect(devolvido, `entrada ${descrever(entrada)}`).toBe('<lançou>');
    }
  });
});

describe('taxaIvaSchema()', () => {
  it.each(ACEITES)('aceita %s e devolve exactamente %s', (entrada, esperado) => {
    const r = taxaIvaSchema().safeParse(entrada);
    expect(r.success).toBe(true);
    expect(Object.is(r.success ? r.data : undefined, esperado)).toBe(true);
  });

  it.each(RECUSADAS.map((v) => [descrever(v), v]))('recusa %s', (_rotulo, entrada) => {
    const r = taxaIvaSchema().safeParse(entrada);
    expect(r.success).toBe(false);
  });

  it('nenhuma entrada recusada devolve 0.16', () => {
    for (const entrada of RECUSADAS) {
      const r = taxaIvaSchema().safeParse(entrada);
      expect(r.success ? r.data : '<recusada>', `entrada ${descrever(entrada)}`).toBe('<recusada>');
    }
  });

  it('sem .default(): ausente é recusado, não vira 0.16', () => {
    const r = taxaIvaSchema().safeParse(undefined);
    expect(r.success).toBe(false);
  });

  it("'' é recusado antes de converter (não vira 0)", () => {
    const r = taxaIvaSchema().safeParse('');
    expect(r.success).toBe(false);
  });

  it('mensagem por omissão é MENSAGEM_TAXA_IVA_INVALIDA', () => {
    const r = taxaIvaSchema().safeParse(0.17);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain(MENSAGEM_TAXA_IVA_INVALIDA);
    }
  });

  it('mensagem personalizada é usada quando passada', () => {
    const r = taxaIvaSchema('outra mensagem').safeParse(0.17);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain('outra mensagem');
    }
  });
});
