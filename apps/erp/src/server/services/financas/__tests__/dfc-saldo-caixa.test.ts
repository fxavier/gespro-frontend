import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { ContaBalancete, NaturezaConta } from '../contabilidade.interface';
import type { MapaConta, RubricaResumo } from '../dfc.interface';
import { classificarVariacoes, saldoCaixaDe } from '../dfc.model';

// ---------------------------------------------------------------------------
// Teste ACESSÓRIO do nó `nucleo` (FIX volta 1, MAJOR 2 da revisão) — fora dos
// ficheiros protegidos do ticket 2. Prova que `saldoCaixaDe` (o que o serviço
// usa para `caixaInicial`/`caixaFinal`) e `efeitoCaixa` das variações CAIXA
// (o lado esquerdo de I6) usam a MESMA regra de sinal, também quando uma
// conta de caixa é CREDORA (129 Descobertos bancários). Σ `saldoAtual` tal
// qual falharia aqui: o descoberto entra com o sinal trocado.
// ---------------------------------------------------------------------------

const ZERO = new Prisma.Decimal(0);
const NUM_RUNS = 1000;

function centavos(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n).dividedBy(100);
}

const CX: RubricaResumo = { id: 'r-CX-01', codigo: 'CX-01', designacao: 'Caixa e equivalentes', atividade: 'CAIXA', sinal: 'VARIACAO', ordem: 10 };
const OP: RubricaResumo = { id: 'r-OP-01', codigo: 'OP-01', designacao: 'Clientes', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 10 };

interface ContaEspec {
  id: string;
  codigo: string;
  natureza: NaturezaConta;
  caixa: boolean;
}

const CONTAS: readonly ContaEspec[] = [
  { id: 'c-111', codigo: '111', natureza: 'DEVEDORA', caixa: true },
  { id: 'c-121', codigo: '121', natureza: 'DEVEDORA', caixa: true },
  { id: 'c-129', codigo: '129', natureza: 'CREDORA', caixa: true },
  { id: 'c-411', codigo: '411', natureza: 'DEVEDORA', caixa: false },
  { id: 'c-421', codigo: '421', natureza: 'CREDORA', caixa: false },
];

const MAPA: MapaConta = new Map(CONTAS.map((c) => [c.id, c.caixa ? CX : OP]));
const CONTAS_CAIXA: ReadonlySet<string> = new Set(CONTAS.filter((c) => c.caixa).map((c) => c.id));

/** Linha de balancete a partir de somas de débitos e créditos: `saldoAtual` pela natureza, como `montarLinhasBalancete`. */
function linha(c: ContaEspec, debitos: Prisma.Decimal, creditos: Prisma.Decimal): ContaBalancete {
  return {
    conta: { id: c.id, codigo: c.codigo, nome: `Conta ${c.codigo}`, tipo: c.natureza === 'DEVEDORA' ? 'ATIVO' : 'PASSIVO', natureza: c.natureza },
    saldoAnterior: ZERO,
    debitos,
    creditos,
    saldoAtual: c.natureza === 'DEVEDORA' ? debitos.minus(creditos) : creditos.minus(debitos),
  };
}

/** Um balancete gerado: por conta, débitos e créditos acumulados (ou ausente). */
const arbBalancete: fc.Arbitrary<ContaBalancete[]> = fc
  .array(
    fc.record({
      conta: fc.constantFrom(...CONTAS),
      debitos: fc.integer({ min: 0, max: 5_000_000_00 }),
      creditos: fc.integer({ min: 0, max: 5_000_000_00 }),
    }),
    { maxLength: CONTAS.length },
  )
  .map((linhas) => {
    const vistas = new Set<string>();
    return linhas
      .filter((l) => (vistas.has(l.conta.id) ? false : (vistas.add(l.conta.id), true)))
      .map((l) => linha(l.conta, centavos(l.debitos), centavos(l.creditos)));
  });

describe('saldoCaixaDe — o lado direito de I6 com a mesma regra de sinal do efeitoCaixa', () => {
  it('[property] saldoCaixaDe(fim) − saldoCaixaDe(ini) == Σ efeitoCaixa das variações CAIXA, com contas CREDORAS e DEVEDORAS na caixa', () => {
    fc.assert(
      fc.property(arbBalancete, arbBalancete, (inicio, fim) => {
        const { variacoes, naoMapeadas } = classificarVariacoes(inicio, fim, MAPA);
        expect(naoMapeadas).toEqual([]);
        const somaEfeitos = variacoes
          .filter((v) => v.atividade === 'CAIXA')
          .reduce((acc, v) => acc.plus(v.efeitoCaixa), ZERO);
        const delta = saldoCaixaDe(fim, CONTAS_CAIXA).minus(saldoCaixaDe(inicio, CONTAS_CAIXA));
        expect(delta.equals(somaEfeitos)).toBe(true);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('descoberto de 100 (129, CREDORA) e depósito de 100 (121, DEVEDORA) ⇒ Δcaixa 0, não +200', () => {
    const c121 = CONTAS[1];
    const c129 = CONTAS[2];
    // Um depósito de 100 financiado por um descoberto de 100: D 121 / C 129.
    const fim = [linha(c121, centavos(100_00), ZERO), linha(c129, ZERO, centavos(100_00))];
    // Σ saldoAtual tal qual daria +200 — é o defeito que este teste tranca.
    expect(fim.reduce((acc, l) => acc.plus(l.saldoAtual), ZERO).equals(centavos(200_00))).toBe(true);
    expect(saldoCaixaDe(fim, CONTAS_CAIXA).equals(ZERO)).toBe(true);
    expect(saldoCaixaDe(fim, CONTAS_CAIXA).minus(saldoCaixaDe([], CONTAS_CAIXA)).equals(ZERO)).toBe(true);
    // …e coincide com o que classificarVariacoes diz das duas contas CAIXA.
    const { variacoes } = classificarVariacoes([], fim, MAPA);
    const somaEfeitos = variacoes.filter((v) => v.atividade === 'CAIXA').reduce((acc, v) => acc.plus(v.efeitoCaixa), ZERO);
    expect(somaEfeitos.equals(ZERO)).toBe(true);
  });

  it('só olha para as contas do conjunto: uma conta fora de contasCaixa não pesa, mesmo que esteja no balancete', () => {
    const fim = [linha(CONTAS[0], centavos(50_00), ZERO), linha(CONTAS[3], centavos(999_00), ZERO)];
    expect(saldoCaixaDe(fim, CONTAS_CAIXA).equals(centavos(50_00))).toBe(true);
    expect(saldoCaixaDe(fim, new Set()).equals(ZERO)).toBe(true);
  });
});
