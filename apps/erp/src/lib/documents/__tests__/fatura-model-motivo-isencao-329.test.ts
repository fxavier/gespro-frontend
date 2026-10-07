/**
 * Oráculo da issue #329 — o PDF da factura mostra o motivo de isenção NA LINHA.
 *
 * O modelo (`construirDocumentoFatura`) reflecte o que foi gravado: a linha a 0% traz o
 * `motivoIsencao` da `LinhaFatura`; uma linha tributada não traz motivo nenhum.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { construirDocumentoFatura, type FaturaInput } from '../fatura-model';

const MOTIVO = 'Isento nos termos do artigo 9.º do Código do IVA';
const d = (v: string) => new Prisma.Decimal(v);

function fatura(): FaturaInput {
  return {
    numero: 'FT/2026/000329',
    serieTipo: 'FATURA',
    moeda: 'MZN',
    dataEmissao: new Date('2026-10-07T09:00:00Z'),
    dataVencimento: new Date('2026-11-06T09:00:00Z'),
    subtotal: d('2000.00'),
    ivaTotal: d('160.00'),
    total: d('2160.00'),
    totalPago: d('0.00'),
    observacoes: null,
    linhas: [
      {
        descricao: 'Serviço normal',
        quantidade: d('1'),
        precoUnitario: d('1000.00'),
        desconto: d('0.00'),
        taxaIva: d('0.16'),
        subtotal: d('1000.00'),
        ivaItem: d('160.00'),
        total: d('1160.00'),
        motivoIsencao: null,
      },
      {
        descricao: 'Livro escolar',
        quantidade: d('1'),
        precoUnitario: d('1000.00'),
        desconto: d('0.00'),
        taxaIva: d('0'),
        subtotal: d('1000.00'),
        ivaItem: d('0.00'),
        total: d('1000.00'),
        motivoIsencao: MOTIVO,
      },
    ] as unknown as FaturaInput['linhas'],
  };
}

describe('construirDocumentoFatura — motivo de isenção por linha (#329)', () => {
  const modelo = construirDocumentoFatura(
    fatura(),
    { nome: 'Empresa Demo, Lda', nuit: '400123456', regimeIva: 'NORMAL' },
    { nome: 'Cliente Teste, SA', nuit: '123456789' },
  );
  const linha = (pct: string) => modelo.linhas.find((l) => l.taxaIvaPercent === pct) as unknown as Record<string, unknown>;

  it('a linha a 0% traz o motivo gravado', () => {
    expect(linha('0%').motivoIsencao).toBe(MOTIVO);
  });

  it('a linha a 16% não traz motivo', () => {
    expect(linha('16%').motivoIsencao ?? null).toBeNull();
  });
});
