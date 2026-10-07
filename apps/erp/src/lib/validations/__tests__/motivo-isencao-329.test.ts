/**
 * Oráculo da issue #329 — o schema de linha PASSA o `motivoIsencao` adiante (ADR-0039 §4).
 *
 * Decisão: `motivoIsencao` é opcional em `LinhaDocumentoSchema` e chega ao serviço; NÃO é
 * um refine — a exigência vive nos núcleos de emissão (factura, NC, ND), porque Proforma e
 * Cotação partilham o schema e uma linha a 0% sem motivo continua a ser válida nelas
 * (taxa-iva-schemas.test.ts espera sucesso numa linha a 0% sem motivo).
 */
import { describe, expect, it } from 'vitest';
import {
  LinhaDocumentoSchema,
  EmitirFaturaSchema,
  EmitirNotaCreditoSchema,
  EmitirNotaDebitoSchema,
  CriarProformaSchema,
  CriarCotacaoComercialSchema,
} from '@/lib/validations/faturacao';

const MOTIVO = 'Isento nos termos do artigo 9.º do Código do IVA';
const linhaIsenta = { descricao: 'Livro escolar', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0 };
const hoje = new Date(2026, 9, 7, 12);
const amanha = new Date(2026, 9, 8, 12);
const CLIENTE = 'cjld2cjxh0000qzrmn831i7rn';
const FATURA = 'cjld2cjxh0001qzrmn831i7ro';

const motivoDa = (r: unknown) => (r as { motivoIsencao?: unknown }).motivoIsencao;

describe('LinhaDocumentoSchema.motivoIsencao (#329)', () => {
  it('passa o motivo adiante numa linha a 0%', () => {
    const r = LinhaDocumentoSchema.parse({ ...linhaIsenta, motivoIsencao: MOTIVO });
    expect(motivoDa(r)).toBe(MOTIVO);
  });

  it('continua a aceitar uma linha a 0% SEM motivo (não é refine — Proforma/Cotação partilham o schema)', () => {
    const r = LinhaDocumentoSchema.safeParse(linhaIsenta);
    expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
  });

  it('os cálculos da linha não mudam por causa do motivo', () => {
    const r = LinhaDocumentoSchema.parse({ ...linhaIsenta, motivoIsencao: MOTIVO });
    expect(r.subtotal).toBe(1000);
    expect(r.ivaItem).toBe(0);
    expect(r.total).toBe(1000);
  });
});

describe('schemas de emissão levam o motivo até ao serviço (#329)', () => {
  it('EmitirFaturaSchema', () => {
    const r = EmitirFaturaSchema.parse({
      clienteId: CLIENTE,
      dataEmissao: hoje,
      dataVencimento: amanha,
      linhas: [{ ...linhaIsenta, motivoIsencao: MOTIVO }],
    });
    expect(motivoDa(r.linhas[0])).toBe(MOTIVO);
  });

  it('EmitirNotaCreditoSchema', () => {
    const r = EmitirNotaCreditoSchema.parse({
      faturaOriginalId: FATURA,
      motivo: 'Devolução',
      dataEmissao: hoje,
      linhas: [{ ...linhaIsenta, motivoIsencao: MOTIVO }],
    });
    expect(motivoDa(r.linhas[0])).toBe(MOTIVO);
  });

  it('EmitirNotaDebitoSchema', () => {
    const r = EmitirNotaDebitoSchema.parse({
      clienteId: CLIENTE,
      motivo: 'Débito',
      dataEmissao: hoje,
      linhas: [{ ...linhaIsenta, motivoIsencao: MOTIVO }],
    });
    expect(motivoDa(r.linhas[0])).toBe(MOTIVO);
  });

  it('Proforma e Cotação aceitam linha a 0% sem motivo', () => {
    const base = { clienteId: CLIENTE, dataEmissao: hoje, dataValidade: amanha, linhas: [linhaIsenta] };
    const p = CriarProformaSchema.safeParse(base);
    const c = CriarCotacaoComercialSchema.safeParse(base);
    expect(p.success, JSON.stringify(!p.success && p.error.issues)).toBe(true);
    expect(c.success, JSON.stringify(!c.success && c.error.issues)).toBe(true);
  });
});
