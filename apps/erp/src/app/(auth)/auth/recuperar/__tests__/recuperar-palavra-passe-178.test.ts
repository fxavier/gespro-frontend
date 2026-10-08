/**
 * ORÁCULO — issue #178 (nó C:recuperar-palavra-passe-178): sem recuperação de
 * palavra-passe self-service.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador; ADR-0029 — o ecrã é nosso, quem autentica
 * é o Keycloak):
 *   - rota pública `/auth/recuperar` com um campo de e-mail; o ecrã de login
 *     liga para ela;
 *   - o servidor pede ao Keycloak, pela Admin API com a conta de serviço que o
 *     cliente `src/server/auth/keycloak.ts` já usa, o
 *     `PUT /users/{sub}/execute-actions-email` com as acções `["UPDATE_PASSWORD"]`
 *     (e SÓ essa — `VERIFY_EMAIL` trancaria a conta no direct grant);
 *   - a resposta é SEMPRE igual: e-mail existente, inexistente, conta
 *     desactivada, Keycloak em baixa, envio falhado ou limite atingido — nada
 *     disso se distingue na resposta;
 *   - rate-limit pela porta existente (`src/server/security/rate-limiter.ts`),
 *     por e-mail e por IP;
 *   - `/auth/recuperar` é pública no middleware.
 *
 * Interface fixada por este oráculo (o resto é livre):
 *   `src/app/(auth)/auth/recuperar/actions.ts` ('use server') exporta
 *   `pedirRecuperacaoPalavraPasse(dados: unknown)` com `dados = { email }`.
 *   Para e-mail bem formado devolve um objecto com `ok: true`, idêntico em todos
 *   os casos. Para entrada mal formada pode devolver `ok: false` (isso não
 *   revela nada sobre a existência da conta) — e não toca no Keycloak.
 *
 * Escolhas conservadoras do verificador (o contrato não as fixa):
 *   - conta desactivada no Keycloak (`enabled: false`) NÃO recebe e-mail;
 *   - pedido acima do limite devolve a MESMA resposta neutra (não «demasiadas
 *     tentativas», que distinguiria) e não chama o Keycloak;
 *   - tectos: no máximo 5 e-mails por endereço e 10 por IP na janela;
 *   - o endereço nunca vai para o log (mesma regra de `enviarEmailVerificacao`).
 *
 * O Keycloak é dublado ao nível da REDE (stub de `fetch`), não ao nível do
 * módulo: o implementador escolhe as funções do cliente que quiser, mas o pedido
 * HTTP que chega ao Keycloak é o que se prova aqui. O contrato com um Keycloak
 * real fica para o E2E `e2e/50-recuperar-palavra-passe-178.spec.ts`.
 *
 * ESTADO ESPERADO antes da implementação: RED — o módulo da action não existe,
 * a página não existe e o login não liga para ela. O teste do middleware já
 * está verde (o prefixo `/auth/` cobre a rota) e fica como guarda.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// O limitador em memória é o que se exercita aqui (sem Valkey no unit).
const envAnterior = vi.hoisted(() => {
  const anterior = {
    RATE_LIMIT_DRIVER: process.env.RATE_LIMIT_DRIVER,
    APP_URL: process.env.APP_URL,
    KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER,
    KEYCLOAK_ISSUER_INTERNO: process.env.KEYCLOAK_ISSUER_INTERNO,
  };
  process.env.RATE_LIMIT_DRIVER = 'memory';
  return anterior;
});

const APP_URL = 'http://app-recuperar-178.exemplo.mz';
const ISSUER = 'http://kc-recuperar-178.exemplo.mz/realms/gespro';
const ADMIN_BASE = 'http://kc-recuperar-178.exemplo.mz/admin/realms/gespro';

const linhasLog = vi.hoisted(() => [] as { nivel: string; dados: unknown; msg: unknown }[]);
vi.mock('@/server/observability/logger', () => {
  const registar =
    (nivel: string) =>
    (dados: unknown, msg?: unknown) =>
      linhasLog.push({ nivel, dados, msg });
  const logger = {
    info: registar('info'),
    warn: registar('warn'),
    error: registar('error'),
    debug: registar('debug'),
    trace: registar('trace'),
    fatal: registar('fatal'),
    child: () => logger,
  };
  return { logger };
});

const cabecalhos = vi.hoisted(() => ({ valor: {} as Record<string, string> }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(cabecalhos.valor),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

// ---------------------------------------------------------------------------
// Keycloak dublado na rede
// ---------------------------------------------------------------------------

interface UtilizadorFalso {
  id: string;
  email: string;
  enabled: boolean;
}

const kc = vi.hoisted(() => ({
  utilizadores: [] as { id: string; email: string; enabled: boolean }[],
  /** Quando `true`, TODA a chamada ao Keycloak rebenta (rede em baixa). */
  emBaixo: false,
  /** Estado HTTP devolvido ao `execute-actions-email` (SMTP partido → 500). */
  estadoAccoes: 204,
  pedidos: [] as { metodo: string; url: string; corpo: string | undefined }[],
}));

