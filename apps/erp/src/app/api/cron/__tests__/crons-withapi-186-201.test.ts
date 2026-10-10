/**
 * Oráculo das issues #186 e #201 — crons no pipeline `withApi`, logger estruturado,
 * e a grafia `motoristasActualizados` na resposta de `transporte-alertas`.
 *
 * #186 — `expirar-trials`, `reconciliar-identidades` e `transporte-alertas` exportavam um
 * `GET` cru: sem `x-request-id`, sem métricas RED, e o `transporte-alertas` escrevia com
 * `console.log`/`console.error`. Contrato (decisão do orquestrador):
 *   - as três rotas passam pelo `withApi` (o mesmo que `abrir-exercicio` e
 *     `expirar-registos-nao-verificados` já usam, `public: true`) — prova observável:
 *     `x-request-id` em TODAS as respostas (200, 401, 500), métrica `recordHttpRequest`
 *     com a rota `/api/cron/<nome>` e o estado, e as linhas do logger estruturado com o
 *     mesmo `requestId` do header;
 *   - o contrato de autenticação fica igual (docs/runbooks/agendador.md):
 *     `Authorization: Bearer <CRON_SECRET>`; sem segredo configurado, sem header ou com
 *     token errado ⇒ 401 `NAO_AUTENTICADO` e o trabalho NÃO corre;
 *   - o envelope fica igual: `{ data: { …, timestamp } }` em sucesso,
 *     `{ error: { code: 'ERRO_INTERNO' } }` com 500 em falha — sem stack nem a mensagem
 *     interna do erro ao cliente;
 *   - `transporte-alertas` não toca na `console` (nem em sucesso nem em falha): escreve
 *     pelo logger estruturado.
 *
 * #201 — a resposta de `transporte-alertas` passa a `totalMotoristasActualizados` /
 * `motoristasActualizados`. Decisão conservadora quanto à chave antiga (a issue pede
 * «corrigir com compatibilidade»): o oráculo exige a chave nova; a antiga pode continuar
 * presente como alias, mas, se estiver, tem de ter o mesmo valor. Nenhum consumidor no
 * repositório lê a chave antiga (o agendador só regista o corpo: infra/local/cron/chamar.sh).
 * Os valores reais por tenant provam-se em test/integration/crons-withapi-186-201.test.ts.
 *
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  processarCicloDeVida: vi.fn(),
  reconciliarIdentidades: vi.fn(),
  listarTenantsComAcesso: vi.fn(),
  recordHttpRequest: vi.fn(),
}));

// `withApi` importa `@/lib/auth`; as rotas de cron são públicas e nunca o chamam.
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

vi.mock('@/server/services/plataforma/assinatura.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processarCicloDeVida: mocks.processarCicloDeVida,
}));
vi.mock('@/server/auth/reconciliacao', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reconciliarIdentidades: mocks.reconciliarIdentidades,
}));
vi.mock('@/server/provisioning/tenants-com-acesso', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listarTenantsComAcesso: mocks.listarTenantsComAcesso,
}));
vi.mock('@/server/observability/prom-registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordHttpRequest: mocks.recordHttpRequest,
}));
// O provider de e-mail usa `require('./noop')`, que não resolve no vitest ESM.
vi.mock('@/server/email', () => ({ emailProvider: { enviar: async () => {} } }));

import { NextRequest } from 'next/server';

const SEGREDO = 'segredo-cron-de-teste-186';
const ERRO_INTERNO_SECRETO = 'detalhe-interno-que-nao-pode-sair-186';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rota = 'expirar-trials' | 'reconciliar-identidades' | 'transporte-alertas';
const ROTAS: Rota[] = ['expirar-trials', 'reconciliar-identidades', 'transporte-alertas'];

async function carregarGET(rota: Rota): Promise<(req: NextRequest) => Promise<Response>> {
  // Import dinâmico: falha o caso, não o ficheiro, se a rota mudar de forma.
  const mod: any =
    rota === 'expirar-trials'
      ? await import('../expirar-trials/route')
      : rota === 'reconciliar-identidades'
        ? await import('../reconciliar-identidades/route')
        : await import('../transporte-alertas/route');
  return mod.GET;
}

async function carregarModulo(rota: Rota): Promise<any> {
  return rota === 'expirar-trials'
    ? import('../expirar-trials/route')
    : rota === 'reconciliar-identidades'
      ? import('../reconciliar-identidades/route')
      : import('../transporte-alertas/route');
}

function pedido(rota: Rota, authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest(`http://localhost:3000/api/cron/${rota}`, { method: 'GET', headers });
}

/** O serviço que cada rota executa — para provar que corre (ou não). */
function servicoDe(rota: Rota) {
  return rota === 'expirar-trials'
    ? mocks.processarCicloDeVida
    : rota === 'reconciliar-identidades'
      ? mocks.reconciliarIdentidades
      : mocks.listarTenantsComAcesso;
}

