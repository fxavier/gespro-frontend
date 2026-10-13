/**
 * ORÁCULO — issue #525 (nó B:admin-plataforma): guarda única de servidor e
 * opção `plataforma` da `createSafeAction`.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (ADR-0011 §5; ADR-0049 em escrita):
 *   - a sessão traz `session.user.plataformaAdmin: boolean` (papel de realm
 *     `plataforma-admin`); um administrador de plataforma SEM `User` de tenant
 *     tem sessão sem `tenantId`;
 *   - `src/server/auth/plataforma-admin.ts` ('server-only') exporta
 *     `exigirPlataformaAdmin()`: com o papel na sessão resolve; sem ele chama
 *     `notFound()` de `next/navigation` (404 — nunca revelar que a área existe);
 *   - `createSafeAction({ plataforma: true, … })`: só corre com o papel; NÃO
 *     estabelece contexto de tenant (nem quando a sessão também tem tenant);
 *     o `tenantId` vindo do cliente não chega ao handler; não é travada pelo
 *     modo de Leitura/pagamento do tenant de quem a chama; o utilizador fica
 *     no log;
 *   - uma action NORMAL (sem `plataforma`) chamada por uma sessão sem tenant é
 *     recusada antes do handler — o papel não abre dados de tenant;
 *   - o layout `src/app/(plataforma)/plataforma/layout.tsx` usa a guarda: sem o
 *     papel → `notFound()`.
 *
 * Seams lidos dinamicamente (`as any`) para que cada caso falhe pela asserção e
 * não o ficheiro inteiro.
 *
 * ESTADO ESPERADO antes da implementação: RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  logs: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: mocks.runWithTenantContext,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  usePathname: () => '/plataforma',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/server/observability/logger', () => {
  const registar = (...a: unknown[]) => {
    mocks.logs.push(a);
  };
  const fazer = (base: unknown): Record<string, unknown> => {
    const l: Record<string, unknown> = {
      info: registar,
      warn: registar,
      error: registar,
      debug: registar,
      trace: registar,
      fatal: registar,
    };
    l.child = (b: unknown) => {
      mocks.logs.push(['child', b]);
      return fazer(b);
    };
    void base;
    return l;
  };
  return { logger: fazer({}) };
});

import { createSafeAction } from '@/server/safe-action';

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

const ID_PLAT = 'plat-user-525';

/** Administrador de plataforma SEM User de tenant: sessão sem tenantId. */
function sessaoSoPlataforma() {
  return {
    user: {
      id: ID_PLAT,
      email: 'plataforma@gespro.mz',
      name: 'Plataforma',
      tenantId: undefined,
      permissions: [],
      emailVerificado: true,
      acesso: 'aberto',
      plataformaAdmin: true,
    },
  };
}

/** Utilizador com tenant E com o papel de plataforma. */
function sessaoDupla(acesso: 'aberto' | 'leitura' | 'pagamento' = 'aberto') {
  return {
    user: {
      id: 'dupla-user-525',
      email: 'dupla@demo.mz',
      name: 'Dupla',
      tenantId: 'tenant-525',
      permissions: ['modulo:escrever'],
      emailVerificado: true,
      acesso,
      plataformaAdmin: true,
    },
  };
}

/** Administrador de TENANT, com todas as permissões, sem o papel. */
function sessaoTenantAdmin(plataformaAdmin: boolean | undefined = false) {
  return {
    user: {
      id: 'admin-tenant-525',
      email: 'admin@demo.mz',
      name: 'Admin',
      tenantId: 'tenant-525',
      permissions: ['modulo:escrever', 'assinatura:gerir', 'utilizadores:gerir'],
      emailVerificado: true,
      acesso: 'aberto',
      ...(plataformaAdmin === undefined ? {} : { plataformaAdmin }),
    },
  };
}

// ---------------------------------------------------------------------------
// Actions sob teste
// ---------------------------------------------------------------------------

