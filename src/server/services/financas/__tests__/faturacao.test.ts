import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  TRANSICOES_FATURA,
  TRANSICOES_NOTA_CREDITO,
  TRANSICOES_PROFORMA,
  TRANSICOES_COTACAO_COMERCIAL,
  transitarFatura,
  transitarNotaCredito,
  transitarProforma,
  transitarCotacaoComercial,
  type StatusFatura,
  type StatusCotacaoComercial,
} from '../faturacao.interface';

// ---------------------------------------------------------------------------
// Máquinas de estado: faturação
// ---------------------------------------------------------------------------

describe('transitarFatura', () => {
  it('RASCUNHO → EMITIDA é permitida', () => {
    expect(() => transitarFatura('RASCUNHO', 'EMITIDA')).not.toThrow();
  });

  it('EMITIDA → PAGA é permitida', () => {
    expect(() => transitarFatura('EMITIDA', 'PAGA')).not.toThrow();
  });

  it('EMITIDA → CANCELADA é permitida', () => {
    expect(() => transitarFatura('EMITIDA', 'CANCELADA')).not.toThrow();
  });

  it('PAGA → EMITIDA não é permitida (terminal)', () => {
    expect(() => transitarFatura('PAGA', 'EMITIDA')).toThrow(/Transi/);
  });

  it('CANCELADA → EMITIDA não é permitida (terminal)', () => {
    expect(() => transitarFatura('CANCELADA', 'EMITIDA')).toThrow(/Transi/);
  });

  it('RASCUNHO → PAGA não é permitida (deve passar por EMITIDA)', () => {
    expect(() => transitarFatura('RASCUNHO', 'PAGA')).toThrow(/Transi/);
  });

  it('PARCIALMENTE_PAGA → PAGA é permitida', () => {
    expect(() => transitarFatura('PARCIALMENTE_PAGA', 'PAGA')).not.toThrow();
  });

  it('erro tem code = TRANSICAO_INVALIDA', () => {
    try {
      transitarFatura('PAGA', 'RASCUNHO');
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('TRANSICAO_INVALIDA');
    }
  });

  it('todos os estados têm entradas no mapa', () => {
    const estados: StatusFatura[] = ['RASCUNHO', 'EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA', 'CANCELADA'];
    for (const e of estados) {
      expect(TRANSICOES_FATURA).toHaveProperty(e);
    }
  });
});

describe('transitarNotaCredito', () => {
  it('RASCUNHO → EMITIDA é permitida', () => {
    expect(() => transitarNotaCredito('RASCUNHO', 'EMITIDA')).not.toThrow();
  });

  it('EMITIDA → LIQUIDADA é permitida', () => {
    expect(() => transitarNotaCredito('EMITIDA', 'LIQUIDADA')).not.toThrow();
  });

  it('LIQUIDADA → EMITIDA é inválida', () => {
    expect(() => transitarNotaCredito('LIQUIDADA', 'EMITIDA')).toThrow(/Transi/);
  });

  it('LIQUIDADA → CANCELADA é inválida', () => {
    expect(() => transitarNotaCredito('LIQUIDADA', 'CANCELADA')).toThrow(/Transi/);
  });
});

describe('transitarProforma', () => {
  it('RASCUNHO → ENVIADA é permitida', () => {
    expect(() => transitarProforma('RASCUNHO', 'ENVIADA')).not.toThrow();
  });

  it('RASCUNHO → CANCELADA é permitida', () => {
    expect(() => transitarProforma('RASCUNHO', 'CANCELADA')).not.toThrow();
  });

  it('ACEITE → CONVERTIDA é permitida', () => {
    expect(() => transitarProforma('ACEITE', 'CONVERTIDA')).not.toThrow();
  });

  it('CONVERTIDA → RASCUNHO é inválida', () => {
    expect(() => transitarProforma('CONVERTIDA', 'RASCUNHO')).toThrow(/Transi/);
  });
});