/** Linhas JSON escritas pelo logger estruturado (stdout + stderr) durante o caso. */
let linhas: string[] = [];
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

function registos(): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  for (const bloco of linhas) {
    for (const l of bloco.split('\n')) {
      const t = l.trim();
      if (!t.startsWith('{')) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        /* não é uma linha do logger */
      }
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SEGREDO;
  mocks.auth.mockResolvedValue(null);
  mocks.processarCicloDeVida.mockResolvedValue({ trialsExpirados: 0, avisosEnviados: 0, leiturasFechadas: 0 });
  mocks.reconciliarIdentidades.mockResolvedValue({ soNoKeycloak: [], soLocal: [], divergentes: [] });
  mocks.listarTenantsComAcesso.mockResolvedValue([]);

  linhas = [];
  const captar = (chunk: unknown) => {
    linhas.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(captar as any);
  vi.spyOn(process.stderr, 'write').mockImplementation(captar as any);
  consoleSpies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
});

describe('#186 — autenticação por CRON_SECRET inalterada, agora dentro do withApi', () => {
  it.each(['expirar-trials', 'reconciliar-identidades'] as Rota[])('%s: runtime continua nodejs', async (rota) => {
    const mod = await carregarModulo(rota);
    expect(mod.runtime).toBe('nodejs');
  });

  it.each(ROTAS)('%s: sem Authorization ⇒ 401 NAO_AUTENTICADO com x-request-id, e nada corre', async (rota) => {
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota));
    const body: any = await res.json();

    expect(res.status).toBe(401);
    expect(body?.error?.code).toBe('NAO_AUTENTICADO');
    expect(res.headers.get('x-request-id') ?? '').toMatch(UUID);
    expect(servicoDe(rota)).not.toHaveBeenCalled();
  });

  it.each(ROTAS)('%s: token errado ⇒ 401 com x-request-id, e nada corre', async (rota) => {
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota, 'Bearer outro-segredo'));
    const body: any = await res.json();

    expect(res.status).toBe(401);
    expect(body?.error?.code).toBe('NAO_AUTENTICADO');
    expect(res.headers.get('x-request-id') ?? '').toMatch(UUID);
    expect(servicoDe(rota)).not.toHaveBeenCalled();
  });

  it.each(ROTAS)('%s: CRON_SECRET por configurar ⇒ 401 mesmo com «Bearer » vazio, e nada corre', async (rota) => {
    delete process.env.CRON_SECRET;
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota, 'Bearer '));

    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id') ?? '').toMatch(UUID);
    expect(servicoDe(rota)).not.toHaveBeenCalled();
  });

  it.each(ROTAS)('%s: 401 também conta nas métricas RED com a rota do cron', async (rota) => {
    const GET = await carregarGET(rota);
    await GET(pedido(rota, 'Bearer outro-segredo'));

    expect(mocks.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: `/api/cron/${rota}`, statusCode: 401 }),
    );
  });
});

describe('#186 — sucesso dentro do pipeline: x-request-id, métrica e log correlacionado', () => {
  it.each(ROTAS)('%s: token certo ⇒ 200 { data: { …, timestamp } } com x-request-id', async (rota) => {
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota, `Bearer ${SEGREDO}`));
    const body: any = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(res.headers.get('x-request-id') ?? '').toMatch(UUID);
    expect(servicoDe(rota)).toHaveBeenCalledTimes(1);
    expect(typeof body?.data?.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(body.data.timestamp))).toBe(false);
  });

  it.each(ROTAS)('%s: sucesso regista recordHttpRequest(GET, /api/cron/…, 200)', async (rota) => {
    const GET = await carregarGET(rota);
    await GET(pedido(rota, `Bearer ${SEGREDO}`));

    expect(mocks.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: `/api/cron/${rota}`, statusCode: 200 }),
    );
  });

  it.each(ROTAS)('%s: o logger estruturado escreve com o requestId do header x-request-id', async (rota) => {
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota, `Bearer ${SEGREDO}`));
    const requestId = res.headers.get('x-request-id');

    expect(requestId ?? '').toMatch(UUID);
    const doPedido = registos().filter((r) => r.requestId === requestId);
    expect(doPedido.length, 'nenhuma linha do logger com o requestId do pedido').toBeGreaterThan(0);
    expect(doPedido.some((r) => r.url === `/api/cron/${rota}`)).toBe(true);
  });
});

