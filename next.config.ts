import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera output standalone para imagem Docker de produção (spec 16).
  // O spec 17 gere os headers/CSP — não tocar nesse bloco.
  output: 'standalone',

  // Fixa a raiz do workspace no projeto (existe um package-lock.json perdido em
  // ~/ que faria o Turbopack inferir a raiz errada).
  turbopack: {
    root: process.cwd(),
  },
  // Sem cabeçalhos globais aqui — os headers de segurança (CSP, HSTS, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, Permissions-Policy) são geridos em
  // middleware.ts (edge), que tem acesso ao nonce CSP por pedido.
  // CORS wildcard removido (spec 17): CORS explícito apenas nos Route Handlers
  // que o exijam (webhooks/exports), via src/lib/api/cors.ts.
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
