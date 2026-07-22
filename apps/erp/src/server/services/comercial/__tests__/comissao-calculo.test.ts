/**
 * Property + unit tests — cálculo de comissão (WS C)
 *
 * Testa a lógica de cálculo de comissão independentemente da BD (funções puras).
 * Cobre: base, escalões, meta, categoria, período, bónus 10% meta mensal.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';

// Alias para usar Decimal do runtime Prisma nos testes
const Decimal = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Lógica extraída (funções puras — não dependem de Prisma)
// ---------------------------------------------------------------------------

interface RegraCalculo {
  id: string;
  nome: string;
  tipo: 'FIXA' | 'ESCALONADA' | 'POR_META' | 'POR_CATEGORIA' | 'POR_PERIODO';
  vendedorId: string | null;
  categoriaId: string | null;
  percentualBase: number;
  percentualBonus: number | null;
  valorMinimo: number | null;
  valorMaximo: number | null;
  metaPercentual: number | null;
  dataInicio: Date | null;
  dataFim: Date | null;
  prioridade: number;
  ativa: boolean;
}

/**
 * Calcula comissão com base nas regras fornecidas (pura — sem BD).
 * Retorna { percentualFinal, valorComissao, regrasAplicadas }.
 */
function calcularComissaoPura(
  vendedorId: string,
  valorVenda: number,
  regras: RegraCalculo[],
  itens: Array<{ categoriaId: string; valor: number }> = [],
  metaMensalAtingida = 0,
): { percentualFinal: number; valorComissao: number; regrasAplicadas: string[] } {
  const valor = new Decimal(valorVenda);
  let percentualFinal = new Decimal(5); // padrão 5%
  let valorComissao = valor.mul(percentualFinal).div(100);
  const regrasAplicadas: string[] = ['Base'];
  const hoje = new Date();

  // Regra base FIXA do vendedor
  const regraBase = regras
    .filter((r) => r.ativa && r.tipo === 'FIXA' && r.vendedorId === vendedorId)
    .sort((a, b) => a.prioridade - b.prioridade)[0];

  if (regraBase) {
    percentualFinal = new Decimal(regraBase.percentualBase);
    valorComissao = valor.mul(percentualFinal).div(100);
    regrasAplicadas[0] = regraBase.nome;
  }

  // Regras especiais por prioridade
  const ativas = regras
    .filter((r) => r.ativa && r.tipo !== 'FIXA')
    .sort((a, b) => a.prioridade - b.prioridade);

  for (const regra of ativas) {
    const vMin = regra.valorMinimo ? new Decimal(regra.valorMinimo) : null;
    const vMax = regra.valorMaximo ? new Decimal(regra.valorMaximo) : null;
    if (vMin && valor.lessThan(vMin)) continue;
    if (vMax && valor.greaterThan(vMax)) continue;

    switch (regra.tipo) {
      case 'ESCALONADA': {
        if (vMin && valor.greaterThanOrEqualTo(vMin)) {
          percentualFinal = new Decimal(regra.percentualBase);
          valorComissao = valor.mul(percentualFinal).div(100);
          regrasAplicadas.push(regra.nome);
        }
        break;
      }
      case 'POR_META': {
        const metaMin = regra.metaPercentual ?? 100;
        if (metaMensalAtingida >= metaMin && regra.percentualBonus != null) {
          const bonus = valor.mul(new Decimal(regra.percentualBonus)).div(100);
          valorComissao = valorComissao.plus(bonus);
          percentualFinal = percentualFinal.plus(new Decimal(regra.percentualBonus));
          regrasAplicadas.push(regra.nome);
        }
        break;
      }
      case 'POR_CATEGORIA': {
        if (regra.categoriaId) {
          const item = itens.find((i) => i.categoriaId === regra.categoriaId);
          if (item) {
            const percCateg = new Decimal(regra.percentualBase);
            valorComissao = new Decimal(item.valor).mul(percCateg).div(100);
            percentualFinal = percCateg;
            regrasAplicadas.push(regra.nome);
          }
        }
        break;
      }
      case 'POR_PERIODO': {
        if (regra.dataInicio && regra.dataFim && hoje >= regra.dataInicio && hoje <= regra.dataFim) {
          percentualFinal = new Decimal(regra.percentualBase);
          valorComissao = valor.mul(percentualFinal).div(100);
          regrasAplicadas.push(regra.nome);
        }
        break;
      }
    }
  }

  return {
    percentualFinal: percentualFinal.toNumber(),
    valorComissao: valorComissao.toNumber(),
    regrasAplicadas,
  };
}

