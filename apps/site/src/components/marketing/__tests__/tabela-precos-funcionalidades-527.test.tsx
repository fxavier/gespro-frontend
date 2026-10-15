/**
 * Oráculo da issue n.º 527 (nó C:funcionalidades-cliente) — os cartões de preços do site listam as
 * funcionalidades vindas de `GET /api/publico/planos`. Escrito pelo VERIFICADOR; alterá-lo do
 * lado de quem implementa é BLOCKER.
 *
 * Percorre o caminho real da página: `fetch` dobrado → `obterPlanos()` → `<TabelaPrecos>` → HTML.
 * O `fetch` responde com a forma REAL do endpoint do ERP (`apps/erp/src/app/api/publico/planos/
 * route.ts`): envelope `{ data: { trialDias, planos } }` (convenção dos Route Handlers).
 * O payload traz um 4.º plano (código que o site não conhece) com o destaque, para provar que:
 *   - as funcionalidades de CADA plano aparecem como itens de lista (<li>) no seu cartão;
 *   - nenhuma funcionalidade do catálogo de demonstração aparece (não há texto fixo nos
 *     componentes, e o site não caiu na demonstração);
 *   - o destaque («Mais escolhido») sai do campo `destaque` — um único cartão, o do plano novo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import pt from "../../../../messages/pt.json";

// O `Link` do next-intl precisa do router do Next; aqui basta uma âncora.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...resto }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, className: (resto as any).className }, children),
}));

const FUNCIONALIDADES: Record<string, string[]> = {
  BASICO: ["Oráculo: facturas certificadas", "Oráculo: um armazém"],
  PROFISSIONAL: ["Oráculo: compras com aprovação"],
  EMPRESARIAL: [],
  STARTUP: ["Oráculo: arranque guiado", "Oráculo: apoio no primeiro mês"],
};

function cru(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Nome ${id}`,
    descricao: `Descrição ${id}`,
    limites: { utilizadores: 5, armazens: -1, suporte: "Email" },
    precoMensal: { valor: 10, moeda: "USD" },
    precoAnual: { valor: 100, moeda: "USD" },
    destaque: false,
    funcionalidades: FUNCIONALIDADES[id],
    ...extra,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderTabela(): Promise<string> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          trialDias: 14,
          planos: [
            cru("BASICO"),
            cru("PROFISSIONAL"),
            cru("EMPRESARIAL"),
            cru("STARTUP", { destaque: true }),
          ],
        },
      }),
    ),
  );
  const { obterPlanos }: any = await import("@/lib/planos");
  const { TabelaPrecos }: any = await import("../tabela-precos");
  const catalogo = await obterPlanos();
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="pt" messages={pt as any} timeZone="Africa/Maputo">
      <TabelaPrecos catalogo={catalogo} />
    </NextIntlClientProvider>,
  );
}

function texto(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/** Itens de lista cujo texto contém `alvo`. */
function itensCom(html: string, alvo: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => texto(m[1]!).trim())
    .filter((t) => t.includes(alvo));
}

describe("n.º 527 — cartões de preços listam as funcionalidades da API", () => {
  it("cada funcionalidade de cada plano aparece como item de lista", async () => {
    const html = await renderTabela();

    for (const [id, lista] of Object.entries(FUNCIONALIDADES)) {
      for (const f of lista) {
        expect(itensCom(html, f), `${id}: «${f}» tem de ser um <li>`).toHaveLength(1);
      }
    }
  });

  it("o plano novo (4.º código) tem cartão e o seu botão de escolha", async () => {
    const html = await renderTabela();

    expect(texto(html)).toContain("Nome STARTUP");
    expect(html).toContain("/comecar?plano=STARTUP");
  });

  it("nenhuma funcionalidade do catálogo de demonstração aparece", async () => {
    const html = await renderTabela();
    const { PLANOS_DEMONSTRACAO }: any = await import("@/lib/planos");

    for (const p of PLANOS_DEMONSTRACAO) {
      for (const f of p.funcionalidades as string[]) {
        expect(texto(html), `«${f}» é texto da demonstração, não da API`).not.toContain(f);
      }
    }
  });

  it("o destaque vem do campo `destaque`: um só cartão marcado", async () => {
    const html = await renderTabela();
    const marca = (pt as any).precos.maisPopular as string;

    const ocorrencias = texto(html).split(marca).length - 1;
    expect(ocorrencias).toBe(1);
    // A marca fica no cartão do plano novo: entre o nome dele e o próximo cartão.
    const t = texto(html);
    const inicio = t.indexOf("Nome STARTUP");
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(t.indexOf(marca, inicio) - inicio).toBeLessThan(40);
  });
});
