import { test, expect } from "@playwright/test";

/**
 * Movimento reduzido (Requisito 3.2 / tarefa 9.4).
 *
 * O projecto `movimento-reduzido` do playwright.config.ts corre com
 * `prefers-reduced-motion: reduce` emulado. O que se verifica não é "nada se
 * mexe" — é o que realmente importa: **nenhum conteúdo fica escondido por trás
 * de uma animação que não corre**.
 */

const ROTAS = ["/", "/funcionalidades", "/precos", "/sobre", "/recursos"];

for (const rota of ROTAS) {
  test(`conteúdo visível com movimento reduzido em ${rota}`, async ({
    page,
  }) => {
    await page.goto(rota);

    const cabecalho = page.getByRole("heading", { level: 1 }).first();
    await expect(cabecalho).toBeVisible();

    // Todas as secções abaixo da dobra têm de estar opacas — é aqui que uma
    // animação de entrada mal configurada deixaria o conteúdo a zero.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const invisiveis = await page.evaluate(() => {
      const alvos = Array.from(
        document.querySelectorAll("main section, main h2, main li")
      );
      return alvos.filter((elemento) => {
        const estilo = window.getComputedStyle(elemento);
        return (
          estilo.display !== "none" &&
          estilo.visibility !== "hidden" &&
          Number(estilo.opacity) < 0.99
        );
      }).length;
    });

    expect(invisiveis).toBe(0);
  });
}

test("o scroll suave é desligado com movimento reduzido", async ({ page }) => {
  await page.goto("/");
  const comportamento = await page.evaluate(
    () => window.getComputedStyle(document.documentElement).scrollBehavior
  );
  expect(comportamento).toBe("auto");
});

test("a Home continua navegável por teclado sem animações", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); // salto para o conteúdo
  await page.keyboard.press("Tab"); // logótipo
  await page.keyboard.press("Tab"); // primeira ligação de navegação
  await expect(page.locator(":focus")).toBeVisible();
});
