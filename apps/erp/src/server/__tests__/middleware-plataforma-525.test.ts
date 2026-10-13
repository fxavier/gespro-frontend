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
import { middleware } from '../../../middleware';

const BASE = 'http://localhost:3000';

async function pedir(caminho: string) {
  return middleware(new NextRequest(`${BASE}${caminho}`));
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
 * Adaptação do verificador (iteração 2): com a app em `src/app`, o `next dev`
 * (setup-dev-bundler) só procura o middleware em `src/` — o da raiz de
 * `apps/erp` não era carregado em dev, e o dev, os E2E e os smokes corriam sem
 * middleware. O `next build` resolve-o na raiz, por isso a imagem de produção
 * corria-o. Os testes acima importam a raiz e ficavam verdes enquanto o dev
 * não corria regra nenhuma (o E2E 61 é que o revelou). Este bloco
 * tranca a ligação: `src/middleware.ts` existe, exporta o MESMO `middleware`
 * e o `config.matcher` é igual ao da raiz (o Next lê o `config` por análise
 * estática e não segue re-exportações — tem de estar literal em `src/`).
 */
describe('ligação: o Next carrega mesmo este middleware', () => {
  it('src/middleware.ts exporta o middleware da raiz', async () => {
    const ligado = await import('../../middleware');
    expect(ligado.middleware).toBe(middleware);
  });

  it('src/middleware.ts declara o config literal igual ao da raiz', async () => {
    const raiz = await import('../../../middleware');
    const ligado = await import('../../middleware');
    expect(ligado.config).toBeDefined();
    expect(ligado.config.matcher).toEqual(raiz.config.matcher);
  });

  it('o config de src/middleware.ts é literal (sem re-exportação)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const codigo = readFileSync(resolve(__dirname, '../../middleware.ts'), 'utf-8');
    expect(codigo).toMatch(/export\s+const\s+config\s*=\s*\{[\s\S]*matcher\s*:/);
    expect(codigo).not.toMatch(/export\s*\{[^}]*\bconfig\b[^}]*\}\s*from/);
  });
});
