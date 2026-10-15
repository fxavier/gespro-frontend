/**
 * Oráculo da issue n.º 527 (nó C:funcionalidades-cliente) — parser do catálogo do site.
 * Escrito pelo VERIFICADOR; alterá-lo do lado de quem implementa é BLOCKER.
 *
 * Desde o n.º 529 o catálogo vive na tabela `Plano` (gerida pelo Administrador de plataforma) e
 * `GET /api/publico/planos` pode devolver qualquer código de plano. O site não pode derrubar o
 * catálogo inteiro (e cair na demonstração) por haver um 4.º plano:
 *
 * A. Aceita qualquer código NÃO VAZIO (um código vazio continua fora do contrato → demonstração).
 * B. `funcionalidades` vem da API tal e qual; ausente → `[]` (compatibilidade).
 * C. Ordem (decisão conservadora do verificador — o contrato não a fixa): os três códigos
 *    conhecidos mantêm a progressão comercial de sempre; um código desconhecido NÃO salta para a
 *    frente — fica depois dos conhecidos, pela ordem em que a API o enviou (a API já ordena por
 *    `Plano.ordem`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as mod from "../planos";

const m: any = mod;

function cru(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Plano ${id}`,
    limites: { utilizadores: 5, armazens: 2, suporte: "Email" },
    precoMensal: { valor: 10, moeda: "USD" },
    precoAnual: { valor: 100, moeda: "USD" },
    ...extra,
  };
}

function servir(planos: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ planos })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("n.º 527 — o catálogo do site aceita planos novos", () => {
  it("um 4.º código (desconhecido do site) não derruba o catálogo da plataforma", async () => {
    servir([
      cru("BASICO"),
      cru("PROFISSIONAL"),
      cru("EMPRESARIAL"),
      cru("STARTUP", { funcionalidades: ["Facturação básica"] }),
    ]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem, "um plano novo não pode empurrar o site para a demonstração").toBe(
      "plataforma",
    );
    expect(catalogo.planos.map((p: any) => p.id)).toContain("STARTUP");
    expect(catalogo.planos).toHaveLength(4);
  });

  it("um catálogo só com códigos novos é aceite", async () => {
    servir([cru("ARRANQUE"), cru("ESCALA")]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos.map((p: any) => p.id).sort()).toEqual(["ARRANQUE", "ESCALA"]);
  });

  it("um código vazio continua fora do contrato (degrada para a demonstração)", async () => {
    servir([cru("")]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("demonstracao");
  });

  it("as funcionalidades vêm da API, pela ordem da API", async () => {
    servir([
      cru("STARTUP", { funcionalidades: ["Facturação básica", "Um armazém", "Apoio por email"] }),
    ]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos[0].funcionalidades).toEqual([
      "Facturação básica",
      "Um armazém",
      "Apoio por email",
    ]);
  });

  it("funcionalidades ausentes → [] (compatibilidade com um endpoint antigo)", async () => {
    servir([cru("STARTUP")]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    expect(catalogo.planos[0].funcionalidades).toEqual([]);
  });

  it("funcionalidades com um elemento não-texto ficam fora do contrato", async () => {
    servir([cru("STARTUP", { funcionalidades: ["ok", 42] })]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("demonstracao");
  });

  it("o destaque continua a vir do campo `destaque`", async () => {
    servir([cru("BASICO"), cru("STARTUP", { destaque: true })]);

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    const porId = Object.fromEntries(catalogo.planos.map((p: any) => [p.id, p.destaque]));
    expect(porId).toEqual({ BASICO: false, STARTUP: true });
  });
});

describe("n.º 527 — a forma real do endpoint do ERP", () => {
  // `apps/erp/src/app/api/publico/planos/route.ts` responde `{ data: { trialDias, planos } }`
  // (envelope dos Route Handlers, `docs/handoff/site-provisionamento.md` §1). Sem o aceitar, o
  // site cai SEMPRE na demonstração e nenhuma funcionalidade da tabela chega ao cliente.
  // Decisão conservadora: aceita o envelope E a forma nua `{ planos }` (testes antigos).
  it("aceita o envelope `{ data: { trialDias, planos } }` e lê as funcionalidades", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            trialDias: 14,
            planos: [cru("STARTUP", { funcionalidades: ["Facturação básica"] }), cru("BASICO")],
          },
        }),
      ),
    );

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("plataforma");
    const porId = Object.fromEntries(
      catalogo.planos.map((p: any) => [p.id, p.funcionalidades]),
    );
    expect(porId).toEqual({ STARTUP: ["Facturação básica"], BASICO: [] });
  });

  it("um envelope sem planos continua fora do contrato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: { trialDias: 14, planos: [] } })),
    );

    const catalogo = await m.obterPlanos();

    expect(catalogo.origem).toBe("demonstracao");
  });
});

describe("n.º 527 — ordem com códigos desconhecidos", () => {
  it("os conhecidos mantêm a progressão; os desconhecidos vêm depois, pela ordem da API", () => {
    const p = (id: string) => ({ ...cru(id), funcionalidades: [], destaque: false });
    const ordenado = m.ordenar([
      p("ZETA"),
      p("EMPRESARIAL"),
      p("ALFA"),
      p("BASICO"),
      p("PROFISSIONAL"),
    ]);

    expect(ordenado.map((x: any) => x.id)).toEqual([
      "BASICO",
      "PROFISSIONAL",
      "EMPRESARIAL",
      "ZETA",
      "ALFA",
    ]);
  });
});
