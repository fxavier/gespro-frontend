import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  TRANSICOES_LANCAMENTO,
  transitarLancamento,
  type StatusLancamento,
} from '../contabilidade.interface';

// ---------------------------------------------------------------------------
// Testes unitários puros (sem DB): máquina de estado + lógica Decimal
// ---------------------------------------------------------------------------

describe('transitarLancamento', () => {
  it('RASCUNHO → LANCADO é permitida', () => {
    expect(() => transitarLancamento('RASCUNHO', 'LANCADO')).not.toThrow();
  });

  it('LANCADO → ESTORNADO é permitida', () => {
    expect(() => transitarLancamento('LANCADO', 'ESTORNADO')).not.toThrow();
  });

  it('RASCUNHO → ESTORNADO não é permitida', () => {
    expect(() => transitarLancamento('RASCUNHO', 'ESTORNADO')).toThrow(/Transi/);
  });

  it('ESTORNADO → LANCADO não é permitida (terminal)', () => {
    expect(() => transitarLancamento('ESTORNADO', 'LANCADO')).toThrow(/Transi/);
  });

  it('ESTORNADO → RASCUNHO não é permitida (terminal)', () => {
    expect(() => transitarLancamento('ESTORNADO', 'RASCUNHO')).toThrow(/Transi/);
  });

  it('LANCADO → RASCUNHO não é permitida', () => {
    expect(() => transitarLancamento('LANCADO', 'RASCUNHO')).toThrow(/Transi/);
  });

  it('erro tem code = TRANSICAO_INVALIDA', () => {
    try {
      transitarLancamento('ESTORNADO', 'LANCADO');
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('TRANSICAO_INVALIDA');
    }
  });

  it('mapa de transições cobre todos os estados', () => {
    const estados: StatusLancamento[] = ['RASCUNHO', 'LANCADO', 'ESTORNADO'];
    for (const e of estados) {
      expect(TRANSICOES_LANCAMENTO).toHaveProperty(e);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariante débito=crédito
// ---------------------------------------------------------------------------

describe('invariante débito=crédito com Decimal', () => {
  it('partidas equilibradas: soma idêntica', () => {
    const partidas = [
      { tipo: 'DEBITO' as const, valor: new Prisma.Decimal('1000.00') },
      { tipo: 'CREDITO' as const, valor: new Prisma.Decimal('750.00') },
      { tipo: 'CREDITO' as const, valor: new Prisma.Decimal('250.00') },
    ];
    let deb = new Prisma.Decimal(0);
    let cred = new Prisma.Decimal(0);
    for (const p of partidas) {
      if (p.tipo === 'DEBITO') deb = deb.plus(p.valor);
      else cred = cred.plus(p.valor);
    }
    expect(deb.equals(cred)).toBe(true);
  });

  it('partidas desequilibradas: soma diferente', () => {
    const partidas = [
      { tipo: 'DEBITO' as const, valor: new Prisma.Decimal('1000.00') },
      { tipo: 'CREDITO' as const, valor: new Prisma.Decimal('999.99') },
    ];
    let deb = new Prisma.Decimal(0);
    let cred = new Prisma.Decimal(0);
    for (const p of partidas) {
      if (p.tipo === 'DEBITO') deb = deb.plus(p.valor);
      else cred = cred.plus(p.valor);
    }
    expect(deb.equals(cred)).toBe(false);
  });

  it('Decimal não tem imprecisão de ponto flutuante em somas', () => {
    // 0.1 + 0.2 em Decimal é exactamente 0.3 (sem imprecisão float)
    const a = new Prisma.Decimal('0.10');
    const b = new Prisma.Decimal('0.20');
    // Decimal preserva precisão — a soma deve ser igual a 0.3
    expect(a.plus(b).equals(new Prisma.Decimal('0.3'))).toBe(true);
    // Em JS nativo há imprecisão:
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('string input é suportada (ADR A9)', () => {
    const v1 = new Prisma.Decimal(String('1234.56'));
    const v2 = new Prisma.Decimal('1234.56');
    expect(v1.equals(v2)).toBe(true);
  });

  it('valor negativo é identificável', () => {
    const neg = new Prisma.Decimal('-1.00');
    expect(neg.isNegative()).toBe(true);
  });

  it('lançamento de 3 partidas equilibradas', () => {
    const partidas = [
      { tipo: 'DEBITO' as const, valor: '5000.00' },
      { tipo: 'CREDITO' as const, valor: '3000.00' },
      { tipo: 'CREDITO' as const, valor: '2000.00' },
    ];
    let deb = new Prisma.Decimal(0);
    let cred = new Prisma.Decimal(0);
    for (const p of partidas) {
      const v = new Prisma.Decimal(p.valor);
      if (p.tipo === 'DEBITO') deb = deb.plus(v);
      else cred = cred.plus(v);
    }
    expect(deb.equals(cred)).toBe(true);
    expect(deb.toFixed(2)).toBe('5000.00');
  });
});

// ---------------------------------------------------------------------------
// periodoFiscal derivado de data
// ---------------------------------------------------------------------------

describe('formato periodoFiscal', () => {
  function periodoFiscalDe(data: Date): string {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  }

  it('Janeiro → YYYY-01', () => {
    expect(periodoFiscalDe(new Date('2025-01-15'))).toBe('2025-01');
  });

  it('Dezembro → YYYY-12', () => {
    expect(periodoFiscalDe(new Date('2025-12-31'))).toBe('2025-12');
  });

  it('formato sempre com 2 dígitos no mês', () => {
    const periodo = periodoFiscalDe(new Date('2025-03-05'));
    expect(periodo).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// Número de lançamento (formato)
// ---------------------------------------------------------------------------

describe('número de lançamento', () => {
  it('padStart 6 zeros: 1 → 000001', () => {
    expect(String(1).padStart(6, '0')).toBe('000001');
  });

  it('padStart 6 zeros: 100 → 000100', () => {
    expect(String(100).padStart(6, '0')).toBe('000100');
  });

  it('padStart 6 zeros: 999999 → 999999', () => {
    expect(String(999999).padStart(6, '0')).toBe('999999');
  });
});
