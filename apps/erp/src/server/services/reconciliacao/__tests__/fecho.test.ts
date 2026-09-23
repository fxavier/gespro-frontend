import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  montarMapaFecho,
  periodosSobrepoem,
  escolherRegra,
  sugerirPartidas,
  type CorrespondenciaFecho,
  type MovimentoFecho,
} from '../fecho';
import type { Natureza } from '../reconciliacao.model';

const D = (v: string | number) => new Prisma.Decimal(v);
const sinal = (n: Natureza) => (n === 'DEBITO' ? 1 : -1);
const Z = D(0);

// Dias civis como aaaammdd. Janela da conta: 20260901–20260930; período: 20260915–20260930.
const INICIO_CONTA = 20260901;
const INICIO = 20260915;
const FIM = 20260930;
const arbDiaDentro = fc.integer({ min: 1, max: 30 }).map((d) => 20260900 + d);
const arbNat = fc.constantFrom<Natureza>('DEBITO', 'CREDITO');
const arbValor = fc.integer({ min: 1, max: 100_000_000 }).map((c) => D(c).div(100));

/**
 * Um razão e um extracto inteiros, gerados JUNTOS, com os saldos calculados a
 * partir dos próprios movimentos — o oráculo não usa a fórmula que testa.
 */
const arbCenario = fc
  .record({
    saldoAberturaBanco: fc.integer({ min: -1e9, max: 1e9 }).map((c) => D(c).div(100)),
    saldoAberturaContab: fc.integer({ min: -1e9, max: 1e9 }).map((c) => D(c).div(100)),
    // pares confirmados, ambos dentro da janela (com ou sem diferença de valor)
    pares: fc.array(fc.record({ db: arbDiaDentro, dc: arbDiaDentro, n: arbNat, vb: arbValor, dif: fc.integer({ min: -500, max: 500 }) }), { maxLength: 15 }),
    // sugestões ainda não confirmadas (reservam, mas não explicam)
    sugeridos: fc.array(fc.record({ db: arbDiaDentro, dc: arbDiaDentro, n: arbNat, v: arbValor }), { maxLength: 5 }),
    // par cuja contabilidade é ANTERIOR ao início da conta (já está no saldo de abertura)
    antesDoInicio: fc.array(fc.record({ db: arbDiaDentro, n: arbNat, v: arbValor }), { maxLength: 5 }),
    // par cujo banco é POSTERIOR ao fim (ainda não está no saldo do banco)
    depoisDoFim: fc.array(fc.record({ dc: arbDiaDentro, n: arbNat, v: arbValor }), { maxLength: 5 }),
    soBanco: fc.array(fc.record({ d: arbDiaDentro, n: arbNat, v: arbValor }), { maxLength: 8 }),
    soContab: fc.array(fc.record({ d: arbDiaDentro, n: arbNat, v: arbValor }), { maxLength: 8 }),
  })
  .map((g) => {
    const bancarios: MovimentoFecho[] = [];
    const contabilisticos: MovimentoFecho[] = [];
    const correspondencias: CorrespondenciaFecho[] = [];
    let saldoContabAntes = g.saldoAberturaContab;
    let id = 0;
    const novo = () => `m${id++}`;

    g.pares.forEach((p) => {
      const c = novo();
      const vc = p.vb.plus(D(p.dif).div(100)).abs().plus(D('0.01'));
      bancarios.push({ id: novo(), dia: p.db, valor: p.vb, natureza: p.n, correspondenciaId: c });
      contabilisticos.push({ id: novo(), dia: p.dc, valor: vc, natureza: p.n, correspondenciaId: c });
      correspondencias.push({ id: c, confirmada: true, dias: [p.db, p.dc], natureza: p.n, valorBanco: p.vb, valorContabilistico: vc });
    });
    g.sugeridos.forEach((p) => {
      const c = novo();
      bancarios.push({ id: novo(), dia: p.db, valor: p.v, natureza: p.n, correspondenciaId: c });
      contabilisticos.push({ id: novo(), dia: p.dc, valor: p.v, natureza: p.n, correspondenciaId: c });
      correspondencias.push({ id: c, confirmada: false, dias: [p.db, p.dc], natureza: p.n, valorBanco: p.v, valorContabilistico: p.v });
    });
    g.antesDoInicio.forEach((p) => {
      const c = novo();
      saldoContabAntes = saldoContabAntes.plus(p.v.times(sinal(p.n)));
      bancarios.push({ id: novo(), dia: p.db, valor: p.v, natureza: p.n, correspondenciaId: c });
      correspondencias.push({ id: c, confirmada: true, dias: [p.db, 20260820], natureza: p.n, valorBanco: p.v, valorContabilistico: p.v });
    });
    g.depoisDoFim.forEach((p) => {
      const c = novo();
      contabilisticos.push({ id: novo(), dia: p.dc, valor: p.v, natureza: p.n, correspondenciaId: c });
      correspondencias.push({ id: c, confirmada: true, dias: [20261003, p.dc], natureza: p.n, valorBanco: p.v, valorContabilistico: p.v });
    });
    g.soBanco.forEach((p) => bancarios.push({ id: novo(), dia: p.d, valor: p.v, natureza: p.n, correspondenciaId: null }));
    g.soContab.forEach((p) => contabilisticos.push({ id: novo(), dia: p.d, valor: p.v, natureza: p.n, correspondenciaId: null }));

    const soma = (ms: MovimentoFecho[]) => ms.reduce((a, m) => a.plus(m.valor.times(sinal(m.natureza))), Z);
    return {
      input: {
        inicioConta: INICIO_CONTA,
        inicio: INICIO,
        fim: FIM,
        saldoInicialBancoAbertura: g.saldoAberturaBanco,
        saldoContabilAntesAbertura: saldoContabAntes,
        saldoFinalBanco: g.saldoAberturaBanco.plus(soma(bancarios)),
        saldoFinalContabil: saldoContabAntes.plus(soma(contabilisticos)),
        bancarios,
        contabilisticos,
        correspondencias,
      },
      g,
    };
  });

