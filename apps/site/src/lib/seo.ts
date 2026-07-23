import type { Metadata } from "next";
import { SITE_URL } from "./env";
import { routing, LOCALE_TAGS, type Locale } from "@/i18n/routing";
import type { Plano } from "./planos";

/**
 * Utilitários de SEO (Requisito 7): metadata canónica + `hreflang`, OG dinâmico
 * e blocos JSON-LD. Nada aqui é específico de uma página — as páginas passam
 * título, descrição e caminho.
 */

/** Caminho absoluto de uma rota no locale indicado (respeita `localePrefix: as-needed`). */
export function urlCanonica(caminho: string, locale: Locale): string {
  const limpo = caminho === "/" ? "" : caminho.replace(/\/+$/, "");
  const prefixo = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${SITE_URL}${prefixo}${limpo}` || `${SITE_URL}/`;
}

/** URL da imagem OG gerada em runtime por `app/api/og/route.tsx`. */
export function urlImagemOg(titulo: string, seccao?: string): string {
  const params = new URLSearchParams({ titulo });
  if (seccao) params.set("seccao", seccao);
  return `${SITE_URL}/api/og?${params.toString()}`;
}

interface OpcoesMetadata {
  titulo: string;
  descricao: string;
  caminho: string;
  locale: Locale;
  /** Etiqueta pequena impressa na imagem OG (ex.: "Preços", "Recursos"). */
  seccao?: string;
  /** Imagem OG explícita (artigos com capa própria); por omissão gera uma. */
  imagem?: string;
  tipo?: "website" | "article";
  /** Ignora o `title.template` do layout (usado na Home, cujo título já é a marca). */
  tituloAbsoluto?: boolean;
  publicadoEm?: string;
  autor?: string;
}

export function construirMetadata({
  titulo,
  descricao,
  caminho,
  locale,
  seccao,
  imagem,
  tipo = "website",
  tituloAbsoluto = false,
  publicadoEm,
  autor,
}: OpcoesMetadata): Metadata {
  const canonica = urlCanonica(caminho, locale);
  const og = imagem ?? urlImagemOg(titulo, seccao);

  const idiomas: Record<string, string> = {};
  for (const l of routing.locales) {
    idiomas[LOCALE_TAGS[l]] = urlCanonica(caminho, l);
  }

  return {
    title: tituloAbsoluto ? { absolute: titulo } : titulo,
    description: descricao,
    alternates: {
      canonical: canonica,
      languages: { ...idiomas, "x-default": urlCanonica(caminho, "pt") },
    },
    openGraph: {
      type: tipo,
      url: canonica,
      title: titulo,
      description: descricao,
      siteName: "GestPro",
      locale: LOCALE_TAGS[locale].replace("-", "_"),
      images: [{ url: og, width: 1200, height: 630, alt: titulo }],
      ...(tipo === "article" && publicadoEm
        ? { publishedTime: publicadoEm, authors: autor ? [autor] : undefined }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [og],
    },
  };
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

type JsonLd = Record<string, unknown>;

export function organizacaoJsonLd(descricao: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GestPro",
    legalName: "GestPro, Lda.",
    url: SITE_URL,
    logo: `${SITE_URL}/logo-gespro.svg`,
    description: descricao,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Maputo",
      addressCountry: "MZ",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "ola@gestpro.co.mz",
      availableLanguage: ["Portuguese"],
    },
  };
}

export function siteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "GestPro",
    url: SITE_URL,
    inLanguage: "pt-MZ",
  };
}

/**
 * `Product` por plano, com `Offer` derivada do catálogo do spec 19 — os preços
 * do JSON-LD vêm exactamente da mesma fonte que a tabela visível.
 */
export function produtoJsonLd(plano: Plano, descricaoFallback: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `GestPro ${plano.nome}`,
    description: plano.descricao ?? descricaoFallback,
    brand: { "@type": "Brand", name: "GestPro" },
    category: "SoftwareApplication",
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/precos`,
      price: plano.precoMensal.valor,
      priceCurrency: plano.precoMensal.moeda,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: plano.precoMensal.valor,
        priceCurrency: plano.precoMensal.moeda,
        unitCode: "MON",
        billingIncrement: 1,
      },
    },
  };
}

export function faqJsonLd(
  itens: { pergunta: string; resposta: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: itens.map((i) => ({
      "@type": "Question",
      name: i.pergunta,
      acceptedAnswer: { "@type": "Answer", text: i.resposta },
    })),
  };
}

export function artigoJsonLd(opcoes: {
  titulo: string;
  resumo: string;
  data: string;
  autor: string;
  caminho: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opcoes.titulo,
    description: opcoes.resumo,
    datePublished: opcoes.data,
    author: { "@type": "Person", name: opcoes.autor },
    publisher: {
      "@type": "Organization",
      name: "GestPro",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-gespro.svg` },
    },
    mainEntityOfPage: `${SITE_URL}${opcoes.caminho}`,
    inLanguage: "pt-MZ",
  };
}

export function breadcrumbJsonLd(
  itens: { nome: string; caminho: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: itens.map((item, indice) => ({
      "@type": "ListItem",
      position: indice + 1,
      name: item.nome,
      item: `${SITE_URL}${item.caminho}`,
    })),
  };
}
