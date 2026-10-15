/**
 * ORÁCULO — issue n.º 541 (nó G:site-proxy-refs): `apps/site/src/middleware.ts` →
 * `apps/site/src/proxy.ts` (convenção do Next 16), com comportamento IGUAL.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente
 * de implementação que altere este ficheiro (ou o `server.deps.inline` do
 * `vitest.config.ts`, que só existe para o next-intl resolver `next/server` em
 * node) é BLOCKER.
 *
 * Contrato:
 *   1. `src/proxy.ts` existe e `src/middleware.ts` não (os dois juntos, o Next
 *      16 recusa; só o middleware, o `next dev` avisa de depreciação).
 *   2. A exportação é a que o Next 16 aceita para o proxy
 *      (node_modules/next/dist/build: «must export a function named `proxy` or
 *      a default function») — e nunca uma função `middleware`.
 *   3. `config` é um literal estático (o Next lê-o por análise do código) com o
 *      MESMO matcher de antes.
 *   4. Comportamento de negociação de locale igual ao do middleware
 *      (`createMiddleware(routing)` do next-intl, `localePrefix: "as-needed"`):
 *      PT servido sem prefixo por rewrite, `/pt/...` → 307 sem prefixo, `/en/...`
 *      passa, `Accept-Language`/cookie `en` na raiz → 307 `/en`.
 *
 * ESTADO ESPERADO antes da implementação: RED (src/proxy.ts inexistente,
 * src/middleware.ts presente).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

const SRC = resolve(__dirname, "..");
const PROXY = resolve(SRC, "proxy.ts");
const MIDDLEWARE = resolve(SRC, "middleware.ts");
const BASE = "http://localhost:3100";
const MATCHER = ["/((?!api|_next|_vercel|.*\\..*).*)"];

type Proxy = (req: NextRequest) => Promise<Response> | Response;

async function carregar(): Promise<{ fn: Proxy; mod: Record<string, unknown> }> {
  expect(existsSync(PROXY), "apps/site/src/proxy.ts não existe").toBe(true);
  // caminho dinâmico: o ficheiro ainda não existe na fase vermelha
  const caminho = "../proxy";
  const mod = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  const fn = (mod.proxy ?? mod.default) as Proxy | undefined;
  expect(typeof fn, "src/proxy.ts tem de exportar `proxy` ou uma função por omissão").toBe("function");
  return { fn: fn as Proxy, mod };
}

async function pedir(caminho: string, headers: Record<string, string> = {}): Promise<Response> {
  const { fn } = await carregar();
  return fn(new NextRequest(`${BASE}${caminho}`, { headers }));
}

describe("n.º 541 — o site usa src/proxy.ts (Next 16)", () => {
  it("src/proxy.ts existe e src/middleware.ts já não", () => {
    expect(existsSync(PROXY), "apps/site/src/proxy.ts não existe").toBe(true);
    expect(existsSync(MIDDLEWARE), "apps/site/src/middleware.ts ainda existe").toBe(false);
  });

  it("exporta o proxy na forma que o Next 16 aceita, e não uma função `middleware`", async () => {
    const { mod } = await carregar();
    expect(mod.middleware, "não pode exportar `middleware`").toBeUndefined();
    const codigo = readFileSync(PROXY, "utf-8");
    expect(codigo).not.toMatch(/export\s+(async\s+)?function\s+middleware\b/);
    expect(codigo).not.toMatch(/export\s+const\s+middleware\b/);
  });

  it("config é um literal estático com o mesmo matcher", async () => {
    const { mod } = await carregar();
    expect((mod.config as { matcher?: unknown } | undefined)?.matcher).toEqual(MATCHER);
    const codigo = readFileSync(PROXY, "utf-8");
    // literal: `export const config = { matcher: [ "<string>" ] }` — nada de variáveis
    expect(codigo).toMatch(
      /export\s+const\s+config\s*=\s*\{[\s\S]*?matcher\s*:\s*\[\s*["']\/\(\(\?!api\|_next\|_vercel\|\.\*\\\\\.\.\*\)\.\*\)["']\s*,?\s*\]/,
    );
  });
});

describe("n.º 541 — o proxy negoceia o locale como o middleware negociava", () => {
  it.each([
    ["/", "/pt"],
    ["/precos", "/pt/precos"],
  ])("%s (PT, sem prefixo) é servido por rewrite para %s, sem redirect", async (caminho, interno) => {
    const res = await pedir(caminho);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe(`${BASE}${interno}`);
    expect(res.headers.get("link")).toContain('hreflang="pt"');
  });

  it("/en/precos passa (sem rewrite nem redirect) e fixa NEXT_LOCALE=en", async () => {
    const res = await pedir("/en/precos");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("set-cookie")).toContain("NEXT_LOCALE=en");
  });

  it("/pt/precos → 307 para /precos (prefixo do idioma por omissão sai)", async () => {
    const res = await pedir("/pt/precos");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/precos`);
  });

  it.each([
    [{ "accept-language": "en" }],
    [{ cookie: "NEXT_LOCALE=en" }],
  ])("na raiz, preferência en (%o) → 307 /en", async (headers) => {
    const res = await pedir("/", headers);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/en`);
  });
});
