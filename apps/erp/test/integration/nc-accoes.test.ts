/**
 * Teste de integração — acções sobre notas de crédito (#148, ticket 3.3)
 *
 * Contra Postgres real (Testcontainers), prova o que o duplo em memória não pode:
 *   (a) N1 — cancelar uma NC emitida pelo serviço deixa o lançamento dela `ESTORNADO`
 *       e `NotaCredito.lancamentoEstornoId` aponta para o lançamento de ESTORNO (o que
 *       tem `tipo = 'ESTORNO'` e aponta para o original), não para o original;
 *   (b) N5 — liquidar por COMPENSACAO e cancelar a MESMA NC em simultâneo: exactamente
 *       uma operação passa, a outra recusa com BusinessRuleError, e o estado final é
 *       coerente — ou LIQUIDADA sem estorno (e a factura abatida), ou CANCELADA com
 *       estorno (e a factura intacta). Sem o `FOR UPDATE` na NC antes da leitura, as
 *       duas leem EMITIDA e passam ambas.
 *
 * O tenant é montado pelos serviços reais: `bootstrapContabilidade` (PGC, diários,
 * séries do ano corrente), `emitirFatura` e `emitirNotaCredito` — nenhum número nem
 * lançamento escrito à mão.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// A sessão é fronteira, não domínio — o módulo de faturação importa-a para o travão de emissão.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('Acções sobre notas de crédito — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let val: typeof import('@/lib/validations/faturacao');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-nc-accoes-${sufixo}`;
  const USER = `user-nc-accoes-${sufixo}`;
  // O ctx do createSafeAction traz as permissões; a compensação não precisa de caixa/banca.
  const ctx = {
    tenantId: TENANT,
    userId: USER,
    permissions: new Set(['faturacao:nc:liquidar', 'faturacao:nc:cancelar']),
  };
  let faturaId: string;

  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  async function emitirNC(): Promise<{ id: string; lancamentoId: string; total: number }> {
    const input = val.EmitirNotaCreditoSchema.parse({
      faturaOriginalId: faturaId,
      motivo: 'Devolução parcial',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'Artigo devolvido', quantidade: 1, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const nc = await noCtx(() => fat.emitirNotaCredito(input, ctx));
    expect(nc.lancamentoId).toBeTruthy();
    return { id: nc.id, lancamentoId: nc.lancamentoId as string, total: Number(String(nc.total)) };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant NC Acções', slug: `nc-accoes-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: {
        id: USER,
        tenantId: TENANT,
        email: `nc-accoes-${sufixo}@test.mz`,
        nome: 'Utilizador NC',
        keycloakSub: `kc-nc-accoes-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente NC',
        tipo: 'JURIDICA',
        nuit: '400000001',
        email: `cliente-${sufixo}@test.mz`,
        telefone: '840000000',
        codigo: `CLI-NC-${sufixo}`,
      },
    });

    const hoje = new Date();
    const inputFatura = val.EmitirFaturaSchema.parse({
      clienteId: cliente.id,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const fatura = await noCtx(() => fat.emitirFatura(inputFatura, ctx));
    faturaId = fatura.id;
  });

  afterAll(async () => {
    // Base efémera (Testcontainers): destruída no teardown global.
  });

  // -------------------------------------------------------------------------
  // (a) N1
  // -------------------------------------------------------------------------

  it('(a) N1: cancelar estorna o lançamento da NC e lancamentoEstornoId aponta para o ESTORNO', async () => {
    const nc = await emitirNC();

    await noCtx(() => fat.cancelarNotaCredito(nc.id, 'Emitida por engano', ctx));

    const gravada = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
    expect(gravada.status).toBe('CANCELADA');
    expect(gravada.motivoCancelamento).toBe('Emitida por engano');
    expect(gravada.lancamentoId).toBe(nc.lancamentoId);
    expect(gravada.lancamentoEstornoId).toBeTruthy();
    expect(gravada.lancamentoEstornoId).not.toBe(nc.lancamentoId);

    const original = await db.lancamento.findFirst({ where: { id: nc.lancamentoId, tenantId: TENANT } });
    expect(original.status).toBe('ESTORNADO');

    const estorno = await db.lancamento.findFirst({
      where: { id: gravada.lancamentoEstornoId, tenantId: TENANT },
      include: { partidas: true },
    });
    expect(estorno).not.toBeNull();
    expect(estorno.tipo).toBe('ESTORNO');
    expect(estorno.lancamentoEstornoId).toBe(nc.lancamentoId);
    expect(estorno.status).toBe('LANCADO');
    expect(estorno.observacoes).toContain('Emitida por engano');

    // Nenhuma NC cancelada do tenant tem lançamento vivo.
    const canceladas = await db.notaCredito.findMany({ where: { tenantId: TENANT, status: 'CANCELADA' } });
    for (const c of canceladas) {
      if (!c.lancamentoId) continue;
      const l = await db.lancamento.findFirst({ where: { id: c.lancamentoId } });
      expect(l.status).toBe('ESTORNADO');
    }
  });

  // -------------------------------------------------------------------------
  // (b) N5
  // -------------------------------------------------------------------------

  it('(b) N5: liquidar (COMPENSACAO) ‖ cancelar a mesma NC — exactamente uma passa, estado final coerente', async () => {
    // Três rondas: com uma só, a ordem de chegada podia esconder a corrida.
    for (let ronda = 0; ronda < 3; ronda++) {
      const nc = await emitirNC();
      const faturaAntes = await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } });
      const pagoAntes = Number(String(faturaAntes.totalPago));

      const liquidar = noCtx(() =>
        fat.liquidarNotaCredito({ id: nc.id, forma: 'COMPENSACAO', data: new Date() }, ctx),
      );
      const cancelar = noCtx(() => fat.cancelarNotaCredito(nc.id, 'Cancelamento concorrente', ctx));
      const [rl, rc] = await Promise.allSettled([liquidar, cancelar]);

      const cumpridas = [rl, rc].filter((r) => r.status === 'fulfilled');
      const rejeitadas = [rl, rc].filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(cumpridas, `ronda ${ronda}`).toHaveLength(1);
      expect(rejeitadas, `ronda ${ronda}`).toHaveLength(1);
      expect(rejeitadas[0].reason, `ronda ${ronda}: ${String(rejeitadas[0].reason)}`).toBeInstanceOf(BusinessRuleError);

      const final = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
      const lancNC = await db.lancamento.findFirst({ where: { id: nc.lancamentoId, tenantId: TENANT } });
      const faturaDepois = await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } });
      const pagoDepois = Number(String(faturaDepois.totalPago));

      if (rl.status === 'fulfilled') {
        expect(final.status).toBe('LIQUIDADA');
        expect(final.formaLiquidacao).toBe('COMPENSACAO');
        expect(final.lancamentoEstornoId).toBeNull();
        expect(final.lancamentoLiquidacaoId).toBeNull();
        expect(lancNC.status).toBe('LANCADO');
        expect(pagoDepois).toBeCloseTo(pagoAntes + nc.total, 2);
        const estornos = await db.lancamento.count({
          where: { tenantId: TENANT, lancamentoEstornoId: nc.lancamentoId },
        });
        expect(estornos).toBe(0);
      } else {
        expect(final.status).toBe('CANCELADA');
        expect(final.formaLiquidacao).toBeNull();
        expect(final.lancamentoEstornoId).toBeTruthy();
        expect(lancNC.status).toBe('ESTORNADO');
        expect(pagoDepois).toBeCloseTo(pagoAntes, 2);
      }
    }
  });
});
