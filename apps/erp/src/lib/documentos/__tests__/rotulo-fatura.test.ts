/**
 * Oráculo #86/#266 — o rótulo da opção «Factura a creditar» mostra o SALDO CREDITÁVEL.
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato de `rotuloFaturaCreditavel(f)`, com `f` = linha de `procurarFaturasCreditaveis`
 * (`{ numero, dataEmissao, total, saldoCreditavel }`):
 *  - começa pelo número (é o que se pesquisa; os E2E escolhem a opção por `^número`);
 *  - leva a data de emissão (`formatarData`);
 *  - leva o saldo creditável formatado (`formatMZN`) — numa factura parcialmente creditada,
 *    é o saldo que tem de estar lá, não só o total.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { rotuloFaturaCreditavel } from '../rotulo-fatura';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';

const rotulo = rotuloFaturaCreditavel as unknown as (f: Record<string, unknown>) => string;

const BASE = {
  id: 'fat-86',
  numero: 'FAT/2026/000086',
  dataEmissao: new Date('2026-09-01T10:00:00+02:00'),
  total: new Prisma.Decimal('1160'),
};

describe('rotuloFaturaCreditavel — saldo creditável (#86, #266)', () => {
  it('parcialmente creditada: mostra o saldo (1 044,00), começa pelo número e leva a data', () => {
    const r = rotulo({ ...BASE, saldoCreditavel: new Prisma.Decimal('1044') });
    expect(r.startsWith('FAT/2026/000086')).toBe(true);
    expect(r).toContain(formatarData(BASE.dataEmissao));
    expect(r).toContain(formatMZN('1044'));
  });

  it('o saldo vem do campo saldoCreditavel, não do total', () => {
    const a = rotulo({ ...BASE, saldoCreditavel: new Prisma.Decimal('1044') });
    const b = rotulo({ ...BASE, saldoCreditavel: new Prisma.Decimal('500.5') });
    expect(b).toContain(formatMZN('500.5'));
    expect(b).not.toContain(formatMZN('1044'));
    expect(a).not.toBe(b);
  });

  it('sem NC (saldo = total): o valor creditável aparece', () => {
    const r = rotulo({ ...BASE, saldoCreditavel: new Prisma.Decimal('1160') });
    expect(r.startsWith('FAT/2026/000086')).toBe(true);
    expect(r).toContain(formatMZN('1160'));
  });

  it('aceita o saldo serializado como string (o que atravessa a fronteira RSC)', () => {
    const r = rotulo({ ...BASE, total: '1160', saldoCreditavel: '1044' });
    expect(r).toContain(formatMZN('1044'));
  });
});
