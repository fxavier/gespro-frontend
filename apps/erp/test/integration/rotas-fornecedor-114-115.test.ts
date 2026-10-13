/**
 * Oráculo — issue #115: arquivar fornecedor é irreversível, contra o texto da confirmação.
 *
 * Contrato (decidido pelo orquestrador: a saída REVERSÍVEL — acção «Reactivar»):
 *   - `fornecedorService.reactivar(id, ctx)` em `compras/fornecedor.service.ts`: só aceita um
 *     fornecedor arquivado (`deletedAt` preenchido) — senão `BusinessRuleError`
 *     `FORNECEDOR_NAO_ARQUIVADO` e nada muda; repõe `deletedAt = null` e `status = 'ATIVO'` e não
 *     toca em mais nenhum campo; tenant explícito (fornecedor de outro tenant ou inexistente →
 *     `NotFoundError`, nada muda).
 *   - Para se poder chegar a um arquivado: `fornecedorService.listar({ arquivados: true })`
 *     devolve SÓ os arquivados do tenant; sem a bandeira, só os não arquivados (comportamento
 *     actual). `FilterFornecedorSchema` aceita `arquivados: boolean`.
 *   - `fornecedorService.obter(id)` de um arquivado continua a responder e expõe
 *     `arquivadoEm: Date | null` (Date quando arquivado; null depois de reactivar).
 *   - action `reactivarFornecedorAction({ id })` em `fornecedores.actions.ts`, com a MESMA
 *     permissão do arquivar (`fornecedores:arquivar` — sem permissão nova, sem seed), `revalidate`
 *     de um caminho de `/fornecedores`, travada em modo de Leitura (é escrita).
 *   - Escolha conservadora deste verificador: reactivar devolve `status = 'ATIVO'` (o estado
 *     anterior ao arquivo não é guardado) e reactivar um não arquivado é RECUSADO, não ignorado.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:rotas-fornecedor-114-115; um agente de implementação que o
 * altere é BLOCKER.
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

describe.skipIf(skip)('Arquivar/reactivar fornecedor (#115) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  // Acesso dinâmico: a operação ainda não existe — falha o caso, não o ficheiro.
  let svc: Record<string, any>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;
  let FilterFornecedorSchema: any;
  let nextCache: any;

  const sufixo = Date.now();
  const TENANT = `tenant-forn-115-${sufixo}`;
  const TENANT_B = `tenant-forn-115-b-${sufixo}`;
  const USER = `user-forn-115-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>, c = ctx) => runCtx(c, fn);

  let alfa: { id: string }; // arquivado e reactivado pelo serviço
  let beta: { id: string }; // nunca arquivado
  let gama: { id: string }; // arquivado e reactivado pela action
  let doOutroTenant: { id: string }; // arquivado no tenant B

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

  function reactivarSvc(): (id: string, c: typeof ctx) => Promise<unknown> {
    const fn = svc.reactivar;
    expect(typeof fn, 'fornecedorService.reactivar não existe').toBe('function');
    return fn.bind(svc);
  }

  function action() {
    const fn = actions.reactivarFornecedorAction;
    expect(typeof fn, 'reactivarFornecedorAction não está exportada de fornecedores.actions.ts').toBe('function');
    return fn;
  }

  const reactivar = (id: string) => noCtx(() => reactivarSvc()(id, ctx));
  const arquivar = (id: string, c = ctx) => noCtx(() => svc.arquivar(id, c), c);
  const ler = (id: string) => db.fornecedor.findUnique({ where: { id } });
  const listar = async (filtros: Record<string, unknown>, c = ctx): Promise<string[]> => {
    const p: any = await noCtx(() => svc.listar({ take: 100, ...filtros }, c), c);
    return p.items.map((f: any) => f.id);
  };

  async function criarFornecedor(tenantId: string, chave: string, n: number) {
    return db.fornecedor.create({
      data: {
        tenantId,
        codigo: `FOR-115-${chave}-${sufixo}`,
        nome: `Fornecedor 115 ${chave}`,
        tipo: 'PESSOA_JURIDICA',
        nuit: `5${String(sufixo + n).slice(-8)}`,
        email: `for-115-${chave.toLowerCase()}-${sufixo}@test.mz`,
        classificacao: 'PREFERENCIAL',
        observacoes: `observação ${chave}`,
      },
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ NotFoundError, BusinessRuleError } = await import('@/lib/errors'));
    ({ fornecedorService: svc } = (await import('@/server/services/compras/fornecedor.service')) as any);
    actions = (await import('@/server/actions/fornecedores.actions')) as unknown as typeof actions;
    ({ FilterFornecedorSchema } = await import('@/lib/validations/fornecedores'));
    nextCache = await import('next/cache');

    for (const [id, nome, n] of [
      [TENANT, 'Tenant fornecedores 115', 0],
      [TENANT_B, 'Tenant fornecedores 115 B', 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome, slug: `forn-115-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `forn-115-${sufixo}@test.mz`, nome: 'Comprador', keycloakSub: `kc-forn-115-${sufixo}` },
    });

    alfa = await criarFornecedor(TENANT, 'ALFA', 10);
    beta = await criarFornecedor(TENANT, 'BETA', 11);
    gama = await criarFornecedor(TENANT, 'GAMA', 12);
    doOutroTenant = await criarFornecedor(TENANT_B, 'OUTRO', 13);
    await arquivar(doOutroTenant.id, ctxB);
  }, 90_000);

  beforeEach(() => {
    sessao(['fornecedores:arquivar', 'fornecedores:ver']);
    vi.mocked(nextCache.revalidatePath).mockClear();
  });

  // -------------------------------------------------------------------------
  // Partida: o arquivo de hoje (já existe)
  // -------------------------------------------------------------------------

  it('partida: arquivar grava deletedAt + INATIVO e o fornecedor sai da listagem padrão', async () => {
    await arquivar(alfa.id);
    const f = await ler(alfa.id);
    expect(f.deletedAt).not.toBeNull();
    expect(f.status).toBe('INATIVO');
    const ids = await listar({});
    expect(ids).not.toContain(alfa.id);
    expect(ids).toContain(beta.id);
  });

  // -------------------------------------------------------------------------
  // Chegar a um arquivado
  // -------------------------------------------------------------------------

  it('FilterFornecedorSchema aceita a bandeira arquivados', () => {
    const r = FilterFornecedorSchema.safeParse({ arquivados: true });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data.arquivados).toBe(true);
  });

  it('listar({ arquivados: true }) devolve SÓ os arquivados do próprio tenant', async () => {
    const ids = await listar({ arquivados: true });
    expect(ids).toContain(alfa.id);
    expect(ids).not.toContain(beta.id);
    expect(ids).not.toContain(gama.id);
    expect(ids, 'arquivado de outro tenant não pode aparecer').not.toContain(doOutroTenant.id);
  });

  it('obter de um arquivado responde e expõe arquivadoEm (Date)', async () => {
    const d: any = await noCtx(() => svc.obter(alfa.id, ctx));
    expect(d.id).toBe(alfa.id);
    expect(d.arquivadoEm, 'arquivadoEm tem de vir preenchido num arquivado').toBeInstanceOf(Date);
    const b: any = await noCtx(() => svc.obter(beta.id, ctx));
    expect(b.arquivadoEm, 'arquivadoEm é null num fornecedor activo').toBeNull();
  });

  // -------------------------------------------------------------------------
  // Serviço
  // -------------------------------------------------------------------------

  it('reactivar repõe deletedAt=null e status ATIVO, sem tocar em mais nenhum campo', async () => {
    const antes = await ler(alfa.id);
    await reactivar(alfa.id);
    const depois = await ler(alfa.id);
    expect(depois.deletedAt).toBeNull();
    expect(depois.status).toBe('ATIVO');
    for (const campo of ['tenantId', 'codigo', 'nome', 'nuit', 'email', 'tipo', 'classificacao', 'observacoes', 'diasPagamento']) {
      expect(depois[campo], campo).toEqual(antes[campo]);
    }
    expect(String(depois.saldoDevedor)).toBe(String(antes.saldoDevedor));
    expect(String(depois.totalCompras)).toBe(String(antes.totalCompras));
  });

  it('reactivado, volta à listagem padrão, sai da dos arquivados, e obter dá arquivadoEm null', async () => {
    expect(await listar({})).toContain(alfa.id);
    expect(await listar({ arquivados: true })).not.toContain(alfa.id);
    const d: any = await noCtx(() => svc.obter(alfa.id, ctx));
    expect(d.arquivadoEm).toBeNull();
    expect(d.status).toBe('ATIVO');
  });

  it('o ciclo repete-se: arquivar de novo e reactivar de novo', async () => {
    await arquivar(alfa.id);
    expect((await ler(alfa.id)).deletedAt).not.toBeNull();
    await reactivar(alfa.id);
    const f = await ler(alfa.id);
    expect(f.deletedAt).toBeNull();
    expect(f.status).toBe('ATIVO');
  });

  it('reactivar um fornecedor não arquivado → FORNECEDOR_NAO_ARQUIVADO e nada muda', async () => {
    const antes = await ler(beta.id);
    const erro = await capturarErro(() => reactivar(beta.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('FORNECEDOR_NAO_ARQUIVADO');
    const depois = await ler(beta.id);
    expect(depois.updatedAt.getTime()).toBe(antes.updatedAt.getTime());
    expect(depois.status).toBe(antes.status);
  });

  it('fornecedor de outro tenant → NotFoundError e continua arquivado', async () => {
    const erro = await capturarErro(() => reactivar(doOutroTenant.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
    const f = await ler(doOutroTenant.id);
    expect(f.deletedAt).not.toBeNull();
    expect(f.status).toBe('INATIVO');
  });

  it('id inexistente → NotFoundError', async () => {
    const erro = await capturarErro(() => reactivar(`cnaoexiste${sufixo}`));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
  });

  // -------------------------------------------------------------------------
  // Action
  // -------------------------------------------------------------------------

  it('action com fornecedores:arquivar reactiva e revalida um caminho de /fornecedores', async () => {
    await arquivar(gama.id);
    const r = await action()({ id: gama.id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const f = await ler(gama.id);
    expect(f.deletedAt).toBeNull();
    expect(f.status).toBe('ATIVO');
    const caminhos: string[] = vi.mocked(nextCache.revalidatePath).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(caminhos.some((p) => p.startsWith('/fornecedores')), JSON.stringify(caminhos)).toBe(true);
  });

  it('action sem fornecedores:arquivar → SEM_PERMISSAO e nada muda', async () => {
    await arquivar(gama.id);
    sessao(['fornecedores:ver', 'fornecedores:editar']);
    const r = await action()({ id: gama.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await ler(gama.id)).deletedAt).not.toBeNull();
  });

  it('action em modo de Leitura → ACESSO_LEITURA e nada muda', async () => {
    sessao(['fornecedores:arquivar', 'fornecedores:ver'], 'leitura');
    const r = await action()({ id: gama.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ACESSO_LEITURA');
    expect((await ler(gama.id)).deletedAt).not.toBeNull();
  });

  it('action sobre fornecedor de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const r = await action()({ id: doOutroTenant.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect((await ler(doOutroTenant.id)).deletedAt).not.toBeNull();
  });
});
