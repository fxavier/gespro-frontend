import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright do SITE — acessibilidade e movimento reduzido.
 *
 * Configuração própria (e não a de `apps/erp`) porque o site não tem sessão:
 * não há projecto `setup` nem `storageState`, e o `baseURL` é a porta do site.
 * `pnpm e2e:a11y` na raiz corre `turbo run e2e:a11y`, que dispara ambos.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.SITE_BASE_URL ?? "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    locale: "pt-PT",
    timezoneId: "Africa/Maputo",
  },
  projects: [
    {
      name: "a11y-site",
      testMatch: /.*\.a11y\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // Movimento reduzido também aqui, deliberadamente: as animações de
        // entrada passam por `opacity: 0` e o axe media o contraste contra
        // esse estado transitório, produzindo dezenas de falsos positivos que
        // escondem as violações reais. Com movimento reduzido mede-se o estado
        // final — o que o utilizador lê. O contrato do movimento reduzido em si
        // é verificado pelo projecto `movimento-reduzido`.
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      // Emula `prefers-reduced-motion: reduce` (Requisito 3.2 / tarefa 9.4).
      name: "movimento-reduzido",
      testMatch: /.*\.movimento\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],
  webServer: {
    // `next start` e não `next dev`: o alvo da medição é o que vai para
    // produção (páginas estáticas, bundle minificado).
    command: "pnpm build && pnpm start",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