const handlerPlat = vi.fn(async (input: unknown, ctx: unknown) => ({ input, ctx }));
const handlerNormal = vi.fn(async (_input: unknown, ctx: unknown) => ({ ctx }));

// `plataforma` ainda não existe no tipo das opções: passa-se por `any`.
const criar = createSafeAction as any;

const accaoPlataforma = criar({
  plataforma: true,
  // `.passthrough()` de propósito: o pipeline, e não o schema da action, é
  // quem garante que um `tenantId` vindo do cliente não chega ao handler.
  schema: z.object({ nome: z.string() }).passthrough(),
  revalidate: { paths: ['/plataforma'] },
  handler: handlerPlat,
});

const accaoNormal = createSafeAction({
  permission: 'modulo:escrever',
  revalidate: { paths: ['/algures'] },
  handler: handlerNormal,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logs.length = 0;
});

describe('createSafeAction({ plataforma: true })', () => {
  it('sem sessão → NAO_AUTENTICADO, handler não corre', async () => {
    mocks.auth.mockResolvedValue(null);
    const r = await accaoPlataforma({ nome: 'x' });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTENTICADO' } });
    expect(handlerPlat).not.toHaveBeenCalled();
  });

  it('administrador de TENANT sem o papel → recusado antes do handler (com todas as permissões)', async () => {
    mocks.auth.mockResolvedValue(sessaoTenantAdmin(false));
    const r = await accaoPlataforma({ nome: 'x' });
    expect(r.ok).toBe(false);
    expect(handlerPlat).not.toHaveBeenCalled();
    if (r.ok) return;
    // Recusa estável, nunca erro interno.
    expect(['NAO_ENCONTRADO', 'SEM_PERMISSAO']).toContain(r.error.code);
  });

  it('sessão antiga sem o campo `plataformaAdmin` → recusada (ausente conta como false)', async () => {
    mocks.auth.mockResolvedValue(sessaoTenantAdmin(undefined));
    const r = await accaoPlataforma({ nome: 'x' });
    expect(r.ok).toBe(false);
    expect(handlerPlat).not.toHaveBeenCalled();
  });

  it('com o papel e sem tenant → corre, SEM contexto de tenant', async () => {
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await accaoPlataforma({ nome: 'x' });

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(handlerPlat).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
    const ctx = handlerPlat.mock.calls[0][1] as Record<string, unknown> | undefined;
    expect(ctx?.tenantId).toBeFalsy();
  });

  it('com o papel E com tenant → continua a NÃO estabelecer contexto de tenant', async () => {
    mocks.auth.mockResolvedValue(sessaoDupla());
    const r = await accaoPlataforma({ nome: 'x' });

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
    const ctx = handlerPlat.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(ctx?.tenantId).toBeFalsy();
  });

  it('um `tenantId` vindo do cliente nunca chega ao handler (ignorado ou recusado)', async () => {
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await accaoPlataforma({ nome: 'x', tenantId: 'tenant-alheio' });

    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
    if (r.ok) {
      expect(handlerPlat).toHaveBeenCalledTimes(1);
      const input = handlerPlat.mock.calls[0][0] as Record<string, unknown>;
      expect(input.tenantId).toBeUndefined();
      const ctx = handlerPlat.mock.calls[0][1] as Record<string, unknown> | undefined;
      expect(ctx?.tenantId).toBeFalsy();
    } else {
      expect(handlerPlat).not.toHaveBeenCalled();
      expect(r.error.code).not.toBe('ERRO_INTERNO');
    }
    // Controlo: o caso tem de ter sido exercitado com a opção a existir —
    // sem ela, a action corria no contexto do tenant da sessão.
    mocks.auth.mockResolvedValue(sessaoTenantAdmin(false));
    const recusa = await accaoPlataforma({ nome: 'x', tenantId: 'tenant-alheio' });
    expect(recusa.ok).toBe(false);
  });

  it.each(['leitura', 'pagamento'] as const)(
    'não é travada pelo modo `%s` do tenant de quem a chama',
    async (acesso) => {
      mocks.auth.mockResolvedValue(sessaoDupla(acesso));
      const r = await accaoPlataforma({ nome: 'x' });
      expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
      expect(handlerPlat).toHaveBeenCalledTimes(1);
    },
  );

  it('regista o utilizador no log da action', async () => {
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    await accaoPlataforma({ nome: 'x' });
    expect(JSON.stringify(mocks.logs)).toContain(ID_PLAT);
  });
});

