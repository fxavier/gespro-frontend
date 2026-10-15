/**
 * ORÁCULO — issue #525 (nó B:admin-plataforma): o middleware e a sessão sem
 * tenant.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *   - `/plataforma` exige sessão (NÃO é PUBLIC_PATH): sem token → login;
 *   - um token SEM `tenantId` (administrador de plataforma sem `User` de
 *     tenant) que pede uma rota de tenant — `/dashboard`, `/vendas/…` — vai
 *     para `/plataforma` (nunca erro 500). É também assim que o login, cujo
 *     destino por omissão é `/dashboard`, o leva a `/plataforma`;
 *   - `/plataforma` e as suas sub-rotas passam para quem não tem tenant;
 *   - quem tem tenant (com ou sem o papel) continua a ver as rotas de tenant;
 *     o 404 a quem não tem o papel decide-se no layout (`exigirPlataformaAdmin`),
 *     não aqui.
 *
 * Decisão do verificador: a regra vive no MIDDLEWARE, como a do `pagamento`
 * (issue #99) — um layout partilhado não volta a correr numa navegação
 * client-side, e o middleware corre em todos os pedidos.
 *
 * ESTADO ESPERADO antes da implementação: RED nos redireccionamentos para
 * `/plataforma`; os controlos já estão verdes e ficam como guarda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({ token: null as Record<string, unknown> | null }));

vi.mock('next-auth/jwt', () => ({ getToken: async () => estado.token }));

import { NextRequest } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:3000';

/**
 * Adaptação do verificador (#533, nó D:proxy-next16): a implementação passou
 * de `apps/erp/middleware.ts` para `apps/erp/src/proxy.ts` (convenção do
 * Next 16: função `proxy`). Import dinâmico para que a falta do ficheiro
 * falhe cada caso, não o ficheiro inteiro.
 */
type Proxy = (req: NextRequest) => Promise<Response>;
async function carregarProxy(): Promise<Proxy> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('../../proxy');
  expect(typeof mod.proxy, 'src/proxy.ts tem de exportar a função `proxy`').toBe('function');
  return mod.proxy as Proxy;
}

async function pedir(caminho: string) {
  const proxy = await carregarProxy();
  return proxy(new NextRequest(`${BASE}${caminho}`));
}

function destino(res: Response): string | null {
  const loc = res.headers.get('location');
  return loc ? new URL(loc, BASE).pathname : null;
}

const TOKEN_SO_PLATAFORMA = {
  sub: 'kc-plataforma',
  uid: 'kc-plataforma',
  permissions: [],
  acesso: 'aberto',
  plataformaAdmin: true,
};

const TOKEN_DUPLO = {
  sub: 'kc-dupla',
  uid: 'u-dupla',
  tenantId: 'tenant-525',
  permissions: ['vendas:criar'],
  acesso: 'aberto',
  plataformaAdmin: true,
};

const TOKEN_TENANT = {
  sub: 'kc-admin',
  uid: 'u-admin',
  tenantId: 'tenant-525',
  permissions: ['vendas:criar'],
  acesso: 'aberto',
  plataformaAdmin: false,
};

beforeEach(() => {
  estado.token = null;
});

describe('sessão SEM tenant (administrador de plataforma)', () => {
  it.each(['/dashboard', '/vendas/pos', '/contabilidade/balancete', '/definicoes/faturacao'])(
    '%s → redirect para /plataforma',
    async (caminho) => {
      estado.token = TOKEN_SO_PLATAFORMA;
      const res = await pedir(caminho);
      expect(res.status, `${caminho} devolveu ${res.status}`).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(destino(res)).toBe('/plataforma');
    },
  );

  it.each(['/plataforma', '/plataforma/planos'])('%s passa (sem redirect)', async (caminho) => {
    estado.token = TOKEN_SO_PLATAFORMA;
    const res = await pedir(caminho);
    expect(destino(res)).toBeNull();
    expect(res.status).toBeLessThan(300);
  });

  it('as rotas públicas continuam públicas (sem ciclo de redirects)', async () => {
    estado.token = TOKEN_SO_PLATAFORMA;
    const res = await pedir('/auth/login');
    expect(destino(res)).toBeNull();
  });
});

