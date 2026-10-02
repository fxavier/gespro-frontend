/**
 * Oráculo S2 (iteração 2, achado M2) — o cliente técnico Consumidor Final é protegido
 * (ADR-0041 §2; issue #306)
 *
 * Toda a venda POS anónima factura contra o Consumidor Final (CF-000000, NUIT 999999999).
 * Se alguém o desactivar (soft delete) ou lhe mudar nome/NUIT, o POS anónimo deixa de
 * facturar, ou passa a facturar com um NUIT que não é o de consumidor final. Por isso:
 *   - `clienteService.desativar` (o «eliminar» do serviço — soft delete) e
 *     `clienteService.atualizar` sobre o Consumidor Final lançam BusinessRuleError
 *     `CLIENTE_TECNICO_PROTEGIDO` e não mudam nada na linha;
 *   - um cliente normal continua a actualizar e a desactivar-se como antes.
 *
 * O Consumidor Final é criado pelo `bootstrapContabilidade` real; identificado pelo
 * `codigo` de `@/lib/consumidor-final`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('Consumidor Final é um cliente técnico protegido — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let clienteService: (typeof import('@/server/services/comercial/cliente.service'))['clienteService'];
  let CF: (typeof import('@/lib/consumidor-final'))['CLIENTE_CONSUMIDOR_FINAL'];

  const sufixo = Date.now();
  const TENANT = `tenant-cf-protegido-${sufixo}`;
  const USER = `user-cf-protegido-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let cfId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const lerCliente = (id: string) => db.cliente.findFirst({ where: { id, tenantId: TENANT } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ clienteService } = await import('@/server/services/comercial/cliente.service'));
    ({ CLIENTE_CONSUMIDOR_FINAL: CF } = await import('@/lib/consumidor-final'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant CF protegido', slug: `cf-protegido-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `cf-protegido-${sufixo}@test.mz`, nome: 'Gestor', keycloakSub: `kc-cf-protegido-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cfs = await db.cliente.findMany({ where: { tenantId: TENANT, codigo: CF.codigo } });
    expect(cfs, 'o bootstrap cria um Consumidor Final').toHaveLength(1);
    cfId = cfs[0].id;
  });

  it.each([
    ['nome', { nome: 'Cliente Renomeado' }],
    ['NUIT', { nuit: '400000999' }],
    ['estado', { status: 'INATIVO' }],
  ])('atualizar o %s do Consumidor Final → CLIENTE_TECNICO_PROTEGIDO e a linha fica igual', async (_campo, input) => {
    const antes = await lerCliente(cfId);

    const erro = await capturarErro(() => noCtx(() => clienteService.atualizar(cfId, input as never, ctx)));

    expect(erro, 'a actualização tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CLIENTE_TECNICO_PROTEGIDO');
    expect(await lerCliente(cfId)).toEqual(antes);
  });

  it('desactivar (eliminar) o Consumidor Final → CLIENTE_TECNICO_PROTEGIDO e continua activo', async () => {
    const antes = await lerCliente(cfId);

    const erro = await capturarErro(() => noCtx(() => clienteService.desativar(cfId, ctx)));

    expect(erro, 'a desactivação tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CLIENTE_TECNICO_PROTEGIDO');
    const depois = await lerCliente(cfId);
    expect(depois).toEqual(antes);
    expect(depois.deletedAt).toBeNull();
    expect(depois.nuit).toBe(CF.nuit);
  });

  it('um cliente normal continua a actualizar-se e a desactivar-se', async () => {
    const normal = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Normal',
        tipo: 'JURIDICA',
        nuit: '400000123',
        email: `normal-${sufixo}@test.mz`,
        telefone: '840000123',
        codigo: `CLI-NORMAL-${sufixo}`,
      },
    });

    await noCtx(() => clienteService.atualizar(normal.id, { nome: 'Cliente Normal Renomeado' } as never, ctx));
    expect((await lerCliente(normal.id)).nome).toBe('Cliente Normal Renomeado');

    await noCtx(() => clienteService.desativar(normal.id, ctx));
    expect((await lerCliente(normal.id)).deletedAt).not.toBeNull();
  });
});
