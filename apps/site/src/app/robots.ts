import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

/**
 * robots.txt (Requisito 7.2).
 *
 * `/api/*` fora do índice (não é conteúdo) e `/en/*` também, enquanto o
 * catálogo inglês não estiver traduzido — indexá-lo produziria páginas
 * duplicadas em português sob URLs `/en`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/en/", "/en"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
