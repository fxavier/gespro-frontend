import { describe, expect, it } from "vitest";
import { construirDestinoRegisto } from "../funil";

/**
 * O funil atravessa uma fronteira de domínio (ADR-0031 §Consequências). O que
 * se perde no salto não se recupera: sem `utm_*` do outro lado, a conversão
 * medida deixa de ter origem e o investimento em aquisição passa a ser
 * avaliado a olho (Requisito 7.2).
 */
describe("construirDestinoRegisto", () => {
  it("aponta para /registo no ERP, e não para uma rota do site", () => {
    expect(construirDestinoRegisto()).toBe("http://localhost:3000/registo");
  });

  it("preserva o plano escolhido na tabela de preços", () => {
    expect(construirDestinoRegisto({ plano: "PROFISSIONAL" })).toBe(
      "http://localhost:3000/registo?plano=PROFISSIONAL"
    );
  });

  it("preserva todos os utm_*, por ordem determinística", () => {
    const destino = new URL(
      construirDestinoRegisto({
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "erp-mz",
        utm_content: "anuncio-b",
        utm_term: "software+facturacao",
        plano: "BASICO",
      })
    );

    expect(destino.pathname).toBe("/registo");
    expect([...destino.searchParams.keys()]).toEqual([
      "plano",
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term",
    ]);
    expect(destino.searchParams.get("utm_source")).toBe("google");
  });

  it("não reencaminha parâmetros que não são do funil", () => {
    const destino = new URL(
      construirDestinoRegisto({
        plano: "BASICO",
        redirect: "https://exemplo.invalido",
        email: "alguem@empresa.co.mz",
        fbclid: "xyz",
      })
    );

    expect([...destino.searchParams.keys()]).toEqual(["plano"]);
  });

  it("ignora valores vazios e fica com o primeiro de um parâmetro repetido", () => {
    const destino = new URL(
      construirDestinoRegisto({
        plano: "   ",
        utm_source: ["newsletter", "outro"],
      })
    );

    expect(destino.searchParams.get("plano")).toBeNull();
    expect(destino.searchParams.get("utm_source")).toBe("newsletter");
  });

  it("trava um valor inflado antes de ele entrar no cabeçalho Location", () => {
    const destino = new URL(
      construirDestinoRegisto({ utm_campaign: "x".repeat(5000) })
    );

    expect(destino.searchParams.get("utm_campaign")!.length).toBe(200);
  });
});
