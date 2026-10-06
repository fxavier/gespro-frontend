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
import { Client } from 'pg';

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
  // O pagamento da factura (P2, fatura-pdf-pagamento) é por transferência: precisa da banca.
  const ctx = {
    tenantId: TENANT,
    userId: USER,
    permissions: new Set(['faturacao:nc:liquidar', 'faturacao:nc:cancelar', 'faturacao:fatura:pagar', 'financas:banca:escrita']),
  };
  let faturaId: string;
  let clienteId: string;
  let contaBancariaId: string;

  /** Pagamento de 200 por transferência (contrato P2: meio obrigatório, lança D 123 / C 411). */
  const pagamento200 = (idFatura: string) => ({
    faturaId: idFatura,
    valor: 200,
    dataPagamento: new Date(),
    formaPagamento: 'TRANSFERENCIA_BANCARIA' as const,
    contaBancariaId,
  });

  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  async function emitirFatura(): Promise<string> {
    const hoje = new Date();
    const input = val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const f = await noCtx(() => fat.emitirFatura(input, ctx));
    return f.id;
  }

  async function emitirNC(faturaOriginalId: string = faturaId): Promise<{ id: string; lancamentoId: string; total: number }> {
    const input = val.EmitirNotaCreditoSchema.parse({
      faturaOriginalId,
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

    clienteId = cliente.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const conta = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco NC',
        agencia: '0001',
        numeroConta: `NC-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaBancariaId = conta.id;

    faturaId = await emitirFatura();
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

  // -------------------------------------------------------------------------
  // (c) compensação ‖ registarPagamento na mesma factura
  // -------------------------------------------------------------------------

  it('(c) compensação ‖ registarPagamento na mesma factura: o totalPago final é a soma dos dois', async () => {
    // Três rondas, cada uma numa factura nova (total 1160): NC de 116 + pagamento de 200.
    for (let ronda = 0; ronda < 3; ronda++) {
      const idFatura = await emitirFatura();
      const nc = await emitirNC(idFatura);

      const [rl, rp] = await Promise.allSettled([
        noCtx(() => fat.liquidarNotaCredito({ id: nc.id, forma: 'COMPENSACAO', data: new Date() }, ctx)),
        noCtx(() => fat.registarPagamento(pagamento200(idFatura), ctx)),
      ]);

      expect(rl.status, `ronda ${ronda}: ${rl.status === 'rejected' ? String(rl.reason) : ''}`).toBe('fulfilled');
      expect(rp.status, `ronda ${ronda}: ${rp.status === 'rejected' ? String(rp.reason) : ''}`).toBe('fulfilled');

      const f = await db.fatura.findFirst({ where: { id: idFatura, tenantId: TENANT } });
      expect(Number(String(f.totalPago)), `ronda ${ronda}`).toBeCloseTo(nc.total + 200, 2);
      expect(f.status).toBe('PARCIALMENTE_PAGA');

      const ncFinal = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
      expect(ncFinal.status).toBe('LIQUIDADA');
    }
  });

  // -------------------------------------------------------------------------
  // (d) a mesma corrida, determinística
  // -------------------------------------------------------------------------

  it('(d) registarPagamento espera pela tranca de uma compensação em curso e soma por cima dela', async () => {
    // (c) depende de as duas transacções se cruzarem de facto. Aqui a compensação é
    // uma transacção à parte que tranca a factura (como a do serviço) e só faz commit
    // depois de o pagamento estar à espera de um lock. Quem lê a factura antes de a
    // trancar escreve 200 por cima dos 116 — perde a compensação.
    const idFatura = await emitirFatura();
    const conc = new Client({ connectionString: process.env.INTEGRATION_DB_URL! });
    const monitor = new Client({ connectionString: process.env.INTEGRATION_DB_URL! });
    await conc.connect();
    await monitor.connect();
    try {
      await conc.query('BEGIN');
      await conc.query('SELECT id FROM "Fatura" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE', [idFatura, TENANT]);

      const pagamento = noCtx(() =>
        fat.registarPagamento(pagamento200(idFatura), ctx),
      );
      const falhou = pagamento.then(
        () => null,
        (e: unknown) => e,
      );

      // Espera (com tecto) até o pagamento estar bloqueado num lock.
      let bloqueado = false;
      for (let i = 0; i < 60 && !bloqueado; i++) {
        const r = await monitor.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'`,
        );
        bloqueado = r.rows[0].n > 0;
        if (!bloqueado) await new Promise((res) => setTimeout(res, 50));
      }
      expect(bloqueado, 'o pagamento nunca chegou a esperar por um lock da factura').toBe(true);

      await conc.query('UPDATE "Fatura" SET "totalPago" = "totalPago" + 116, status = \'PARCIALMENTE_PAGA\' WHERE id = $1', [idFatura]);
      await conc.query('COMMIT');

      expect(await falhou).toBeNull();
      const f = await db.fatura.findFirst({ where: { id: idFatura, tenantId: TENANT } });
      expect(Number(String(f.totalPago))).toBeCloseTo(316, 2);
      expect(f.status).toBe('PARCIALMENTE_PAGA');
    } finally {
      await conc.query('ROLLBACK').catch(() => undefined);
      await conc.end();
      await monitor.end();
    }
  });
});
