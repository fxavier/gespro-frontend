/**
 * Oráculo #241 (unit) — `serieNotaCreditoId` sai dos schemas de devolução/troca.
 *
 * Desde #93 a série da NC é a activa do tipo/ano: a escolha de série é ignorada, por isso o campo
 * deixa de existir no contrato de entrada. Os quatro schemas (action e formulário, devolução e
 * troca) não o declaram, e um chamador antigo que ainda o envie vê-o descartado (o `z.object`
 * por omissão tira chaves desconhecidas) — nunca recusado, nunca passado ao serviço.
 *
 * Acesso dinâmico (`as any`) de propósito: o caso falha pelo comportamento, não o ficheiro.
 */
import { describe, it, expect } from 'vitest';
import * as vendas from '@/lib/validations/vendas';

const CUID = 'ckz0000000000000000000000';
const CUID2 = 'ckz0000000000000000000001';
const CUID3 = 'ckz0000000000000000000002';

const SCHEMAS = [
  'ProcessarDevolucaoSchema',
  'ProcessarDevolucaoFormSchema',
  'CreateTrocaSchema',
  'CriarTrocaFormSchema',
] as const;

describe('#241 — serieNotaCreditoId fora dos schemas de devolução/troca', () => {
  for (const nome of SCHEMAS) {
    it(`${nome} não declara serieNotaCreditoId`, () => {
      const schema = (vendas as any)[nome];
      expect(schema, `${nome} exportado`).toBeDefined();
      expect(Object.keys(schema.shape)).not.toContain('serieNotaCreditoId');
    });
  }

  it('ProcessarDevolucaoSchema: válido sem série; uma série enviada por chamador antigo é descartada', () => {
    const semSerie = (vendas as any).ProcessarDevolucaoSchema.safeParse({ id: CUID, localizacaoId: CUID2 });
    expect(semSerie.success).toBe(true);

    const comSerie = (vendas as any).ProcessarDevolucaoSchema.safeParse({
      id: CUID,
      localizacaoId: CUID2,
      serieNotaCreditoId: CUID3,
    });
    expect(comSerie.success, 'não recusa o chamador antigo').toBe(true);
    expect(comSerie.data).not.toHaveProperty('serieNotaCreditoId');
    expect(comSerie.data).toEqual({ id: CUID, localizacaoId: CUID2 });
  });

  it('CreateTrocaSchema: válido sem série; uma série enviada (mesmo inválida) é descartada', () => {
    const base = {
      devolucaoId: CUID,
      novoItem: { produtoId: CUID2, nomeProduto: 'Artigo', quantidade: 1, precoUnitario: 100, desconto: 0, taxaIva: 0.16 },
      pagamentos: [],
      localizacaoId: CUID3,
    };
    const semSerie = (vendas as any).CreateTrocaSchema.safeParse(base);
    expect(semSerie.success, JSON.stringify(semSerie.error?.issues)).toBe(true);

    // Antes, um valor que não fosse cuid era recusado: prova de que o campo já não é validado.
    const comSerieLixo = (vendas as any).CreateTrocaSchema.safeParse({ ...base, serieNotaCreditoId: 'nao-e-cuid' });
    expect(comSerieLixo.success, 'campo já não validado').toBe(true);
    expect(comSerieLixo.data).not.toHaveProperty('serieNotaCreditoId');
  });
});
