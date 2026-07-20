import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  construirDocumentoFatura,
  construirMencoesLegais,
  type FaturaInput,
  type EmitenteInput,
  type AdquirenteInput,
} from './fatura-model';

const emitente: EmitenteInput = {
  nome: 'Empresa Demo, Lda',
  nuit: '400123456',
  endereco: 'Av. Julius Nyerere, 100',
  cidade: 'Maputo',
  provincia: 'Maputo',
  regimeIva: 'NORMAL',
};

const adquirente: AdquirenteInput = {
  nome: 'Cliente Teste, SA',
  nuit: '123456789',
};

function faturaBase(overrides: Partial<FaturaInput> = {}): FaturaInput {
  return {
    numero: 'FT/2026/000042',
    serieTipo: 'FATURA',
    moeda: 'MZN',
    dataEmissao: new Date('2026-07-20T09:00:00Z'),
    dataVencimento: new Date('2026-08-19T09:00:00Z'),
    subtotal: new Prisma.Decimal('1000.00'),
    ivaTotal: new Prisma.Decimal('160.00'),
    total: new Prisma.Decimal('1160.00'),
    totalPago: new Prisma.Decimal('0.00'),
    observacoes: null,
    linhas: [
      {
        descricao: 'Serviço de consultoria',
        quantidade: new Prisma.Decimal('1'),
        precoUnitario: new Prisma.Decimal('1000.00'),
        desconto: new Prisma.Decimal('0.00'),
        taxaIva: new Prisma.Decimal('0.16'),
        subtotal: new Prisma.Decimal('1000.00'),
        ivaItem: new Prisma.Decimal('160.00'),
        total: new Prisma.Decimal('1160.00'),
      },
    ],
    ...overrides,
  };
}

/** Extrai apenas os dígitos (robusto a espaços/vírgulas/símbolos pt-PT). */
const digitos = (s: string) => s.replace(/\D/g, '');

describe('construirDocumentoFatura — requisitos fiscais MZ', () => {
  const model = construirDocumentoFatura(faturaBase(), emitente, adquirente);

  it('inclui NUIT do emitente e do adquirente', () => {
    expect(model.emitente.nuit).toBe('400123456');
    expect(model.adquirente.nuit).toBe('123456789');
  });

  it('inclui número de série do documento', () => {
    expect(model.numero).toBe('FT/2026/000042');
    expect(model.designacao).toBe('Factura');
  });

  it('apresenta a taxa de IVA como 16% (fracção 0.16)', () => {
    expect(model.linhas[0].taxaIvaPercent).toBe('16%');
    expect(model.resumoIva.some((r) => r.taxaPercent === '16%')).toBe(true);
  });

  it('resumo de IVA reflecte incidência e valor emitidos', () => {
    const linha16 = model.resumoIva.find((r) => r.taxaPercent === '16%')!;
    expect(digitos(linha16.incidencia)).toBe('100000'); // 1000,00
    expect(digitos(linha16.iva)).toBe('16000'); // 160,00
  });

  it('total reflecte o valor emitido (append-only), não recalcula', () => {
    expect(digitos(model.totais.total)).toBe('116000'); // 1160,00
    expect(digitos(model.totais.ivaTotal)).toBe('16000');
    expect(digitos(model.totais.subtotal)).toBe('100000');
  });

  it('menções legais obrigatórias presentes', () => {
    const texto = model.mencoesLegais.join(' ');
    expect(texto).toMatch(/IVA/i);
    expect(texto).toMatch(/programa inform/i);
    expect(texto).toMatch(/C[óo]digo do IVA/i);
  });
});

describe('reflexão append-only', () => {
  it('usa o total PERSISTIDO mesmo quando difere da soma das linhas', () => {
    // Total emitido intencionalmente diferente da soma de linhas (1160).
    const fatura = faturaBase({ total: new Prisma.Decimal('9999.99') });
    const model = construirDocumentoFatura(fatura, emitente, adquirente);
    // Reflecte 9999.99 — NUNCA recalcula a partir das linhas.
    expect(digitos(model.totais.total)).toBe('999999');
  });
});

describe('construirMencoesLegais', () => {
  it('marca isenção quando todas as linhas têm taxa 0%', () => {
    const mencoes = construirMencoesLegais('ISENCAO', [
      {
        descricao: 'Bem isento',
        quantidade: '1',
        precoUnitario: '500.00',
        desconto: '0',
        taxaIva: '0',
        subtotal: '500.00',
        ivaItem: '0.00',
        total: '500.00',
      },
    ]);
    expect(mencoes.join(' ')).toMatch(/[Ii]sento de IVA/);
  });
});
