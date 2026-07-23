import { describe, expect, it } from "vitest";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  organizacaoJsonLd,
  produtoJsonLd,
  urlCanonica,
  urlImagemOg,
} from "../seo";
import type { Plano } from "../planos";

describe("urlCanonica", () => {
  it("não prefixa o locale por omissão (PT-PT serve na raiz)", () => {
    expect(urlCanonica("/precos", "pt")).toMatch(/\/precos$/);
    expect(urlCanonica("/precos", "pt")).not.toContain("/pt/");
  });

  it("prefixa os restantes locales", () => {
    expect(urlCanonica("/precos", "en")).toContain("/en/precos");
  });

  it("normaliza a raiz sem barra final duplicada", () => {
    expect(urlCanonica("/", "pt")).not.toMatch(/\/\/$/);
  });
});

describe("urlImagemOg", () => {
  it("codifica o título na query string", () => {
    const url = urlImagemOg("Preços & planos", "Preços");
    expect(url).toContain("/api/og?");
    expect(url).toContain("titulo=Pre%C3%A7os+%26+planos");
  });
});

describe("JSON-LD", () => {
  const plano: Plano = {
    id: "PROFISSIONAL",
    nome: "Profissional",
    limites: {},
    funcionalidades: [],
    destaque: true,
    precoMensal: { valor: "79", moeda: "USD" },
    precoAnual: { valor: "790", moeda: "USD" },
  };

  it("gera Organization com contexto schema.org", () => {
    const dados = organizacaoJsonLd("ERP moçambicano");
    expect(dados["@context"]).toBe("https://schema.org");
    expect(dados["@type"]).toBe("Organization");
  });

  it("deriva o preço do Product do catálogo, sem valor próprio", () => {
    const dados = produtoJsonLd(plano, "fallback") as {
      offers: { price: string; priceCurrency: string };
    };
    expect(dados.offers.price).toBe("79");
    expect(dados.offers.priceCurrency).toBe("USD");
  });

  it("gera FAQPage com uma Question por item", () => {
    const dados = faqJsonLd([
      { pergunta: "P1", resposta: "R1" },
      { pergunta: "P2", resposta: "R2" },
    ]) as { mainEntity: unknown[] };
    expect(dados.mainEntity).toHaveLength(2);
  });

  it("numera as posições do breadcrumb a partir de 1", () => {
    const dados = breadcrumbJsonLd([
      { nome: "Início", caminho: "/" },
      { nome: "Preços", caminho: "/precos" },
    ]) as { itemListElement: { position: number }[] };
    expect(dados.itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });
});
