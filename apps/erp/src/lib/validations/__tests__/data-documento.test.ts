import { describe, it, expect } from 'vitest';
import { dataDocumento } from '../common';
import {
  CriarCotacaoComercialSchema,
  CriarProformaSchema,
  EmitirFaturaSchema,
  EmitirNotaCreditoSchema,
  EmitirNotaDebitoSchema,
} from '../faturacao';

/**
 * #237: o `<input type="date">` do Chromium aceita cinco algarismos no ano e a
 * fatura seguiu para o serviço com emissão em 92026 («série do ano 92026 não
 * encontrada»). A data de um documento recusa-se no schema, com o erro no campo.
 */
describe('dataDocumento', () => {
  const schema = dataDocumento('Data de emissão');

  it('aceita uma data do ano corrente, em Date ou em aaaa-mm-dd', () => {
    expect(schema.safeParse(new Date(2026, 8, 26, 12)).success).toBe(true);
    expect(schema.safeParse('2026-09-26').success).toBe(true);
  });

  it('aceita os extremos do intervalo', () => {
    expect(schema.safeParse('2000-01-01T12:00:00Z').success).toBe(true);
    expect(schema.safeParse('2100-12-31T12:00:00Z').success).toBe(true);
  });

  it('recusa um ano de cinco algarismos, com mensagem em português', () => {
    const r = schema.safeParse('+092026-09-26T12:00:00Z');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.message).toBe(
        'Data de emissão inválida: o ano tem de estar entre 2000 e 2100',
      );
    }
    expect(schema.safeParse(new Date(92026, 8, 26, 12)).success).toBe(false);
  });

  it('recusa anos fora do intervalo pelos dois lados', () => {
    expect(schema.safeParse('1999-12-31T12:00:00Z').success).toBe(false);
    expect(schema.safeParse('2101-01-01T12:00:00Z').success).toBe(false);
  });

  it('recusa lixo com a mensagem do campo', () => {
    const r = schema.safeParse('não é data');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toBe('Data de emissão inválida');
  });
});

describe('schemas de emissão recusam o ano de cinco algarismos', () => {
  const ano92026 = new Date(92026, 8, 26, 12);
  const hoje = new Date(2026, 8, 26, 12);
  const linha = { descricao: 'Livro', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0 };
  const base = {
    serieDocumentoId: 'cmryxs0ig009dwg9kurri602u',
    clienteId: 'cmryxs0ig009dwg9kurri602v',
    linhas: [linha],
  };

  const caminhoRecusado = (r: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
    r.success ? [] : r.error!.issues.map((i) => i.path.join('.'));

  it('fatura: emissão e vencimento', () => {
    const valido = EmitirFaturaSchema.safeParse({ ...base, dataEmissao: hoje, dataVencimento: hoje });
    expect(valido.success, JSON.stringify(valido.error?.issues)).toBe(true);
    expect(
      caminhoRecusado(EmitirFaturaSchema.safeParse({ ...base, dataEmissao: ano92026, dataVencimento: ano92026 })),
    ).toEqual(expect.arrayContaining(['dataEmissao', 'dataVencimento']));
  });

  it('notas de crédito e de débito: emissão', () => {
    const nc = EmitirNotaCreditoSchema.safeParse({
      ...base, faturaOriginalId: 'cmryxs0ig009dwg9kurri602w', motivo: 'Devolução', dataEmissao: ano92026,
    });
    expect(caminhoRecusado(nc)).toContain('dataEmissao');
    const nd = EmitirNotaDebitoSchema.safeParse({ ...base, motivo: 'Juros', dataEmissao: ano92026 });
    expect(caminhoRecusado(nd)).toContain('dataEmissao');
  });

  it('proforma e cotação: validade', () => {
    const futuro = new Date(92027, 0, 1, 12);
    expect(caminhoRecusado(CriarProformaSchema.safeParse({ ...base, dataEmissao: hoje, dataValidade: futuro })))
      .toContain('dataValidade');
    expect(
      caminhoRecusado(CriarCotacaoComercialSchema.safeParse({ ...base, dataEmissao: hoje, dataValidade: futuro })),
    ).toContain('dataValidade');
  });
});
