import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E — GestPro
 *
 * Corre contra a app local (pnpm dev ou pnpm build && pnpm start).
 * DB semeada deterministicamente via `pnpm db:seed`.
 *
 * Utilizadores de teste (criados pelo seed):
 *   admin@demo.mz       / demo1234  (ADMIN)
 *   gestor@demo.mz      / demo1234  (GESTOR)
 *   financeiro@demo.mz  / demo1234  (FINANCEIRO)
 *   operador@demo.mz    / demo1234  (OPERADOR)
 *   leitura@demo.mz     / demo1234  (LEITURA)
 */

export default defineConfig({
  testDir: './e2e',
  /* Timeout por teste — suficiente para SSR + hydration */
  timeout: 30_000,
  /* Timeout de asserção */
  expect: { timeout: 10_000 },
  /* Correr testes em sequência (app local shared) */
  fullyParallel: false,
  workers: 1,
  /* Não retentar em CI — falha deterministicamente */
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    /* Screenshot em falha */
    screenshot: 'only-on-failure',
    /* Video em CI */
    video: process.env.CI ? 'retain-on-failure' : 'off',
    /* Trace em falha */
    trace: 'on-first-retry',
    /* Locale PT-PT para datas e formatos */
    locale: 'pt-PT',
    timezoneId: 'Africa/Maputo',
    /* Ignora erros de HTTPS self-signed */
    ignoreHTTPSErrors: true,
  },
  projects: [
    /* Setup global: autenticação — cria ficheiro de estado de sessão */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    /* Testes E2E principais */
    {
      name: 'e2e',
      use: {
        ...devices['Desktop Chrome'],
        /* Reutiliza estado de sessão criado no setup */
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    /* Testes de A11y — mesmo browser, dependem do setup */
    {
      name: 'a11y',
      testMatch: /.*\.a11y\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  /* Iniciar o servidor de desenvolvimento automaticamente se não estiver a correr */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
