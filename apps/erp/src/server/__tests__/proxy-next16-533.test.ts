/**
 * ORÁCULO — issue #533 (nó D:proxy-next16): `middleware.ts` → `src/proxy.ts`
 * (convenção do Next 16) e o aviso de Edge do `instrumentation.ts`.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *   1. Comportamento do proxy IGUAL ao do middleware: cabeçalhos de segurança
 *      (os de `buildSecurityHeaders`, sem `X-Powered-By`), CSP report-only com
 *      nonce por pedido propagado ao RSC como `x-nonce`, CSP estrita só com
 *      `CSP_ENFORCE=true`, a excepção de CSP do `/registo` (Turnstile),
 *      `PUBLIC_PATHS`, redirect para `/auth/login?callbackUrl=<caminho+query>`
 *      com os cabeçalhos, bloqueio de `pagamento` (#99) e sessão sem tenant →
 *      `/plataforma` (#525, coberto em `middleware-plataforma-525.test.ts`).
 *   2. O aviso «A Node.js API is used (process.on …) not supported in the Edge
 *      Runtime» desaparece. DECISÃO DO VERIFICADOR (forma menos frágil, e a
 *      que remove o aviso seja qual for o runtime que o Next analise): o
 *      `instrumentation.ts` não contém `process.on(`; o `register()` só faz
 *      `import('./instrumentation-node')` e chama `registerNode()` quando
 *      `NEXT_RUNTIME === 'nodejs'`. O corpo Node-only vive em
 *      `apps/erp/instrumentation-node.ts` com o MESMO comportamento: sondas
 *      sempre; OTel só com `OTEL_EXPORTER_OTLP_ENDPOINT`; shutdown em SIGTERM;
 *      imports estáticos-por-string (o @vercel/nft precisa deles no standalone).
 *   3. Documentação viva (CLAUDE.md da raiz, docs/runbooks, docs/sistema) e
 *      comentários de código em `apps/erp/src` deixam de nomear `middleware.ts`
 *      e o CLAUDE.md nomeia `src/proxy.ts`. ADRs e handoffs são histórico e
 *      ficam como estão.
 *
 * ESTADO ESPERADO antes da implementação: RED (src/proxy.ts e
 * instrumentation-node.ts inexistentes, `process.on` no instrumentation.ts,
 * docs a nomear `middleware.ts`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const estado = vi.hoisted(() => ({ token: null as Record<string, unknown> | null }));
vi.mock('next-auth/jwt', () => ({ getToken: async () => estado.token }));

import { NextRequest } from 'next/server';
import { buildSecurityHeaders } from '@/lib/security/headers';
import { ROTA_REGULARIZAR_SUBSCRICAO } from '@/lib/state-machines';

const ERP = resolve(__dirname, '../../..');
const RAIZ = resolve(ERP, '../..');
const BASE = 'http://localhost:3000';

type Proxy = (req: NextRequest) => Promise<Response>;
async function carregarProxy(): Promise<Proxy> {
  const mod: any = await import('../../proxy');
  expect(typeof mod.proxy, 'src/proxy.ts tem de exportar a função `proxy`').toBe('function');
  return mod.proxy as Proxy;
}

async function pedir(caminho: string): Promise<Response> {
  const proxy = await carregarProxy();
  return proxy(new NextRequest(`${BASE}${caminho}`));
}

function destino(res: Response): URL | null {
  const loc = res.headers.get('location');
  return loc ? new URL(loc, BASE) : null;
}

const NOMES_CABECALHOS = Object.keys(
  buildSecurityHeaders({ nonce: 'x', isDev: false, enforceCSP: false }),
).filter((n) => n !== 'Content-Security-Policy-Report-Only');

function verificarCabecalhos(res: Response) {
  for (const nome of NOMES_CABECALHOS) {
    expect(res.headers.get(nome), `falta o cabeçalho ${nome}`).not.toBeNull();
  }
  expect(res.headers.get('X-Powered-By')).toBeNull();
}

const TOKEN_TENANT = {
  sub: 'kc-admin',
  uid: 'u-admin',
  tenantId: 'tenant-533',
  permissions: ['vendas:criar'],
  acesso: 'aberto',
};

beforeEach(() => {
  estado.token = null;
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. Comportamento do proxy (paridade com o middleware)
// ---------------------------------------------------------------------------
describe('#533 — o proxy mantém os cabeçalhos de segurança e a CSP com nonce', () => {
  it('rota pública: cabeçalhos de segurança, CSP report-only com o nonce propagado como x-nonce', async () => {
    const res = await pedir('/api/health');
    expect(destino(res)).toBeNull();
    verificarCabecalhos(res);

    const csp = res.headers.get('Content-Security-Policy-Report-Only');
    expect(csp, 'falta a CSP report-only').not.toBeNull();
    expect(res.headers.get('Content-Security-Policy')).toBeNull();

    const nonce = res.headers.get('x-middleware-request-x-nonce');
    expect(nonce, 'o nonce não chega ao RSC como cabeçalho x-nonce do pedido').toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it('o nonce é novo em cada pedido', async () => {
    const a = (await pedir('/api/health')).headers.get('x-middleware-request-x-nonce');
    const b = (await pedir('/api/health')).headers.get('x-middleware-request-x-nonce');
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('CSP_ENFORCE=true → Content-Security-Policy estrita (e não report-only)', async () => {
    vi.stubEnv('CSP_ENFORCE', 'true');
    const res = await pedir('/api/health');
    expect(res.headers.get('Content-Security-Policy')).toMatch(/'nonce-[^']+'/);
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
  });

  it('/registo leva a CSP própria com o Turnstile; as outras rotas não', async () => {
    const registo = await pedir('/registo');
    expect(destino(registo)).toBeNull();
    expect(registo.headers.get('Content-Security-Policy-Report-Only')).toContain(
      'challenges.cloudflare.com',
    );
    const login = await pedir('/auth/login');
    expect(login.headers.get('Content-Security-Policy-Report-Only')).not.toContain(
      'challenges.cloudflare.com',
    );
  });
});

describe('#533 — PUBLIC_PATHS continuam públicos sem sessão', () => {
  it.each([
    '/api/health',
    '/api/ready',
    '/api/metrics',
    '/api/auth/session',
    '/api/auth/callback/keycloak',
    '/api/publico/registo',
    '/api/publico/planos',
    '/api/publico/verificar-email',
    '/api/webhooks/stripe',
    '/api/cron/expirar-trials',
    '/registo',
    '/auth/login',
    '/auth/erro',
    '/auth/recuperar',
    '/contactos',
  ])('%s passa sem sessão (sem redirect)', async (caminho) => {
    estado.token = null;
    const res = await pedir(caminho);
    expect(destino(res), `${caminho} redireccionou`).toBeNull();
    expect(res.status).toBeLessThan(300);
    verificarCabecalhos(res);
  });
});

describe('#533 — redirect para o login', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/vendas/pos?cliente=1&x=y', '/vendas/pos?cliente=1&x=y'],
    ['/api/vendas', '/api/vendas'],
  ])('sem sessão, %s → /auth/login?callbackUrl=%s, com os cabeçalhos', async (caminho, callback) => {
    estado.token = null;
    const res = await pedir(caminho);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const d = destino(res);
    expect(d?.pathname).toBe('/auth/login');
    expect(d?.searchParams.get('callbackUrl')).toBe(callback);
    verificarCabecalhos(res);
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toMatch(/'nonce-[^']+'/);
  });

  it('com sessão de tenant, /dashboard passa', async () => {
    estado.token = TOKEN_TENANT;
    const res = await pedir('/dashboard');
    expect(destino(res)).toBeNull();
    verificarCabecalhos(res);
  });
});

describe('#533 — bloqueio de pagamento (#99)', () => {
  beforeEach(() => {
    estado.token = { ...TOKEN_TENANT, acesso: 'pagamento' };
  });

  it.each(['/dashboard', '/vendas/pos'])('%s → página de regularização', async (caminho) => {
    const res = await pedir(caminho);
    expect(destino(res)?.pathname).toBe(ROTA_REGULARIZAR_SUBSCRICAO);
    verificarCabecalhos(res);
  });

  it.each([ROTA_REGULARIZAR_SUBSCRICAO, `${ROTA_REGULARIZAR_SUBSCRICAO}/x`, '/api/vendas', '/logo.png'])(
    '%s passa em pagamento',
    async (caminho) => {
      const res = await pedir(caminho);
      expect(destino(res)).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// 2. instrumentation.ts sem API Node à vista da análise do Edge
// ---------------------------------------------------------------------------
const INSTR = resolve(ERP, 'instrumentation.ts');
const INSTR_NODE = resolve(ERP, 'instrumentation-node.ts');

describe('#533 — instrumentation.ts só importa o módulo Node atrás da guarda', () => {
  it('instrumentation.ts não contém `process.on(` (o aviso de Edge sai)', () => {
    const codigo = readFileSync(INSTR, 'utf-8');
    expect(codigo).not.toMatch(/process\s*\.\s*on\s*\(/);
  });

  it('instrumentation.ts importa dinamicamente ./instrumentation-node (string literal) atrás de NEXT_RUNTIME', () => {
    const codigo = readFileSync(INSTR, 'utf-8');
    expect(codigo).toMatch(/import\(\s*['"]\.\/instrumentation-node['"]\s*\)/);
    expect(codigo).toMatch(/NEXT_RUNTIME/);
    // nada de OTel nem de sondas no módulo analisado pelos dois runtimes
    expect(codigo).not.toMatch(/import\(\s*['"]@opentelemetry\//);
    expect(codigo).not.toMatch(/^\s*import\s[^;]*from\s*['"]@opentelemetry\//m);
  });

  it('instrumentation-node.ts existe com os imports estáticos-por-string que o standalone precisa', () => {
    expect(existsSync(INSTR_NODE), 'apps/erp/instrumentation-node.ts não existe').toBe(true);
    const codigo = readFileSync(INSTR_NODE, 'utf-8');
    for (const pacote of [
      './src/server/observability/probes',
      '@opentelemetry/sdk-node',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-logs-otlp-http',
      '@opentelemetry/sdk-logs',
      '@opentelemetry/resources',
      '@opentelemetry/semantic-conventions',
      '@opentelemetry/sdk-trace-base',
      '@prisma/instrumentation',
    ]) {
      expect(codigo, `falta import('${pacote}') literal`).toContain(`import('${pacote}')`);
    }
    expect(codigo).toMatch(/export\s+async\s+function\s+registerNode\s*\(/);
    expect(codigo).toMatch(/process\s*\.\s*on\s*\(\s*['"]SIGTERM['"]/);
  });

  describe('register()', () => {
    const registerNode = vi.fn(async () => {});
    beforeEach(() => {
      vi.resetModules();
      registerNode.mockClear();
      vi.doMock('../../../instrumentation-node', () => ({ registerNode }));
    });
    afterEach(() => {
      vi.doUnmock('../../../instrumentation-node');
    });

    it("NEXT_RUNTIME='nodejs' → chama registerNode() uma vez", async () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      const { register } = await import('../../../instrumentation');
      await register();
      expect(registerNode).toHaveBeenCalledTimes(1);
    });

    it.each(['edge', ''])("NEXT_RUNTIME='%s' → não chama registerNode()", async (rt) => {
      vi.stubEnv('NEXT_RUNTIME', rt);
      const { register } = await import('../../../instrumentation');
      await register();
      expect(registerNode).not.toHaveBeenCalled();
    });
  });
});

describe('#533 — registerNode() mantém o comportamento (sondas sempre; OTel só com endpoint; SIGTERM)', () => {
  const startProbes = vi.fn();
  const sdkStart = vi.fn();
  const sdkCriado = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    startProbes.mockClear();
    sdkStart.mockClear();
    sdkCriado.mockClear();
    vi.doMock('../observability/probes', () => ({ startProbes }));
    vi.doMock('@opentelemetry/sdk-node', () => ({
      NodeSDK: class {
        constructor(opts: unknown) {
          sdkCriado(opts);
        }
        start = sdkStart;
        shutdown = async () => {};
      },
    }));
    vi.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: class {} }));
    vi.doMock('@opentelemetry/exporter-logs-otlp-http', () => ({ OTLPLogExporter: class {} }));
    vi.doMock('@opentelemetry/sdk-logs', () => ({ SimpleLogRecordProcessor: class {} }));
    vi.doMock('@opentelemetry/resources', () => ({ Resource: class {} }));
    vi.doMock('@opentelemetry/semantic-conventions', () => ({ ATTR_SERVICE_NAME: 'service.name' }));
    vi.doMock('@opentelemetry/sdk-trace-base', () => ({ TraceIdRatioBasedSampler: class {} }));
    vi.doMock('@prisma/instrumentation', () => ({ PrismaInstrumentation: class {} }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const m of [
      '../observability/probes',
      '@opentelemetry/sdk-node',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-logs-otlp-http',
      '@opentelemetry/sdk-logs',
      '@opentelemetry/resources',
      '@opentelemetry/semantic-conventions',
      '@opentelemetry/sdk-trace-base',
      '@prisma/instrumentation',
    ]) {
      vi.doUnmock(m);
    }
  });

  async function carregarRegisterNode(): Promise<() => Promise<void>> {
    const mod: any = await import('../../../instrumentation-node');
    expect(typeof mod.registerNode).toBe('function');
    return mod.registerNode;
  }

  it('sem OTEL_EXPORTER_OTLP_ENDPOINT: arranca as sondas e não cria o SDK nem regista SIGTERM', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    const on = vi.spyOn(process, 'on');
    const registerNode = await carregarRegisterNode();
    await registerNode();
    expect(startProbes).toHaveBeenCalledTimes(1);
    expect(sdkCriado).not.toHaveBeenCalled();
    expect(on.mock.calls.some(([ev]) => ev === 'SIGTERM')).toBe(false);
  });

  it('com OTEL_EXPORTER_OTLP_ENDPOINT: sondas, SDK arrancado e shutdown em SIGTERM', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://otel.invalid:4318');
    const on = vi.spyOn(process, 'on').mockImplementation(() => process);
    const registerNode = await carregarRegisterNode();
    await registerNode();
    expect(startProbes).toHaveBeenCalledTimes(1);
    expect(sdkCriado).toHaveBeenCalledTimes(1);
    expect(sdkStart).toHaveBeenCalledTimes(1);
    expect(on.mock.calls.some(([ev]) => ev === 'SIGTERM')).toBe(true);
  });

  it('sondas que rebentam não impedem o arranque (best-effort)', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    startProbes.mockImplementationOnce(() => {
      throw new Error('sonda partida');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const registerNode = await carregarRegisterNode();
    await expect(registerNode()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Documentação viva e comentários de código
// ---------------------------------------------------------------------------
function ficheirosEm(dir: string, filtro: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === 'node_modules' || nome === '__tests__') continue;
      out.push(...ficheirosEm(p, filtro));
    } else if (filtro(p)) {
      out.push(p);
    }
  }
  return out;
}

describe('#533 — a documentação nomeia src/proxy.ts, não middleware.ts', () => {
  it('CLAUDE.md da raiz nomeia src/proxy.ts e já não nomeia middleware.ts', () => {
    const texto = readFileSync(resolve(RAIZ, 'CLAUDE.md'), 'utf-8');
    expect(texto).not.toMatch(/middleware\.ts/);
    expect(texto).toMatch(/src\/proxy\.ts/);
  });

  it('docs/runbooks e docs/sistema não nomeiam middleware.ts', () => {
    const ficheiros = [
      ...ficheirosEm(resolve(RAIZ, 'docs/runbooks'), (f) => f.endsWith('.md')),
      ...ficheirosEm(resolve(RAIZ, 'docs/sistema'), (f) => f.endsWith('.md')),
    ];
    expect(ficheiros.length).toBeGreaterThan(0);
    const ofensores = ficheiros
      .filter((f) => /middleware\.ts/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(RAIZ, f));
    expect(ofensores).toEqual([]);
  });

  it('o código de apps/erp/src (fora dos testes) não nomeia middleware.ts', () => {
    const ficheiros = ficheirosEm(resolve(ERP, 'src'), (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    const ofensores = ficheiros
      .filter((f) => /middleware\.ts/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(ERP, f));
    expect(ofensores).toEqual([]);
  });
});