describe('transitarCotacaoComercial', () => {
  it('ACEITE → CONVERTIDA é a única transição', () => {
    const alvo = TRANSICOES_COTACAO_COMERCIAL['ACEITE'];
    expect(alvo).toEqual(['CONVERTIDA']);
  });

  it('REJEITADA → ACEITE é inválida', () => {
    expect(() => transitarCotacaoComercial('REJEITADA', 'ACEITE')).toThrow(/Transi/);
  });

  it('estados terminais corretos', () => {
    const terminais: StatusCotacaoComercial[] = ['REJEITADA', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA'];
    for (const t of terminais) {
      expect(TRANSICOES_COTACAO_COMERCIAL[t]).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Cálculo de IVA Moçambicano
// ---------------------------------------------------------------------------

describe('IVA 16% moçambicano', () => {
  it('cálculo de linha: base=1000, IVA=160, total=1160', () => {
    const quantidade = new Prisma.Decimal('10');
    const precoUnitario = new Prisma.Decimal('100.00');
    const desconto = new Prisma.Decimal('0.00');
    const taxaIva = new Prisma.Decimal('0.16');

    const base = quantidade.times(precoUnitario).minus(desconto);
    const iva = base.times(taxaIva);
    const total = base.plus(iva);

    expect(base.equals(new Prisma.Decimal('1000'))).toBe(true);
    expect(iva.equals(new Prisma.Decimal('160'))).toBe(true);
    expect(total.equals(new Prisma.Decimal('1160'))).toBe(true);
  });

  it('cálculo isento: IVA=0', () => {
    const base = new Prisma.Decimal('500.00');
    const taxaIva = new Prisma.Decimal('0');
    const iva = base.times(taxaIva);
    expect(iva.isZero()).toBe(true);
    expect(base.plus(iva).equals(new Prisma.Decimal('500'))).toBe(true);
  });

  it('taxa inválida (ex: 10%) é identificável', () => {
    const taxaInvalida = 0.10;
    const taxasMocambicanas = [0, 0.16];
    expect(taxasMocambicanas.some((t) => Math.abs(t - taxaInvalida) < 0.0001)).toBe(false);
  });

  it('taxa 16% é válida', () => {
    const taxa = 0.16;
    const taxasMocambicanas = [0, 0.16];
    expect(taxasMocambicanas.some((t) => Math.abs(t - taxa) < 0.0001)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Template de numeração
// ---------------------------------------------------------------------------

describe('formatarNumero (template)', () => {
  function formatarNumero(template: string, vars: { prefixo: string; ano: number; numero: number }): string {
    return template
      .replace('{prefixo}', vars.prefixo)
      .replace('{ano}', String(vars.ano))
      .replace(/\{numero(?::(\d+))?\}/, (_, w) => String(vars.numero).padStart(w ? parseInt(w, 10) : 1, '0'));
  }

  it('template padrão {prefixo}/{ano}/{numero:06}', () => {
    const resultado = formatarNumero('{prefixo}/{ano}/{numero:06}', { prefixo: 'FAT', ano: 2025, numero: 1 });
    expect(resultado).toBe('FAT/2025/000001');
  });

  it('número alto não é truncado', () => {
    const resultado = formatarNumero('{prefixo}/{ano}/{numero:06}', { prefixo: 'NC', ano: 2025, numero: 999999 });
    expect(resultado).toBe('NC/2025/999999');
  });

  it('número além de 6 dígitos não é truncado', () => {
    const resultado = formatarNumero('{prefixo}/{ano}/{numero:06}', { prefixo: 'FAT', ano: 2025, numero: 1000000 });
    expect(resultado).toBe('FAT/2025/1000000');
  });

  it('template sem padding', () => {
    const resultado = formatarNumero('{prefixo}-{numero}', { prefixo: 'REC', ano: 2025, numero: 42 });
    expect(resultado).toBe('REC-42');
  });
});
