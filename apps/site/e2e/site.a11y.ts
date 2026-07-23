import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Acessibilidade do site (Requisito 8.3 / tarefa 9.2).
 *
 * Mesma regra do ERP: violações axe com impacto `critical` ou `serious` são
 * BLOCKER; `moderate`/`minor` são reportadas sem falhar. Cada rota é medida nos
 * dois temas — o contraste é o modo de falha mais frequente e o tema escuro é
 * o que ninguém verifica à mão.
 */

const ROTAS = [
  { caminho: "/", nome: "Home" },
  { caminho: "/funcionalidades", nome: "Funcionalidades" },
  { caminho: "/funcionalidades/financas", nome: "Módulo Finanças" },
  { caminho: "/precos", nome: "Preços" },
  { caminho: "/comecar", nome: "Começar" },
  { caminho: "/sobre", nome: "Sobre" },
  { caminho: "/contacto", nome: "Contacto" },
  { caminho: "/recursos", nome: "Recursos" },
  { caminho: "/termos", nome: "Termos" },
  { caminho: "/privacidade", nome: "Privacidade" },
  { caminho: "/rota-que-nao-existe", nome: "404" },
];

/**
 * Percorre a página até ao fim para montar tudo o que só entra em cena com o
 * scroll, e volta ao topo. O projecto corre com movimento reduzido, pelo que
 * os blocos aparecem já opacos (ver playwright.config.ts).
 */
async function revelarTudo(pagina: Page) {
  await pagina.evaluate(async () => {
    const passo = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += passo) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });

}

async function verificarA11y(pagina: Page, contexto: string) {
  await revelarTudo(pagina);

  const resultado = await new AxeBuilder({ page: pagina })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  const bloqueadoras = resultado.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  if (bloqueadoras.length > 0) {
    const detalhe = bloqueadoras
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.help}\n  → nós: ${v.nodes
            .map((n) => n.target.join(" "))
            .join(" | ")}`
      )
      .join("\n\n");
    throw new Error(
      `A11y BLOCKER em "${contexto}": ${bloqueadoras.length} violação(ões)\n\n${detalhe}`
    );
  }

  const avisos = resultado.violations.filter(
    (v) => v.impact === "moderate" || v.impact === "minor"
  );
  if (avisos.length > 0) {
    console.warn(
      `A11y aviso em "${contexto}": ${avisos.length} moderate/minor — ${avisos
        .map((v) => v.id)
        .join(", ")}`
    );
  }
}

for (const rota of ROTAS) {
  test(`sem violações AA em ${rota.nome} (tema claro)`, async ({ page }) => {
    await page.goto(rota.caminho);
    await expect(page.locator("main").first()).toBeVisible();
    await verificarA11y(page, `${rota.nome} claro`);
  });

  test(`sem violações AA em ${rota.nome} (tema escuro)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(rota.caminho);
    await expect(page.locator("main").first()).toBeVisible();
    // Confirma que o tema escuro foi mesmo aplicado antes de medir contraste.
    await expect(page.locator("html")).toHaveClass(/dark/);
    await verificarA11y(page, `${rota.nome} escuro`);
  });
}

test("o salto para o conteúdo é o primeiro alvo de teclado", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focado = page.locator(":focus");
  await expect(focado).toHaveAttribute("href", "#conteudo");
});

test("o menu móvel anuncia o seu estado de expansão", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const botao = page.getByRole("button", { name: /menu de navegação/i });
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(botao).toHaveAttribute("aria-expanded", "false");
});

test("o formulário de contacto liga rótulos e erros aos campos", async ({
  page,
}) => {
  await page.goto("/contacto");
  const email = page.getByLabel("E-mail", { exact: true });
  await expect(email).toBeVisible();
  await email.fill("nao-e-email");
  await page.getByRole("button", { name: /enviar mensagem/i }).click();
  // O erro chega do servidor; o campo tem de passar a aria-invalid.
  await expect(email).toHaveAttribute("aria-invalid", "true", {
    timeout: 15_000,
  });
});
