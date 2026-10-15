/**
 * ORÁCULO — issue #537 (nó G:sessao-tenant-opcional): `Session.user.tenantId`
 * opcional para as sessões de plataforma.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *   1. `src/types/next-auth.d.ts` declara `Session.user.tenantId?: string` —
 *      o tipo verdadeiro (o JWT já o tinha opcional).
 *   2. Guarda ÚNICA de servidor `src/server/auth/sessao-tenant.ts`
 *      ('server-only') que exporta `exigirSessaoDeTenant()`:
 *        - sem sessão                → `redirect('/auth/login')`;
 *        - sessão sem `tenantId`     → `redirect('/plataforma')` (nunca 404,
 *                                      nunca um tenant vazio);
 *        - sessão de tenant          → devolve `{ tenantId: string, userId, … }`
 *                                      com os valores da sessão, sem redirect.
 *      As páginas e layouts do tenant que hoje leem `session.user.tenantId`
 *      passam a usá-la (nenhum `page.tsx`/`layout.tsx` lê `user.tenantId`).
 *   3. Nenhum `tenantId as string`, `tenantId!` nem `user.tenantId ?? ''` em
 *      `apps/erp/src` (fora de testes). DECISÃO DO VERIFICADOR (conservadora,
 *      «recusar > número errado»): o `?? ''` fica também proibido — trocar o
 *      cast por um tenant vazio passaria o `tsc` e mandaria `''` ao serviço.
 *   4. Comportamento igual para sessões de tenant; os pipelines mantêm a recusa
 *      da sessão sem tenant ANTES da permissão (`createSafeAction` → 403
 *      `SEM_PERMISSAO`; `withApi` → 403), sem contexto de tenant. Estes casos
 *      já estão verdes hoje: são a tranca de regressão do refactor.
 *
 * Seams lidos dinamicamente (`as any`) para que cada caso falhe pela asserção e
 * não o ficheiro inteiro.
 *
 * ESTADO ESPERADO antes da implementação: RED (helper inexistente, tipo
 * obrigatório, `as string` em `src/lib/auth.ts`, páginas a ler
 * `session.user.tenantId`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: mocks.runWithTenantContext,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { createSafeAction } from '@/server/safe-action';
import { withApi } from '@/lib/api/with-api';

const ERP = resolve(__dirname, '../../..');
const SRC = join(ERP, 'src');

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

/** Administrador de plataforma SEM User de tenant: sessão sem tenantId. */
function sessaoSoPlataforma() {
  return {
    user: {
      id: 'plat-user-537',
      email: 'plataforma@gespro.mz',
      name: 'Plataforma',
      permissions: [] as string[],
      emailVerificado: true,
      acesso: 'aberto',
      plataformaAdmin: true,
    },
  };
}

function sessaoTenant(plataformaAdmin = false) {
  return {
    user: {
      id: 'user-537',
      email: 'admin@demo.mz',
      name: 'Admin',
      tenantId: 'tenant-537',
      permissions: ['modulo:ler', 'modulo:escrever'],
      emailVerificado: true,
      acesso: 'aberto',
      plataformaAdmin,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 2. Guarda de servidor exigirSessaoDeTenant()
// ---------------------------------------------------------------------------

async function guarda(): Promise<() => Promise<any>> {
  // Caminho em variável: o módulo ainda não existe e o `tsc` não pode partir
  // por isso — o caso é que tem de falhar.
  const caminho: string = '@/server/auth/sessao-tenant';
  const mod: any = await import(/* @vite-ignore */ caminho).catch((e) => ({ __erro: e }));
  expect(
    typeof mod.exigirSessaoDeTenant,
    '`exigirSessaoDeTenant` tem de ser exportado de src/server/auth/sessao-tenant.ts (#537)',
  ).toBe('function');
  return mod.exigirSessaoDeTenant;
}

describe('exigirSessaoDeTenant()', () => {
  it('sem sessão → redirect para /auth/login', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(null);
    await expect(exigir()).rejects.toThrow('NEXT_REDIRECT:/auth/login');
    expect(mocks.redirect).toHaveBeenCalledWith('/auth/login');
  });

  it('sessão sem `user` → redirect para /auth/login', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue({ expires: '2099-01-01' });
    await expect(exigir()).rejects.toThrow('NEXT_REDIRECT:/auth/login');
  });

  it('sessão de plataforma sem tenant → redirect para /plataforma (nunca 404)', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    await expect(exigir()).rejects.toThrow('NEXT_REDIRECT:/plataforma');
    expect(mocks.redirect).toHaveBeenCalledWith('/plataforma');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('tenantId vazio conta como ausente → redirect para /plataforma', async () => {
    const exigir = await guarda();
    const s = sessaoTenant();
    mocks.auth.mockResolvedValue({ user: { ...s.user, tenantId: '' } });
    await expect(exigir()).rejects.toThrow('NEXT_REDIRECT:/plataforma');
  });

  it('sessão de tenant → devolve tenantId e userId da sessão, sem redirect', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoTenant());
    const r = await exigir();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tenantId: 'tenant-537', userId: 'user-537' });
    expect(typeof r.tenantId).toBe('string');
  });

  it('utilizador de tenant que também é administrador de plataforma → fica no seu tenant', async () => {
    const exigir = await guarda();
    mocks.auth.mockResolvedValue(sessaoTenant(true));
    const r = await exigir();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tenantId: 'tenant-537', userId: 'user-537' });
  });

  it('o módulo é server-only', () => {
    const f = join(SRC, 'server/auth/sessao-tenant.ts');
    expect(existsSync(f), 'src/server/auth/sessao-tenant.ts tem de existir').toBe(true);
    if (!existsSync(f)) return;
    expect(readFileSync(f, 'utf8')).toMatch(/^\s*import ['"]server-only['"];?/m);
  });
});

