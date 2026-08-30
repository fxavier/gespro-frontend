import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Raiz do monorepo (apps/site → ../../). Necessária porque as dependências são
// instaladas em node_modules na raiz do workspace (pnpm): sem isto o output
// standalone fica incompleto e o Turbopack infere a raiz errada. Ver ADR-0006.
const monorepoRoot = path.join(__dirname, "../../");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Site público: build standalone para poder correr em contentor mínimo
  // (ou ser servido a partir de um CDN com origem Node para as rotas ISR).
  // Nunca depende de `prisma migrate deploy` — ver ADR-0006 e spec 18 §10.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },

  images: {
    // AVIF/WebP com fallback automático (Requisito 8.2).
    formats: ["image/avif", "image/webp"],
  },

  // Headers de segurança do SITE. Deliberadamente distintos do ERP:
  // o `middleware.ts` do ERP (spec 17) é dono dos headers dessa app e não é
  // partilhado — é exactamente o isolamento que justifica o monorepo (ADR-0006).
  //
  // CSP do site (estática — sem nonce; o ERP tem nonce por pedido no middleware).
  // Domínios Cloudflare Turnstile adicionados em ADR-0016: script-src e frame-src
  // são necessários para o widget de captcha da página /comecar.
  // Este header deve ser acrescentado ANTES de o w8-correcoes activar o modo
  // estrito (CSP_ENFORCE) — conforme §3 do conflito 3 no execucao-paralela-w8.md.
  async headers() {
    // Política CSP do site. 'unsafe-inline' em script-src é necessário para os
    // scripts de hidratação do Next.js (sem middleware de nonce no site).
    const csp = [
      "default-src 'self'",
      // Scripts próprios + hidratação Next.js + Turnstile (ADR-0016)
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      // Widget Turnstile usa um iframe (ADR-0016)
      "frame-src https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
