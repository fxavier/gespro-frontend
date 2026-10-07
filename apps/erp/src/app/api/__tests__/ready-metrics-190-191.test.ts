/**
 * ORÁCULO — issues #190 e #191 (nó A:ready-metrics-190-191).
 *
 * Escrito pelo VERIFICADOR antes da correcção. As rotas são importadas
 * dinamicamente em cada teste. NUNCA `vitest -u`; um agente de implementação
 * que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador):
 *  #190 — /api/ready e /api/metrics, em falha, NÃO devolvem a mensagem crua do
 *         erro ao cliente (não autenticado): só um estado/código genérico. O
 *         detalhe vai para o logger estruturado, na mesma linha que o `requestId`
 *         que a resposta leva em `x-request-id`.
 *  #191 — /api/metrics sem `METRICS_SECRET` (ausente ou vazio) RECUSA (fail-closed)
 *         em qualquer ambiente, sem gerar métricas. Com o segredo, o bearer certo
 *         serve e o errado recusa. /api/health continua público e mínimo.
 *         /api/health, /api/ready e /api/metrics continuam em PUBLIC_PATHS (o
 *         HEALTHCHECK do Docker precisa de /api/health sem sessão).
 *
 * Escolha conservadora (o contrato não fixa o código HTTP da recusa do #191):
 * aceita-se qualquer 4xx/5xx desde que o corpo não traga métricas e
 * `registry.metrics()` nunca seja chamado.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mensagem de erro com aspecto de detalhe interno (fictícia, sem segredo real).
const DETALHE_DB = 'connect ECONNREFUSED db-interno-xyz.rede:5432 (role "utilizador_fantasma")';
const DETALHE_METRICAS = 'falha-interna-registo-abc123 em /opt/app/node_modules/prom-client';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/client', () => ({
  prismaBase: { $queryRaw: mocks.queryRaw },
  prisma: {},
}));

type Linha = Record<string, unknown>;

/** Captura as linhas JSON do logger estruturado (stdout + stderr). */
function capturarLogs(): { linhas: () => Linha[]; brutas: () => string[] } {
  const brutas: string[] = [];
  const intercept = (chunk: unknown) => {
    brutas.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(intercept as never);
  vi.spyOn(process.stderr, 'write').mockImplementation(intercept as never);
  return {
    brutas: () => brutas,
    linhas: () =>
      brutas
        .join('')
        .split('\n')
        .filter((l) => l.trim().startsWith('{'))
        .map((l) => {
          try {
            return JSON.parse(l) as Linha;
          } catch {
            return null;
          }
        })
        .filter((l): l is Linha => l !== null),
  };
}

function pedido(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { method: 'GET', headers });
}

async function chamar(
  modulo: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const mod = (await import(modulo)) as Record<string, unknown>;
  const GET = mod.GET as (req: NextRequest) => Promise<Response>;
  return GET(pedido(path, headers));
}

