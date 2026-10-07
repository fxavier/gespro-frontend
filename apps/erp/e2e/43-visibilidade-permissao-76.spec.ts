/**
 * E2E — issue #76 (visibilidade-permissao-76): menu e páginas filtram por
 * permissão de CONSULTA (ORÁCULO, escrito pelo verificador).
 *
 * Só lê — não escreve nada na base; corre contra o tenant `demo` do seed.
 *
 * OPERADOR (`operador@demo.mz`): sem `admin:ver_utilizadores` nem
 * `admin:ver_auditoria` (prisma/seed/rbac.ts, depois da correcção):
 *   - `/core-tenancy/utilizadores` e `/core-tenancy/auditoria` mostram «Sem permissão»
 *     e NÃO mostram a listagem;
 *   - a barra lateral (expandida, grupo «Plataforma & Analytics» aberto) não tem
 *     ligações para nenhuma das duas rotas.
 * ADMIN: as duas páginas abrem com a listagem e sem «Sem permissão».
 *
 * Nota de base: o `pnpm db:seed` é ADITIVO (createMany skipDuplicates) — não retira
 * permissões a papéis de tenants existentes; a correcção tem de as retirar no `demo`.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

const ROTA_UTILIZADORES = '/core-tenancy/utilizadores';
const ROTA_AUDITORIA = '/core-tenancy/auditoria';

function principal(page: Page): Locator {
  return page.locator('#main-content');
}

function navegacao(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Navegação principal' });
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}

test.describe('visibilidade-permissao-76 — OPERADOR', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Utilizadores e Auditoria mostram «Sem permissão» e não estão no menu', async ({ page }) => {
    test.setTimeout(180_000); // login real + compilação fria
    await loginAs(page, USERS.operador);

    for (const [rota, titulo] of [
      [ROTA_UTILIZADORES, 'Utilizadores'],
      [ROTA_AUDITORIA, 'Registo de Auditoria'],
    ] as const) {
      await page.goto(rota);
      await aguardar(page);
      await expect(principal(page).getByText('Sem permissão').first(), rota).toBeVisible({
        timeout: 30_000,
      });
      // A listagem não chega a renderizar: nem o cabeçalho da página nem a tabela.
      await expect(principal(page).getByRole('heading', { name: titulo, exact: true }), rota).toHaveCount(0);
      await expect(principal(page).getByRole('table'), rota).toHaveCount(0);
    }

    // Menu: barra expandida; abre o grupo da plataforma se ainda lá estiver.
    await page.goto('/dashboard');
    await aguardar(page);
    const nav = navegacao(page);
    await expect(nav).toBeVisible({ timeout: 30_000 });
    const grupo = nav.getByRole('button', { name: /Plataforma & Analytics/ });
    if ((await grupo.count()) > 0 && (await grupo.getAttribute('aria-expanded')) !== 'true') {
      await grupo.click();
    }
    for (const rota of [ROTA_UTILIZADORES, ROTA_AUDITORIA]) {
      await expect(nav.locator(`a[href="${rota}"], a[href^="${rota}/"]`), rota).toHaveCount(0);
    }
  });
});

test.describe('visibilidade-permissao-76 — ADMIN', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Utilizadores e Auditoria continuam a abrir', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, USERS.admin);

    for (const [rota, titulo] of [
      [ROTA_UTILIZADORES, 'Utilizadores'],
      [ROTA_AUDITORIA, 'Registo de Auditoria'],
    ] as const) {
      await page.goto(rota);
      await aguardar(page);
      await expect(principal(page).getByRole('heading', { name: titulo, exact: true }), rota).toBeVisible({
        timeout: 30_000,
      });
      await expect(principal(page).getByText('Sem permissão'), rota).toHaveCount(0);
    }
  });
});
