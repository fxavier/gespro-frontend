import { describe, expect, it } from "vitest";
import pt from "../../../messages/pt.json";
import en from "../../../messages/en.json";
import { MODULOS } from "../modulos";

type Objecto = Record<string, unknown>;

function caminhos(objecto: Objecto, prefixo = ""): string[] {
  return Object.entries(objecto).flatMap(([chave, valor]) => {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? caminhos(valor as Objecto, caminho)
      : [caminho];
  });
}

describe("catálogo PT-PT", () => {
  it("tem uma entrada completa por módulo do ERP", () => {
    for (const modulo of MODULOS) {
      const entrada = (pt.modulos as Objecto)[modulo] as Objecto | undefined;
      expect(entrada, `modulos.${modulo}`).toBeDefined();
      expect(entrada!.nome).toBeTruthy();
      expect(entrada!.resumo).toBeTruthy();
      expect(entrada!.descricao).toBeTruthy();
      expect(
        (entrada!.funcionalidades as string[]).length
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("não deixa nenhuma chave vazia", () => {
    const vazias: string[] = [];
    const percorrer = (objecto: Objecto, prefixo = "") => {
      for (const [chave, valor] of Object.entries(objecto)) {
        const caminho = prefixo ? `${prefixo}.${chave}` : chave;
        if (typeof valor === "string" && valor.trim() === "") {
          vazias.push(caminho);
        } else if (valor && typeof valor === "object" && !Array.isArray(valor)) {
          percorrer(valor as Objecto, caminho);
        }
      }
    };
    percorrer(pt as Objecto);
    expect(vazias).toEqual([]);
  });

  it("tem uma pergunta frequente com resposta em cada item do FAQ", () => {
    const itens = (pt.precos as Objecto).faq as Objecto;
    const lista = itens.itens as { pergunta: string; resposta: string }[];
    expect(lista.length).toBeGreaterThanOrEqual(4);
    for (const item of lista) {
      expect(item.pergunta.length).toBeGreaterThan(10);
      expect(item.resposta.length).toBeGreaterThan(40);
    }
  });

  it("não contém valores monetários — os preços vêm do spec 19", () => {
    const suspeitos = caminhos(pt as Objecto).filter((caminho) => {
      const valor = caminho
        .split(".")
        .reduce<unknown>(
          (acumulado, parte) => (acumulado as Objecto)?.[parte],
          pt
        );
      return (
        typeof valor === "string" &&
        /\b(MZN|USD|EUR|MT)\s?\d|\d+\s?(MZN|USD|EUR|MT)\b|[$€]\s?\d/.test(valor)
      );
    });
    expect(suspeitos).toEqual([]);
  });
});

describe("catálogo EN (stub)", () => {
  it("não introduz chaves que não existam em PT-PT", () => {
    const chavesPt = new Set(caminhos(pt as Objecto));
    const extra = caminhos(en as Objecto).filter(
      (caminho) => !chavesPt.has(caminho) && !caminho.startsWith("_")
    );
    expect(extra).toEqual([]);
  });
});
