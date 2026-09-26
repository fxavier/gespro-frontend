/**
 * E2E — Séries de documento (issue #149, ticket 8.1; escrito pelo verificador).
 *
 * ADMIN, só pela UI:
 *   1. a lista `/faturacao/series` mostra os 6 tipos geríveis do ano corrente;
 *   2. cria uma PROFORMA do ANO SEGUINTE com prefixo único e número inicial 500
 *      (pré-visualização `…/000500`, linha na lista);
 *   3. uma 2.ª PROFORMA activa do mesmo ano é recusada («Já existe uma série activa…»)
 *      e o utilizador fica no formulário;
 *   4. edita o prefixo; desactiva; reactiva; elimina (a linha desaparece).
 * GESTOR (sem `faturacao:series:escrita`): vê a lista sem «Nova série» nem acções, e
 * `/faturacao/series/nova` responde «Sem permissão».
 *
 * Estado da base: tudo o que o teste cria é eliminado pela UI no passo 4. O `afterAll`
 * é a rede — apaga por SQL, no tenant `demo`, SÓ as séries com o prefixo desta corrida
 * (nunca numeradas: foram criadas agora e ninguém emite PROFORMAs do ano seguinte).
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { loginAs, USERS } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

const ROTA = '/faturacao/series';
const TIPOS = ['Factura', 'Nota de Crédito', 'Nota de Débito', 'Factura Pró-forma', 'Cotação', 'Recibo'];
const PROFORMA = 'Factura Pró-forma';

/** Ano civil corrente em Africa/Maputo (o mesmo relógio do servidor, S5). */
const ANO_CORRENTE = Number(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()),
);
const ANO = ANO_CORRENTE + 1;

/** Prefixo único por corrida: `E2E` + 4 caracteres [A-Z0-9] (7 ≤ 10). */
const PREFIXO = `E2E${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`;
const PREFIXO_RECUSADO = `${PREFIXO}B`;
const PREFIXO_EDITADO = `${PREFIXO}X`;

// ─── base de dados (só leitura/limpeza por prefixo desta corrida) ───────────

function psql(sql: string): string {
  const env = (v: string) => execFileSync('docker', ['exec', 'gespro-db', 'printenv', v]).toString().trim();
  return execFileSync('docker', [
    'exec', 'gespro-db', 'psql', '-U', env('POSTGRES_USER'), '-d', env('POSTGRES_DB'), '-Atc', sql,
  ])
    .toString()
    .trim();
}

const FILTRO_CORRIDA = `"prefixo" LIKE '${PREFIXO}%' AND "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'demo')`;

function seriesDaCorrida(): number {
  return Number(psql(`SELECT count(*) FROM "SerieDocumento" WHERE ${FILTRO_CORRIDA};`));
}

test.afterAll(() => {
  // Rede: se o teste falhou a meio, nenhuma série desta corrida fica no `demo`.
  psql(`DELETE FROM "SerieDocumento" WHERE ${FILTRO_CORRIDA};`);
});

// ─── utilitários ────────────────────────────────────────────────────────────

function principal(page: Page): Locator {
  return page.locator('#main-content');
}

async function abrir(page: Page, caminho: string, titulo: string | RegExp): Promise<void> {
  await page.goto(caminho);
  await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

/** Linha da tabela cuja célula de prefixo é exactamente `prefixo`. */
function linha(page: Page, prefixo: string): Locator {
  return principal(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: prefixo, exact: true }) });
}

const rotulo = (prefixo: string) => `${prefixo}/${ANO} (${PROFORMA})`;

async function escolher(page: Page, campo: string, opcao: string): Promise<void> {
  await principal(page).getByRole('combobox', { name: campo }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}

async function preencherNova(page: Page, prefixo: string, numeroInicial: string): Promise<void> {
  await escolher(page, 'Tipo de documento', PROFORMA);
  await escolher(page, 'Ano', String(ANO));
  await principal(page).getByLabel('Prefixo').fill(prefixo);
  await principal(page).getByLabel('Número inicial').fill(numeroInicial);
  await principal(page).getByLabel('Número inicial').blur();
}

async function confirmarAccao(page: Page, botao: string, prefixo: string, feito: string): Promise<void> {
  await principal(page).getByRole('button', { name: `${botao} a série ${rotulo(prefixo)}` }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: botao, exact: true }).click();
  await expect(page.getByText(`Série ${rotulo(prefixo)} ${feito}.`)).toBeVisible({ timeout: 20_000 });
  await expect(dialogo).toBeHidden();
}

// ─── ADMIN ──────────────────────────────────────────────────────────────────

