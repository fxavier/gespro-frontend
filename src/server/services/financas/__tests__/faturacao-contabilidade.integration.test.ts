/**
 * Wave 3 — integração faturação → contabilidade
 *
 * Testa a função pura `construirLancamentoFatura` e `construirLancamentoNotaCredito`
 * sem precisar de DB real. O wiring (chamada a `registarLancamentoContabilistico`
 * dentro de `emitirFatura`) é verificado por tsc + inspeção de código.
 *
 * Invariante principal: sum(débitos) === sum(créditos)
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  construirLancamentoFatura,
  construirLancamentoNotaCredito,
  PGC_FATURACAO,
} from '../faturacao.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function somarPartidas(
  partidas: Array<{ tipo: string; valor: string | Prisma.Decimal }>,
  tipo: 'DEBITO' | 'CREDITO',
): Prisma.Decimal {
  return partidas
    .filter((p) => p.tipo === tipo)
    .reduce((acc, p) => acc.plus(new Prisma.Decimal(String(p.valor))), new Prisma.Decimal(0));
}

// Fatura de teste base
function faturaBase(overrides?: Partial<{
  id: string;
  numero: string;
  total: string;
  subtotal: string;
  ivaTotal: string;
  dataEmissao: Date;
}>) {
  return {
    id: 'fat-001',
    numero: 'FT/2026/000001',
    total: new Prisma.Decimal(overrides?.total ?? '1160.00'),
    subtotal: new Prisma.Decimal(overrides?.subtotal ?? '1000.00'),
    ivaTotal: new Prisma.Decimal(overrides?.ivaTotal ?? '160.00'),
    dataEmissao: overrides?.dataEmissao ?? new Date('2026-07-01'),
  };
}

// ---------------------------------------------------------------------------
// construirLancamentoFatura
// ---------------------------------------------------------------------------

describe('construirLancamentoFatura', () => {
  it('retorna diário VENDAS e origem VENDA', () => {
    const input = construirLancamentoFatura(faturaBase());
    expect(input.diarioTipo).toBe('VENDAS');
    expect(input.origem).toBe('VENDA');
    expect(input.documentoOrigemTipo).toBe('Fatura');
    expect(input.documentoOrigemId).toBe('fat-001');
  });

  it('invariante: sum(débitos) === sum(créditos)', () => {
    const input = construirLancamentoFatura(faturaBase());
    const debitos = somarPartidas(input.partidas, 'DEBITO');
    const creditos = somarPartidas(input.partidas, 'CREDITO');
    expect(debitos.equals(creditos)).toBe(true);
  });

  it('débito em Clientes c/c igual ao total (subtotal + IVA)', () => {
    const fat = faturaBase();
    const input = construirLancamentoFatura(fat);
    const debClientes = input.partidas.find(
      (p) => p.tipo === 'DEBITO' && p.contaCodigo === PGC_FATURACAO.CLIENTES_CC,
    );
    expect(debClientes).toBeDefined();
    expect(new Prisma.Decimal(String(debClientes!.valor)).equals(fat.total)).toBe(true);
  });

  it('crédito em Receita de Vendas igual ao subtotal', () => {
    const fat = faturaBase();
    const input = construirLancamentoFatura(fat);
    const credReceita = input.partidas.find(
      (p) => p.tipo === 'CREDITO' && p.contaCodigo === PGC_FATURACAO.RECEITA_VENDAS,
    );
    expect(credReceita).toBeDefined();
    expect(new Prisma.Decimal(String(credReceita!.valor)).equals(fat.subtotal)).toBe(true);
  });

  it('crédito em IVA liquidado igual ao ivaTotal', () => {
    const fat = faturaBase();
    const input = construirLancamentoFatura(fat);
    const credIva = input.partidas.find(
      (p) => p.tipo === 'CREDITO' && p.contaCodigo === PGC_FATURACAO.IVA_LIQUIDADO,
    );
    expect(credIva).toBeDefined();
    expect(new Prisma.Decimal(String(credIva!.valor)).equals(fat.ivaTotal)).toBe(true);
  });

  it('gera 3 partidas quando ivaTotal > 0 (Clientes / Receita / IVA)', () => {
    const input = construirLancamentoFatura(faturaBase());
    expect(input.partidas).toHaveLength(3);
  });

  it('gera 2 partidas quando ivaTotal === 0 (isento de IVA)', () => {
    const fat = {
      id: 'fat-002',
      numero: 'FT/2026/000002',
      total: new Prisma.Decimal('500.00'),
      subtotal: new Prisma.Decimal('500.00'),
      ivaTotal: new Prisma.Decimal('0.00'),
      dataEmissao: new Date('2026-07-01'),
    };
    const input = construirLancamentoFatura(fat);
    expect(input.partidas).toHaveLength(2);
    const debitos = somarPartidas(input.partidas, 'DEBITO');
    const creditos = somarPartidas(input.partidas, 'CREDITO');
    expect(debitos.equals(creditos)).toBe(true);
  });

  it('débito === crédito com valores exactos em Decimal (sem float drift)', () => {
    // Garante que não há drift de ponto flutuante
    const fat = {
      id: 'fat-003',
      numero: 'FT/2026/000003',
      total: new Prisma.Decimal('1234.56'),
      subtotal: new Prisma.Decimal('1061.69'),
      ivaTotal: new Prisma.Decimal('172.87'), // 1061.69 + 172.87 ≈ 1234.56 (arredondamentos)
      dataEmissao: new Date('2026-07-01'),
    };
    // Nota: aqui total pode não ser exactamente subtotal+iva por arredondamento
    // O que testamos é que o input construído tem déb = créd (cada partida usa toFixed(2))
    const input = construirLancamentoFatura({ ...fat, total: fat.subtotal.plus(fat.ivaTotal) });
    const debitos = somarPartidas(input.partidas, 'DEBITO');
    const creditos = somarPartidas(input.partidas, 'CREDITO');
    expect(debitos.equals(creditos)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// construirLancamentoNotaCredito (estorno inverso)
// ---------------------------------------------------------------------------

describe('construirLancamentoNotaCredito', () => {
  function ncBase() {
    return {
      id: 'nc-001',
      numero: 'NC/2026/000001',
      total: new Prisma.Decimal('1160.00'),
      subtotal: new Prisma.Decimal('1000.00'),
      ivaTotal: new Prisma.Decimal('160.00'),
      dataEmissao: new Date('2026-07-02'),
    };
  }

  it('retorna diário VENDAS e origem VENDA e tipo NotaCredito', () => {
    const input = construirLancamentoNotaCredito(ncBase());
    expect(input.diarioTipo).toBe('VENDAS');
    expect(input.origem).toBe('VENDA');
    expect(input.documentoOrigemTipo).toBe('NotaCredito');
    expect(input.documentoOrigemId).toBe('nc-001');
  });

  it('invariante: sum(débitos) === sum(créditos)', () => {
    const input = construirLancamentoNotaCredito(ncBase());
    const debitos = somarPartidas(input.partidas, 'DEBITO');
    const creditos = somarPartidas(input.partidas, 'CREDITO');
    expect(debitos.equals(creditos)).toBe(true);
  });

  it('crédito em Clientes c/c igual ao total (redução do crédito do cliente)', () => {
    const nc = ncBase();
    const input = construirLancamentoNotaCredito(nc);
    const credClientes = input.partidas.find(
      (p) => p.tipo === 'CREDITO' && p.contaCodigo === PGC_FATURACAO.CLIENTES_CC,
    );
    expect(credClientes).toBeDefined();
    expect(new Prisma.Decimal(String(credClientes!.valor)).equals(nc.total)).toBe(true);
  });

  it('débito em Receita de Vendas igual ao subtotal (estorno de receita)', () => {
    const nc = ncBase();
    const input = construirLancamentoNotaCredito(nc);
    const debReceita = input.partidas.find(
      (p) => p.tipo === 'DEBITO' && p.contaCodigo === PGC_FATURACAO.RECEITA_VENDAS,
    );
    expect(debReceita).toBeDefined();
    expect(new Prisma.Decimal(String(debReceita!.valor)).equals(nc.subtotal)).toBe(true);
  });

  it('débito em IVA liquidado quando ivaTotal > 0 (estorno IVA)', () => {
    const nc = ncBase();
    const input = construirLancamentoNotaCredito(nc);
    const debIva = input.partidas.find(
      (p) => p.tipo === 'DEBITO' && p.contaCodigo === PGC_FATURACAO.IVA_LIQUIDADO,
    );
    expect(debIva).toBeDefined();
    expect(new Prisma.Decimal(String(debIva!.valor)).equals(nc.ivaTotal)).toBe(true);
  });

  it('gera 3 partidas quando ivaTotal > 0', () => {
    const input = construirLancamentoNotaCredito(ncBase());
    expect(input.partidas).toHaveLength(3);
  });

  it('gera 2 partidas quando ivaTotal === 0', () => {
    const nc = {
      id: 'nc-002',
      numero: 'NC/2026/000002',
      total: new Prisma.Decimal('300.00'),
      subtotal: new Prisma.Decimal('300.00'),
      ivaTotal: new Prisma.Decimal('0.00'),
      dataEmissao: new Date('2026-07-02'),
    };
    const input = construirLancamentoNotaCredito(nc);
    expect(input.partidas).toHaveLength(2);
    const debitos = somarPartidas(input.partidas, 'DEBITO');
    const creditos = somarPartidas(input.partidas, 'CREDITO');
    expect(debitos.equals(creditos)).toBe(true);
  });

  it('partidas são simétricas às da fatura original (estorno completo)', () => {
    const fat = faturaBase();
    const lancFatura = construirLancamentoFatura(fat);
    const nc = { ...fat, id: 'nc-x', numero: 'NC/2026/000001', dataEmissao: new Date('2026-07-03') };
    const lancNC = construirLancamentoNotaCredito(nc);

    // Cada crédito na fatura deve ter débito correspondente na NC e vice-versa
    const creditosFatura = lancFatura.partidas.filter((p) => p.tipo === 'CREDITO');
    const debitosNC = lancNC.partidas.filter((p) => p.tipo === 'DEBITO');
    const debitosFatura = lancFatura.partidas.filter((p) => p.tipo === 'DEBITO');
    const creditosNC = lancNC.partidas.filter((p) => p.tipo === 'CREDITO');

    // Soma dos créditos da fatura === soma dos débitos da NC
    const somaCreditosFatura = somarPartidas(creditosFatura, 'CREDITO');
    const somaDebitosNC = somarPartidas(debitosNC, 'DEBITO');
    expect(somaCreditosFatura.equals(somaDebitosNC)).toBe(true);

    // Soma dos débitos da fatura === soma dos créditos da NC
    const somaDebitosFatura = somarPartidas(debitosFatura, 'DEBITO');
    const somaCreditosNC = somarPartidas(creditosNC, 'CREDITO');
    expect(somaDebitosFatura.equals(somaCreditosNC)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Constantes PGC
// ---------------------------------------------------------------------------

describe('PGC_FATURACAO', () => {
  it('usa código 411 para Clientes c/c (PGC-NIRF 4.1.1)', () => {
    expect(PGC_FATURACAO.CLIENTES_CC).toBe('411');
  });

  it('usa código 711 para Receita de Vendas (PGC-NIRF 7.1.1)', () => {
    expect(PGC_FATURACAO.RECEITA_VENDAS).toBe('711');
  });

  it('usa código 44331 para IVA liquidado (PGC-NIRF 4.4.3.3.1)', () => {
    expect(PGC_FATURACAO.IVA_LIQUIDADO).toBe('44331');
  });
});