describe('montarMapaFecho — RF §16', () => {
  it('INVARIANTE: com tudo o que está no sistema explicado, a diferença residual é exactamente zero', () => {
    fc.assert(
      fc.property(arbCenario, ({ input }) => {
        const m = montarMapaFecho(input);
        expect(m.diferencaResidual.isZero(), `residual ${m.diferencaResidual}`).toBe(true);
        expect(m.saldoReconciliado.equals(input.saldoFinalContabil)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('um movimento que o sistema não conhece aparece, inteiro, na diferença residual', () => {
    fc.assert(
      fc.property(arbCenario, arbValor, arbNat, ({ input }, v, n) => {
        // O banco tem um movimento que nunca foi importado: está no saldo, não nas listas.
        const m = montarMapaFecho({ ...input, saldoFinalBanco: input.saldoFinalBanco.plus(v.times(sinal(n))) });
        expect(m.diferencaResidual.equals(v.times(sinal(n)))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('só correspondências CONFIRMADAS com todas as linhas na janela contam como reconciliadas', () => {
    const c = (confirmada: boolean, dias: number[]): CorrespondenciaFecho => ({
      id: 'c', confirmada, dias, natureza: 'DEBITO', valorBanco: D(100), valorContabilistico: D(100),
    });
    const base = {
      inicioConta: INICIO_CONTA, inicio: INICIO, fim: FIM,
      saldoInicialBancoAbertura: Z, saldoContabilAntesAbertura: Z, saldoFinalBanco: D(100), saldoFinalContabil: D(100),
      bancarios: [{ id: 'b', dia: 20260920, valor: D(100), natureza: 'DEBITO' as const, correspondenciaId: 'c' }],
      contabilisticos: [{ id: 'k', dia: 20260918, valor: D(100), natureza: 'DEBITO' as const, correspondenciaId: 'c' }],
    };
    expect(montarMapaFecho({ ...base, correspondencias: [c(true, [20260920, 20260918])] }).totalReconciliados).toBe(2);
    const sugerida = montarMapaFecho({ ...base, correspondencias: [c(false, [20260920, 20260918])] });
    expect(sugerida.totalReconciliados).toBe(0);
    expect(sugerida.valorEmTransito.equals(D(100))).toBe(true);
    expect(sugerida.valorBancoSemContabilizacao.equals(D(100))).toBe(true);
    expect(sugerida.diferencaResidual.isZero()).toBe(true);
  });

  it('diferença de valor aceite entra em valorDiferencas, com sinal pela natureza', () => {
    const m = montarMapaFecho({
      inicioConta: INICIO_CONTA, inicio: INICIO, fim: FIM,
      saldoInicialBancoAbertura: Z, saldoContabilAntesAbertura: Z,
      saldoFinalBanco: D(-100500), saldoFinalContabil: D(-100000),
      bancarios: [{ id: 'b', dia: 20260920, valor: D(100500), natureza: 'CREDITO', correspondenciaId: 'c' }],
      contabilisticos: [{ id: 'k', dia: 20260918, valor: D(100000), natureza: 'CREDITO', correspondenciaId: 'c' }],
      correspondencias: [{ id: 'c', confirmada: true, dias: [20260920, 20260918], natureza: 'CREDITO', valorBanco: D(100500), valorContabilistico: D(100000) }],
    });
    expect(m.valorDiferencas.equals(D(-500))).toBe(true);
    expect(m.diferencaResidual.isZero()).toBe(true);
  });

  it('totais de movimentos contam só o período; a janela de ajustes começa no início da conta', () => {
    const m = montarMapaFecho({
      inicioConta: INICIO_CONTA, inicio: INICIO, fim: FIM,
      saldoInicialBancoAbertura: Z, saldoContabilAntesAbertura: Z, saldoFinalBanco: D(30), saldoFinalContabil: Z,
      bancarios: [
        { id: 'antes', dia: 20260905, valor: D(10), natureza: 'DEBITO', correspondenciaId: null },
        { id: 'dentro', dia: 20260920, valor: D(20), natureza: 'DEBITO', correspondenciaId: null },
      ],
      contabilisticos: [],
      correspondencias: [],
    });
    expect(m.totalMovimentosBanco).toBe(1);
    expect(m.valorBancoSemContabilizacao.equals(D(30))).toBe(true); // o de dia 5 continua por explicar
  });
});

describe('periodosSobrepoem', () => {
  it('é simétrica e verdadeira sse os intervalos fechados se tocam', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 30 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 30 }), (a, la, b, lb) => {
        const p = { inicio: a, fim: a + la };
        const q = { inicio: b, fim: b + lb };
        const tocam = [...Array(la + 1).keys()].some((i) => a + i >= b && a + i <= b + lb);
        expect(periodosSobrepoem(p, q)).toBe(tocam);
        expect(periodosSobrepoem(q, p)).toBe(tocam);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('sugestão de lançamento — RF §9', () => {
  const regras = [
    { id: 'r-juros', contaBancariaId: null, padrao: 'JUROS', natureza: 'DEBITO' as const, contaContrapartidaId: 'pgc-7911', prioridade: 50 },
    { id: 'r-conta', contaBancariaId: 'conta-2', padrao: 'COMISSAO', natureza: 'CREDITO' as const, contaContrapartidaId: 'pgc-outra', prioridade: 10 },
    { id: 'r-geral', contaBancariaId: null, padrao: 'COMISSAO|ENCARGO|TAXA', natureza: 'CREDITO' as const, contaContrapartidaId: 'pgc-6981', prioridade: 100 },
  ];

  it('escolhe a regra de menor prioridade que casa descrição (sem acentos), natureza e conta', () => {
    expect(escolherRegra({ descricao: 'Comissão bancária', natureza: 'CREDITO', contaBancariaId: 'conta-1' }, regras)?.id).toBe('r-geral');
    expect(escolherRegra({ descricao: 'COMISSÃO manutenção', natureza: 'CREDITO', contaBancariaId: 'conta-2' }, regras)?.id).toBe('r-conta');
    expect(escolherRegra({ descricao: 'Juros credores', natureza: 'DEBITO', contaBancariaId: 'conta-1' }, regras)?.id).toBe('r-juros');
    expect(escolherRegra({ descricao: 'Comissão', natureza: 'DEBITO', contaBancariaId: 'conta-1' }, regras)).toBeNull();
    expect(escolherRegra({ descricao: 'Transferência cliente', natureza: 'CREDITO', contaBancariaId: 'conta-1' }, regras)).toBeNull();
  });

  it('as partidas sugeridas estão sempre balanceadas e o lado do banco tem a natureza do movimento', () => {
    fc.assert(
      fc.property(arbValor, arbNat, (valor, natureza) => {
        const ps = sugerirPartidas({ valor, natureza }, 'pgc-banco', 'pgc-contra');
        const deb = ps.filter((p) => p.tipo === 'DEBITO').reduce((a, p) => a.plus(p.valor), Z);
        const cred = ps.filter((p) => p.tipo === 'CREDITO').reduce((a, p) => a.plus(p.valor), Z);
        expect(deb.equals(cred)).toBe(true);
        expect(ps.find((p) => p.contaId === 'pgc-banco')!.tipo).toBe(natureza);
        expect(ps.find((p) => p.contaId === 'pgc-contra')!.tipo).not.toBe(natureza);
      }),
      { numRuns: 1000 },
    );
  });
});
