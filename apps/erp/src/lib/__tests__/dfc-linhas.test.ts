import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { compararSeccao } from '../dfc-linhas';
import type { LinhaRubricaDFC, SeccaoDFC, VariacaoClassificada } from '@/server/services/financas/dfc.interface';


const D = (v: string) => new Prisma.Decimal(v);

function conta(id: string, codigo: string, efeito: string): VariacaoClassificada {
  return {
    conta: { id, codigo, nome: `Conta ${codigo}`, tipo: 'ATIVO', natureza: 'DEVEDORA' } as VariacaoClassificada['conta'],
    rubricaId: 'r',
    atividade: 'OPERACIONAL',
    saldoInicial: D('0'),
    saldoFinal: D(efeito),
    variacao: D(efeito),
    efeitoCaixa: D(efeito),
  };
}

function linha(id: string, codigo: string, ordem: number, contas: VariacaoClassificada[]): LinhaRubricaDFC {
  return {
    rubrica: { id, codigo, designacao: codigo, atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem } as LinhaRubricaDFC['rubrica'],
    valor: contas.reduce((a, c) => a.plus(c.efeitoCaixa), D('0')),
    contas,
  };
}

const seccao = (rubricas: LinhaRubricaDFC[]): SeccaoDFC => ({ atividade: 'OPERACIONAL', rubricas, total: D('0') });

describe('compararSeccao', () => {
  it('sem homólogo: só N, e o lado N-1 é null', () => {
    const r = compararSeccao(seccao([linha('a', 'OP-02', 2, [conta('c1', '211', '10')])]), null);
    expect(r).toHaveLength(1);
    expect(r[0]!.n1).toBeNull();
    expect(r[0]!.contas[0]!.n1).toBeNull();
    expect(r[0]!.contas[0]!.n!.efeitoCaixa.equals(D('10'))).toBe(true);
  });

  it('une as rubricas das duas colunas, ordenadas por ordem e código, sem recalcular valores', () => {
    const n = seccao([linha('b', 'OP-03', 3, [conta('c2', '221', '-5')]), linha('a', 'OP-01', 1, [conta('c1', '211', '7')])]);
    const n1 = seccao([linha('a', 'OP-01', 1, [conta('c3', '212', '4')]), linha('z', 'OP-02', 2, [conta('c4', '241', '1')])]);
    const r = compararSeccao(n, n1);
    expect(r.map((x) => x.rubrica.codigo)).toEqual(['OP-01', 'OP-02', 'OP-03']);
    // OP-01 existe nas duas: cada lado é o `valor` do serviço.
    expect(r[0]!.n!.valor.equals(D('7'))).toBe(true);
    expect(r[0]!.n1!.valor.equals(D('4'))).toBe(true);
    // As contas são a união, por código; a que falta num lado fica null.
    expect(r[0]!.contas.map((c) => [c.conta.codigo, c.n !== null, c.n1 !== null])).toEqual([
      ['211', true, false],
      ['212', false, true],
    ]);
    // Só em N-1 / só em N.
    expect(r[1]!.n).toBeNull();
    expect(r[2]!.n1).toBeNull();
  });
});
