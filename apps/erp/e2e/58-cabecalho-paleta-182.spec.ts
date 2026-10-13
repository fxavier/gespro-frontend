/**
 * E2E — issue #182 (cabecalho-paleta-182): o cabeçalho global funciona em todas as páginas
 * (ORÁCULO, escrito pelo verificador).
 *
 * Só lê — não escreve nada na base; corre contra o tenant `demo` do seed, como ADMIN
 * (storageState do projecto `e2e`). Viewport de secretária (a caixa de pesquisa é `hidden md:flex`).
 *
 * 1. Clicar na caixa de pesquisa do cabeçalho («Abrir paleta de comandos») abre a paleta — em
 *    `/dashboard` e numa página do grupo `(dashboard)`.
 * 2. O sino de notificações (ligação para /notificacoes) está no cabeçalho de `/dashboard`.
 * 3. «Configurações» no menu do utilizador: ou não existe, ou leva a uma página real — nunca a
 *    `/configuracoes` (404) nem a uma rota que só redirecciona para `/dashboard`.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const PAGINAS = ['/dashboard', '/contabilidade'] as const;

function cabecalho(page: Page): Locator {
  return page.locator('header').filter({ has: page.getByRole('button', { name: 'Menu do utilizador' }) });
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}

test.describe('cabecalho-paleta-182 — ADMIN', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const rota of PAGINAS) {
    test(`cabecalho-paleta-182: em ${rota} a pesquisa do cabeçalho abre a paleta`, async ({ page }) => {
      test.setTimeout(120_000); // compilação fria em `pnpm dev`
      await page.goto(rota);
      await aguardar(page);

      const pesquisa = cabecalho(page).getByRole('button', { name: 'Abrir paleta de comandos' });
      await expect(pesquisa).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await pesquisa.click();

      const paleta = page.getByRole('dialog');
      await expect(paleta).toBeVisible({ timeout: 10_000 });
      const campo = paleta.getByPlaceholder('Pesquisar páginas, módulos...');
      await expect(campo).toBeVisible();
      await expect(campo).toBeFocused();

      // A paleta é a de navegação: filtra e mostra entradas.
      await campo.fill('Colaboradores');
      await expect(paleta.getByRole('option', { name: /Colaboradores/ }).first()).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  test('cabecalho-paleta-182: /dashboard mostra o sino de notificações no cabeçalho', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/dashboard');
    await aguardar(page);

    const sino = cabecalho(page).locator('a[href="/notificacoes"]');
    await expect(sino).toHaveCount(1, { timeout: 30_000 });
    await expect(sino).toBeVisible();
    await expect(sino).toHaveAccessibleName(/Notificações|notificações por ler/);

    // Mesmo sino que nas páginas do grupo (dashboard).
    await page.goto('/contabilidade');
    await aguardar(page);
    await expect(cabecalho(page).locator('a[href="/notificacoes"]')).toHaveCount(1, { timeout: 30_000 });
  });

  test('cabecalho-paleta-182: «Configurações» no menu do utilizador não leva a uma rota inexistente', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/dashboard');
    await aguardar(page);

    await cabecalho(page).getByRole('button', { name: 'Menu do utilizador' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: 10_000 });
    await expect(menu.getByRole('menuitem', { name: 'Terminar sessão' })).toBeVisible();

    const item = menu.getByRole('menuitem', { name: 'Configurações', exact: true });
    if ((await item.count()) === 0) return; // retirado do menu — cumpre o contrato.

    const href = await item.getAttribute('href');
    expect(href, 'o item «Configurações» é uma ligação').not.toBeNull();
    expect(new URL(href!, 'http://x').pathname.replace(/\/$/, '')).not.toBe('/configuracoes');

    await item.click();
    await page.waitForURL((url) => url.pathname !== '/dashboard', { timeout: 60_000 });
    await aguardar(page);

    const destino = new URL(page.url()).pathname.replace(/\/$/, '');
    expect(destino).not.toBe('/configuracoes');
    expect(destino, 'não pode ser uma rota que só redirecciona para o dashboard').not.toBe('/dashboard');
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
    await expect(page.locator('#main-content').getByText('Sem permissão')).toHaveCount(0);
    await expect(page.locator('#main-content').getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
  });
});
