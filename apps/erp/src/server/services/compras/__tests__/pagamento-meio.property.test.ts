/**
 * Oráculo da issue #78 — T7: propriedade sobre forma × valor.
 *
 * Para toda a forma de pagamento válida e todo o valor com 2 casas decimais
 * (incluindo pagamentos parciais ≤ restante), registarPagamento produz UM lançamento com:
 *   - Σ débitos = Σ créditos = valor (Decimal, nunca float);
 *   - crédito em 111 ⇔ forma = NUMERARIO;
 *   - existe MovimentoCaixa ⇔ forma = NUMERARIO.
 * Duplo com estado (helpers/duplo-prisma.ts), um duplo novo por execução.
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { DuploPrisma, somaPartidas } from './helpers/duplo-prisma';
import { montarCenario, ctx } from './helpers/cenario-pagamento';

const estado = vi.hoisted(() => ({ duplo: null as unknown as { prisma: any; prismaBase: any } }));

vi.mock('@/server/db/client', () => ({
  prisma: new Proxy({}, { get: (_t, p) => estado.duplo.prisma[p as string] }),
  prismaBase: new Proxy({}, { get: (_t, p) => estado.duplo.prismaBase[p as string] }),
}));

const mocks = vi.hoisted(() => ({ registarLancamento: vi.fn(), proximoNumero: vi.fn() }));
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: mocks.registarLancamento,
}));
vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: mocks.proximoNumero,
}));

const FORMAS = ['TRANSFERENCIA_BANCARIA', 'CHEQUE', 'M-PESA', 'E-MOLA', 'NUMERARIO'] as const;
type Forma = (typeof FORMAS)[number];

/** Restante em cêntimos e valor ≤ restante em cêntimos. */
const arbValores = fc
  .integer({ min: 1, max: 10_000_000_00 })
  .chain((restante) => fc.record({
    restanteCent: fc.constant(restante),
    valorCent: fc.oneof(fc.constant(restante), fc.integer({ min: 1, max: restante })),
  }));

function centParaString(c: number): string {
  return new Prisma.Decimal(c).dividedBy(100).toFixed(2);
}

describe('T7 — propriedade: equilíbrio e caixa ⇔ numerário', () => {
  it('para toda a forma × valor (2 casas, parcial ≤ restante)', async () => {
    const { contaPagarService } = await import('../conta-pagar.service');
    let seq = 0;

    await fc.assert(
      fc.asyncProperty(fc.constantFrom<Forma>(...FORMAS), arbValores, async (forma, { restanteCent, valorCent }) => {
        const c = montarCenario({ valorOriginal: centParaString(restanteCent), sessaoPropria: true, sessaoAlheia: true });
        estado.duplo = c.duplo as unknown as DuploPrisma;
        mocks.registarLancamento.mockReset();
        mocks.registarLancamento.mockImplementation(async (tx: any, input: any, cx: any) => {
          const l = await tx.lancamento.create({ data: { tenantId: cx.tenantId, ...input } });
          return { id: l.id };
        });
        mocks.proximoNumero.mockReset();
        mocks.proximoNumero.mockImplementation(async (_tx: any, tipo: string) => `${tipo}-${++seq}`);

        const valorStr = centParaString(valorCent);
        const contaBancariaId =
          forma === 'NUMERARIO' ? undefined
            : forma === 'M-PESA' || forma === 'E-MOLA' ? c.bancos.carteira
              : c.bancos.corrente;

        await contaPagarService.registarPagamento(
          {
            contaPagarId: c.contaPagarId,
            dataPagamento: new Date('2026-09-20T10:00:00Z'),
            valor: Number(valorStr),
            formaPagamento: forma,
            ...(contaBancariaId ? { contaBancariaId } : {}),
          } as any,
          ctx,
        );

        const ls = c.duplo.linhas('lancamento');
        expect(ls).toHaveLength(1);
        const partidas = ls[0].partidas as Array<{ tipo: string; contaCodigo: string; valor: unknown }>;

        // Σ débitos = Σ créditos = valor
        expect(somaPartidas(partidas, 'DEBITO').toFixed(2)).toBe(valorStr);
        expect(somaPartidas(partidas, 'CREDITO').toFixed(2)).toBe(valorStr);

        // crédito em 111 ⇔ NUMERARIO
        const creditaCaixa = partidas.some((p) => p.tipo === 'CREDITO' && p.contaCodigo === '111');
        expect(creditaCaixa).toBe(forma === 'NUMERARIO');

        // fora do numerário, o crédito é a conta PGC da ContaBancaria escolhida
        if (forma !== 'NUMERARIO') {
          const creditosCodigos = partidas.filter((p) => p.tipo === 'CREDITO').map((p) => p.contaCodigo);
          expect(creditosCodigos).toEqual([c.codigoPorBanco[contaBancariaId!]]);
        }

        // movimento de caixa ⇔ NUMERARIO (e, havendo, pelo valor exacto)
        const movs = c.duplo.linhas('movimentoCaixa');
        expect(movs.length > 0).toBe(forma === 'NUMERARIO');
        if (forma === 'NUMERARIO') {
          expect(movs).toHaveLength(1);
          expect(new Prisma.Decimal(String(movs[0].valor)).toFixed(2)).toBe(valorStr);
        }
      }),
      { numRuns: 1000 },
    );
  }, 120_000);
});