test.describe('Séries de documento — ADMIN', () => {
  test.beforeEach(({ page }) => {
    // O formulário tem UnsavedChangesGuard: sair com alterações pede confirmação.
    page.on('dialog', (d) => void d.accept());
  });

  test('a lista mostra os 6 tipos geríveis do ano corrente', async ({ page }) => {
    await abrir(page, ROTA, 'Séries de documento');
    await expect(principal(page).getByRole('link', { name: 'Nova série' })).toBeVisible();
    for (const tipo of TIPOS) {
      const linhasDoTipo = principal(page)
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: tipo, exact: true }) })
        .filter({ has: page.getByRole('cell', { name: String(ANO_CORRENTE), exact: true }) });
      await expect(linhasDoTipo.first(), `linha de ${tipo} em ${ANO_CORRENTE}`).toBeVisible();
    }
    // Nenhum tipo do ano corrente sem série activa no seed.
    await expect(principal(page).getByTestId('tipos-sem-serie-activa')).toHaveCount(0);
  });

  test('criar PROFORMA do ano seguinte com número inicial 500', async ({ page }) => {
    await abrir(page, `${ROTA}/nova`, 'Nova série');
    await preencherNova(page, PREFIXO, '500');
    await expect(principal(page).getByTestId('serie-previsualizacao')).toHaveText(`${PREFIXO}/${ANO}/000500`);

    await principal(page).getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(new RegExp(`${ROTA}\\?ano=${ANO}$`), { timeout: 30_000 });

    const l = linha(page, PREFIXO);
    await expect(l).toHaveCount(1, { timeout: 20_000 });
    await expect(l).toContainText(PROFORMA);
    await expect(l).toContainText(`${PREFIXO}/${ANO}/000500`);
    await expect(l).toContainText('Activa');
    expect(seriesDaCorrida()).toBe(1);
  });

  test('2.ª PROFORMA activa do mesmo ano é recusada e fica no formulário', async ({ page }) => {
    await abrir(page, `${ROTA}/nova`, 'Nova série');
    await preencherNova(page, PREFIXO_RECUSADO, '500');
    await principal(page).getByRole('button', { name: 'Guardar' }).click();

    await expect(principal(page).getByTestId('serie-erro-servidor')).toContainText(
      `Já existe uma série activa de ${PROFORMA} para ${ANO}`,
      { timeout: 20_000 },
    );
    expect(new URL(page.url()).pathname).toBe(`${ROTA}/nova`);
    await expect(principal(page).getByLabel('Prefixo')).toHaveValue(PREFIXO_RECUSADO);
    expect(seriesDaCorrida()).toBe(1);
  });

  test('editar o prefixo, desactivar, reactivar e eliminar', async ({ page }) => {
    await abrir(page, `${ROTA}?ano=${ANO}`, 'Séries de documento');
    await principal(page).getByTestId(`accoes-serie-${PREFIXO}-${ANO}`).getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: `Série ${PREFIXO}/${ANO}`, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const campo = principal(page).getByLabel('Prefixo');
    await expect(campo).toHaveValue(PREFIXO);
    await campo.fill(PREFIXO_EDITADO);
    await expect(principal(page).getByTestId('serie-previsualizacao')).toHaveText(`${PREFIXO_EDITADO}/${ANO}/000500`);
    await principal(page).getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(new RegExp(`${ROTA}\\?ano=${ANO}$`), { timeout: 30_000 });

    await expect(linha(page, PREFIXO_EDITADO)).toHaveCount(1, { timeout: 20_000 });
    await expect(linha(page, PREFIXO)).toHaveCount(0);
    await expect(linha(page, PREFIXO_EDITADO)).toContainText(`${PREFIXO_EDITADO}/${ANO}/000500`);
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    await confirmarAccao(page, 'Desactivar', PREFIXO_EDITADO, 'desactivada');
    await expect(linha(page, PREFIXO_EDITADO)).toContainText('Inactiva', { timeout: 20_000 });

    await confirmarAccao(page, 'Activar', PREFIXO_EDITADO, 'activada');
    await expect(linha(page, PREFIXO_EDITADO)).toContainText('Activa', { timeout: 20_000 });
    await expect(linha(page, PREFIXO_EDITADO)).not.toContainText('Inactiva');

    await confirmarAccao(page, 'Eliminar', PREFIXO_EDITADO, 'eliminada');
    await expect(linha(page, PREFIXO_EDITADO)).toHaveCount(0, { timeout: 20_000 });

    // Reposto pela UI: nenhuma série desta corrida ficou no tenant.
    expect(seriesDaCorrida()).toBe(0);
  });
});

// ─── GESTOR ─────────────────────────────────────────────────────────────────

test.describe('Séries de documento — GESTOR (só leitura)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('vê a lista sem «Nova série» nem acções; /nova diz «Sem permissão»', async ({ page }) => {
    test.setTimeout(120_000); // login real + compilação fria
    await loginAs(page, USERS.gestor);

    await abrir(page, ROTA, 'Séries de documento');
    await expect(principal(page).getByRole('cell', { name: 'Factura', exact: true }).first()).toBeVisible();
    await expect(principal(page).getByRole('link', { name: 'Nova série' })).toHaveCount(0);
    await expect(principal(page).getByRole('columnheader', { name: 'Acções' })).toHaveCount(0);
    await expect(principal(page).locator('[data-testid^="accoes-serie-"]')).toHaveCount(0);
    for (const botao of ['Editar', 'Desactivar', 'Activar', 'Eliminar']) {
      await expect(principal(page).getByRole('button', { name: new RegExp(`^${botao} `) })).toHaveCount(0);
      await expect(principal(page).getByRole('link', { name: botao, exact: true })).toHaveCount(0);
    }

    await abrir(page, `${ROTA}/nova`, 'Nova série');
    await expect(principal(page).getByTestId('series-sem-permissao')).toContainText('Sem permissão');
    await expect(principal(page).getByLabel('Prefixo')).toHaveCount(0);
  });
});
