import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  TRANSICOES_RECONCILIACAO,
  transitarReconciliacao,
  sinalItem,
  calcularAjusteConciliado,
  calcularDiferencaNaoConciliada,
  sugerirMatchesPuro,
  type ItemParaCalculo,
  type ItemParaMatch,
} from '../reconciliacao.helpers';
import type { StatusReconciliacao } from '../contabilidade.interface';

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------

describe('TRANSICOES_RECONCILIACAO', () => {
  const estados: StatusReconciliacao[] = ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'];

  it('cobre todos os estados e destinos existem', () => {
    for (const e of estados) expect(TRANSICOES_RECONCILIACAO).toHaveProperty(e);
    for (const destinos of Object.values(TRANSICOES_RECONCILIACAO)) {
      for (const d of destinos) expect(estados).toContain(d);
    }
  });

  it('EM_ANDAMENTO → CONCLUIDA e CANCELADA são permitidas', () => {
    expect(() => transitarReconciliacao('EM_ANDAMENTO', 'CONCLUIDA')).not.toThrow();
    expect(() => transitarReconciliacao('EM_ANDAMENTO', 'CANCELADA')).not.toThrow();
  });

  it('property: CONCLUIDA e CANCELADA são terminais — nenhuma transição sai delas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<StatusReconciliacao>('CONCLUIDA', 'CANCELADA'),
        fc.constantFrom<StatusReconciliacao>(...estados),
        (terminal, alvo) => {
          expect(() => transitarReconciliacao(terminal, alvo)).toThrow(/Transição inválida/);
        },
      ),
    );
  });

  it('erro tem code TRANSICAO_INVALIDA', () => {
    try {
      transitarReconciliacao('CONCLUIDA', 'EM_ANDAMENTO');
      expect.fail('deveria lançar');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('TRANSICAO_INVALIDA');
    }
  });
});

// ---------------------------------------------------------------------------
// Invariante de balanceamento
// ---------------------------------------------------------------------------

const arbValor = fc
  .integer({ min: 1, max: 10_000_000 })
  .map((c) => new Prisma.Decimal(c).div(100)); // cêntimos → Decimal exacto 2 casas

const arbItem: fc.Arbitrary<ItemParaCalculo> = fc.record({
  tipo: fc.constantFrom('LANCAMENTO_CONTABIL', 'EXTRATO_BANCARIO'),
  tipoMovimento: fc.constantFrom<'DEBITO' | 'CREDITO'>('DEBITO', 'CREDITO'),
  valor: arbValor,
  conciliado: fc.boolean(),
});