beforeEach(() => {
  vi.resetModules();
  // O logger fixa o nível ao carregar; o detalhe pode ir em qualquer nível.
  vi.stubEnv('LOG_LEVEL', 'debug');
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue(null); // nunca há sessão: os três endpoints são públicos
  mocks.queryRaw.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// #190 — /api/ready
// ---------------------------------------------------------------------------

describe('#190 — /api/ready não expõe o erro cru', () => {
  it('base em baixo → 503 not_ready, sem a mensagem do erro no corpo', async () => {
    const logs = capturarLogs();
    mocks.queryRaw.mockRejectedValue(new Error(DETALHE_DB));

    const res = await chamar('@/app/api/ready/route', '/api/ready');
    const texto = await res.text();
    logs.brutas(); // mantém a captura viva até aqui

    expect(res.status).toBe(503);
    const corpo = JSON.parse(texto) as Record<string, unknown>;
    expect(corpo.status).toBe('not_ready');
    expect(texto).not.toContain(DETALHE_DB);
    expect(texto).not.toContain('ECONNREFUSED');
    expect(texto).not.toContain('db-interno-xyz');
    expect(texto).not.toMatch(/stack/i);
  });

  it('o detalhe do erro vai para o logger, na linha do requestId da resposta', async () => {
    const logs = capturarLogs();
    mocks.queryRaw.mockRejectedValue(new Error(DETALHE_DB));

    const res = await chamar('@/app/api/ready/route', '/api/ready');
    const requestId = res.headers.get('x-request-id');

    expect(requestId).toBeTruthy();
    const comDetalhe = logs
      .linhas()
      .filter((l) => JSON.stringify(l).includes('db-interno-xyz'));
    expect(comDetalhe.length).toBeGreaterThan(0);
    expect(comDetalhe.some((l) => l.requestId === requestId)).toBe(true);
  });

  it('base em cima → 200 ready (regressão)', async () => {
    capturarLogs();
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await chamar('@/app/api/ready/route', '/api/ready');
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.status).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// #190 — /api/metrics (falha a gerar métricas)
// ---------------------------------------------------------------------------

describe('#190 — /api/metrics não expõe o erro cru', () => {
  it('registry.metrics() rebenta → 500 genérico, detalhe só no logger com requestId', async () => {
    vi.stubEnv('METRICS_SECRET', 'segredo-de-teste-190');
    const logs = capturarLogs();
    const { registry } = await import('@/server/observability/prom-registry');
    vi.spyOn(registry, 'metrics').mockRejectedValue(new Error(DETALHE_METRICAS));

    const res = await chamar('@/app/api/metrics/route', '/api/metrics', {
      authorization: 'Bearer segredo-de-teste-190',
    });
    const texto = await res.text();
    const requestId = res.headers.get('x-request-id');

    expect(res.status).toBe(500);
    expect(texto).not.toContain(DETALHE_METRICAS);
    expect(texto).not.toContain('falha-interna-registo-abc123');
    expect(texto).not.toContain('node_modules');
    expect(texto).not.toMatch(/stack/i);

    expect(requestId).toBeTruthy();
    const comDetalhe = logs
      .linhas()
      .filter((l) => JSON.stringify(l).includes('falha-interna-registo-abc123'));
    expect(comDetalhe.length).toBeGreaterThan(0);
    expect(comDetalhe.some((l) => l.requestId === requestId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #191 — /api/metrics fail-closed
// ---------------------------------------------------------------------------

describe('#191 — /api/metrics recusa sem METRICS_SECRET', () => {
  const casos: Array<[string, string | undefined, string]> = [
    ['ausente, desenvolvimento', undefined, 'development'],
    ['ausente, produção', undefined, 'production'],
    ['vazio, produção', '', 'production'],
    ['vazio, desenvolvimento', '', 'development'],
  ];

  for (const [nome, segredo, nodeEnv] of casos) {
    it(`segredo ${nome} → recusa sem gerar métricas`, async () => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('METRICS_SECRET', segredo as string);
      if (segredo === undefined) delete process.env.METRICS_SECRET;
      capturarLogs();
      const { registry } = await import('@/server/observability/prom-registry');
      const espiao = vi.spyOn(registry, 'metrics');

      // Sem header e também com um bearer qualquer: nenhum dos dois abre.
      const variantes: Array<Record<string, string>> = [
        {},
        { authorization: 'Bearer ' },
        { authorization: 'Bearer x' },
      ];
      for (const headers of variantes) {
        const res = await chamar('@/app/api/metrics/route', '/api/metrics', headers);
        const texto = await res.text();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(texto).not.toContain('# HELP');
        expect(texto).not.toContain('# TYPE');
        expect(texto).not.toContain('http_requests_total');
      }
      expect(espiao).not.toHaveBeenCalled();
    });
  }

  it('com segredo: bearer certo → 200 métricas; errado ou ausente → 401', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('METRICS_SECRET', 'segredo-de-teste-191');
    capturarLogs();

    const ok = await chamar('@/app/api/metrics/route', '/api/metrics', {
      authorization: 'Bearer segredo-de-teste-191',
    });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('# HELP');

    const errado = await chamar('@/app/api/metrics/route', '/api/metrics', {
      authorization: 'Bearer outro',
    });
    expect(errado.status).toBe(401);
    expect(await errado.text()).not.toContain('# HELP');

    const semHeader = await chamar('@/app/api/metrics/route', '/api/metrics');
    expect(semHeader.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// #191 — /api/health continua público e mínimo; paths públicos mantêm-se
// ---------------------------------------------------------------------------

describe('#191 — /api/health público e mínimo', () => {
  it('sem sessão → 200 só com status/version/timestamp', async () => {
    vi.stubEnv('METRICS_SECRET', '');
    capturarLogs();

    const res = await chamar('@/app/api/health/route', '/api/health');
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo.status).toBe('ok');
    for (const chave of Object.keys(corpo)) {
      expect(['status', 'version', 'timestamp']).toContain(chave);
    }
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('middleware mantém /api/health, /api/ready e /api/metrics em PUBLIC_PATHS', () => {
    const codigo = readFileSync(resolve(__dirname, '../../../../middleware.ts'), 'utf-8');
    const bloco = codigo.match(/const PUBLIC_PATHS\s*=\s*\[([\s\S]*?)\];/);
    expect(bloco).not.toBeNull();
    const conteudo = bloco![1].replace(/\/\/.*$/gm, '');
    expect(conteudo).toContain("'/api/health'");
    expect(conteudo).toContain("'/api/ready'");
    expect(conteudo).toContain("'/api/metrics'");
  });
});
