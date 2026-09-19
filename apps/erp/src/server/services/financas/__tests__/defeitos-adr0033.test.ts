/**
 * Testes para os achados A, B e C do ADR-0033 (correcções pré-requisito
 * do exercício contabilístico).
 *
 * Achado A — o estorno inverte o balancete em vez de o zerar
 * Achado B — o filtro usado nas quatro funções dos mapas contabilísticos
 *   (obterContaDetalhe, gerarBalancete, razaoConta, gerarDRE) exclui RASCUNHO
 *   e não exclui ESTORNADO — verificado sobre o argumento real entregue ao
 *   Prisma, não sobre a identidade da constante exportada.
 * Achado C — a DRE devolve zero em todas as linhas de gasto (prefixos com
 *   ponto contra códigos PGC sem ponto); e duplo cômputo latente em classe 78
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  montarLinhasBalancete,
  calcularLinhasDRE,
  type AgregadoPartida,
} from '../contabilidade.service';
import type { ContaBalancete } from '../contabilidade.interface';

// ---------------------------------------------------------------------------
// Dobro do Prisma (padrão vi.hoisted — seguir audit.service.test.ts)
// O vi.mock é içado pelo vitest antes de qualquer importação; a ordem abaixo
// é apenas por legibilidade.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  contaPGCFindFirst: vi.fn(),
  contaPGCFindMany: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prisma: {
    partidaLancamento: {
      groupBy: mocks.groupBy,
      findMany: mocks.findMany,
      count: mocks.count,
    },
    contaPGC: {
      findFirst: mocks.contaPGCFindFirst,
      findMany: mocks.contaPGCFindMany,
    },
  },
  prismaBase: {},
}));

import {
  obterContaDetalhe,
  gerarBalancete,
  razaoConta,
  gerarDRE,
} from '../contabilidade.service';

// ---------------------------------------------------------------------------
// Fixtures partilhadas
// ---------------------------------------------------------------------------

type ContaB = ContaBalancete['conta'];
type ContaDRE = { id: string; codigo: string; natureza: 'DEVEDORA' | 'CREDORA' };

const contaB = (id: string, codigo: string, natureza: 'DEVEDORA' | 'CREDORA'): ContaB =>
  ({ id, codigo, nome: `Conta ${codigo}`, tipo: 'ATIVO', natureza }) as unknown as ContaB;

const contaD = (id: string, codigo: string, natureza: 'DEVEDORA' | 'CREDORA'): ContaDRE =>
  ({ id, codigo, natureza });

const agr = (contaId: string, tipo: 'DEBITO' | 'CREDITO', valor: string | null): AgregadoPartida => ({
  contaId,
  tipo: tipo as AgregadoPartida['tipo'],
  _sum: { valor: valor === null ? null : new Prisma.Decimal(valor) },
});

const CTX = { tenantId: 'tenant-test', userId: 'user-test' };
const DATA_INICIO = new Date('2025-01-01');
const DATA_FIM = new Date('2025-12-31');

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Achado A — estorno deve zerar o saldo, não invertê-lo
// ---------------------------------------------------------------------------

describe('Achado A — estorno zera o balancete (ADR-0033)', () => {
  it('par original (débito) + estorno (crédito) resulta em saldo zero — prova aritmética', () => {
    // montarLinhasBalancete é aritmética pura e estava sempre correcta.
    // O defeito vivia no where da consulta que decidia que agregados chegavam
    // aqui; este teste documenta que, dados os dois lados simétricos, o saldo
    // é zero — o que a correcção do filtro passou a garantir.
    const CONTAS = new Map<string, ContaB>([['cX', contaB('cX', '311', 'DEVEDORA')]]);
    const r = montarLinhasBalancete(
      [
        agr('cX', 'DEBITO', '1000'),  // partida do lançamento original (ESTORNADO)
        agr('cX', 'CREDITO', '1000'), // partida do estorno (LANCADO, lado inverso)
      ],
      CONTAS,
      true, // incluirZeradas para ver a conta mesmo com saldo zero
    );
    expect(r.contas).toHaveLength(1);
    // DEVEDORA: saldo = débitos − créditos = 1000 − 1000 = 0
    expect(r.contas[0].saldoAtual.toString()).toBe('0');
    expect(r.totalDebitos.toString()).toBe('1000');
    expect(r.totalCreditos.toString()).toBe('1000');
  });

  it('gerarBalancete: Prisma a devolver par original+estorno produz saldo zero na conta', async () => {
    // Testa o caminho completo (não apenas a aritmética): gerarBalancete chama
    // prisma.partidaLancamento.groupBy — o dobro devolve o par simétrico tal
    // como a BD o devolve quando o filtro inclui ESTORNADO.
    mocks.groupBy.mockResolvedValue([
      { contaId: 'c311', tipo: 'DEBITO',  _sum: { valor: new Prisma.Decimal('1000') } },
      { contaId: 'c311', tipo: 'CREDITO', _sum: { valor: new Prisma.Decimal('1000') } },
    ]);
    mocks.contaPGCFindMany.mockResolvedValue([
      { id: 'c311', codigo: '311', nome: 'Mercadorias', tipo: 'ATIVO', natureza: 'DEVEDORA' },
    ]);

    const resultado = await gerarBalancete(
      { dataInicio: DATA_INICIO, dataFim: DATA_FIM, incluirZeradas: true },
      CTX,
    );

    expect(resultado.contas).toHaveLength(1);
    expect(resultado.contas[0].saldoAtual.toString()).toBe('0');
    expect(resultado.totalDebitos.toString()).toBe('1000');
    expect(resultado.totalCreditos.toString()).toBe('1000');
  });
});

// ---------------------------------------------------------------------------
// Achado B — os quatro sítios entregam { in: ['LANCADO', 'ESTORNADO'] } ao Prisma
//
// Estes testes são as armadilhas de regressão reais: qualquer um dos quatro
// sítios que volte a usar { not: 'ESTORNADO' } (ou perca o filtro, ou passe a
// usar { not: 'RASCUNHO' } deixando entrar futuros estados em silêncio) faz
// falhar o teste correspondente.
//
// A asserção é sobre o argumento real que chegou ao dobro do Prisma (não sobre
// a identidade da constante exportada — isso seria tautológico).
// ---------------------------------------------------------------------------

describe('Achado B — os quatro sítios entregam { in: [LANCADO, ESTORNADO] } ao Prisma (ADR-0033)', () => {
  it('obterContaDetalhe: groupBy recebe status { in: [...] } com tenantId, não { not: "ESTORNADO" }', async () => {
    mocks.contaPGCFindFirst.mockResolvedValue({
      id: 'c1', codigo: '311', nome: 'Mercadorias', tipo: 'ATIVO', natureza: 'DEVEDORA',
      contaMae: null, subContas: [],
    });
    mocks.groupBy.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);

    await obterContaDetalhe('c1', { dataInicio: DATA_INICIO, dataFim: DATA_FIM }, CTX);

    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: CTX.tenantId,
          lancamento: expect.objectContaining({
            status: { in: ['LANCADO', 'ESTORNADO'] },
          }),
        }),
      }),
    );
    expect(mocks.groupBy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lancamento: expect.objectContaining({
            status: { not: 'ESTORNADO' },
          }),
        }),
      }),
    );
  });

  it('gerarBalancete: groupBy recebe status { in: [...] } com tenantId, não { not: "ESTORNADO" }', async () => {
    mocks.groupBy.mockResolvedValue([]);
    mocks.contaPGCFindMany.mockResolvedValue([]);

    await gerarBalancete(
      { dataInicio: DATA_INICIO, dataFim: DATA_FIM, incluirZeradas: false },
      CTX,
    );

    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: CTX.tenantId,
          lancamento: expect.objectContaining({
            status: { in: ['LANCADO', 'ESTORNADO'] },
          }),
        }),
      }),
    );
    expect(mocks.groupBy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lancamento: expect.objectContaining({
            status: { not: 'ESTORNADO' },
          }),
        }),
      }),
    );
  });

  it('razaoConta: findMany recebe status { in: [...] } com tenantId, não { not: "ESTORNADO" }', async () => {
    mocks.contaPGCFindFirst.mockResolvedValue({
      id: 'c1', codigo: '311', nome: 'Mercadorias', tipo: 'ATIVO', natureza: 'DEVEDORA',
    });
    mocks.findMany.mockResolvedValue([]);

    await razaoConta(
      { contaId: 'c1', dataInicio: DATA_INICIO, dataFim: DATA_FIM, take: 50 },
      CTX,
    );

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: CTX.tenantId,
          lancamento: expect.objectContaining({
            status: { in: ['LANCADO', 'ESTORNADO'] },
          }),
        }),
      }),
    );
    expect(mocks.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lancamento: expect.objectContaining({
            status: { not: 'ESTORNADO' },
          }),
        }),
      }),
    );
  });

  it('gerarDRE: groupBy recebe status { in: [...] } com tenantId, não { not: "ESTORNADO" }', async () => {
    mocks.groupBy.mockResolvedValue([]);
    mocks.contaPGCFindMany.mockResolvedValue([]);

    await gerarDRE({ dataInicio: DATA_INICIO, dataFim: DATA_FIM }, CTX);

    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: CTX.tenantId,
          lancamento: expect.objectContaining({
            status: { in: ['LANCADO', 'ESTORNADO'] },
          }),
        }),
      }),
    );
    expect(mocks.groupBy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lancamento: expect.objectContaining({
            status: { not: 'ESTORNADO' },
          }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Achado C — DRE: prefixos correctos, sem duplo cômputo em 78, classes certas,
//   sem .abs() e mapeamento PGC-NIRF correcto (68 operacional, 69 financeiro)
// ---------------------------------------------------------------------------

describe('Achado C — DRE com prefixos correctos e sem duplo cômputo (ADR-0033)', () => {
  // Contas PGC reais — sem pontos nos códigos
  const CONTAS_DRE = new Map<string, ContaDRE>([
    ['c611', contaD('c611', '611', 'DEVEDORA')],  // Custo dos inventários (classe 61)
    ['c621', contaD('c621', '621', 'DEVEDORA')],  // Gastos com o pessoal (classe 62)
    ['c631', contaD('c631', '631', 'DEVEDORA')],  // Fornecimentos e serv. (classe 63)
    ['c711', contaD('c711', '711', 'CREDORA')],   // Vendas (classe 71)
    ['c781', contaD('c781', '781', 'CREDORA')],   // Juros recebidos (classe 78)
    ['c691', contaD('c691', '691', 'DEVEDORA')],  // Gastos e perdas financeiros (classe 69)
    ['c681', contaD('c681', '681', 'DEVEDORA')],  // Outros gastos operacionais (classe 68)
  ]);

  it('classe 611 aparece em custoProdutosVendidos com o valor correcto', () => {
    // Antes da correcção: saldoPrefixo('6.1') → '611'.startsWith('6.1') = false → zero
    // Depois:            saldoPrefixo('61')  → '611'.startsWith('61')  = true  → 5000
    const dre = calcularLinhasDRE(
      [
        agr('c611', 'DEBITO', '5000'),
        agr('c711', 'CREDITO', '10000'),
      ],
      CONTAS_DRE,
    );
    expect(dre.custoProdutosVendidos.toString()).toBe('5000');
  });

  it('classe 621 (Gastos com o pessoal) aparece em despesasVendas', () => {
    const dre = calcularLinhasDRE(
      [
        agr('c621', 'DEBITO', '1200'),
        agr('c711', 'CREDITO', '10000'),
      ],
      CONTAS_DRE,
    );
    expect(dre.despesasVendas.toString()).toBe('1200');
  });

  it('rendimentos financeiros (classe 781) NÃO são contados em receitaBruta', () => {
    // Antes: receitaBruta = saldoPrefixo('7') incluía 78 (duplo cômputo latente).
    // Depois: receitaBruta = saldo('7') − saldo('78') = 8000.
    const dre = calcularLinhasDRE(
      [
        agr('c711', 'CREDITO', '8000'), // receita operacional
        agr('c781', 'CREDITO', '2000'), // receita financeira
      ],
      CONTAS_DRE,
    );
    expect(dre.receitaBruta.toString()).toBe('8000');
    expect(dre.receitasFinanceiras.toString()).toBe('2000');
  });

  it('cálculo completo: receitas, gastos e lucro correcto', () => {
    // Receita (711) = 10000, CPV (611) = 4000, gastos pessoal (621) = 1000
    // lucroBruto = 10000 − 4000 = 6000
    // lucroOperacional = 6000 − 1000 = 5000
    // sem financeiros nem impostos → lucroLiquido = 5000
    const dre = calcularLinhasDRE(
      [
        agr('c711', 'CREDITO', '10000'),
        agr('c611', 'DEBITO', '4000'),
        agr('c621', 'DEBITO', '1000'),
      ],
      CONTAS_DRE,
    );
    expect(dre.receitaBruta.toString()).toBe('10000');
    expect(dre.custoProdutosVendidos.toString()).toBe('4000');
    expect(dre.lucroBruto.toString()).toBe('6000');
    expect(dre.despesasVendas.toString()).toBe('1000');
    expect(dre.totalDespesasOperacionais.toString()).toBe('1000');
    expect(dre.lucroOperacional.toString()).toBe('5000');
    expect(dre.lucroLiquido.toString()).toBe('5000');
  });

  it('classe 69 (Gastos e perdas financeiros) entra em despesasFinanceiras, não em impostos', () => {
    // Antes da correcção: saldoPrefixo('68') era despesasFinanceiras (errado —
    // 68 = Outros gastos operacionais) e saldoPrefixo('69') era impostos (errado —
    // 69 = Gastos e perdas financeiros). Com os prefixos a zero (antes da correcção
    // dos achados C) ninguém viu. Agora os prefixos funcionam e o mapeamento importa.
    const dre = calcularLinhasDRE(
      [
        agr('c711', 'CREDITO', '10000'),
        agr('c691', 'DEBITO', '500'), // Gastos financeiros (classe 69)
      ],
      CONTAS_DRE,
    );
    expect(dre.despesasFinanceiras.toString()).toBe('500');
    expect(dre.impostos.toString()).toBe('0'); // classe 85 não implementada (ADR-0035)
    expect(dre.lucroLiquido.toString()).toBe('9500'); // 10000 − 500 resultado financeiro
  });

  it('classe 68 (Outros gastos operacionais) entra em despesasGerais, não em despesasFinanceiras', () => {
    const dre = calcularLinhasDRE(
      [
        agr('c711', 'CREDITO', '10000'),
        agr('c681', 'DEBITO', '300'), // Outros gastos operacionais (classe 68)
      ],
      CONTAS_DRE,
    );
    expect(dre.despesasGerais.toString()).toBe('300');
    expect(dre.despesasFinanceiras.toString()).toBe('0');
    expect(dre.lucroOperacional.toString()).toBe('9700'); // 10000 − 300
  });

  it('estorno cross-período: crédito isolado em classe 6 produz CPV negativo (sem .abs())', () => {
    // Um estorno cujo original caiu noutro período deixa só o crédito da conta
    // de gasto. Com .abs() (bug): custoProdutosVendidos = +1000 → gasto fictício.
    // Sem .abs() (correcto):       custoProdutosVendidos = −1000 → reversão de gasto.
    // A página DRE apresenta negativos entre parênteses em vermelho (DreRow).
    const CONTAS_CROSS = new Map<string, ContaDRE>([
      ['c611', contaD('c611', '611', 'DEVEDORA')],
    ]);
    const dre = calcularLinhasDRE(
      [agr('c611', 'CREDITO', '1000')], // só o crédito; o débito estava noutro período
      CONTAS_CROSS,
    );
    // CPV negativo = reversão de gasto, não gasto
    expect(dre.custoProdutosVendidos.toString()).toBe('-1000');
    // lucroBruto = receitaLiquida (0) − CPV (−1000) = 1000 (reversão melhora o lucro)
    expect(dre.lucroBruto.toString()).toBe('1000');
  });
});
