/**
 * Oráculo — issue #142 (parte servidor): desactivar uma conta do plano não tinha reactivar.
 *
 * Contrato (decidido pelo orquestrador; opção conservadora onde ficou em aberto):
 *   - `reativarConta(id, ctx)` em `financas/contabilidade.service.ts`, simétrica de
 *     `desativarConta`: muda SÓ `ativo` (→ true), tenant explícito (conta de outro tenant ou
 *     inexistente → NotFoundError, nada muda), escrita SINGULAR pelo cliente estendido;
 *   - (des)activar fica no AuditLog: `ContaPGC` entra em `AUDIT_MODELS`, e cada escrita deixa
 *     um `UPDATE` com `before.ativo`/`after.ativo`;
 *   - action `reativarContaPGC({ id })` em `contabilidade.actions.ts`, com a mesma permissão e
 *     `revalidate` de `desativarContaPGC` (`financas:plano-contas:escrita`, tag `contas-pgc`),
 *     travada em modo de Leitura (é escrita), id por `idEntidade` (as contas PGC são uuid).
 *   - Não se abre nenhuma via nova para escrever `ativo` pelo `atualizarConta`.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache`
 * é dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:conta-form-etiquetas-142; um agente de implementação
 * que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
      acesso: 'aberto' | 'leitura' | 'fechado';
      emailVerificado: boolean;
    };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: unknown; error?: { code: string; message: string } };

describe.skipIf(skip)('Reactivar conta do plano PGC (#142) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];
  // Acesso dinâmico: a operação ainda não existe — falha o caso, não o ficheiro.
  let contab: Record<string, any>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;
  let nextCache: any;

  const sufixo = Date.now();
  const TENANT = `tenant-pgc-142-${sufixo}`;
  const TENANT_B = `tenant-pgc-142-b-${sufixo}`;
  const USER = `user-pgc-142-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  /** Conta folha do plano sem movimentos (122 — Depósitos com pré-aviso). */
  let conta: any;
  /** Segunda conta folha sem movimentos, usada pela action. */
  let contaAction: any;
  let contaOutroTenant: { id: string };

  const CAMPOS = ['codigo', 'nome', 'classe', 'tipo', 'natureza', 'nivel', 'contaMaeId', 'aceitaLancamento', 'descricao'];

  function sessao(permissions: string[], acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso, emailVerificado: true } };
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function reativar(): (id: string, c: typeof ctx) => Promise<any> {
    const fn = contab.reativarConta;
    expect(typeof fn, 'reativarConta não está exportada de contabilidade.service.ts').toBe('function');
    return fn;
  }

  function action() {
    const fn = actions.reativarContaPGC;
    expect(typeof fn, 'reativarContaPGC não está exportada de contabilidade.actions.ts').toBe('function');
    return fn;
  }

  const ler = (id: string) => db.contaPGC.findUnique({ where: { id } });

  async function auditUpdates(entityId: string, minimo: number): Promise<any[]> {
    // A auditoria de modelos não críticos é assíncrona: espera até 5 s.
    let logs: any[] = [];
    for (let i = 0; i < 50; i++) {
      logs = await db.auditLog.findMany({
        where: { tenantId: TENANT, entity: 'ContaPGC', entityId, action: 'UPDATE' },
        orderBy: { createdAt: 'asc' },
      });
      if (logs.length >= minimo) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return logs;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ NotFoundError } = await import('@/lib/errors'));
    contab = (await import('@/server/services/financas/contabilidade.service')) as unknown as Record<string, any>;
    actions = (await import('@/server/actions/contabilidade.actions')) as unknown as typeof actions;
    nextCache = await import('next/cache');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant plano 142', slug: `pgc-142-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pgc-142-${sufixo}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-pgc-142-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant plano 142 B', slug: `pgc-142-b-${sufixo}`, nuit: `${sufixo + 1}`.slice(-9) },
    });
    contaOutroTenant = await db.contaPGC.create({
      data: {
        tenantId: TENANT_B,
        codigo: '122',
        nome: 'Depósitos com pré-aviso',
        classe: 'CLASSE_1',
        tipo: 'ATIVO',
        natureza: 'DEVEDORA',
        nivel: 3,
        aceitaLancamento: true,
        ativo: false,
      },
    });

    conta = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '122' } });
    contaAction = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    expect(conta, 'ContaPGC 122 no tenant de teste').not.toBeNull();
    expect(contaAction, 'ContaPGC 123 no tenant de teste').not.toBeNull();
    expect(await db.partidaLancamento.count({ where: { contaId: { in: [conta.id, contaAction.id] } } })).toBe(0);
  }, 90_000);

  beforeEach(() => {
    sessao(['financas:plano-contas:escrita', 'financas:leitura']);
    vi.mocked(nextCache.updateTag).mockClear();
    vi.mocked(nextCache.revalidateTag).mockClear();
  });

  // -------------------------------------------------------------------------
  // Serviço
  // -------------------------------------------------------------------------

  it('desactivar uma conta sem movimentos grava ativo=false e deixa UPDATE no AuditLog (ContaPGC)', async () => {
    expect(conta.ativo).toBe(true);
    await noCtx(() => contab.desativarConta(conta.id, ctx));
    expect((await ler(conta.id)).ativo).toBe(false);

    const logs = await auditUpdates(conta.id, 1);
    expect(logs.length, 'a desactivação tinha de ficar no AuditLog (ContaPGC em AUDIT_MODELS)').toBe(1);
    expect(logs[0].data?.before?.ativo).toBe(true);
    expect(logs[0].data?.after?.ativo).toBe(false);
  });

  it('reactivar grava ativo=true, não mexe em mais nenhum campo e deixa novo UPDATE no AuditLog', async () => {
    const antes = await ler(conta.id);
    expect(antes.ativo).toBe(false);
    const nAntes = (await auditUpdates(conta.id, 1)).length;

    const devolvida = await noCtx(() => reativar()(conta.id, ctx));
    expect(devolvida?.ativo).toBe(true);

    const depois = await ler(conta.id);
    expect(depois.ativo).toBe(true);
    for (const campo of CAMPOS) expect(depois[campo], `campo ${campo} mudou`).toEqual(antes[campo]);

    const logs = await auditUpdates(conta.id, nAntes + 1);
    expect(logs.length).toBe(nAntes + 1);
    const ultimo = logs[logs.length - 1];
    expect(ultimo.userId).toBe(USER);
    expect(ultimo.data?.before?.ativo).toBe(false);
    expect(ultimo.data?.after?.ativo).toBe(true);
  });

  it('reactivada, a conta volta a aparecer entre as activas (listagem filtrada por ativo)', async () => {
    const r: any = await noCtx(() => contab.listarContas({ search: '122', ativo: true, take: 50 }, ctx));
    const linhas: any[] = Array.isArray(r) ? r : (r?.items ?? r?.data ?? []);
    expect(linhas.map((c) => c.id)).toContain(conta.id);
  });

  it('conta de outro tenant → NotFoundError e a conta do outro tenant continua inactiva', async () => {
    const erro = await capturarErro(() => noCtx(() => reativar()(contaOutroTenant.id, ctx)));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
    expect((await ler(contaOutroTenant.id)).ativo).toBe(false);
  });

  it('id inexistente → NotFoundError', async () => {
    const erro = await capturarErro(() => noCtx(() => reativar()(`cnaoexiste${sufixo}`, ctx)));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
  });

  // -------------------------------------------------------------------------
  // Action
  // -------------------------------------------------------------------------

  it('action com financas:plano-contas:escrita reactiva (id uuid) e revalida a tag contas-pgc', async () => {
    await noCtx(() => contab.desativarConta(contaAction.id, ctx));
    expect((await ler(contaAction.id)).ativo).toBe(false);

    const r = await action()({ id: contaAction.id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await ler(contaAction.id)).ativo).toBe(true);
    const tags = [
      ...vi.mocked(nextCache.updateTag).mock.calls,
      ...vi.mocked(nextCache.revalidateTag).mock.calls,
    ].map((c) => c[0]);
    expect(tags).toContain('contas-pgc');
  });

  it('action sem financas:plano-contas:escrita → SEM_PERMISSAO e nada muda', async () => {
    await noCtx(() => contab.desativarConta(contaAction.id, ctx));
    sessao(['financas:leitura', 'financas:ver']);
    const r = await action()({ id: contaAction.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await ler(contaAction.id)).ativo).toBe(false);
  });

  it('action em modo de Leitura → ACESSO_LEITURA e nada muda', async () => {
    sessao(['financas:plano-contas:escrita', 'financas:leitura'], 'leitura');
    const r = await action()({ id: contaAction.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ACESSO_LEITURA');
    expect((await ler(contaAction.id)).ativo).toBe(false);
  });

  it('action sobre conta de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const r = await action()({ id: contaOutroTenant.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect((await ler(contaOutroTenant.id)).ativo).toBe(false);
  });
});
