/**
 * Oráculo #128 — pagamentos múltiplos no terminal POS (lógica pura, client-safe).
 *
 * O servidor já aceita vários pagamentos por venda, desde que Σ valor = total ao cêntimo
 * (`vendaService.criar` → PAGAMENTOS_NAO_BATEM_TOTAL; o total vem de `calcularTotaisVendaPOS`).
 * Faltava ao terminal a regra que transforma o que o operador escreveu — uma lista de
 * (meio, valor recebido) — nos `pagamentos` que o servidor aceita, e que recusa submeter
 * enquanto a lista não cobre o total. Esta regra é PURA e vive num módulo client-safe,
 * porque o terminal (browser) é quem a usa:
 *
 *   `@/lib/pos-pagamentos` exporta
 *     resolverPagamentosPOS(
 *       total: number | string | Prisma.Decimal,
 *       entradas: Array<{ tipo: MetodoPagamentoTipo; valor: number | string }>,
 *     ):
 *       | { ok: true;  pagamentos: Array<{ tipo; valor: number; troco?: number }>; troco: number }
 *       | { ok: false; motivo: 'SEM_PAGAMENTOS' | 'VALOR_INVALIDO' | 'EM_FALTA' | 'EXCESSO_SEM_DINHEIRO';
 *                    emFalta: number }
 *
 * Contrato (decisão do orquestrador, #128):
 *   - `valor` de cada entrada é o que o operador recebeu nesse meio. Aceita `number` ou texto
 *     com vírgula ou ponto decimal ("85,60"). Vazio, não numérico, ≤ 0 ou com mais de 2 casas
 *     → VALOR_INVALIDO (recusar > inventar cêntimos).
 *   - Lista vazia → SEM_PAGAMENTOS.
 *   - Σ entradas < total → EM_FALTA, com `emFalta` = total − Σ (ao cêntimo).
 *   - Σ entradas > total → o excesso é TROCO, e troco só em dinheiro: aceite só se o excesso
 *     não ultrapassar o que entrou em DINHEIRO; o troco fica na(s) linha(s) DINHEIRO e o
 *     `valor` delas desce na mesma medida. Excesso sem dinheiro que o cubra →
 *     EXCESSO_SEM_DINHEIRO (o cartão/M-Pesa não dá troco).
 *   - Aceite ⇒ Σ pagamentos.valor = total EXACTAMENTE (Decimal), cada valor > 0 com ≤ 2 casas,
 *     `troco` só em linhas DINHEIRO, Σ troco das linhas = `troco` do resultado.
 *   - Aritmética em Decimal: 0,10 + 0,20 cobre 0,30.
 *
 * Fase vermelha: o módulo ainda não existe. O import é dinâmico e por caminho em variável,
 * para que falhe CADA caso (comportamento em falta) e não o ficheiro.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';

type Entrada = { tipo: string; valor: number | string };
type Pagamento = { tipo: string; valor: number; troco?: number };
type Resolucao =
  | { ok: true; pagamentos: Pagamento[]; troco: number }
  | { ok: false; motivo: string; emFalta: number };

const MODULO = '@/lib/pos-pagamentos';

async function resolver(total: number | string | Prisma.Decimal, entradas: Entrada[]): Promise<Resolucao> {
  const mod: any = await import(/* @vite-ignore */ MODULO);
  expect(typeof mod.resolverPagamentosPOS, 'resolverPagamentosPOS exportada por @/lib/pos-pagamentos').toBe('function');
  return mod.resolverPagamentosPOS(total, entradas);
}

const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(String(v));
const soma = (xs: Array<number | undefined>) => xs.reduce<Prisma.Decimal>((a, v) => a.plus(D(v ?? 0)), D(0));
const duasCasas = (v: number) => D(v).decimalPlaces() <= 2;

/** Invariantes de qualquer resolução aceite. */
function esperarAceiteCoerente(r: Resolucao, total: number | string | Prisma.Decimal) {
  expect(r.ok, `esperava aceite, veio ${JSON.stringify(r)}`).toBe(true);
  if (!r.ok) return;
  expect(r.pagamentos.length).toBeGreaterThan(0);
  expect(soma(r.pagamentos.map((p) => p.valor)).equals(D(total)), 'Σ pagamentos.valor = total ao cêntimo').toBe(true);
  for (const p of r.pagamentos) {
    expect(p.valor, `valor positivo em ${p.tipo}`).toBeGreaterThan(0);
    expect(duasCasas(p.valor), `valor com ≤ 2 casas: ${p.valor}`).toBe(true);
    if (p.troco !== undefined && p.troco !== 0) {
      expect(p.tipo, 'troco só em dinheiro').toBe('DINHEIRO');
      expect(p.troco).toBeGreaterThan(0);
    }
  }
  expect(soma(r.pagamentos.map((p) => p.troco)).equals(D(r.troco)), 'Σ troco das linhas = troco').toBe(true);
}