describe('invariante de balanceamento (property)', () => {
  it('sinalItem: par razão↔extracto com mesmo valor/tipoMovimento soma zero', () => {
    fc.assert(
      fc.property(arbValor, fc.constantFrom<'DEBITO' | 'CREDITO'>('DEBITO', 'CREDITO'), (valor, mov) => {
        const par: ItemParaCalculo[] = [
          { tipo: 'EXTRATO_BANCARIO', tipoMovimento: mov, valor, conciliado: true },
          { tipo: 'LANCAMENTO_CONTABIL', tipoMovimento: mov, valor, conciliado: true },
        ];
        expect(calcularAjusteConciliado(par).isZero()).toBe(true);
      }),
    );
  });

  it('diferenca = (saldoBanco − saldoContabil) − Σ(sinal·valor dos conciliados)', () => {
    fc.assert(
      fc.property(arbValor, arbValor, fc.array(arbItem, { maxLength: 40 }), (banco, contabil, itens) => {
        const diferenca = calcularDiferencaNaoConciliada(banco, contabil, itens);
        let esperado = banco.minus(contabil);
        for (const i of itens) {
          if (!i.conciliado) continue;
          esperado = sinalItem(i) === 1 ? esperado.minus(i.valor) : esperado.plus(i.valor);
        }
        expect(diferenca.equals(esperado)).toBe(true);
      }),
    );
  });

  it('itens não conciliados nunca alteram a diferença', () => {
    fc.assert(
      fc.property(arbValor, arbValor, fc.array(arbItem, { maxLength: 40 }), (banco, contabil, itens) => {
        const naoConciliados = itens.map((i) => ({ ...i, conciliado: false }));
        const diferenca = calcularDiferencaNaoConciliada(banco, contabil, naoConciliados);
        expect(diferenca.equals(banco.minus(contabil))).toBe(true);
      }),
    );
  });

  it('conciliar/desconciliar é reversível: voltar ao estado inicial repõe a diferença', () => {
    fc.assert(
      fc.property(arbValor, arbValor, fc.array(arbItem, { maxLength: 20 }), fc.nat(19), (banco, contabil, itens, idx) => {
        fc.pre(itens.length > 0);
        const i = idx % itens.length;
        const antes = calcularDiferencaNaoConciliada(banco, contabil, itens);
        const alterado = itens.map((item, j) => (j === i ? { ...item, conciliado: !item.conciliado } : item));
        const revertido = alterado.map((item, j) => (j === i ? { ...item, conciliado: !item.conciliado } : item));
        const depois = calcularDiferencaNaoConciliada(banco, contabil, revertido);
        expect(depois.equals(antes)).toBe(true);
      }),
    );
  });

  it('cenário clássico: diferença explicada na totalidade → zero', () => {
    // Banco tem 1000; contabilidade tem 900. Diferença bruta = 100.
    // Extracto tem um crédito bancário de 100 (taxa) ainda não lançado?
    // Não: um DEBITO de 100 no extracto (entrada no banco não registada no razão).
    const itens: ItemParaCalculo[] = [
      { tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'DEBITO', valor: new Prisma.Decimal('100.00'), conciliado: true },
    ];
    const dif = calcularDiferencaNaoConciliada(
      new Prisma.Decimal('1000.00'),
      new Prisma.Decimal('900.00'),
      itens,
    );
    expect(dif.isZero()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Auto-match
// ---------------------------------------------------------------------------

const arbData = fc
  .integer({ min: 0, max: 60 })
  .map((d) => new Date(Date.UTC(2026, 0, 1 + d)));

let seq = 0;
const arbItemMatch: fc.Arbitrary<ItemParaMatch> = fc
  .record({
    tipo: fc.constantFrom('LANCAMENTO_CONTABIL', 'EXTRATO_BANCARIO'),
    tipoMovimento: fc.constantFrom<'DEBITO' | 'CREDITO'>('DEBITO', 'CREDITO'),
    valor: fc.integer({ min: 1, max: 500 }).map((c) => new Prisma.Decimal(c)),
    data: arbData,
    conciliado: fc.boolean(),
  })
  .map((r) => ({ ...r, id: `item-${seq++}` }));

describe('sugerirMatchesPuro (property)', () => {
  it('todas as sugestões são pares válidos e nenhum item entra em dois pares', () => {
    fc.assert(
      fc.property(fc.array(arbItemMatch, { maxLength: 60 }), fc.integer({ min: 0, max: 10 }), (itens, janela) => {
        const sugestoes = sugerirMatchesPuro(itens, janela);
        const porId = new Map(itens.map((i) => [i.id, i]));
        const usados = new Set<string>();
        for (const s of sugestoes) {
          const razao = porId.get(s.itemRazaoId)!;
          const extrato = porId.get(s.itemExtratoId)!;
          // lados correctos
          expect(razao.tipo).toBe('LANCAMENTO_CONTABIL');
          expect(extrato.tipo).toBe('EXTRATO_BANCARIO');
          // não conciliados
          expect(razao.conciliado).toBe(false);
          expect(extrato.conciliado).toBe(false);
          // igualdade de valor + tipoMovimento
          expect(razao.valor.equals(extrato.valor)).toBe(true);
          expect(razao.tipoMovimento).toBe(extrato.tipoMovimento);
          // janela de dias
          const dias = Math.abs(extrato.data.getTime() - razao.data.getTime()) / 86_400_000;
          expect(dias).toBeLessThanOrEqual(janela);
          // sem repetição
          expect(usados.has(s.itemRazaoId)).toBe(false);
          expect(usados.has(s.itemExtratoId)).toBe(false);
          usados.add(s.itemRazaoId);
          usados.add(s.itemExtratoId);
        }
      }),
    );
  });

  it('par exacto na mesma data é sempre sugerido', () => {
    const data = new Date('2026-03-10');
    const itens: ItemParaMatch[] = [
      { id: 'r1', tipo: 'LANCAMENTO_CONTABIL', tipoMovimento: 'DEBITO', valor: new Prisma.Decimal('250.00'), data, conciliado: false },
      { id: 'e1', tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'DEBITO', valor: new Prisma.Decimal('250.00'), data, conciliado: false },
    ];
    const s = sugerirMatchesPuro(itens, 0);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ itemRazaoId: 'r1', itemExtratoId: 'e1', diasDiferenca: 0 });
  });

  it('fora da janela de dias não sugere', () => {
    const itens: ItemParaMatch[] = [
      { id: 'r1', tipo: 'LANCAMENTO_CONTABIL', tipoMovimento: 'CREDITO', valor: new Prisma.Decimal('99.99'), data: new Date('2026-03-01'), conciliado: false },
      { id: 'e1', tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'CREDITO', valor: new Prisma.Decimal('99.99'), data: new Date('2026-03-20'), conciliado: false },
    ];
    expect(sugerirMatchesPuro(itens, 3)).toHaveLength(0);
  });

  it('prefere o extracto mais próximo em data', () => {
    const itens: ItemParaMatch[] = [
      { id: 'r1', tipo: 'LANCAMENTO_CONTABIL', tipoMovimento: 'DEBITO', valor: new Prisma.Decimal('10'), data: new Date('2026-03-10'), conciliado: false },
      { id: 'e-longe', tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'DEBITO', valor: new Prisma.Decimal('10'), data: new Date('2026-03-13'), conciliado: false },
      { id: 'e-perto', tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'DEBITO', valor: new Prisma.Decimal('10'), data: new Date('2026-03-11'), conciliado: false },
    ];
    const s = sugerirMatchesPuro(itens, 5);
    expect(s).toHaveLength(1);
    expect(s[0].itemExtratoId).toBe('e-perto');
  });
});
