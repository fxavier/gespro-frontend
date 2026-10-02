/**
 * Oráculo S2 (iteração 2) — invariante Factura-Recibo ⇔ PAGA (ADR-0041 §1; issue #306)
 *
 * Uma Factura-Recibo é, por definição, um documento pago no acto. O estado não pode
 * depender de o chamador se lembrar de passar `status: 'PAGA'`: quando
 * `emitirDocumentoEmTx` é chamado com `opcoes.tipoSerie = 'FATURA_RECIBO'` e SEM
 * `opcoes.status`, a Fatura tem de nascer PAGA com `totalPago = total` (estado derivado
 * da série). Controlo: sem opções, a factura comum continua EMITIDA com `totalPago = 0`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const dec = (v: unknown) => new Prisma.Decimal(String(v));

describe.skipIf(skip)('Factura-Recibo nasce PAGA pela série — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let val: typeof import('@/lib/validations/faturacao');

  const sufixo = Date.now();
  const TENANT = `tenant-fr-paga-${sufixo}`;
  const USER = `user-fr-paga-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);
  let clienteId: string;

  function inputFatura() {
    const hoje = new Date();
    return val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: hoje,
      dataVencimento: hoje,
      linhas: [{ descricao: 'Mercadoria', quantidade: 2, precoUnitario: 500, taxaIva: 0.16 }],
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant FR paga', slug: `fr-paga-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `fr-paga-${sufixo}@test.mz`, nome: 'Emissor', keycloakSub: `kc-fr-paga-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente FR',
        tipo: 'JURIDICA',
        nuit: '400000307',
        email: `fr-paga-cli-${sufixo}@test.mz`,
        telefone: '840000307',
        codigo: `CLI-FR-PAGA-${sufixo}`,
      },
    });
    clienteId = cliente.id;
  });

  it('tipoSerie FATURA_RECIBO sem status → Fatura PAGA com totalPago = total', async () => {
    const emitida: any = await noCtx(() =>
      db.$transaction((tx: any) => fat.emitirDocumentoEmTx(tx, inputFatura(), ctx, { tipoSerie: 'FATURA_RECIBO' })),
    );

    const f = await db.fatura.findFirst({ where: { id: emitida.id, tenantId: TENANT }, include: { serieDocumento: true } });
    expect(f.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(dec(f.total).equals(dec('1160'))).toBe(true);
    expect(f.status).toBe('PAGA');
    expect(dec(f.totalPago).equals(dec(f.total))).toBe(true);
  });

  it('controlo: sem opções, a factura comum nasce EMITIDA com totalPago = 0', async () => {
    const emitida: any = await noCtx(() => db.$transaction((tx: any) => fat.emitirDocumentoEmTx(tx, inputFatura(), ctx)));

    const f = await db.fatura.findFirst({ where: { id: emitida.id, tenantId: TENANT }, include: { serieDocumento: true } });
    expect(f.serieDocumento.tipo).toBe('FATURA');
    expect(f.status).toBe('EMITIDA');
    expect(dec(f.totalPago).equals(dec(0))).toBe(true);
  });
});