describe('o papel não abre dados de tenant — actions normais', () => {
  it('action normal chamada por sessão SEM tenant → recusada antes do handler', async () => {
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await accaoNormal(undefined as never);
    expect(r.ok).toBe(false);
    expect(handlerNormal).not.toHaveBeenCalled();
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
    if (r.ok) return;
    expect(r.error.code).not.toBe('ERRO_INTERNO');
  });

  it('action normal ainda que sem `permission` → recusada para sessão sem tenant', async () => {
    const semPermissao = createSafeAction({
      revalidate: { paths: ['/algures'] },
      handler: handlerNormal,
    });
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await semPermissao(undefined as never);
    expect(r.ok).toBe(false);
    expect(handlerNormal).not.toHaveBeenCalled();
  });

  it('controlo: utilizador com tenant e com o papel continua a correr actions normais no SEU tenant', async () => {
    mocks.auth.mockResolvedValue(sessaoDupla());
    const r = await accaoNormal(undefined as never);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(mocks.runWithTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantContext.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-525' });
  });
});

// ---------------------------------------------------------------------------
// Guarda de servidor
// ---------------------------------------------------------------------------

async function guarda(): Promise<() => Promise<unknown>> {
  // Caminho em variável: o módulo ainda não existe e o `tsc` do `pnpm check`
  // não pode partir por isso — o caso é que tem de falhar.
  const caminho: string = '@/server/auth/plataforma-admin';
  const mod: any = await import(/* @vite-ignore */ caminho).catch((e) => ({ __erro: e }));
  expect(
    typeof mod.exigirPlataformaAdmin,
    '`exigirPlataformaAdmin` tem de ser exportado de src/server/auth/plataforma-admin.ts (#525)',
  ).toBe('function');
  return mod.exigirPlataformaAdmin;
}

describe('exigirPlataformaAdmin()', () => {
  it('com o papel e sem tenant → resolve, sem notFound', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    await exigir();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('com o papel e com tenant → resolve', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoDupla());
    await exigir();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('administrador de tenant sem o papel → notFound() (404, não 403)', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoTenantAdmin(false));
    await expect(exigir()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('sessão sem o campo → notFound()', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoTenantAdmin(undefined));
    await expect(exigir()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sem sessão → não resolve (notFound ou login)', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(null);
    await expect(exigir()).rejects.toThrow(/NEXT_NOT_FOUND|NEXT_REDIRECT:\/auth\/login/);
  });
});

describe('layout (plataforma)/plataforma usa a guarda', () => {
  async function layout(): Promise<(p: { children: unknown }) => Promise<unknown>> {
    const caminho: string = '@/app/(plataforma)/plataforma/layout';
    const mod: any = await import(/* @vite-ignore */ caminho).catch((e) => ({
      __erro: e,
    }));
    expect(
      typeof mod.default,
      `layout de src/app/(plataforma)/plataforma em falta: ${String(mod.__erro ?? '')}`,
    ).toBe('function');
    return mod.default;
  }

  it('administrador de tenant sem o papel → notFound()', async () => {
    const Layout = await layout();
    mocks.auth.mockResolvedValue(sessaoTenantAdmin(false));
    await expect(Layout({ children: null })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('com o papel → renderiza (sem notFound)', async () => {
    const Layout = await layout();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const el = await Layout({ children: null });
    expect(el).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
