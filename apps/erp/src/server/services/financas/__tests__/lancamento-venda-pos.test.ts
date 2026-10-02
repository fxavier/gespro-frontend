/**
 * Oráculo S2 (B) — lançamento da venda POS (ADR-0041 §3, §4; issue #306).
 *
 * `construirLancamentoVendaPOS(doc, pagamentos, contas?)` é puro:
 *   - diário VENDAS, origem VENDA, documento de origem a `Fatura` do POS;
 *   - UMA partida a DÉBITO por linha de pagamento, na conta do meio:
 *       DINHEIRO → 111 · CARTAO / TRANSFERENCIA / MPESA / EMOLA → 121 · CREDITO → 411
 *     (`contas` sobrepõe-se à omissão, meio a meio);
 *   - CRÉDITO 711 = subtotal (base tributável); CRÉDITO 44331 = IVA, só se > 0;
 *   - Σ pagamentos ≠ total → BusinessRuleError PAGAMENTOS_NAO_BATEM_TOTAL.
 * Invariante: Σ débitos = Σ créditos = total.
 *
 * Escrito antes da implementação; o implementador não o altera.
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { Prisma, type MetodoPagamentoTipo } from '@prisma/client';

// O serviço importa o cliente da base e a sessão; a função testada é pura e não os toca.
vi.mock('@/server/db/client', () => ({ prisma: {}, prismaBase: {} }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

import { construirLancamentoVendaPOS } from '../faturacao.service';
import { BusinessRuleError } from '@/lib/errors';

const D = (v: unknown) => new Prisma.Decimal(String(v));
const ZERO = new Prisma.Decimal(0);

type Partida = { contaCodigo: string; tipo: string; valor: Prisma.Decimal | string };

function soma(partidas: Partida[], tipo: 'DEBITO' | 'CREDITO', conta?: string) {
  return partidas
    .filter((p) => p.tipo === tipo && (conta === undefined || p.contaCodigo === conta))
    .reduce((a, p) => a.plus(D(p.valor)), ZERO);
}

function doc(subtotal: string, ivaTotal: string) {
  const s = D(subtotal);
  const i = D(ivaTotal);
  return {
    id: 'fat-pos-1',
    numero: 'FR/2026/000001',
    dataEmissao: new Date('2026-10-02T10:00:00Z'),
    subtotal: s,
    ivaTotal: i,
    total: s.plus(i),
  };
}

const CONTA_OMISSAO: Record<MetodoPagamentoTipo, string> = {
  DINHEIRO: '111',
  CARTAO: '121',
  TRANSFERENCIA: '121',
  MPESA: '121',
  EMOLA: '121',
  CREDITO: '411',
};

describe('construirLancamentoVendaPOS — exemplos', () => {
  it('cabeçalho: diário VENDAS, origem VENDA, documento de origem a Fatura do POS, data do documento', () => {
    const d = doc('1000', '160');
    const l = construirLancamentoVendaPOS(d, [{ tipo: 'DINHEIRO', valor: D('1160') }]);
    expect(l.diarioTipo).toBe('VENDAS');
    expect(l.origem).toBe('VENDA');
    expect(l.documentoOrigemTipo).toBe('Fatura');
    expect(l.documentoOrigemId).toBe(d.id);
    expect(l.data.getTime()).toBe(d.dataEmissao.getTime());
  });

  it('venda a dinheiro: D 111 = total; C 711 = subtotal; C 44331 = IVA', () => {
    const l = construirLancamentoVendaPOS(doc('1000', '160'), [{ tipo: 'DINHEIRO', valor: D('1160') }]);
    expect(l.partidas).toHaveLength(3);
    expect(soma(l.partidas, 'DEBITO', '111').equals(D('1160'))).toBe(true);
    expect(soma(l.partidas, 'CREDITO', '711').equals(D('1000'))).toBe(true);
    expect(soma(l.partidas, 'CREDITO', '44331').equals(D('160'))).toBe(true);
  });

  it('venda mista DINHEIRO 300 + MPESA resto: D 111 = 300, D 121 = resto', () => {
    const l = construirLancamentoVendaPOS(doc('1000', '160'), [
      { tipo: 'DINHEIRO', valor: D('300') },
      { tipo: 'MPESA', valor: D('860') },
    ]);
    expect(soma(l.partidas, 'DEBITO', '111').equals(D('300'))).toBe(true);
    expect(soma(l.partidas, 'DEBITO', '121').equals(D('860'))).toBe(true);
    expect(soma(l.partidas, 'DEBITO').equals(soma(l.partidas, 'CREDITO'))).toBe(true);
  });

  it.each(Object.entries(CONTA_OMISSAO))('meio %s debita, por omissão, a conta %s', (tipo, conta) => {
    const l = construirLancamentoVendaPOS(doc('100', '16'), [{ tipo: tipo as MetodoPagamentoTipo, valor: D('116') }]);
    const debitos = l.partidas.filter((p) => p.tipo === 'DEBITO');
    expect(debitos).toHaveLength(1);
    expect(debitos[0].contaCodigo).toBe(conta);
    expect(D(debitos[0].valor).equals(D('116'))).toBe(true);
  });

  it('uma partida a débito POR linha de pagamento (dois pagamentos em dinheiro = duas partidas a 111)', () => {
    const l = construirLancamentoVendaPOS(doc('100', '16'), [
      { tipo: 'DINHEIRO', valor: D('50') },
      { tipo: 'DINHEIRO', valor: D('66') },
    ]);
    const debitos = l.partidas.filter((p) => p.tipo === 'DEBITO');
    expect(debitos).toHaveLength(2);
    expect(debitos.every((p) => p.contaCodigo === '111')).toBe(true);
    expect(soma(l.partidas, 'DEBITO', '111').equals(D('116'))).toBe(true);
  });

  it('`contas` sobrepõe-se à omissão só para os meios indicados', () => {
    const l = construirLancamentoVendaPOS(
      doc('1000', '160'),
      [
        { tipo: 'MPESA', valor: D('500') },
        { tipo: 'CARTAO', valor: D('400') },
        { tipo: 'DINHEIRO', valor: D('260') },
      ],
      { MPESA: '1219' },
    );
    expect(soma(l.partidas, 'DEBITO', '1219').equals(D('500'))).toBe(true);
    expect(soma(l.partidas, 'DEBITO', '121').equals(D('400'))).toBe(true);
    expect(soma(l.partidas, 'DEBITO', '111').equals(D('260'))).toBe(true);
  });

  it('sem IVA não há partida a 44331', () => {
    const l = construirLancamentoVendaPOS(doc('250', '0'), [{ tipo: 'CARTAO', valor: D('250') }]);
    expect(l.partidas.some((p) => p.contaCodigo === '44331')).toBe(false);
    expect(soma(l.partidas, 'CREDITO', '711').equals(D('250'))).toBe(true);
    expect(soma(l.partidas, 'DEBITO').equals(D('250'))).toBe(true);
  });

  it('Σ pagamentos ≠ total → BusinessRuleError PAGAMENTOS_NAO_BATEM_TOTAL (a menos e a mais)', () => {
    for (const valor of ['1159.99', '1160.01', '0.01']) {
      let erro: unknown;
      try {
        construirLancamentoVendaPOS(doc('1000', '160'), [{ tipo: 'DINHEIRO', valor: D(valor) }]);
      } catch (e) {
        erro = e;
      }
      expect(erro, `pagamento de ${valor}`).toBeInstanceOf(BusinessRuleError);
      expect((erro as BusinessRuleError).code).toBe('PAGAMENTOS_NAO_BATEM_TOTAL');
    }
  });
});

describe('construirLancamentoVendaPOS — propriedades', () => {
  const METODOS: MetodoPagamentoTipo[] = ['DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'MPESA', 'EMOLA', 'CREDITO'];

  /** Documento em cêntimos + partição do total em 1..5 pagamentos positivos com meios arbitrários. */
  const arbCaso = fc
    .record({
      subCent: fc.integer({ min: 1, max: 100_000_000 }),
      ivaCent: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 20_000_000 })),
      cortes: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 0, maxLength: 4 }),
      meios: fc.array(fc.constantFrom(...METODOS), { minLength: 5, maxLength: 5 }),
    })
    .map(({ subCent, ivaCent, cortes, meios }) => {
      const totalCent = subCent + ivaCent;
      const pontos = [...new Set(cortes.map((c) => Math.floor(c * totalCent)).filter((p) => p > 0 && p < totalCent))].sort(
        (a, b) => a - b,
      );
      const limites = [0, ...pontos, totalCent];
      const partes = limites.slice(1).map((v, k) => v - limites[k]);
      const pagamentos = partes.map((c, k) => ({ tipo: meios[k], valor: D(c).div(100) }));
      return { doc: doc(D(subCent).div(100).toString(), D(ivaCent).div(100).toString()), pagamentos };
    });

  it('Σ débitos = Σ créditos = total; débito por conta = Σ pagamentos do meio; 711 = subtotal; 44331 = IVA', () => {
    fc.assert(
      fc.property(arbCaso, ({ doc: d, pagamentos }) => {
        const l = construirLancamentoVendaPOS(d, pagamentos);
        const debitos = soma(l.partidas, 'DEBITO');
        const creditos = soma(l.partidas, 'CREDITO');
        expect(debitos.equals(creditos)).toBe(true);
        expect(debitos.equals(d.total)).toBe(true);

        expect(l.partidas.filter((p) => p.tipo === 'DEBITO')).toHaveLength(pagamentos.length);
        for (const conta of new Set(Object.values(CONTA_OMISSAO))) {
          const esperado = pagamentos
            .filter((p) => CONTA_OMISSAO[p.tipo] === conta)
            .reduce((a, p) => a.plus(p.valor), ZERO);
          expect(soma(l.partidas, 'DEBITO', conta).equals(esperado)).toBe(true);
        }

        expect(soma(l.partidas, 'CREDITO', '711').equals(d.subtotal)).toBe(true);
        expect(soma(l.partidas, 'CREDITO', '44331').equals(d.ivaTotal)).toBe(true);
        expect(l.partidas.some((p) => p.contaCodigo === '44331')).toBe(d.ivaTotal.greaterThan(0));
        // Nenhuma partida a zero nem negativa.
        expect(l.partidas.every((p) => D(p.valor).greaterThan(0))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('qualquer desvio de Σ pagamentos face ao total (≥ 1 cêntimo) lança PAGAMENTOS_NAO_BATEM_TOTAL', () => {
    fc.assert(
      fc.property(
        arbCaso,
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.boolean(),
        ({ doc: d, pagamentos }, desvioCent, aMais) => {
          const ultimo = pagamentos[pagamentos.length - 1];
          const novo = aMais ? ultimo.valor.plus(D(desvioCent).div(100)) : ultimo.valor.minus(D(desvioCent).div(100));
          fc.pre(novo.greaterThan(0));
          const errados = [...pagamentos.slice(0, -1), { tipo: ultimo.tipo, valor: novo }];
          let erro: unknown;
          try {
            construirLancamentoVendaPOS(d, errados);
          } catch (e) {
            erro = e;
          }
          expect(erro).toBeInstanceOf(BusinessRuleError);
          expect((erro as BusinessRuleError).code).toBe('PAGAMENTOS_NAO_BATEM_TOTAL');
        },
      ),
      { numRuns: 300 },
    );
  });
});
