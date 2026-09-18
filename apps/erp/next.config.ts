import path from "node:path";
import type { NextConfig } from "next";

// Raiz do monorepo (apps/erp → ../../). Necessária porque as dependências são
// instaladas em node_modules na raiz do workspace (pnpm): sem isto o output
// standalone fica incompleto e o Turbopack infere a raiz errada.
const monorepoRoot = path.join(__dirname, "../../");

// ---------------------------------------------------------------------------
// Cabeçalhos da rota pública `/registo` (ADR-0031; spec 21 tarefa 3.4)
// ---------------------------------------------------------------------------
//
// Só o `X-Robots-Tag`. A entrada pública do funil é `gestpro.co.mz/comecar`;
// esta rota é o destino dela, não uma segunda morada a indexar (Requisito
// 2.4). Duplica de propósito o `robots` do `generateMetadata` da página: um
// cabeçalho vale para respostas que não sejam HTML e para quem não executa a
// página.
//
// A excepção de CSP do Turnstile **não** pode viver aqui, ao contrário do que
// o `design.md` §3 previa: o `middleware.ts` escreve o cabeçalho CSP por
// último e um CSP substitui-se, não se acrescenta — verificado com
// `next build && next start` + `curl -D -`. A política está escrita e
// guardada por teste em `src/app/registo/csp.ts`, com o porquê e a alteração
// exacta que o `middleware.ts` precisa; o gap está em
// `docs/handoff/s21-l3-ecra-registo.md`.

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/registo",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },

  // Gera output standalone para imagem Docker de produção (spec 16).
  // O spec 17 gere os headers/CSP — não tocar nesse bloco.
  output: 'standalone',

  // Pacotes OTel tratados como externos pelo bundler Next.js — garante que
  // @vercel/nft os inclui no output standalone e que não são tree-shaken
  // quando carregados dinamicamente em instrumentation.ts.
  serverExternalPackages: [
    '@opentelemetry/sdk-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/resources',
    '@opentelemetry/semantic-conventions',
    '@prisma/instrumentation',
  ],

  // Rastreio de ficheiros do standalone a partir da raiz do monorepo.
  outputFileTracingRoot: monorepoRoot,

  // Fixa a raiz do workspace (existe um package-lock.json perdido em ~/ que
  // faria o Turbopack inferir a raiz errada).
  turbopack: {
    root: monorepoRoot,
  },
  // Sem cabeçalhos GLOBAIS aqui — os headers de segurança (CSP, HSTS, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, Permissions-Policy) são geridos em
  // middleware.ts (edge), que tem acesso ao nonce CSP por pedido, e que os
  // escreve DEPOIS destes: declarar aqui um nome que ele também escreve é
  // declarar um cabeçalho que nunca chega ao browser. A única entrada em
  // `headers()` acima é de uma rota e de um nome que o middleware não usa.
  // CORS wildcard removido (spec 17): CORS explícito apenas nos Route Handlers
  // que o exijam (webhooks/exports), via src/lib/api/cors.ts.
  //
  // Spec 19: os endpoints públicos de onboarding (/api/publico/*) aplicam a
  // allowlist ALLOWED_ORIGINS do ambiente — a origem do site de marketing
  // (spec 18) TEM de constar lá antes do deploy. A variável é lida em runtime
  // (src/lib/api/cors.ts), não em build: não há nada a declarar aqui.
  // A chave `output: 'standalone'` é domínio exclusivo do spec 16 — não editar aqui.
  images: {
    remotePatterns: [
      {
        hostname: "images.pexels.com",
      },
      {
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