function resposta(status: number, corpo: unknown = null): Response {
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : 'GET')).toUpperCase();
  const corpo = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : undefined;
  kc.pedidos.push({ metodo, url: url.href, corpo });

  if (kc.emBaixo) throw new TypeError('fetch failed: ECONNREFUSED');

  if (url.pathname.endsWith('/protocol/openid-connect/token')) {
    return resposta(200, { access_token: 'token-conta-servico', expires_in: 300 });
  }

  const m = /\/admin\/realms\/[^/]+\/users(?:\/([^/]+))?(?:\/([^/?]+))?$/.exec(url.pathname);
  if (!m) return resposta(404, { error: 'rota desconhecida no duplo' });
  const [, id, accao] = m;

  if (!id && metodo === 'GET') {
    const alvo = (
      url.searchParams.get('email') ??
      url.searchParams.get('username') ??
      url.searchParams.get('search') ??
      ''
    ).toLowerCase();
    const lista = kc.utilizadores
      .filter((u) => u.email === alvo)
      .map((u) => ({ id: u.id, username: u.email, email: u.email, enabled: u.enabled }));
    return resposta(200, lista);
  }

  const u = kc.utilizadores.find((x) => x.id === decodeURIComponent(id ?? ''));
  if (id && !accao && metodo === 'GET') {
    return u ? resposta(200, { id: u.id, username: u.email, email: u.email, enabled: u.enabled }) : resposta(404);
  }
  if (accao === 'execute-actions-email' && metodo === 'PUT') {
    if (!u) return resposta(404, { error: 'User not found' });
    if (!u.enabled) return resposta(400, { errorMessage: 'User is disabled' });
    return resposta(kc.estadoAccoes, kc.estadoAccoes >= 400 ? { errorMessage: 'Failed to send execute actions email' } : null);
  }
  return resposta(405, { error: 'operação não prevista no duplo' });
});

function pedidosDeRecuperacao() {
  return kc.pedidos.filter((p) => p.metodo === 'PUT' && /\/execute-actions-email/.test(p.url));
}

/** Nenhuma escrita no realm além do envio do e-mail de acções. */
function escritasNoRealm() {
  return kc.pedidos.filter(
    (p) =>
      p.url.startsWith(ADMIN_BASE) &&
      p.metodo !== 'GET' &&
      !/\/execute-actions-email/.test(p.url),
  );
}

// ---------------------------------------------------------------------------
// A action (import dinâmico: um módulo em falta parte o caso, não o ficheiro)
// ---------------------------------------------------------------------------

type Pedir = (dados: unknown) => Promise<Record<string, unknown>>;

