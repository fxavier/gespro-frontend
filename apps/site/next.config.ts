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
  async headers() {
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
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
