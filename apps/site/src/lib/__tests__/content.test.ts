import { describe, expect, it } from "vitest";
import {
  frontmatterSchema,
  listar,
  listarArtigos,
  obter,
  obterArtigo,
  slugsDeArtigos,
} from "../content";

describe("frontmatterSchema", () => {
  it("aceita uma data em objecto Date (gray-matter converte datas YAML)", () => {
    const resultado = frontmatterSchema.safeParse({
      titulo: "T",
      resumo: "R",
      data: new Date("2026-03-04T00:00:00Z"),
      autor: "A",
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.data).toBe("2026-03-04");
  });

  it("rejeita datas fora do formato ISO curto", () => {
    const resultado = frontmatterSchema.safeParse({
      titulo: "T",
      resumo: "R",
      data: "04/03/2026",
      autor: "A",
    });

    expect(resultado.success).toBe(false);
  });

  it("exige título, resumo e autor", () => {
    expect(frontmatterSchema.safeParse({ data: "2026-01-01" }).success).toBe(
      false
    );
  });
});

describe("colecções", () => {
  it("carrega todo o conteúdo do repositório sem erros de frontmatter", () => {
    // Se algum ficheiro MDX tiver frontmatter inválido, `listar` lança — e é
    // aqui que se descobre, não no build.
    expect(() => listar("blog")).not.toThrow();
    expect(() => listar("recursos")).not.toThrow();
    expect(() => listar("legal")).not.toThrow();
  });

  it("ordena os artigos do mais recente para o mais antigo", () => {
    const datas = listarArtigos().map((d) => d.data);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  it("funde blog e recursos numa só lista sem slugs repetidos", () => {
    const slugs = slugsDeArtigos();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("devolve null para um slug inexistente em vez de lançar", () => {
    expect(obterArtigo("nao-existe-de-todo")).toBeNull();
  });

  it("expõe as páginas legais como documentos da colecção legal", () => {
    for (const slug of ["termos", "privacidade"]) {
      const documento = obter("legal", slug);
      expect(documento, `content/legal/${slug}.mdx`).not.toBeNull();
      expect(documento!.corpo.length).toBeGreaterThan(200);
    }
  });

  it("estima o tempo de leitura de cada artigo em pelo menos um minuto", () => {
    for (const artigo of listarArtigos()) {
      expect(artigo.minutosLeitura).toBeGreaterThanOrEqual(1);
    }
  });
});
