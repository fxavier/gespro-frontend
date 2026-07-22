import path from "node:path";
import type { NextConfig } from "next";

// Raiz do monorepo (apps/erp → ../../). Necessária porque as dependências são
// instaladas em node_modules na raiz do workspace (pnpm): sem isto o output
// standalone fica incompleto e o Turbopack infere a raiz errada.
const monorepoRoot = path.join(__dirname, "../../");

const nextConfig: NextConfig = {
  // Gera output standalone para imagem Docker de produção (spec 16).
  // O spec 17 gere os headers/CSP — não tocar nesse bloco.
  output: 'standalone',

  // Rastreio de ficheiros do standalone a partir da raiz do monorepo.
  outputFileTracingRoot: monorepoRoot,

  // Fixa a raiz do workspace (existe um package-lock.json perdido em ~/ que
  // faria o Turbopack inferir a raiz errada).
  turbopack: {
    root: monorepoRoot,
  },
  // Sem cabeçalhos globais aqui — os headers de segurança (CSP, HSTS, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, Permissions-Policy) são geridos em
  // middleware.ts (edge), que tem acesso ao nonce CSP por pedido.
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
