/**
 * Oráculo das issues #91/#92 (nó A:caixa-totais-91-92) — escrito pelo verificador.
 * Alterar este ficheiro do lado de quem implementa é BLOCKER (doutrina 00 §2).
 *
 * Contrato: `totaisSessaoCaixa(movimentos, fundoInicial)` em `src/lib/caixa-movimentos.ts`,
 * pura e client-safe, é a ÚNICA aritmética dos totais de uma sessão de caixa:
 *   - ignora ABERTURA (o fundo já entra por `fundoInicial` — contá-lo duas vezes era o #91)
 *     e FECHAMENTO (é a contagem do fecho, não um movimento de dinheiro);
 *   - totalEntradas = Σ VENDA + RECEBIMENTO + REFORCO;
 *   - totalSaidas   = Σ SANGRIA + DEVOLUCAO + PAGAMENTO;
 *   - saldoEsperado = fundoInicial + totalEntradas − totalSaidas.
 * `MOVIMENTOS_ENTRADA` mantém ABERTURA (serve o sinal/cor na tabela de movimentos).
 *
 * Os números esperados são apurados à mão, nunca pela implementação. A função é lida por
 * acesso dinâmico para que, enquanto não existir, falhe CADA caso e não o ficheiro.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import * as caixaMovimentos from '@/lib/caixa-movimentos';

const D = (v: string | number) => new Prisma.Decimal(v);
const dois = (v: unknown) => D(String(v)).toFixed(2);

type Mov = { tipo: string; valor: Prisma.Decimal };
type Totais = { totalEntradas: unknown; totalSaidas: unknown; saldoEsperado: unknown };

function totais(movimentos: Mov[], fundoInicial: Prisma.Decimal): Totais {
  const fn = (caixaMovimentos as Record<string, unknown>).totaisSessaoCaixa;
  expect(typeof fn, 'src/lib/caixa-movimentos.ts tem de exportar totaisSessaoCaixa').toBe('function');
  return (fn as (m: Mov[], f: Prisma.Decimal) => Totais)(movimentos, fundoInicial);
}

const mov = (tipo: string, valor: string): Mov => ({ tipo, valor: D(valor) });

describe('totaisSessaoCaixa — #91: o fundo inicial conta UMA vez', () => {
  it('fundo 1000 + ABERTURA 1000 + VENDA 300 ⇒ entradas 300, saídas 0, esperado 1300', () => {
    const t = totais([mov('ABERTURA', '1000.00'), mov('VENDA', '300.00')], D('1000.00'));
    expect(dois(t.totalEntradas)).toBe('300.00');
    expect(dois(t.totalSaidas)).toBe('0.00');
    // Hoje (ABERTURA somada às entradas E fundoInicial somado ao saldo) daria 2300.
    expect(dois(t.saldoEsperado)).toBe('1300.00');
  });

  it('o FECHAMENTO não é movimento de dinheiro: uma sessão já fechada dá os mesmos totais', () => {
    const base = [mov('ABERTURA', '1000.00'), mov('VENDA', '300.00')];
    const t = totais([...base, mov('FECHAMENTO', '1300.00')], D('1000.00'));
    expect(dois(t.totalEntradas)).toBe('300.00');
    expect(dois(t.totalSaidas)).toBe('0.00');
    expect(dois(t.saldoEsperado)).toBe('1300.00');
  });

  it.each(['0.00', '0.01', '1000.00', '987654.32'])(
    'acrescentar uma ABERTURA de %s não muda nenhum dos três totais',
    (v) => {
      const base = [mov('VENDA', '120.50'), mov('SANGRIA', '20.25')];
      const sem = totais(base, D('500.00'));
      const com = totais([mov('ABERTURA', v), ...base], D('500.00'));
      expect(dois(com.totalEntradas)).toBe(dois(sem.totalEntradas));
      expect(dois(com.totalSaidas)).toBe(dois(sem.totalSaidas));
      expect(dois(com.saldoEsperado)).toBe(dois(sem.saldoEsperado));
      // e os valores são os apurados à mão: 500 + 120,50 − 20,25
      expect(dois(com.saldoEsperado)).toBe('600.25');
    },
  );

  it('sessão só com a abertura ⇒ esperado = fundo inicial, entradas e saídas a zero', () => {
    const t = totais([mov('ABERTURA', '750.00')], D('750.00'));
    expect(dois(t.totalEntradas)).toBe('0.00');
    expect(dois(t.totalSaidas)).toBe('0.00');
    expect(dois(t.saldoEsperado)).toBe('750.00');
  });

  it('sem movimentos nenhuns ⇒ esperado = fundo inicial', () => {
    const t = totais([], D('42.10'));
    expect(dois(t.totalEntradas)).toBe('0.00');
    expect(dois(t.totalSaidas)).toBe('0.00');
    expect(dois(t.saldoEsperado)).toBe('42.10');
  });
});

describe('totaisSessaoCaixa — classificação por tipo', () => {
  it('VENDA, RECEBIMENTO e REFORCO entram; SANGRIA, DEVOLUCAO e PAGAMENTO saem', () => {
    const t = totais(
      [
        mov('ABERTURA', '1000.00'),
        mov('VENDA', '300.00'),
        mov('RECEBIMENTO', '200.00'),
        mov('REFORCO', '100.00'),
        mov('SANGRIA', '50.00'),
        mov('PAGAMENTO', '25.00'),
        mov('DEVOLUCAO', '10.00'),
        mov('FECHAMENTO', '1500.00'),
      ],
      D('1000.00'),
    );
    // À mão: entradas 300 + 200 + 100 = 600; saídas 50 + 25 + 10 = 85; 1000 + 600 − 85 = 1515.
    expect(dois(t.totalEntradas)).toBe('600.00');
    expect(dois(t.totalSaidas)).toBe('85.00');
    expect(dois(t.saldoEsperado)).toBe('1515.00');
  });

  it('é exacta ao cêntimo (Decimal, nunca float)', () => {
    const t = totais(
      [mov('VENDA', '0.10'), mov('VENDA', '0.20'), mov('SANGRIA', '0.30')],
      D('0.00'),
    );
    expect(dois(t.totalEntradas)).toBe('0.30');
    expect(dois(t.totalSaidas)).toBe('0.30');
    expect(D(String(t.saldoEsperado)).isZero()).toBe(true);
  });
});

describe('MOVIMENTOS_ENTRADA continua a servir o sinal/cor', () => {
  it('mantém ABERTURA (a correcção do #91 não passa por lá)', () => {
    expect(caixaMovimentos.MOVIMENTOS_ENTRADA as readonly string[]).toContain('ABERTURA');
  });
});