describe('controlos', () => {
  it('sem sessão, /plataforma → login (não é PUBLIC_PATH)', async () => {
    estado.token = null;
    const res = await pedir('/plataforma');
    expect(destino(res)).toBe('/auth/login');
    expect(new URL(res.headers.get('location')!, BASE).searchParams.get('callbackUrl')).toBe(
      '/plataforma',
    );
  });

  it('com tenant e com o papel: /dashboard e /plataforma passam', async () => {
    estado.token = TOKEN_DUPLO;
    expect(destino(await pedir('/dashboard'))).toBeNull();
    expect(destino(await pedir('/plataforma'))).toBeNull();
  });

  it('com tenant e sem o papel: /dashboard passa; /plataforma não manda para o login', async () => {
    estado.token = TOKEN_TENANT;
    expect(destino(await pedir('/dashboard'))).toBeNull();
    // O 404 decide-se no layout; o middleware não pode revelar a área com um
    // redirect para outro sítio nem pedir login a quem já tem sessão.
    expect(destino(await pedir('/plataforma'))).not.toBe('/auth/login');
  });
});

/**
 * Adaptação do verificador (iteração 2, revista em #533): com a app em
 * `src/app`, o `next dev` só procura o middleware/proxy em `src/` — por isso
 * houve dois ficheiros (`apps/erp/middleware.ts` com a lógica e
 * `src/middleware.ts` a re-exportar). O Next 16 depreca a convenção
 * `middleware` a favor de `proxy` (sempre em runtime Node). Este bloco tranca
 * a ligação nova: UMA implementação em `src/proxy.ts`, com a função `proxy` e
 * o `config` literal (o Next lê-o por análise estática e não segue
 * re-exportações; um `runtime` no `config` do proxy rebenta o `next build`),
 * e nenhum `middleware.ts` em lado nenhum.
 */
const ERP = resolve(__dirname, '../../..');
const PROXY_TS = resolve(ERP, 'src/proxy.ts');
const MATCHER = ['/((?!_next/static|_next/image|favicon\\.ico).*)'];

describe('ligação: o Next carrega mesmo este proxy', () => {
  it('src/proxy.ts existe e exporta a função `proxy`', async () => {
    expect(existsSync(PROXY_TS), 'apps/erp/src/proxy.ts não existe').toBe(true);
    const proxy = await carregarProxy();
    expect(typeof proxy).toBe('function');
  });

  it('src/proxy.ts exporta o `config` com o matcher de sempre (e sem `runtime`)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('../../proxy');
    expect(mod.config).toBeDefined();
    expect(mod.config.matcher).toEqual(MATCHER);
    expect(mod.config).not.toHaveProperty('runtime');
  });

  it('o `config` de src/proxy.ts é literal e nada é re-exportado de outro módulo', () => {
    expect(existsSync(PROXY_TS), 'apps/erp/src/proxy.ts não existe').toBe(true);
    const codigo = readFileSync(PROXY_TS, 'utf-8');
    expect(codigo).toMatch(/export\s+const\s+config\s*=\s*\{[\s\S]*matcher\s*:/);
    expect(codigo).not.toMatch(/export\s*\{[^}]*\}\s*from/);
    expect(codigo).not.toMatch(/export\s*\*\s*(as\s+\w+\s+)?from/);
    expect(codigo).toMatch(/export\s+(async\s+)?function\s+proxy\s*\(/);
    expect(codigo, 'a convenção `middleware` saiu: o proxy não exporta `middleware`').not.toMatch(
      /export\s+(async\s+)?function\s+middleware\b|export\s+const\s+middleware\b/,
    );
  });

  it.each(['middleware.ts', 'src/middleware.ts', 'middleware.js', 'src/middleware.js', 'proxy.ts'])(
    'apps/erp/%s não existe (uma só implementação, em src/proxy.ts)',
    (rel) => {
      expect(existsSync(resolve(ERP, rel)), `apps/erp/${rel} ainda existe`).toBe(false);
    },
  );
});
