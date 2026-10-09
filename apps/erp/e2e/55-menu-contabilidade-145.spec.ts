/**
 * E2E — issue #145 (menu-contabilidade-145): DRE, Centros de Custo e Contas
 * Bancárias têm entrada no grupo «Finanças & Contabilidade» da barra lateral
 * (ORÁCULO, escrito pelo verificador).
 *
 * Só lê — não escreve nada na base; corre contra o tenant `demo` do seed, como ADMIN
 * (storageState do projecto `e2e`).
 *
 * Para cada uma das três rotas: com a barra expandida e o grupo aberto, há uma
 * ligação com esse href; clicá-la leva à rota e a página mostra o seu cabeçalho,
 * sem «Sem permissão» nem 404.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const ENTRADAS = [
  { href: '/contabilidade/dre', cabecalho: 'Demonstração do Resultado do Exercício' },
  { href: '/contabilidade/centros-custo', cabecalho: 'Centros de Custo' },
  { href: '/contabilidade/contas-bancarias', cabecalho: 'Contas Bancárias' },
] as const;

function navegacao(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Navegação principal' });
}

function principal(page: Page): Locator {
  return page.locator('#main-content');
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}

/** Barra expandida e grupo «Finanças & Contabilidade» aberto. */
async function abrirGrupoContabilidade(page: Page): Promise<Locator> {
  const nav = navegacao(page);
  await expect(nav).toBeVisible({ timeout: 30_000 });
  const grupo = nav.getByRole('button', { name: /Finanças & Contabilidade/ });
  if ((await grupo.count()) === 0) {
    // Barra recolhida (carril): expande-a pelo botão de alternar.
    await page.getByRole('button', { name: 'Expandir barra lateral' }).click();
  }
  await expect(grupo).toBeVisible({ timeout: 15_000 });
  if ((await grupo.getAttribute('aria-expanded')) !== 'true') await grupo.click();
  await expect(grupo).toHaveAttribute('aria-expanded', 'true');
  return nav;
}

test.describe('menu-contabilidade-145 — ADMIN', () => {
  for (const { href, cabecalho } of ENTRADAS) {
    test(`a barra lateral tem ${href} e a ligação abre a página`, async ({ page }) => {
      test.setTimeout(120_000); // compilação fria em `pnpm dev`

      await page.goto('/contabilidade');
      await aguardar(page);
      const nav = await abrirGrupoContabilidade(page);

      const ligacao = nav.locator(`a[href="${href}"]`);
      await expect(ligacao, href).toHaveCount(1);
      await expect(ligacao).toBeVisible();

      await ligacao.click();
      await page.waitForURL((url) => url.pathname === href, { timeout: 60_000 });
      await aguardar(page);

      await expect(
        principal(page).getByRole('heading', { name: cabecalho, exact: true }),
        href,
      ).toBeVisible({ timeout: 30_000 });
      await expect(principal(page).getByText('Sem permissão'), href).toHaveCount(0);
      await expect(page.getByText('This page could not be found'), href).toHaveCount(0);
    });
  }
});
