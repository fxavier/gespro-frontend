/**
 * E2E — issue #235: criar as séries do ano seguinte a partir de `/faturacao/series`
 * (escrito pelo verificador do nó D:series-ano-seguinte-235; o implementador não o altera).
 *
 * ADMIN, só pela UI:
 *   1. em `/faturacao/series` há a acção «Criar séries de <ano+1>»;
 *   2. abre um AlertDialog de confirmação (sem dados a recolher); «Voltar» não cria nada;
 *   3. confirmar cria, para o ano seguinte em Maputo, uma série activa por cada tipo que
 *      o ano corrente tem activo no seed, e o utilizador vê a confirmação (com o ano).
 * GESTOR (sem `faturacao:series:escrita`): não vê a acção.
 *
 * Estado da base: o `afterAll` apaga, no tenant `demo`, SÓ as séries do ano seguinte que
 * não existiam antes da corrida e que nunca numeraram (proximoNumero = numeroInicial).
 * Sem isto, o `19-series-documento` deixaria de poder criar a sua PROFORMA do ano seguinte.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { loginAs, USERS } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

const ROTA = '/faturacao/series';
const ANO_CORRENTE = Number(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()),
);
const ANO = ANO_CORRENTE + 1;
const ACCAO = new RegExp(`Criar séries de ${ANO}`, 'i');

// ─── base de dados (prefixo único desta spec: series-ano-seguinte-235) ──────

function psql(sql: string): string {
  const env = (v: string) => execFileSync('docker', ['exec', 'gespro-db', 'printenv', v]).toString().trim();
  return execFileSync('docker', [
    'exec', 'gespro-db', 'psql', '-U', env('POSTGRES_USER'), '-d', env('POSTGRES_DB'), '-Atc', sql,
  ])
    .toString()
    .trim();
}

const DEMO = `(SELECT id FROM "Tenant" WHERE slug = 'demo')`;

function idsAnoSeguinte(): string[] {
  const out = psql(`SELECT id FROM "SerieDocumento" WHERE "tenantId" = ${DEMO} AND ano = ${ANO} ORDER BY id;`);
  return out ? out.split('\n') : [];
}

function tiposActivos(ano: number): string[] {
  const out = psql(
    `SELECT DISTINCT tipo FROM "SerieDocumento" WHERE "tenantId" = ${DEMO} AND ano = ${ano} AND ativo ORDER BY tipo;`,
  );
  return out ? out.split('\n') : [];
}

let existentesAntes: string[] = [];

test.beforeAll(() => {
  existentesAntes = idsAnoSeguinte();
});

test.afterAll(() => {
  const preservar = existentesAntes.length ? existentesAntes.map((id) => `'${id}'`).join(',') : `''`;
  psql(
    `DELETE FROM "SerieDocumento" WHERE "tenantId" = ${DEMO} AND ano = ${ANO} ` +
      `AND id NOT IN (${preservar}) AND "proximoNumero" = "numeroInicial";`,
  );
});

// ─── utilitários ────────────────────────────────────────────────────────────

function principal(page: Page): Locator {
  return page.locator('#main-content');
}

async function abrir(page: Page): Promise<void> {
  await page.goto(ROTA);
  await expect(page.getByRole('heading', { name: 'Séries de documento', level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

// ─── ADMIN ──────────────────────────────────────────────────────────────────

test.describe('Criar séries do ano seguinte — ADMIN', () => {
  test('«Voltar» no diálogo não cria nada', async ({ page }) => {
    await abrir(page);
    await principal(page).getByRole('button', { name: ACCAO }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText(String(ANO));
    await dialogo.getByRole('button', { name: 'Voltar' }).click();
    await expect(dialogo).toBeHidden();
    expect(idsAnoSeguinte()).toEqual(existentesAntes);
  });

  test('confirmar cria uma série activa por tipo para o ano seguinte', async ({ page }) => {
    const tiposCorrente = tiposActivos(ANO_CORRENTE);
    expect(tiposCorrente.length, 'o seed tem séries activas no ano corrente').toBeGreaterThan(0);

    await abrir(page);
    await principal(page).getByRole('button', { name: ACCAO }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /^Criar/ }).click();

    await expect(page.getByText(new RegExp(`séries? de ${ANO}`, 'i')).first()).toBeVisible({ timeout: 20_000 });
    await expect(dialogo).toBeHidden({ timeout: 20_000 });

    // Todo o tipo activo no ano corrente tem agora série activa no seguinte.
    await expect.poll(() => tiposActivos(ANO), { timeout: 20_000 }).toEqual(expect.arrayContaining(tiposCorrente));

    // E a lista do ano seguinte deixa de avisar tipos sem série activa.
    await page.goto(`${ROTA}?ano=${ANO}`);
    await expect(page.getByRole('heading', { name: 'Séries de documento', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(principal(page).getByTestId('tipos-sem-serie-activa')).toHaveCount(0);
  });
});

// ─── GESTOR ─────────────────────────────────────────────────────────────────

test.describe('Criar séries do ano seguinte — GESTOR (só leitura)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('não vê a acção', async ({ page }) => {
    test.setTimeout(120_000); // login real + compilação fria
    await loginAs(page, USERS.gestor);
    await abrir(page);
    await expect(principal(page).getByRole('cell', { name: 'Factura', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: ACCAO })).toHaveCount(0);
  });
});
