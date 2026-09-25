/**
 * Oráculo da issue #78 — T8: um movimento PAGAMENTO é SAÍDA de caixa.
 *
 * Afirma só DELTAS (antes/depois, ou com/sem o movimento), nunca o saldo absoluto:
 * o fundo inicial tem um defeito separado (#16) que não é deste nó.
 * O movimento entra pelo contrato registarMovimentoCaixa, a correr a sério sobre
 * o duplo com estado do Prisma.
 */
import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { DuploPrisma } from '../../compras/__tests__/helpers/duplo-prisma';

const estado = vi.hoisted(() => ({ duplo: null as unknown as { prisma: any; prismaBase: any } }));

vi.mock('@/server/db/client', () => ({
  prisma: new Proxy({}, { get: (_t, p) => estado.duplo.prisma[p as string] }),
  prismaBase: new Proxy({}, { get: (_t, p) => estado.duplo.prismaBase[p as string] }),
}));
vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: vi.fn(async () => 'CX-2026-00001'),
}));

const ctx = { tenantId: 'tenant-cx', userId: 'user-cx' };
const D = (v: unknown) => new Prisma.Decimal(String(v));

function novoDuplo() {
  const duplo = new DuploPrisma();
  duplo.tenantAtual = ctx.tenantId;
  const sessao = duplo.semear('sessaoCaixa', {
    tenantId: ctx.tenantId, responsavelId: ctx.userId, numero: 'CX-1', dataAbertura: new Date(),
    fundoInicial: '1000.00', totalEntradas: '0', totalSaidas: '0', status: 'ABERTA',
  });
  // Movimentos de fundo, para o delta não depender de uma sessão vazia.
  for (const [tipo, valor] of [['ABERTURA', '1000.00'], ['VENDA', '300.00'], ['SANGRIA', '50.00']] as const) {
    duplo.semear('movimentoCaixa', {
      tenantId: ctx.tenantId, sessaoCaixaId: sessao.id, tipo, valor, descricao: tipo,
      responsavelId: ctx.userId, dataMovimento: new Date(),
    });
  }
  estado.duplo = duplo as unknown as typeof estado.duplo;
  return { duplo, sessaoId: sessao.id as string };
}

async function acrescentarPagamento(duplo: DuploPrisma, sessaoId: string, valor: string) {
  const { registarMovimentoCaixa } = await import('../caixa.service');
  await duplo.prisma.$transaction((tx: any) =>
    registarMovimentoCaixa(
      tx,
      {
        sessaoCaixaId: sessaoId,
        tipo: 'PAGAMENTO' as any,
        valor,
        descricao: 'Pagamento PAGAMENTO-2026-00001',
        documentoOrigemTipo: 'Pagamento',
        documentoOrigemId: 'pag-78',
      },
      ctx,
    ),
  );
}

describe('T8 — PAGAMENTO conta como saída em resumoSessao', () => {
  it.each(['0.01', '250.50', '1234567.89'])(
    'acrescentar PAGAMENTO de %s desce saldoEsperado e sobe totalSaidas exactamente por esse valor',
    async (v) => {
      const { duplo, sessaoId } = novoDuplo();
      const { resumoSessao } = await import('../caixa.service');

      const antes = await resumoSessao(sessaoId, ctx);
      await acrescentarPagamento(duplo, sessaoId, v);
      const depois = await resumoSessao(sessaoId, ctx);

      expect(D(antes.saldoEsperado).minus(D(depois.saldoEsperado)).toFixed(2)).toBe(D(v).toFixed(2));
      expect(D(depois.totalSaidas).minus(D(antes.totalSaidas)).toFixed(2)).toBe(D(v).toFixed(2));
      // e não é contado como entrada
      expect(D(depois.totalEntradas).minus(D(antes.totalEntradas)).toFixed(2)).toBe('0.00');
    },
  );
});

describe('T8 — PAGAMENTO conta como saída em fecharSessao', () => {
  it('com/sem um PAGAMENTO de V: totalSaidas gravado difere V, diferenca difere V (fundoFinal igual)', async () => {
    const V = '420.35';
    const { fecharSessao } = await import('../caixa.service');

    // sessão sem o pagamento
    const sem = novoDuplo();
    await fecharSessao({ sessaoCaixaId: sem.sessaoId, fundoFinal: 1250 } as any, ctx);
    const sessaoSem = sem.duplo.linhas('sessaoCaixa')[0];

    // sessão idêntica, com o pagamento
    const com = novoDuplo();
    await acrescentarPagamento(com.duplo, com.sessaoId, V);
    await fecharSessao({ sessaoCaixaId: com.sessaoId, fundoFinal: 1250 } as any, ctx);
    const sessaoCom = com.duplo.linhas('sessaoCaixa')[0];

    expect(sessaoSem.status).toBe('FECHADA');
    expect(sessaoCom.status).toBe('FECHADA');
    expect(D(sessaoCom.totalSaidas).minus(D(sessaoSem.totalSaidas)).toFixed(2)).toBe(D(V).toFixed(2));
    expect(D(sessaoCom.totalEntradas).minus(D(sessaoSem.totalEntradas)).toFixed(2)).toBe('0.00');
    // saldoEsperado desce V ⇒ diferenca (= fundoFinal − saldoEsperado) sobe V
    expect(D(sessaoCom.diferenca).minus(D(sessaoSem.diferenca)).toFixed(2)).toBe(D(V).toFixed(2));
  });
});
