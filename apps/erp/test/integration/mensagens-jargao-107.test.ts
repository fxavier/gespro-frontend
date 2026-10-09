/**
 * Oráculo #107 (integração) — as recusas de duplicado que o utilizador vê de facto, pelo
 * serviço real e contra a base efémera, não falam em «tenant».
 *
 *   - `fornecedorService.criar` com um NUIT já usado → `BusinessRuleError` `NUIT_DUPLICADO`
 *     (código inalterado), mensagem em pt-PT que identifica o NUIT e não diz «tenant».
 *   - `vendedorService.criar` para um utilizador que já é vendedor → `VENDEDOR_DUPLICADO`
 *     (código inalterado), mensagem sem «tenant».
 *   - Nada se grava na segunda tentativa.
 *
 * O varrimento de todas as mensagens dos serviços vive no unit
 * `src/server/services/__tests__/mensagens-jargao-107.test.ts`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#107 — mensagens de duplicado sem jargão — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fornecedorService: any;
  let vendedorService: any;

  const sufixo = Date.now();
  const TENANT = `tenant-msg-107-${sufixo}`;
  const USER = `user-msg-107-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);
  const NUIT = `4${String(sufixo).slice(-8)}`;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ fornecedorService } = await import('@/server/services/compras/fornecedor.service'));
    ({ vendedorService } = await import('@/server/services/comercial/vendedor.service'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant mensagens 107', slug: `msg-107-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: {
        id: USER,
        tenantId: TENANT,
        email: `msg-107-${sufixo}@test.mz`,
        nome: 'Gestor 107',
        keycloakSub: `kc-msg-107-${sufixo}`,
      },
    });
  });

  it('fornecedor com NUIT repetido → NUIT_DUPLICADO, mensagem com o NUIT e sem «tenant»; nada se grava', async () => {
    const dados = (nome: string) => ({
      nome,
      tipo: 'PESSOA_JURIDICA',
      nuit: NUIT,
      email: `${nome.toLowerCase().replace(/\s+/g, '-')}-${sufixo}@test.mz`,
      formasPagamento: [],
      tags: [],
    });

    await noCtx(() => fornecedorService.criar(dados('Fornecedor Um') as never, ctx));
    const erro = await capturarErro(() => noCtx(() => fornecedorService.criar(dados('Fornecedor Dois') as never, ctx)));

    expect(erro, 'o segundo fornecedor com o mesmo NUIT tinha de ser recusado').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('NUIT_DUPLICADO');
    expect(erro.message).toContain(NUIT);
    expect(erro.message, `«${erro.message}»`).not.toMatch(/\btenants?\b/i);

    const n = await db.fornecedor.count({ where: { tenantId: TENANT, nuit: NUIT } });
    expect(n).toBe(1);
  });

  it('segundo vendedor para o mesmo utilizador → VENDEDOR_DUPLICADO, mensagem sem «tenant»; nada se grava', async () => {
    await noCtx(() => vendedorService.criar({ nome: 'Vendedor 107', userId: USER } as never, ctx));
    const erro = await capturarErro(() =>
      noCtx(() => vendedorService.criar({ nome: 'Vendedor 107 bis', userId: USER } as never, ctx)),
    );

    expect(erro, 'o segundo vendedor do mesmo utilizador tinha de ser recusado').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('VENDEDOR_DUPLICADO');
    expect(erro.message.trim().length).toBeGreaterThan(10);
    expect(erro.message, `«${erro.message}»`).not.toMatch(/\btenants?\b/i);

    const n = await db.vendedor.count({ where: { tenantId: TENANT, userId: USER, deletedAt: null } });
    expect(n).toBe(1);
  });
});
