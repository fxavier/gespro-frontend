/**
 * E2E: primeiro acesso com palavra-passe atribuída (ADR-0030).
 *
 * Cobre o ciclo inteiro contra um Keycloak REAL: o administrador cria com
 * palavra-passe, a pessoa entra com a provisória, é obrigada a mudá-la, e a
 * provisória deixa de servir. É o caminho que o ADR-0029 §5 deixava trancado
 * — acertar a palavra-passe e receber «conta por activar», sem saída.
 *
 * CUSTO: cada execução deixa dois utilizadores no tenant demo (um por modo de
 * acesso). Não há apagamento de utilizadores no produto — desactivar é o que
 * existe —, e apagar só a identidade no Keycloak deixaria a linha local órfã.
 * Os endereços levam o prefixo `e2e.` para serem reconhecíveis.
 */

import { test, expect } from '@playwright/test';

/** O alerta do formulário — o Next tem um `role=alert` próprio para anunciar rotas. */
const alerta = 'form [role=alert]';

async function criarUtilizador(
  page: import('@playwright/test').Page,
  opcoes: { nome: string; email: string; comPalavraPasse: boolean },
) {
  await page.goto('/core-tenancy/utilizadores/novo');
  await expect(page.getByRole('heading', { name: 'Novo Utilizador' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Nome Completo').fill(opcoes.nome);
  await page.getByLabel('Email Corporativo').fill(opcoes.email);
  if (opcoes.comPalavraPasse) await page.getByText('Definir palavra-passe agora').click();
  await page.locator('button[role="checkbox"]').last().click(); // um papel qualquer
  await page.getByRole('button', { name: /Criar Utilizador/ }).click();
}

test('palavra-passe atribuída: entra, é obrigado a mudar, e a provisória morre', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `e2e.primeiro-acesso.${Date.now()}@demo.mz`;
  const nova = 'UmaNovaSegura-2026';

  await criarUtilizador(page, { nome: 'E2E Primeiro Acesso', email, comPalavraPasse: true });

  await expect(page.getByRole('heading', { name: 'Utilizador criado' })).toBeVisible({
    timeout: 30_000,
  });
  const provisoria = (await page.locator('dd.font-mono.text-lg').innerText()).trim();
  expect(provisoria).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);

  // Entrar com a provisória leva ao ecrã de mudança, não a um beco sem saída.
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.locator('#identificador').fill(email);
  await page.locator('#palavraPasse').fill(provisoria);
  await page.locator('button[type=submit]').click();

  await page.waitForURL(/\/auth\/mudar-palavra-passe/, { timeout: 60_000 });
  await expect(page.locator('#identificador')).toHaveValue(email);

  // A palavra-passe actual é revalidada no Keycloak — enganá-la não passa.
  await page.locator('#actual').fill('errada-de-proposito');
  await page.locator('#nova').fill(nova);
  await page.locator('#confirmacao').fill(nova);
  await page.locator('button[type=submit]').click();
  await expect(page.locator(alerta)).toContainText(/incorrecta/i, { timeout: 30_000 });

  // Com a certa: muda, e entra sem ter de a escrever outra vez.
  await page.locator('#actual').fill(provisoria);
  await page.locator('#nova').fill(nova);
  await page.locator('#confirmacao').fill(nova);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

  // A provisória deixou de servir.
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.locator('#identificador').fill(email);
  await page.locator('#palavraPasse').fill(provisoria);
  await page.locator('button[type=submit]').click();
  await expect(page.locator(alerta)).toContainText(/incorrect/i, { timeout: 30_000 });
});

test('convite por e-mail continua a ser o caminho por omissão', async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e.convite.${Date.now()}@demo.mz`;

  await criarUtilizador(page, { nome: 'E2E Convite', email, comPalavraPasse: false });

  // Sem palavra-passe para mostrar: volta directamente à listagem.
  await page.waitForURL(/\/core-tenancy\/utilizadores$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Utilizador criado' })).toHaveCount(0);

  // Repor gera uma provisória e volta a exigir a mudança — o mesmo caminho.
  await page.getByRole('row', { name: new RegExp(email) }).click();
  await page.waitForURL(/\/core-tenancy\/utilizadores\/[a-z0-9]+$/, { timeout: 60_000 });
  await page.getByRole('button', { name: /Repor palavra-passe/ }).click();
  await page.getByRole('button', { name: /^Repor palavra-passe$/ }).last().click();
  await expect(page.getByRole('heading', { name: 'Palavra-passe reposta' })).toBeVisible({
    timeout: 30_000,
  });
  const provisoria = (await page.locator('p.font-mono.text-lg').innerText()).trim();

  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.locator('#identificador').fill(email);
  await page.locator('#palavraPasse').fill(provisoria);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/auth\/mudar-palavra-passe/, { timeout: 60_000 });
});