async function pedir(dados: unknown): Promise<Record<string, unknown>> {
  const caminho = '../actions';
  const mod = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  const fn = mod.pedirRecuperacaoPalavraPasse as Pedir | undefined;
  expect(typeof fn, 'actions.ts tem de exportar pedirRecuperacaoPalavraPasse').toBe('function');
  return fn!(dados);
}

let seq = 0;
/** Endereço e IP únicos por caso: o limitador é de módulo e persiste entre testes. */
function unico(prefixo: string) {
  seq += 1;
  return {
    email: `${prefixo}-${seq}@recuperar-178.mz`,
    ip: `198.51.100.${seq}`,
  };
}

function utilizador(email: string, enabled = true): UtilizadorFalso {
  const u = { id: `sub-${email.replace(/[^a-z0-9]/gi, '-')}`, email: email.toLowerCase(), enabled };
  kc.utilizadores.push(u);
  return u;
}

beforeAll(() => {
  process.env.APP_URL = APP_URL;
  process.env.KEYCLOAK_ISSUER = ISSUER;
  process.env.KEYCLOAK_ISSUER_INTERNO = ISSUER;
  vi.stubGlobal('fetch', fetchFalso);
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(envAnterior)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

beforeEach(() => {
  kc.utilizadores = [];
  kc.emBaixo = false;
  kc.estadoAccoes = 204;
  kc.pedidos = [];
  linhasLog.length = 0;
  fetchFalso.mockClear();
});

// ---------------------------------------------------------------------------
// O pedido que chega ao Keycloak
// ---------------------------------------------------------------------------

describe('#178 — pedido de recuperação chega ao Keycloak como execute-actions-email', () => {
  it('conta activa: um PUT execute-actions-email com ["UPDATE_PASSWORD"] e só isso, pela conta de serviço', async () => {
    const { email, ip } = unico('activa');
    cabecalhos.valor = { 'x-forwarded-for': ip };
    const u = utilizador(email);

    const r = await pedir({ email });

    expect(r).toMatchObject({ ok: true });
    const envios = pedidosDeRecuperacao();
    expect(envios).toHaveLength(1);
    const url = new URL(envios[0].url);
    expect(url.origin + url.pathname).toBe(
      `${ADMIN_BASE}/users/${encodeURIComponent(u.id)}/execute-actions-email`,
    );
    // Só UPDATE_PASSWORD: VERIFY_EMAIL deixaria a conta por activar e o direct
    // grant recusava a sessão (ADR-0029/0031).
    expect(JSON.parse(envios[0].corpo ?? 'null')).toEqual(['UPDATE_PASSWORD']);
    // O regresso é ao produto (o cliente do ERP), não a um URL arbitrário.
    expect(url.searchParams.get('client_id')).toBe(process.env.KEYCLOAK_CLIENT_ID ?? 'gespro-erp');
    const regresso = url.searchParams.get('redirect_uri');
    expect(regresso, 'redirect_uri para o ERP').toBeTruthy();
    expect(new URL(regresso!).origin).toBe(APP_URL);
    // A recuperação não reescreve a conta: nem palavra-passe, nem estado, nem acções.
    expect(escritasNoRealm()).toEqual([]);
  });

  it('o e-mail é normalizado (espaços e maiúsculas) antes de procurar a conta', async () => {
    const { email, ip } = unico('normalizar');
    cabecalhos.valor = { 'x-forwarded-for': ip };
    utilizador(email);

    const r = await pedir({ email: `  ${email.toUpperCase()}  ` });

    expect(r).toMatchObject({ ok: true });
    expect(pedidosDeRecuperacao()).toHaveLength(1);
  });

  it('entrada mal formada não toca no Keycloak', async () => {
    cabecalhos.valor = { 'x-forwarded-for': unico('invalido').ip };
    for (const dados of [{ email: 'nao-e-um-email' }, { email: '' }, {}, null, 'x@y.mz']) {
      // Uma Server Action não lança para o cliente: recusa com `ok: false`.
      const r = await pedir(dados);
      expect(r.ok, `entrada ${JSON.stringify(dados)} não pode ser aceite`).toBe(false);
    }
    expect(kc.pedidos.filter((p) => p.url.startsWith(ADMIN_BASE))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Resposta sempre igual — não revelar se a conta existe
// ---------------------------------------------------------------------------

describe('#178 — a resposta nunca revela se a conta existe', () => {
  it('existente, inexistente e desactivada devolvem exactamente a mesma resposta', async () => {
    const a = unico('existe');
    const b = unico('nao-existe');
    const c = unico('desactivada');
    utilizador(a.email);
    utilizador(c.email, false);

    cabecalhos.valor = { 'x-forwarded-for': a.ip };
    const rExiste = await pedir({ email: a.email });
    cabecalhos.valor = { 'x-forwarded-for': b.ip };
    const rNaoExiste = await pedir({ email: b.email });
    cabecalhos.valor = { 'x-forwarded-for': c.ip };
    const rDesactivada = await pedir({ email: c.email });

    expect(rExiste).toMatchObject({ ok: true });
    expect(rNaoExiste).toEqual(rExiste);
    expect(rDesactivada).toEqual(rExiste);
    // E a resposta não ecoa o endereço (senão já não seria «igual»).
    expect(JSON.stringify(rExiste)).not.toContain(a.email);
  });

  it('conta inexistente: nenhum e-mail de acções é pedido', async () => {
    const { email, ip } = unico('fantasma');
    cabecalhos.valor = { 'x-forwarded-for': ip };

    await pedir({ email });

    expect(pedidosDeRecuperacao()).toEqual([]);
    expect(escritasNoRealm()).toEqual([]);
  });

  it('conta desactivada no Keycloak: nenhum e-mail de acções é pedido', async () => {
    const { email, ip } = unico('inactiva');
    cabecalhos.valor = { 'x-forwarded-for': ip };
    utilizador(email, false);

    await pedir({ email });

    expect(pedidosDeRecuperacao()).toEqual([]);
    expect(escritasNoRealm()).toEqual([]);
  });

  it('Keycloak em baixa: não lança e devolve a mesma resposta', async () => {
    const ref = unico('referencia');
    utilizador(ref.email);
    cabecalhos.valor = { 'x-forwarded-for': ref.ip };
    const rRef = await pedir({ email: ref.email });

    const { email, ip } = unico('kc-em-baixo');
    utilizador(email);
    kc.emBaixo = true;
    cabecalhos.valor = { 'x-forwarded-for': ip };
    const r = await pedir({ email });

    expect(r).toEqual(rRef);
  });

  it('envio falhado (SMTP do Keycloak partido → 500): mesma resposta', async () => {
    const ref = unico('referencia-smtp');
    utilizador(ref.email);
    cabecalhos.valor = { 'x-forwarded-for': ref.ip };
    const rRef = await pedir({ email: ref.email });

    const { email, ip } = unico('smtp-partido');
    utilizador(email);
    kc.estadoAccoes = 500;
    cabecalhos.valor = { 'x-forwarded-for': ip };
    const r = await pedir({ email });

    expect(pedidosDeRecuperacao().length).toBeGreaterThanOrEqual(2);
    expect(r).toEqual(rRef);
  });

  it('o endereço nunca vai para o log', async () => {
    const a = unico('log-existe');
    const b = unico('log-fantasma');
    const c = unico('log-falha');
    utilizador(a.email);
    utilizador(c.email);

    cabecalhos.valor = { 'x-forwarded-for': a.ip };
    await pedir({ email: a.email });
    cabecalhos.valor = { 'x-forwarded-for': b.ip };
    await pedir({ email: b.email });
    kc.estadoAccoes = 500;
    cabecalhos.valor = { 'x-forwarded-for': c.ip };
    await pedir({ email: c.email });

    const texto = JSON.stringify(linhasLog).toLowerCase();
    for (const e of [a.email, b.email, c.email]) expect(texto).not.toContain(e);
  });
});

// ---------------------------------------------------------------------------
// Rate-limit pela porta existente
// ---------------------------------------------------------------------------

describe('#178 — rate-limit (porta de src/server/security/rate-limiter.ts)', () => {
  it('o mesmo endereço, de IPs diferentes: no máximo 5 e-mails na janela, e a resposta não muda', async () => {
    const { email } = unico('martelado');
    utilizador(email);

    const respostas: Record<string, unknown>[] = [];
    for (let i = 0; i < 20; i += 1) {
      cabecalhos.valor = { 'x-forwarded-for': `203.0.113.${i + 1}` };
      respostas.push(await pedir({ email }));
    }

    const enviados = pedidosDeRecuperacao().length;
    expect(enviados).toBeGreaterThanOrEqual(1);
    expect(enviados).toBeLessThanOrEqual(5);
    // Acima do limite a resposta é a mesma: «demasiadas tentativas» distinguiria.
    for (const r of respostas) expect(r).toEqual(respostas[0]);
  });

  it('o mesmo IP, muitos endereços: no máximo 10 e-mails na janela, e a resposta não muda', async () => {
    const ip = '192.0.2.178';
    const respostas: Record<string, unknown>[] = [];
    for (let i = 0; i < 30; i += 1) {
      const { email } = unico('varrimento');
      utilizador(email);
      cabecalhos.valor = { 'x-forwarded-for': `${ip}, 10.0.0.1` };
      respostas.push(await pedir({ email }));
    }

    const enviados = pedidosDeRecuperacao().length;
    expect(enviados).toBeGreaterThanOrEqual(1);
    expect(enviados).toBeLessThanOrEqual(10);
    for (const r of respostas) expect(r).toEqual(respostas[0]);
  });

  it('o limitador vive na porta existente (createRateLimiterFromEnv), não num Map local', () => {
    const fonte = readFileSync(path.join(process.cwd(), 'src/app/(auth)/auth/recuperar/actions.ts'), 'utf-8');
    expect(fonte).toMatch(/@\/server\/security\/rate-limiter/);
    expect(fonte).not.toMatch(/new Map\s*[<(]/);
  });
});

// ---------------------------------------------------------------------------
// Página, ligação no login e middleware
// ---------------------------------------------------------------------------

describe('#178 — ecrã /auth/recuperar e a porta no login', () => {
  const RAIZ_AUTH = path.join(process.cwd(), 'src/app/(auth)/auth');

  it('existe a página /auth/recuperar e é Server Component', () => {
    const pagina = path.join(RAIZ_AUTH, 'recuperar/page.tsx');
    expect(existsSync(pagina), 'src/app/(auth)/auth/recuperar/page.tsx').toBe(true);
    const fonte = readFileSync(pagina, 'utf-8');
    expect(fonte).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('o ecrã de login liga para /auth/recuperar', () => {
    const fontes = ['login/page.tsx', 'login/login-form.tsx']
      .map((f) => path.join(RAIZ_AUTH, f))
      .filter((f) => existsSync(f))
      .map((f) => readFileSync(f, 'utf-8'))
      .join('\n');
    expect(fontes).toMatch(/href=\{?\s*['"`]\/auth\/recuperar['"`]/);
  });

  it('guarda: /auth/recuperar responde sem sessão (middleware não redirige para o login)', async () => {
    vi.doMock('next-auth/jwt', () => ({ getToken: async () => null }));
    const { NextRequest } = await import('next/server');
    const { middleware } = await import('../../../../../../middleware');
    const res = await middleware(new NextRequest('http://localhost:3000/auth/recuperar'));
    const destino = res.headers.get('location') ?? '';
    expect(destino).not.toMatch(/\/auth\/login/);
    vi.doUnmock('next-auth/jwt');
  });
});