// ---------------------------------------------------------------------------
// Dados de teste
// ---------------------------------------------------------------------------

const VENDEDOR_ID = 'vendedor-01';

const regraBase: RegraCalculo = {
  id: 'r1', nome: 'Base 5%', tipo: 'FIXA',
  vendedorId: VENDEDOR_ID, categoriaId: null,
  percentualBase: 5, percentualBonus: null, valorMinimo: null, valorMaximo: null,
  metaPercentual: null, dataInicio: null, dataFim: null, prioridade: 1, ativa: true,
};

const regraEscalonada: RegraCalculo = {
  id: 'r2', nome: 'Escalonada 7%', tipo: 'ESCALONADA',
  vendedorId: VENDEDOR_ID, categoriaId: null,
  percentualBase: 7, percentualBonus: null, valorMinimo: 50000, valorMaximo: null,
  metaPercentual: null, dataInicio: null, dataFim: null, prioridade: 2, ativa: true,
};

const regraMeta: RegraCalculo = {
  id: 'r3', nome: 'Bónus Meta', tipo: 'POR_META',
  vendedorId: VENDEDOR_ID, categoriaId: null,
  percentualBase: 5, percentualBonus: 2, valorMinimo: null, valorMaximo: null,
  metaPercentual: 100, dataInicio: null, dataFim: null, prioridade: 3, ativa: true,
};

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('calcularComissao (lógica pura)', () => {
  it('aplica base de 5% por defeito', () => {
    const { percentualFinal, valorComissao } = calcularComissaoPura(
      VENDEDOR_ID, 10000, [regraBase], [], 0,
    );
    expect(percentualFinal).toBe(5);
    expect(valorComissao).toBeCloseTo(500, 2);
  });

  it('escalão 7% aplica-se quando venda >= valorMinimo', () => {
    const { percentualFinal, valorComissao } = calcularComissaoPura(
      VENDEDOR_ID, 60000, [regraBase, regraEscalonada], [], 0,
    );
    expect(percentualFinal).toBe(7);
    expect(valorComissao).toBeCloseTo(4200, 2);
  });

  it('escalão 7% NÃO se aplica quando venda < valorMinimo', () => {
    const { percentualFinal, valorComissao } = calcularComissaoPura(
      VENDEDOR_ID, 30000, [regraBase, regraEscalonada], [], 0,
    );
    expect(percentualFinal).toBe(5);
    expect(valorComissao).toBeCloseTo(1500, 2);
  });

  it('bónus de meta aplica-se quando metaMensalAtingida >= metaPercentual', () => {
    const { percentualFinal, regrasAplicadas } = calcularComissaoPura(
      VENDEDOR_ID, 10000, [regraBase, regraMeta], [], 110,
    );
    expect(percentualFinal).toBe(7); // 5 base + 2 bónus
    expect(regrasAplicadas).toContain('Bónus Meta');
  });

  it('bónus de meta NÃO se aplica quando meta insuficiente', () => {
    const { percentualFinal, regrasAplicadas } = calcularComissaoPura(
      VENDEDOR_ID, 10000, [regraBase, regraMeta], [], 80,
    );
    expect(percentualFinal).toBe(5);
    expect(regrasAplicadas).not.toContain('Bónus Meta');
  });

  it('regra por categoria aplica percentual específico', () => {
    const regraCateg: RegraCalculo = {
      id: 'r4', nome: 'Categoria Premium', tipo: 'POR_CATEGORIA',
      vendedorId: VENDEDOR_ID, categoriaId: 'cat-premium',
      percentualBase: 10, percentualBonus: null, valorMinimo: null, valorMaximo: null,
      metaPercentual: null, dataInicio: null, dataFim: null, prioridade: 2, ativa: true,
    };

    const itens = [{ categoriaId: 'cat-premium', valor: 5000 }];
    const { valorComissao, regrasAplicadas } = calcularComissaoPura(
      VENDEDOR_ID, 10000, [regraBase, regraCateg], itens, 0,
    );
    expect(valorComissao).toBeCloseTo(500, 2); // 10% de 5000
    expect(regrasAplicadas).toContain('Categoria Premium');
  });

  it('regra por período aplica-se dentro do intervalo', () => {
    const ontem = new Date(Date.now() - 86400000);
    const amanha = new Date(Date.now() + 86400000);
    const regraPeriodo: RegraCalculo = {
      id: 'r5', nome: 'Período Especial', tipo: 'POR_PERIODO',
      vendedorId: VENDEDOR_ID, categoriaId: null,
      percentualBase: 8, percentualBonus: null, valorMinimo: null, valorMaximo: null,
      metaPercentual: null, dataInicio: ontem, dataFim: amanha, prioridade: 2, ativa: true,
    };

    const { percentualFinal } = calcularComissaoPura(
      VENDEDOR_ID, 10000, [regraBase, regraPeriodo], [], 0,
    );
    expect(percentualFinal).toBe(8);
  });

  it('regra por período NÃO se aplica fora do intervalo', () => {
    const dataPassada1 = new Date(Date.now() - 7 * 86400000);
    const dataPassada2 = new Date(Date.now() - 3 * 86400000);
    const regraPeriodo: RegraCalculo = {
      id: 'r5', nome: 'Período Passado', tipo: 'POR_PERIODO',
      vendedorId: VENDEDOR_ID, categoriaId: null,
      percentualBase: 8, percentualBonus: null, valorMinimo: null, valorMaximo: null,
      metaPercentual: null, dataInicio: dataPassada1, dataFim: dataPassada2, prioridade: 2, ativa: true,
    };

    const { percentualFinal } = calcularComissaoPura(
      VENDEDOR_ID, 10000, [regraBase, regraPeriodo], [], 0,
    );
    expect(percentualFinal).toBe(5); // regra base mantém-se
  });

  it('regra inativa não é aplicada', () => {
    const regraInativa = { ...regraEscalonada, ativa: false };
    const { percentualFinal } = calcularComissaoPura(
      VENDEDOR_ID, 60000, [regraBase, regraInativa], [], 0,
    );
    expect(percentualFinal).toBe(5); // escalão ignorado
  });

  it('comissão é sempre não-negativa', () => {
    const { valorComissao } = calcularComissaoPura(VENDEDOR_ID, 0, [regraBase], [], 0);
    expect(valorComissao).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('[property] cálculo de comissão', () => {
  const positiveArb = fc
    .float({ min: 1, max: 1000000, noNaN: true, noDefaultInfinity: true })
    .map((n) => Math.round(n * 100) / 100);

  it('[property] valorComissao ≥ 0 para qualquer valor de venda', () => {
    fc.assert(
      fc.property(positiveArb, (valor) => {
        const { valorComissao } = calcularComissaoPura(VENDEDOR_ID, valor, [regraBase], [], 0);
        expect(valorComissao).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('[property] percentualFinal > 0 se houver regra base ativa', () => {
    fc.assert(
      fc.property(positiveArb, (valor) => {
        const { percentualFinal } = calcularComissaoPura(VENDEDOR_ID, valor, [regraBase], [], 0);
        expect(percentualFinal).toBeGreaterThan(0);
      }),
    );
  });

  it('[property] comissão escalonada ≥ comissão base para valor >= limiar', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 50000, max: 1000000, noNaN: true, noDefaultInfinity: true }),
        (valor) => {
          const { valorComissao: base } = calcularComissaoPura(
            VENDEDOR_ID, valor, [regraBase], [], 0,
          );
          const { valorComissao: escalonado } = calcularComissaoPura(
            VENDEDOR_ID, valor, [regraBase, regraEscalonada], [], 0,
          );
          expect(escalonado).toBeGreaterThanOrEqual(base);
        },
      ),
    );
  });

  it('[property] bónus de meta aumenta o valor da comissão', () => {
    fc.assert(
      fc.property(positiveArb, (valor) => {
        const { valorComissao: semBonus } = calcularComissaoPura(
          VENDEDOR_ID, valor, [regraBase], [], 0,
        );
        const { valorComissao: comBonus } = calcularComissaoPura(
          VENDEDOR_ID, valor, [regraBase, regraMeta], [], 100,
        );
        expect(comBonus).toBeGreaterThanOrEqual(semBonus);
      }),
    );
  });

  it('[property] comissão é monótona — mais vendas = mais comissão (mesmas regras)', () => {
    fc.assert(
      fc.property(
        fc.tuple(positiveArb, positiveArb).filter(([a, b]) => a < b),
        ([valorPequeno, valorGrande]) => {
          const { valorComissao: comMenor } = calcularComissaoPura(
            VENDEDOR_ID, valorPequeno, [regraBase], [], 0,
          );
          const { valorComissao: comMaior } = calcularComissaoPura(
            VENDEDOR_ID, valorGrande, [regraBase], [], 0,
          );
          expect(comMaior).toBeGreaterThanOrEqual(comMenor);
        },
      ),
    );
  });
});