describe('#186 — falha do trabalho: 500 sem fuga, ainda com x-request-id e métrica', () => {
  it.each(ROTAS)('%s: serviço rebenta ⇒ 500 ERRO_INTERNO, sem stack nem mensagem interna', async (rota) => {
    servicoDe(rota).mockRejectedValue(new Error(ERRO_INTERNO_SECRETO));
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota, `Bearer ${SEGREDO}`));
    const texto = await res.text();
    const body: any = JSON.parse(texto);

    expect(res.status).toBe(500);
    expect(body?.error?.code).toBe('ERRO_INTERNO');
    expect(texto).not.toContain(ERRO_INTERNO_SECRETO);
    expect(texto).not.toMatch(/\bat\s.+:\d+:\d+/); // nenhuma linha de stack
    expect(res.headers.get('x-request-id') ?? '').toMatch(UUID);
    expect(mocks.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: `/api/cron/${rota}`, statusCode: 500 }),
    );
  });

  it.each(ROTAS)('%s: a falha fica no logger estruturado (nível error) com o requestId do pedido', async (rota) => {
    servicoDe(rota).mockRejectedValue(new Error(ERRO_INTERNO_SECRETO));
    const GET = await carregarGET(rota);
    const res = await GET(pedido(rota, `Bearer ${SEGREDO}`));
    const requestId = res.headers.get('x-request-id');

    expect(requestId ?? '').toMatch(UUID);
    const erros = registos().filter((r) => r.level === 'error' && r.requestId === requestId);
    expect(erros.length, 'a falha tem de ser registada pelo logger, correlacionada').toBeGreaterThan(0);
  });
});

describe('#186 — transporte-alertas não usa a console', () => {
  function chamadasConsole(): number {
    return consoleSpies.reduce((s, spy) => s + spy.mock.calls.length, 0);
  }

  it('em sucesso: zero chamadas à console e uma linha info do logger sobre o transporte-alertas', async () => {
    const GET = await carregarGET('transporte-alertas');
    const res = await GET(pedido('transporte-alertas', `Bearer ${SEGREDO}`));
    const requestId = res.headers.get('x-request-id');

    expect(res.status).toBe(200);
    expect(chamadasConsole()).toBe(0);
    const resumo = registos().filter(
      (r) => r.level === 'info' && r.requestId === requestId && /transporte-alertas/.test(String(r.msg)),
    );
    expect(resumo.length, 'o resumo do cron tem de sair pelo logger estruturado').toBeGreaterThan(0);
  });

  it('em falha: zero chamadas à console', async () => {
    mocks.listarTenantsComAcesso.mockRejectedValue(new Error(ERRO_INTERNO_SECRETO));
    const GET = await carregarGET('transporte-alertas');
    const res = await GET(pedido('transporte-alertas', `Bearer ${SEGREDO}`));

    expect(res.status).toBe(500);
    expect(chamadasConsole()).toBe(0);
  });
});

describe('#201 — grafia motoristasActualizados na resposta de transporte-alertas', () => {
  it('o total chama-se totalMotoristasActualizados (e o alias antigo, se ficar, tem o mesmo valor)', async () => {
    const GET = await carregarGET('transporte-alertas');
    const res = await GET(pedido('transporte-alertas', `Bearer ${SEGREDO}`));
    const body: any = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.data).toHaveProperty('totalMotoristasActualizados', 0);
    if ('totalMotoistasActualizados' in body.data) {
      expect(body.data.totalMotoistasActualizados).toBe(body.data.totalMotoristasActualizados);
    }
    // As outras chaves do contrato não mudam.
    expect(body.data).toHaveProperty('tenants', 0);
    expect(body.data).toHaveProperty('totalViaturasActualizadas', 0);
    expect(body.data).toHaveProperty('totalNotificacoesEmitidas', 0);
    expect(body.data.resultados).toEqual([]);
  });
});
