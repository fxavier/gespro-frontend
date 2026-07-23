import { describe, expect, it, vi, afterEach } from "vitest";
import {
  formatarPreco,
  ordenar,
  poupancaAnual,
  obterPlanos,
  PLANOS_DEMONSTRACAO,
  type Plano,
} from "../planos";

function plano(parcial: Partial<Plano> = {}): Plano {
  return {
    id: "BASICO",
    nome: "Básico",
    limites: {},
    funcionalidades: [],
    destaque: false,
    precoMensal: { valor: "29", moeda: "USD" },
    precoAnual: { valor: "290", moeda: "USD" },
    ...parcial,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("obterPlanos", () => {
  it("usa o catálogo da plataforma quando o endpoint responde conforme o contrato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          planos: [
            {
              id: "PROFISSIONAL",
              nome: "Profissional",
              limites: { utilizadores: 15 },
              // `Decimal` serializa como string — o schema tem de aceitar.
              precoMensal: { valor: "99.50", moeda: "USD" },
              precoAnual: { valor: 995, moeda: "USD" },
            },
          ],
        })
      )
    );

    const catalogo = await obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos).toHaveLength(1);
    expect(catalogo.planos[0]!.precoMensal.valor).toBe("99.50");
    // Número normalizado para string, sem perda.
    expect(catalogo.planos[0]!.precoAnual.valor).toBe("995");
  });

  it("degrada para o catálogo de demonstração quando o endpoint não existe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );

    const catalogo = await obterPlanos();

    expect(catalogo.origem).toBe("demonstracao");
    expect(catalogo.planos).toEqual(PLANOS_DEMONSTRACAO);
  });

  it("degrada quando o endpoint responde com um payload fora do contrato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ planos: [{ id: "OURO" }] }))
    );

    const catalogo = await obterPlanos();

    expect(catalogo.origem).toBe("demonstracao");
  });

  it("degrada em resposta de erro sem propagar o corpo do backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ erro: "stack interna" }, { status: 500 })
      )
    );

    const catalogo = await obterPlanos();

    expect(catalogo.origem).toBe("demonstracao");
    expect(JSON.stringify(catalogo)).not.toContain("stack interna");
  });
});

describe("ordenar", () => {
  it("aplica a progressão comercial independentemente da ordem da API", () => {
    const desordenado = [
      plano({ id: "EMPRESARIAL" }),
      plano({ id: "BASICO" }),
      plano({ id: "PROFISSIONAL" }),
    ];

    expect(ordenar(desordenado).map((p) => p.id)).toEqual([
      "BASICO",
      "PROFISSIONAL",
      "EMPRESARIAL",
    ]);
  });
});

describe("formatarPreco", () => {
  it("usa a moeda vinda da API, não uma assumida pelo site", () => {
    const emEuros = formatarPreco({ valor: "50", moeda: "EUR" }, "pt-MZ");
    expect(emEuros).toContain("50");
    expect(emEuros).not.toContain("MZN");
  });

  it("degrada legivelmente se o valor não for numérico", () => {
    expect(formatarPreco({ valor: "sob consulta", moeda: "USD" })).toBe(
      "sob consulta USD"
    );
  });
});

describe("poupancaAnual", () => {
  it("calcula a poupança face a doze mensalidades", () => {
    expect(
      poupancaAnual(
        plano({
          precoMensal: { valor: "100", moeda: "USD" },
          precoAnual: { valor: "1000", moeda: "USD" },
        })
      )
    ).toBe(17);
  });

  it("devolve zero quando o anual não é mais barato", () => {
    expect(
      poupancaAnual(
        plano({
          precoMensal: { valor: "100", moeda: "USD" },
          precoAnual: { valor: "1200", moeda: "USD" },
        })
      )
    ).toBe(0);
  });
});

describe("REVALIDACAO_PLANOS", () => {
  it("coincide com o literal `export const revalidate` das páginas que o usam", async () => {
    const { REVALIDACAO_PLANOS } = await import("../planos");
    const { readFileSync } = await import("node:fs");

    for (const pagina of [
      "src/app/[locale]/(marketing)/precos/page.tsx",
      "src/app/[locale]/(marketing)/comecar/page.tsx",
    ]) {
      const fonte = readFileSync(pagina, "utf8");
      const encontrado = /export const revalidate = (\d+);/.exec(fonte);
      expect(encontrado, pagina).not.toBeNull();
      expect(Number(encontrado![1]), pagina).toBe(REVALIDACAO_PLANOS);
    }
  });
});
