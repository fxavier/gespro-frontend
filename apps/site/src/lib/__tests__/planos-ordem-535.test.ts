/**
 * Oráculo da issue n.º 535 (nó F:planos-ordem-grelha) — o site respeita a ordem dos planos.
 * Escrito pelo VERIFICADOR; alterá-lo do lado de quem implementa é BLOCKER.
 *
 * `GET /api/publico/planos` já devolve os planos ordenados por `Plano.ordem`, que o Administrador
 * de plataforma edita em `/plataforma/planos`. O site não pode reordenar os códigos de origem
 * (BASICO, PROFISSIONAL, EMPRESARIAL) por uma constante própria: o catálogo devolvido por
 * `obterPlanos` preserva EXACTAMENTE a ordem da API, com e sem o envelope `{ data }`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as mod from "../planos";

const m: any = mod;

const ORDEM_DA_API = ["PROFISSIONAL", "BASICO", "PERSONALIZADO", "EMPRESARIAL"];

function cru(id: string) {
  return {
    id,
    nome: `Plano ${id}`,
    limites: { utilizadores: 5, armazens: 2, suporte: "Email" },
    precoMensal: { valor: 10, moeda: "USD" },
    precoAnual: { valor: 100, moeda: "USD" },
    funcionalidades: [`Funcionalidade ${id}`],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("n.º 535 — o catálogo do site preserva a ordem da API", () => {
  it("forma nua `{ planos }`: [PROFISSIONAL, BASICO, PERSONALIZADO, EMPRESARIAL] mantém-se", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ planos: ORDEM_DA_API.map(cru) })),
    );

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos.map((p: any) => p.id)).toEqual(ORDEM_DA_API);
    // Cada plano continua com os seus dados (a ordem não troca conteúdos entre planos).
    expect(catalogo.planos.map((p: any) => p.funcionalidades[0])).toEqual(
      ORDEM_DA_API.map((id) => `Funcionalidade ${id}`),
    );
  });

  it("envelope `{ data: { trialDias, planos } }`: a mesma ordem mantém-se", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ data: { trialDias: 14, planos: ORDEM_DA_API.map(cru) } }),
      ),
    );

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos.map((p: any) => p.id)).toEqual(ORDEM_DA_API);
  });

  it("só os três códigos de origem, por ordem inversa, não são reordenados", async () => {
    const inversa = ["EMPRESARIAL", "PROFISSIONAL", "BASICO"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ planos: inversa.map(cru) })),
    );

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos.map((p: any) => p.id)).toEqual(inversa);
  });
});
