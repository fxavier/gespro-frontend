import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { MODULOS } from "@/lib/modulos";
import { slugsDeArtigos } from "@/lib/content";

/**
 * Sitemap (Requisito 7.2).
 *
 * Só o locale por omissão (PT-PT) entra: `/en` ainda não está traduzido e um
 * sitemap que anuncia páginas por traduzir convida o motor de busca a indexar
 * conteúdo duplicado. Quando `messages/en.json` estiver completo, iterar
 * `routing.locales` aqui e retirar a regra de `robots.ts`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();

  const estaticas: { caminho: string; prioridade: number; frequencia: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { caminho: "/", prioridade: 1, frequencia: "weekly" },
    { caminho: "/funcionalidades", prioridade: 0.9, frequencia: "monthly" },
    { caminho: "/precos", prioridade: 0.9, frequencia: "weekly" },
    { caminho: "/comecar", prioridade: 0.8, frequencia: "monthly" },
    { caminho: "/recursos", prioridade: 0.7, frequencia: "weekly" },
    { caminho: "/sobre", prioridade: 0.6, frequencia: "yearly" },
    { caminho: "/contacto", prioridade: 0.6, frequencia: "yearly" },
    { caminho: "/termos", prioridade: 0.3, frequencia: "yearly" },
    { caminho: "/privacidade", prioridade: 0.3, frequencia: "yearly" },
  ];

  const modulos = MODULOS.map((modulo) => ({
    caminho: `/funcionalidades/${modulo}`,
    prioridade: 0.7,
    frequencia: "monthly" as const,
  }));

  const artigos = slugsDeArtigos().map((slug) => ({
    caminho: `/recursos/${slug}`,
    prioridade: 0.6,
    frequencia: "yearly" as const,
  }));

  return [...estaticas, ...modulos, ...artigos].map((rota) => ({
    url: `${SITE_URL}${rota.caminho === "/" ? "" : rota.caminho}` || SITE_URL,
    lastModified: agora,
    changeFrequency: rota.frequencia,
    priority: rota.prioridade,
  }));
}
