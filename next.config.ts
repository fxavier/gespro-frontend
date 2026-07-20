import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do workspace no projecto (existe um package-lock.json perdido em
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