// ---------------------------------------------------------------------------
// 4. Pipelines — a recusa da sessão sem tenant mantém-se (regressão)
// ---------------------------------------------------------------------------

describe('pipelines — sessão sem tenant continua recusada antes da permissão', () => {
  const handler = vi.fn(async () => ({ feito: true }));

  it('createSafeAction com permissão que a sessão NÃO tem → recusa por falta de tenant, sem contexto', async () => {
    const accao = createSafeAction({
      permission: 'modulo:escrever',
      revalidate: { paths: ['/algures'] },
      handler,
    });
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await accao(undefined as never);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('SEM_PERMISSAO');
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it('createSafeAction de leitura sem permissão declarada → recusada para sessão sem tenant', async () => {
    const accao = createSafeAction({ permiteEmLeitura: true, handler } as any) as any;
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await accao(undefined);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it('controlo: a mesma action com sessão de tenant corre no tenant da sessão', async () => {
    const accao = createSafeAction({
      permission: 'modulo:escrever',
      revalidate: { paths: ['/algures'] },
      handler,
    });
    mocks.auth.mockResolvedValue(sessaoTenant());
    const r = await accao(undefined as never);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(mocks.runWithTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantContext.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-537',
      userId: 'user-537',
    });
  });

  it('withApi (rota sem permissão declarada) → 403 para sessão sem tenant, handler não corre', async () => {
    const rotaHandler = vi.fn(async () => Response.json({ ok: true }));
    const rota = withApi(rotaHandler as any);
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const res = await rota(new NextRequest('http://localhost:3000/api/qualquer'));
    expect(res.status).toBe(403);
    expect(rotaHandler).not.toHaveBeenCalled();
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it('controlo: withApi com sessão de tenant passa o tenantId da sessão ao handler', async () => {
    const rotaHandler = vi.fn(async (_req: unknown, _ctx: unknown) => Response.json({ ok: true }));
    const rota = withApi(rotaHandler as any);
    mocks.auth.mockResolvedValue(sessaoTenant());
    const res = await rota(new NextRequest('http://localhost:3000/api/qualquer'));
    expect(res.status).toBe(200);
    expect(rotaHandler).toHaveBeenCalledTimes(1);
    expect(rotaHandler.mock.calls[0][1]).toMatchObject({ tenantId: 'tenant-537' });
  });
});

// ---------------------------------------------------------------------------
// 1 e 3. Estático — tipo verdadeiro e nenhum cast sobre o tenantId
// ---------------------------------------------------------------------------

function ficheirosFonte(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === '__tests__' || nome === 'node_modules') continue;
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...ficheirosFonte(p));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
}

function ocorrencias(re: RegExp, alvo: string[] = ficheirosFonte(SRC)): string[] {
  const achados: string[] = [];
  for (const f of alvo) {
    const linhas = readFileSync(f, 'utf8').split('\n');
    linhas.forEach((l, i) => {
      if (re.test(l)) achados.push(`${relative(ERP, f)}:${i + 1}: ${l.trim()}`);
    });
  }
  return achados;
}

describe('tipo da sessão (src/types/next-auth.d.ts)', () => {
  it('Session.user.tenantId é opcional', () => {
    const d = readFileSync(join(SRC, 'types/next-auth.d.ts'), 'utf8');
    const inicio = d.indexOf('interface Session');
    const fim = d.indexOf("declare module 'next-auth/jwt'");
    expect(inicio, 'interface Session não encontrada').toBeGreaterThanOrEqual(0);
    const bloco = d.slice(inicio, fim > inicio ? fim : undefined);
    expect(bloco).toMatch(/\btenantId\?\s*:\s*string\s*;/);
    expect(bloco).not.toMatch(/\btenantId\s*:\s*string\s*;/);
  });
});

describe('nenhum cast nem tenant vazio sobre o tenantId (apps/erp/src)', () => {
  it('nenhum `tenantId as string`', () => {
    expect(ocorrencias(/tenantId\s+as\s+string/)).toEqual([]);
  });

  it('nenhum `tenantId!` (asserção de não-nulo)', () => {
    expect(ocorrencias(/tenantId!(?!=)/)).toEqual([]);
  });

  it("nenhum `user.tenantId ?? ''` (tenant vazio em vez de recusa)", () => {
    // Só o lido da sessão: `opts.tenantId ?? ''` do prom-registry é um rótulo de métrica.
    expect(ocorrencias(/user\??\.tenantId\s*(\?\?|\|\|)\s*(''|""|``)/)).toEqual([]);
  });
});

describe('páginas e layouts do tenant usam a guarda', () => {
  const app = join(SRC, 'app');
  const paginasELayouts = ficheirosFonte(app).filter((f) => /\/(page|layout)\.tsx$/.test(f));

  it('nenhum page.tsx/layout.tsx lê `user.tenantId` directamente', () => {
    expect(ocorrencias(/\buser\.tenantId\b/, paginasELayouts)).toEqual([]);
  });

  // Os leitores directos de `session.user.tenantId` em páginas/layouts à data
  // do oráculo (git grep -n 'user.tenantId' -- apps/erp/src).
  const LEITORES_537 = [
    'src/app/(dashboard)/layout.tsx',
    'src/app/dashboard/layout.tsx',
    'src/app/(dashboard)/compras/cotacoes/novo/page.tsx',
    'src/app/(dashboard)/compras/pedidos/novo/page.tsx',
    'src/app/(dashboard)/contabilidade/balanco/page.tsx',
    'src/app/(dashboard)/contabilidade/reconciliacao/[contaId]/importar/page.tsx',
    'src/app/(dashboard)/contabilidade/reconciliacao/[contaId]/manual/page.tsx',
    'src/app/(dashboard)/contabilidade/reconciliacao/[contaId]/page.tsx',
    'src/app/(dashboard)/contabilidade/reconciliacao/[contaId]/periodos/[periodoId]/page.tsx',
    'src/app/(dashboard)/contabilidade/reconciliacao/[contaId]/periodos/novo/page.tsx',
    'src/app/(dashboard)/contabilidade/reconciliacao/[contaId]/periodos/page.tsx',
    'src/app/(dashboard)/definicoes/empresa/page.tsx',
    'src/app/(dashboard)/definicoes/faturacao/page.tsx',
    'src/app/(dashboard)/faturacao/cotacoes/nova/page.tsx',
    'src/app/(dashboard)/faturacao/nota-credito/nova/page.tsx',
    'src/app/(dashboard)/faturacao/proforma/nova/page.tsx',
    'src/app/(dashboard)/producao/estrutura/nova/page.tsx',
    'src/app/(dashboard)/projetos/orcamento/novo/page.tsx',
    'src/app/(dashboard)/rh/ausencias/nova/page.tsx',
    'src/app/(dashboard)/rh/colaboradores/novo/page.tsx',
    'src/app/(dashboard)/servicos/novo/page.tsx',
    'src/app/(dashboard)/vendas/comissoes/regras/nova/page.tsx',
    'src/app/(dashboard)/vendas/devolucoes/nova/page.tsx',
    'src/app/(impressao)/pos/talao/[id]/page.tsx',
  ];

  it.each(LEITORES_537)('%s usa exigirSessaoDeTenant()', (rel) => {
    const f = join(ERP, rel);
    expect(existsSync(f), `${rel} desapareceu — actualizar o oráculo com o verificador`).toBe(
      true,
    );
    expect(readFileSync(f, 'utf8')).toMatch(/\bexigirSessaoDeTenant\s*\(/);
  });

  it('os dois layouts do tenant continuam a desviar a sessão sem tenant para /plataforma (pela guarda)', () => {
    for (const rel of ['src/app/(dashboard)/layout.tsx', 'src/app/dashboard/layout.tsx']) {
      const src = readFileSync(join(ERP, rel), 'utf8');
      expect(src, rel).toMatch(/from ['"]@\/server\/auth\/sessao-tenant['"]/);
    }
  });
});
