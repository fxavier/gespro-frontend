/**
 * Oráculo da issue #77 — T5: os três schemas de servidor que recebem uma taxa de IVA.
 *
 * Decisão C2: nenhum deles tem `.default(0.16)` — uma taxa ausente é recusada,
 * não inventada. Cada um restringe a {0, 0.16} e mantém a sua mensagem actual.
 */
import { describe, expect, it } from 'vitest';
import { LinhaDocumentoSchema } from '@/lib/validations/faturacao';
import { ProdutoCreateSchema } from '@/lib/validations/produtos';
import { CreateItemPedidoCompraSchema } from '@/lib/validations/compras';

const MSG_FATURACAO = 'Taxa de IVA inválida — use 0.16 (16%) ou 0 (isento)';
const MSG_PRODUTOS = 'Taxa de IVA deve ser 0 (isento) ou 0.16 (16%)';

const linhaBase = { descricao: 'Serviço', quantidade: 1, precoUnitario: 1000, desconto: 0, ordemLinha: 0 };
const produtoBase = {
  sku: 'SKU-77',
  nome: 'Produto isento',
  categoriaId: 'cjld2cjxh0000qzrmn831i7rn',
  unidadeMedida: 'un',
  precoVenda: 100,
  precoCompra: 50,
};
const itemPedidoBase = { descricao: 'Item', quantidade: 1, unidadeMedida: 'un', precoUnitario: 1000, desconto: 0 };

function semTaxa<T extends object>(o: T): T {
  const c = { ...o } as Record<string, unknown>;
  delete c.taxaIva;
  return c as T;
}

function mensagensTaxa(r: { success: boolean; error?: { issues: Array<{ path: (string | number)[]; message: string }> } }) {
  return (r.error?.issues ?? []).filter((i) => i.path.includes('taxaIva')).map((i) => i.message);
}

describe('LinhaDocumentoSchema.taxaIva', () => {
  it('aceita 0 e preserva-o (ivaItem 0)', () => {
    const r = LinhaDocumentoSchema.parse({ ...linhaBase, taxaIva: 0 });
    expect(Object.is(r.taxaIva, 0)).toBe(true);
    expect(r.ivaItem).toBe(0);
  });

  it('recusa 0.17 com a mensagem EXACTA da faturação', () => {
    const r = LinhaDocumentoSchema.safeParse({ ...linhaBase, taxaIva: 0.17 });
    expect(r.success).toBe(false);
    expect(mensagensTaxa(r as never)).toContain(MSG_FATURACAO);
  });

  it('C2: taxaIva ausente é recusado (sem omissão 0.16)', () => {
    const r = LinhaDocumentoSchema.safeParse(semTaxa({ ...linhaBase, taxaIva: 0 }));
    expect(r.success, r.success ? `aceitou com taxaIva=${r.data.taxaIva}` : '').toBe(false);
  });

  it("'' é recusado (não vira 0 nem 0.16)", () => {
    const r = LinhaDocumentoSchema.safeParse({ ...linhaBase, taxaIva: '' as never });
    expect(r.success).toBe(false);
  });
});

describe('ProdutoCreateSchema.taxaIva', () => {
  it('aceita 0 e preserva-o', () => {
    const r = ProdutoCreateSchema.parse({ ...produtoBase, taxaIva: 0 });
    expect(Object.is(r.taxaIva, 0)).toBe(true);
  });

  it('recusa 0.17 com a mensagem EXACTA dos produtos', () => {
    const r = ProdutoCreateSchema.safeParse({ ...produtoBase, taxaIva: 0.17 });
    expect(r.success).toBe(false);
    expect(mensagensTaxa(r as never)).toContain(MSG_PRODUTOS);
  });

  it('C2: taxaIva ausente é recusado (sem omissão 0.16)', () => {
    const r = ProdutoCreateSchema.safeParse(produtoBase);
    expect(r.success, r.success ? `aceitou com taxaIva=${r.data.taxaIva}` : '').toBe(false);
  });

  it("'' é recusado (z.coerce convertia-o em 0)", () => {
    const r = ProdutoCreateSchema.safeParse({ ...produtoBase, taxaIva: '' as never });
    expect(r.success, r.success ? `aceitou com taxaIva=${r.data.taxaIva}` : '').toBe(false);
  });
});

describe('CreateItemPedidoCompraSchema.taxaIva', () => {
  it('aceita 0 e preserva-o', () => {
    const r = CreateItemPedidoCompraSchema.parse({ ...itemPedidoBase, taxaIva: 0 });
    expect(Object.is(r.taxaIva, 0)).toBe(true);
  });

  it('recusa 0.17 (só {0, 0.16})', () => {
    const r = CreateItemPedidoCompraSchema.safeParse({ ...itemPedidoBase, taxaIva: 0.17 });
    expect(r.success, r.success ? `aceitou com taxaIva=${r.data.taxaIva}` : '').toBe(false);
  });

  it('C2: taxaIva ausente é recusado (sem omissão 0.16)', () => {
    const r = CreateItemPedidoCompraSchema.safeParse(itemPedidoBase);
    expect(r.success, r.success ? `aceitou com taxaIva=${r.data.taxaIva}` : '').toBe(false);
  });

  it("'' é recusado", () => {
    const r = CreateItemPedidoCompraSchema.safeParse({ ...itemPedidoBase, taxaIva: '' as never });
    expect(r.success).toBe(false);
  });
});
