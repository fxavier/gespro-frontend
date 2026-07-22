import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  TRANSICOES_SESSAO_CAIXA,
  transitarSessaoCaixa,
  type StatusSessaoCaixa,
} from '../caixa.interface';

// ---------------------------------------------------------------------------
// Máquina de estado: SessaoCaixa
// ---------------------------------------------------------------------------

describe('transitarSessaoCaixa', () => {
  it('ABERTA → FECHADA é permitida', () => {
    expect(() => transitarSessaoCaixa('ABERTA', 'FECHADA')).not.toThrow();
  });

  it('ABERTA → CANCELADA é permitida', () => {
    expect(() => transitarSessaoCaixa('ABERTA', 'CANCELADA')).not.toThrow();
  });

  it('FECHADA → qualquer estado lança erro com "Transição inválida"', () => {
    const estados: StatusSessaoCaixa[] = ['ABERTA', 'FECHADA', 'CANCELADA'];
    for (const alvo of estados) {
      expect(() => transitarSessaoCaixa('FECHADA', alvo)).toThrow(/Transi/);
    }
  });

  it('CANCELADA → qualquer estado lança erro com "Transição inválida"', () => {
    const estados: StatusSessaoCaixa[] = ['ABERTA', 'FECHADA', 'CANCELADA'];
    for (const alvo of estados) {
      expect(() => transitarSessaoCaixa('CANCELADA', alvo)).toThrow(/Transi/);
    }
  });

  it('erro lançado tem propriedade code = TRANSICAO_INVALIDA', () => {
    try {
      transitarSessaoCaixa('FECHADA', 'ABERTA');
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('TRANSICAO_INVALIDA');
    }
  });

  it('mapa cobre todos os estados', () => {
    const esperados: StatusSessaoCaixa[] = ['ABERTA', 'FECHADA', 'CANCELADA'];
    for (const e of esperados) {
      expect(TRANSICOES_SESSAO_CAIXA).toHaveProperty(e);
    }
  });
});

// ---------------------------------------------------------------------------
// Cálculo de fundo de caixa
// ---------------------------------------------------------------------------

describe('cálculo fundo e diferença de caixa', () => {
  it('saldo esperado = fundoInicial + entradas - saídas', () => {
    const fundoInicial = new Prisma.Decimal('1000.00');
    const totalEntradas = new Prisma.Decimal('5500.00');
    const totalSaidas = new Prisma.Decimal('500.00');
    const saldoEsperado = fundoInicial.plus(totalEntradas).minus(totalSaidas);
    expect(saldoEsperado.equals(new Prisma.Decimal('6000'))).toBe(true);
  });

  it('diferença = fundoFinal - saldoEsperado', () => {
    const saldoEsperado = new Prisma.Decimal('6000.00');
    const fundoFinal = new Prisma.Decimal('5990.00');
    const diferenca = fundoFinal.minus(saldoEsperado);
    expect(diferenca.equals(new Prisma.Decimal('-10'))).toBe(true);
    expect(diferenca.isNegative()).toBe(true); // falta 10 MZN
  });

  it('diferença zero quando fundo bate certo', () => {
    const saldo = new Prisma.Decimal('2500.00');
    const fundo = new Prisma.Decimal('2500.00');
    expect(fundo.minus(saldo).equals(0)).toBe(true);
  });

  it('valor de Decimal | string é suportado (ADR A9)', () => {
    const viaString = new Prisma.Decimal(String('250.00'));
    const viaDecimal = new Prisma.Decimal('250.00');
    expect(viaString.equals(viaDecimal)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tipos de movimento
// ---------------------------------------------------------------------------

describe('tipos de movimento de caixa', () => {
  const ENTRADAS = ['VENDA', 'RECEBIMENTO', 'REFORCO', 'ABERTURA'];
  const SAIDAS = ['SANGRIA', 'DEVOLUCAO'];

  it('entradas e saídas não se sobrepõem', () => {
    for (const tipo of SAIDAS) {
      expect(ENTRADAS).not.toContain(tipo);
    }
  });

  it('VENDA e RECEBIMENTO são entradas', () => {
    expect(ENTRADAS).toContain('VENDA');
    expect(ENTRADAS).toContain('RECEBIMENTO');
  });

  it('SANGRIA é saída', () => {
    expect(SAIDAS).toContain('SANGRIA');
  });

  it('cálculo de totais com múltiplos movimentos', () => {
    const movimentos = [
      { tipo: 'ABERTURA', valor: new Prisma.Decimal('500.00') },
      { tipo: 'VENDA', valor: new Prisma.Decimal('1200.00') },
      { tipo: 'SANGRIA', valor: new Prisma.Decimal('200.00') },
      { tipo: 'VENDA', valor: new Prisma.Decimal('800.00') },
      { tipo: 'REFORCO', valor: new Prisma.Decimal('300.00') },
    ];

    const totalEntradas = movimentos
      .filter((m) => ENTRADAS.includes(m.tipo))
      .reduce((acc, m) => acc.plus(m.valor), new Prisma.Decimal(0));

    const totalSaidas = movimentos
      .filter((m) => SAIDAS.includes(m.tipo))
      .reduce((acc, m) => acc.plus(m.valor), new Prisma.Decimal(0));

    expect(totalEntradas.equals(new Prisma.Decimal('2800'))).toBe(true);
    expect(totalSaidas.equals(new Prisma.Decimal('200'))).toBe(true);
  });
});
