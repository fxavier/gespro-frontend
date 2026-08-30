/**
 * Aritmética do balancete (defeito D3, ADR-0018 §6).
 *
 * A agregação passou de um `findMany` somado em JavaScript para um `groupBy`
 * em SQL — a versão antiga esgotava a heap do Node e matava a instância com
 * 250 000 partidas. A consulta mudou; a aritmética **não pode** ter mudado, e
 * não havia nada a garanti-lo. É o que este ficheiro faz.
 */
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  montarLinhasBalancete,
  type AgregadoPartida,
} from '../contabilidade.service';
import type { ContaBalancete } from '../contabilidade.interface';

type Conta = ContaBalancete['conta'];

const conta = (id: string, codigo: string, natureza: 'DEVEDORA' | 'CREDORA'): Conta =>
  ({ id, codigo, nome: `Conta ${codigo}`, tipo: 'ATIVO', natureza }) as unknown as Conta;

const agregado = (contaId: string, tipo: 'DEBITO' | 'CREDITO', valor: string | null): AgregadoPartida => ({
  contaId,
  tipo: tipo as AgregadoPartida['tipo'],
  _sum: { valor: valor === null ? null : new Prisma.Decimal(valor) },
});

const CONTAS = new Map<string, Conta>([
  ['c1', conta('c1', '1.1', 'DEVEDORA')],
  ['c2', conta('c2', '7.1', 'CREDORA')],
  ['c3', conta('c3', '2.1', 'DEVEDORA')],
]);

describe('montarLinhasBalancete', () => {
  it('soma cada lado e aplica o sinal pela natureza da conta', () => {
    const r = montarLinhasBalancete(
      [
        agregado('c1', 'DEBITO', '1000.50'),
        agregado('c1', 'CREDITO', '250.25'),
        agregado('c2', 'CREDITO', '800'),
        agregado('c2', 'DEBITO', '300'),
      ],
      CONTAS,
      false,
    );

    const devedora = r.contas.find((l) => l.conta.id === 'c1')!;
    // DEVEDORA: débitos − créditos
    expect(devedora.saldoAtual.toString()).toBe('750.25');

    const credora = r.contas.find((l) => l.conta.id === 'c2')!;
    // CREDORA: créditos − débitos
    expect(credora.saldoAtual.toString()).toBe('500');

    expect(r.totalDebitos.toString()).toBe('1300.5');
    expect(r.totalCreditos.toString()).toBe('1050.25');
  });

  it('mantém a precisão decimal — sem passar por float', () => {
    const r = montarLinhasBalancete(
      [agregado('c1', 'DEBITO', '0.1'), agregado('c3', 'DEBITO', '0.2')],
      CONTAS,
      false,
    );
    expect(r.totalDebitos.toString()).toBe('0.3'); // 0.1 + 0.2 !== 0.30000000000000004
  });

  it('exclui contas de saldo nulo quando incluirZeradas é falso, e inclui-as quando é verdadeiro', () => {
    const zerada = [agregado('c1', 'DEBITO', '0'), agregado('c1', 'CREDITO', '0')];
    expect(montarLinhasBalancete(zerada, CONTAS, false).contas).toHaveLength(0);
    expect(montarLinhasBalancete(zerada, CONTAS, true).contas).toHaveLength(1);
  });

  it('trata a soma nula do groupBy como zero em vez de rebentar', () => {
    const r = montarLinhasBalancete([agregado('c1', 'DEBITO', null)], CONTAS, true);
    expect(r.contas[0].debitos.toString()).toBe('0');
  });

  it('ignora partidas cuja conta não pertence ao tenant', () => {
    // Uma conta ausente do mapa só pode vir de outro tenant. Somá-la seria uma
    // fuga cross-tenant silenciosa; a linha é descartada.
    const r = montarLinhasBalancete([agregado('intruso', 'DEBITO', '999')], CONTAS, true);
    expect(r.contas).toHaveLength(0);
    expect(r.totalDebitos.toString()).toBe('0');
  });

  it('ordena as linhas por código de conta', () => {
    const r = montarLinhasBalancete(
      [agregado('c3', 'DEBITO', '5'), agregado('c1', 'DEBITO', '5'), agregado('c2', 'CREDITO', '5')],
      CONTAS,
      true,
    );
    expect(r.contas.map((l) => l.conta.codigo)).toEqual(['1.1', '2.1', '7.1']);
  });
});