function esperarRecusa(r: Resolucao, motivo: string) {
  expect(r.ok, `esperava recusa ${motivo}, veio ${JSON.stringify(r)}`).toBe(false);
  if (r.ok) return;
  expect(r.motivo).toBe(motivo);
}

// 1 × 160 @16 % → 185,60 (Tomada Schuko do seed demo)
const TOTAL = 185.6;

describe('#128 resolverPagamentosPOS — lista de pagamentos do terminal', () => {
  it('um só pagamento exacto (cartão) é aceite tal como está, sem troco', async () => {
    const r = await resolver(TOTAL, [{ tipo: 'CARTAO', valor: 185.6 }]);
    esperarAceiteCoerente(r, TOTAL);
    if (!r.ok) return;
    expect(r.pagamentos).toEqual([expect.objectContaining({ tipo: 'CARTAO', valor: 185.6 })]);
    expect(r.troco).toBe(0);
  });

  it('dinheiro recebido acima do total: aceite, a linha vale o total e leva o troco', async () => {
    const r = await resolver(TOTAL, [{ tipo: 'DINHEIRO', valor: 200 }]);
    esperarAceiteCoerente(r, TOTAL);
    if (!r.ok) return;
    expect(r.troco).toBe(14.4);
    expect(r.pagamentos).toEqual([{ tipo: 'DINHEIRO', valor: 185.6, troco: 14.4 }]);
  });

  it('pagamento misto cartão + dinheiro com troco: o cartão fica intacto, o dinheiro desce o troco', async () => {
    const r = await resolver(TOTAL, [
      { tipo: 'CARTAO', valor: 100 },
      { tipo: 'DINHEIRO', valor: 100 },
    ]);
    esperarAceiteCoerente(r, TOTAL);
    if (!r.ok) return;
    expect(r.troco).toBe(14.4);
    const cartao = r.pagamentos.filter((p) => p.tipo === 'CARTAO');
    const dinheiro = r.pagamentos.filter((p) => p.tipo === 'DINHEIRO');
    expect(cartao).toEqual([expect.objectContaining({ valor: 100 })]);
    expect(cartao[0].troco ?? 0).toBe(0);
    expect(dinheiro).toEqual([{ tipo: 'DINHEIRO', valor: 85.6, troco: 14.4 }]);
  });

  it('três meios electrónicos que somam o total exacto: aceites, sem troco', async () => {
    const r = await resolver(TOTAL, [
      { tipo: 'MPESA', valor: 50 },
      { tipo: 'EMOLA', valor: 35.6 },
      { tipo: 'TRANSFERENCIA', valor: 100 },
    ]);
    esperarAceiteCoerente(r, TOTAL);
    if (!r.ok) return;
    expect(r.troco).toBe(0);
    expect(r.pagamentos.map((p) => [p.tipo, p.valor])).toEqual([
      ['MPESA', 50],
      ['EMOLA', 35.6],
      ['TRANSFERENCIA', 100],
    ]);
  });

  it('parte a crédito + parte a dinheiro exacta: aceite (o servidor exige o cliente, não esta regra)', async () => {
    const r = await resolver(TOTAL, [
      { tipo: 'DINHEIRO', valor: 85.6 },
      { tipo: 'CREDITO', valor: 100 },
    ]);
    esperarAceiteCoerente(r, TOTAL);
  });

  it('Σ abaixo do total: recusa EM_FALTA e diz quanto falta, ao cêntimo', async () => {
    const r = await resolver(TOTAL, [
      { tipo: 'CARTAO', valor: 100 },
      { tipo: 'MPESA', valor: 30 },
    ]);
    esperarRecusa(r, 'EM_FALTA');
    if (r.ok) return;
    expect(r.emFalta).toBe(55.6);
  });

  it('dinheiro abaixo do total (valor recebido insuficiente): recusa EM_FALTA', async () => {
    const r = await resolver(TOTAL, [{ tipo: 'DINHEIRO', valor: 150 }]);
    esperarRecusa(r, 'EM_FALTA');
    if (r.ok) return;
    expect(r.emFalta).toBe(35.6);
  });

  it('troco só em dinheiro: cartão acima do total é recusado', async () => {
    esperarRecusa(await resolver(TOTAL, [{ tipo: 'CARTAO', valor: 200 }]), 'EXCESSO_SEM_DINHEIRO');
    esperarRecusa(await resolver(TOTAL, [{ tipo: 'MPESA', valor: 185.61 }]), 'EXCESSO_SEM_DINHEIRO');
  });

  it('excesso maior do que o dinheiro entregue é recusado (o troco não sai do cartão)', async () => {
    // excesso 34,40 > 10 em dinheiro
    const r = await resolver(TOTAL, [
      { tipo: 'CARTAO', valor: 210 },
      { tipo: 'DINHEIRO', valor: 10 },
    ]);
    esperarRecusa(r, 'EXCESSO_SEM_DINHEIRO');
  });

  it('lista vazia: recusa SEM_PAGAMENTOS', async () => {
    esperarRecusa(await resolver(TOTAL, []), 'SEM_PAGAMENTOS');
  });

  it.each([
    ['zero', 0],
    ['negativo', -10],
    ['vazio', ''],
    ['texto', 'abc'],
    ['NaN', Number.NaN],
    ['três casas', '185.605'],
    ['três casas (número)', 100.005],
  ])('valor inválido (%s) numa das linhas: recusa VALOR_INVALIDO, mesmo que o resto cubra o total', async (_n, valor) => {
    const r = await resolver(TOTAL, [
      { tipo: 'CARTAO', valor: 185.6 },
      { tipo: 'DINHEIRO', valor: valor as number | string },
    ]);
    esperarRecusa(r, 'VALOR_INVALIDO');
  });

  it('aceita o valor escrito como no terminal, com vírgula decimal', async () => {
    const r = await resolver(TOTAL, [
      { tipo: 'CARTAO', valor: '100,00' },
      { tipo: 'DINHEIRO', valor: '85,60' },
    ]);
    esperarAceiteCoerente(r, TOTAL);
    if (!r.ok) return;
    expect(r.troco).toBe(0);
  });

  it('aritmética em Decimal: 0,10 + 0,20 cobre exactamente 0,30', async () => {
    const r = await resolver('0.30', [
      { tipo: 'CARTAO', valor: 0.1 },
      { tipo: 'MPESA', valor: 0.2 },
    ]);
    esperarAceiteCoerente(r, '0.30');
  });

  it('aceita o total como Prisma.Decimal vindo de calcularTotaisVendaPOS (o mesmo do servidor)', async () => {
    const { total } = calcularTotaisVendaPOS([
      { quantidade: 3, precoUnitario: 33.33, desconto: 10, taxaIva: 0.16 },
      { quantidade: 1, precoUnitario: 10.03, taxaIva: 0.16 },
    ]);
    const r = await resolver(total, [
      { tipo: 'MPESA', valor: 50 },
      { tipo: 'DINHEIRO', valor: 100 },
    ]);
    esperarAceiteCoerente(r, total);
    if (!r.ok) return;
    expect(D(r.troco).equals(D(150).minus(total))).toBe(true);
  });

  it('propriedade: qualquer lista é aceite sse cobre o total e o excesso cabe no dinheiro; aceite ⇒ Σ = total', async () => {
    const mod: any = await import(/* @vite-ignore */ MODULO);
    const tipos = ['DINHEIRO', 'CARTAO', 'MPESA', 'EMOLA', 'TRANSFERENCIA'] as const;
    const centimos = fc.integer({ min: 1, max: 500_00 });
    fc.assert(
      fc.property(
        centimos,
        fc.array(fc.record({ tipo: fc.constantFrom(...tipos), c: centimos }), { minLength: 1, maxLength: 5 }),
        (totalC, linhas) => {
          const total = D(totalC).div(100);
          const entradas = linhas.map((l) => ({ tipo: l.tipo, valor: l.c / 100 }));
          const r: Resolucao = mod.resolverPagamentosPOS(total, entradas);
          const pagoC = linhas.reduce((a, l) => a + l.c, 0);
          const dinheiroC = linhas.filter((l) => l.tipo === 'DINHEIRO').reduce((a, l) => a + l.c, 0);
          const excessoC = pagoC - totalC;

          if (excessoC < 0) {
            esperarRecusa(r, 'EM_FALTA');
            if (!r.ok) expect(D(r.emFalta).equals(D(-excessoC).div(100))).toBe(true);
            return;
          }
          if (excessoC > dinheiroC) {
            esperarRecusa(r, 'EXCESSO_SEM_DINHEIRO');
            return;
          }
          // Excesso coberto pelo dinheiro. Se o dinheiro inteiro for troco (linha a 0), a
          // implementação pode descartar a linha ou recusar — mas se aceitar, é coerente.
          const algumDinheiroTodoTroco = excessoC > 0 && excessoC === dinheiroC;
          if (algumDinheiroTodoTroco && !r.ok) return;
          esperarAceiteCoerente(r, total);
          if (r.ok) {
            expect(D(r.troco).equals(D(excessoC).div(100)), 'troco = Σ − total').toBe(true);
            // Os meios que não são dinheiro passam intactos.
            const naoDinheiro = (xs: Array<{ tipo: string; valor: number }>) =>
              soma(xs.filter((x) => x.tipo !== 'DINHEIRO').map((x) => x.valor));
            expect(naoDinheiro(r.pagamentos).equals(naoDinheiro(entradas))).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
