/**
 * Issue #352 — o predicado de vigência das regras POR_PERIODO do `comissaoService` REAL compara
 * dias civis de Maputo, não instantes.
 *
 * Ao contrário de `comissao-calculo.test.ts` (que testa uma cópia local da lógica e por isso nunca
 * fica vermelho), este ficheiro chama `comissaoService.calcularComissao` com o relógio fixo e a
 * leitura das regras dobrada — o predicado que decide é o do serviço.
 *
 * Contrato:
 *   - hoje = dia civil de Maputo do relógio; a regra vale se dia(dataInicio) ≤ hoje ≤ dia(dataFim),
 *     com dia(x) = dia civil de Maputo de x.
 *   - Cobre as regras já gravadas à meia-noite UTC (`z.coerce.date` antigo), sem migração:
 *     dataFim 2026-06-30T00:00Z é o dia 30/06 em Maputo (02h00) — vale o dia 30 inteiro.
 *   - E as gravadas pelo schema novo (dataFim 2026-06-30T21:59:59.999Z, dataInicio
 *     2026-05-31T22:00:00.000Z).
 *   - Fora do intervalo (00h30 de Maputo do dia seguinte / 23h30 de Maputo da véspera) não vale.
 *
 * Escrito pelo autor do oráculo (nó C:comissao-dia-maputo-352); um agente de implementação que
 * o altere é BLOCKER.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

const regrasDobradas = vi.hoisted(() => ({ linhas: [] as unknown[] }));

vi.mock('@/server/db/client', () => {
  const regraComissao = {
    findMany: vi.fn(async () => regrasDobradas.linhas),
  };
  const comissao = {
    // `_calcularMetaMensal` / agregações — não são exercitadas por regras POR_PERIODO.
    aggregate: vi.fn(async () => ({ _sum: { valorComissao: null, valorBase: null } })),
    findMany: vi.fn(async () => []),
  };
  const venda = {
    aggregate: vi.fn(async () => ({ _sum: { total: null } })),
    findMany: vi.fn(async () => []),
  };
  const cliente = { prisma: { regraComissao, comissao, venda } };
  return { prisma: cliente.prisma, prismaBase: cliente.prisma };
});

const VENDEDOR = 'cvendedor352';
const TENANT = 'tenant-comissao-352';
const ctx = { tenantId: TENANT, userId: VENDEDOR };

function regraPeriodo(nome: string, dataInicio: Date, dataFim: Date) {
  const agora = new Date('2026-01-01T00:00:00Z');
  return {
    id: `r-${nome}`,
    tenantId: TENANT,
    nome,
    tipo: 'POR_PERIODO',
    vendedorId: null,
    categoriaId: null,
    percentualBase: new Prisma.Decimal(12),
    percentualBonus: null,
    valorMinimo: null,
    valorMaximo: null,
    quantidadeMinima: null,
    metaPercentual: null,
    dataInicio,
    dataFim,
    prioridade: 1,
    descricao: 'período #352',
    ativa: true,
    createdAt: agora,
    updatedAt: agora,
  };
}

// Regras de Junho de 2026 — gravadas pelo schema antigo (meia-noite UTC) e pelo novo (dia de Maputo).
const LEGADA = () =>
  regraPeriodo('Junho legada', new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-30T00:00:00.000Z'));
const NOVA = () =>
  regraPeriodo('Junho nova', new Date('2026-05-31T22:00:00.000Z'), new Date('2026-06-30T21:59:59.999Z'));

async function calcularCom(relogio: string, regra: ReturnType<typeof regraPeriodo>) {
  vi.setSystemTime(new Date(relogio));
  regrasDobradas.linhas = [regra];
  const { comissaoService } = await import('@/server/services/comercial/comissao.service');
  // Acesso dinâmico: o caso falha pelo comportamento, não pela assinatura.
  return (comissaoService as any).calcularComissao(VENDEDOR, 'venda-352', '1000', undefined, ctx) as Promise<{
    percentualAplicado: string;
    valorComissao: string;
    regrasAplicadas: string[];
  }>;
}

function aplicou(res: { percentualAplicado: string; valorComissao: string; regrasAplicadas: string[] }, nome: string) {
  return (
    res.regrasAplicadas.includes(nome) &&
    new Prisma.Decimal(res.percentualAplicado).equals(12) &&
    new Prisma.Decimal(res.valorComissao).equals(120)
  );
}

describe('#352 comissaoService.calcularComissao — vigência POR_PERIODO em dias civis de Maputo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    regrasDobradas.linhas = [];
  });

  describe('último dia (30/06)', () => {
    it('regra legada (dataFim 2026-06-30T00:00Z) vale às 12h00 de Maputo do dia 30 (relógio 2026-06-30T10:00Z)', async () => {
      const res = await calcularCom('2026-06-30T10:00:00.000Z', LEGADA());
      expect(aplicou(res, 'Junho legada')).toBe(true);
    });

    it('regra legada vale às 23h30 de Maputo do dia 30 (relógio 2026-06-30T21:30Z)', async () => {
      const res = await calcularCom('2026-06-30T21:30:00.000Z', LEGADA());
      expect(aplicou(res, 'Junho legada')).toBe(true);
    });

    it('regra nova (dataFim 2026-06-30T21:59:59.999Z) vale às 12h00 de Maputo do dia 30', async () => {
      const res = await calcularCom('2026-06-30T10:00:00.000Z', NOVA());
      expect(aplicou(res, 'Junho nova')).toBe(true);
    });

    it('nenhuma vale às 00h30 de Maputo do dia 01/07 (relógio 2026-06-30T22:30Z)', async () => {
      const legada = await calcularCom('2026-06-30T22:30:00.000Z', LEGADA());
      expect(legada.regrasAplicadas).not.toContain('Junho legada');
      expect(new Prisma.Decimal(legada.percentualAplicado).equals(5)).toBe(true);
      const nova = await calcularCom('2026-06-30T22:30:00.000Z', NOVA());
      expect(nova.regrasAplicadas).not.toContain('Junho nova');
      expect(new Prisma.Decimal(nova.percentualAplicado).equals(5)).toBe(true);
    });
  });

  describe('primeiro dia (01/06)', () => {
    it('regra legada (dataInicio 2026-06-01T00:00Z) vale às 00h30 de Maputo do dia 01 (relógio 2026-05-31T22:30Z)', async () => {
      const res = await calcularCom('2026-05-31T22:30:00.000Z', LEGADA());
      expect(aplicou(res, 'Junho legada')).toBe(true);
    });

    it('regra nova (dataInicio 2026-05-31T22:00Z) vale às 00h30 de Maputo do dia 01', async () => {
      const res = await calcularCom('2026-05-31T22:30:00.000Z', NOVA());
      expect(aplicou(res, 'Junho nova')).toBe(true);
    });

    it('nenhuma vale às 23h30 de Maputo do dia 31/05 (relógio 2026-05-31T21:30Z)', async () => {
      const legada = await calcularCom('2026-05-31T21:30:00.000Z', LEGADA());
      expect(legada.regrasAplicadas).not.toContain('Junho legada');
      const nova = await calcularCom('2026-05-31T21:30:00.000Z', NOVA());
      expect(nova.regrasAplicadas).not.toContain('Junho nova');
    });
  });

  it('meio do intervalo continua a valer (15/06, 12h00 de Maputo)', async () => {
    expect(aplicou(await calcularCom('2026-06-15T10:00:00.000Z', LEGADA()), 'Junho legada')).toBe(true);
    expect(aplicou(await calcularCom('2026-06-15T10:00:00.000Z', NOVA()), 'Junho nova')).toBe(true);
  });

  it('regra de um só dia legada (dataInicio = dataFim = 2026-06-30T00:00Z) vale o dia 30 inteiro de Maputo', async () => {
    const dia = new Date('2026-06-30T00:00:00.000Z');
    const umDia = () => regraPeriodo('Dia 30', dia, dia);
    // 00h30 de Maputo do dia 30 (antes do instante gravado) e 23h30 de Maputo (depois dele).
    expect(aplicou(await calcularCom('2026-06-29T22:30:00.000Z', umDia()), 'Dia 30')).toBe(true);
    expect(aplicou(await calcularCom('2026-06-30T21:30:00.000Z', umDia()), 'Dia 30')).toBe(true);
    expect((await calcularCom('2026-06-30T22:30:00.000Z', umDia())).regrasAplicadas).not.toContain('Dia 30');
    expect((await calcularCom('2026-06-29T21:30:00.000Z', umDia())).regrasAplicadas).not.toContain('Dia 30');
  });
});
