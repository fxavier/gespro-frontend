/**
 * Oráculo E2E — issue #165: [produção] sem activar BOM/roteiro nem criar centros de trabalho.
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais de recolha, sem permissões novas,
 * sem endpoints novos — as acções chamam `transitarStatusBOMAction`, `transitarStatusRoteiroAction`,
 * `criarCentroTrabalhoAction` e `actualizarCentroTrabalhoAction`):
 *
 *   Detalhe `/producao/estrutura/<id>` (a lista já aponta para lá; hoje é 404) — Server Component que
 *   mostra o código da BOM e:
 *     - em RASCUNHO ou INATIVO: o botão «Activar» (e não «Desactivar»); clicar grava ATIVO;
 *     - em ATIVO: o botão «Desactivar» (e não «Activar»); clicar grava INATIVO;
 *     - em SUBSTITUIDO: nenhum dos dois;
 *   a página continua no detalhe e, depois da acção, mostra o botão do estado novo. Uma confirmação
 *   é opcional; se existir, é um AlertDialog sem campos (nunca um Dialog).
 *
 *   Detalhe `/producao/roteiros/<id>` — o mesmo, com «Activar» também em EM_REVISAO.
 *
 *   `/producao/centros-trabalho` — lista (Server Component) com os centros do tenant e a ligação para
 *   `/producao/centros-trabalho/novo`; cada centro leva (linha ou ligação) a
 *   `/producao/centros-trabalho/<id>` ou `/producao/centros-trabalho/<id>/editar`.
 *   `/producao/centros-trabalho/novo` — formulário em rota (sem Dialog) com Código, Nome, Tipo,
 *   Custo por hora e Capacidade (h/dia); gravar cria o centro no tenant e sai de `/novo`.
 *   `/producao/centros-trabalho/<id>/editar` — o mesmo formulário preenchido com o centro, mais o
 *   interruptor/caixa «Activo»; gravar altera o centro (nome e desactivação) e sai de `/editar`.
 *
 * As regras de servidor (transições fora do mapa, código duplicado, capacidade ≤ 24 h, permissões,
 * isolamento, modo de leitura) são provadas em `test/integration/producao-bom-roteiro-165.test.ts`.
 *
 * Dados (prefixo único `producao-bom-roteiro-165`), no tenant `demo`, por SQL: duas BOM (RASCUNHO e
 * SUBSTITUIDO) de um produto existente do demo, dois roteiros (RASCUNHO e EM_REVISAO) e um centro de
 * trabalho. Ficam no demo, como os dados do `47-…` a `51-…`.
 *
 * ESTADO ESPERADO antes da implementação: RED — os detalhes de BOM e roteiro e as rotas
 * `/producao/centros-trabalho/**` não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/52-producao-bom-roteiro-165.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:producao-bom-roteiro-165; um agente de implementação que o altere
 * é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'producao-bom-roteiro-165';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_BOM_RASC = `cbomrasc165${SUF}`;
const ID_BOM_SUBS = `cbomsubs165${SUF}`;
const ID_ROT_RASC = `crotrasc165${SUF}`;
const ID_ROT_REV = `crotrevi165${SUF}`;
const ID_CENTRO = `ccentro165${SUF}`;

const COD = {
  bomRasc: `BOMR165${SUF}`.toUpperCase(),
  bomSubs: `BOMS165${SUF}`.toUpperCase(),
  rotRasc: `ROTR165${SUF}`.toUpperCase(),
  rotRev: `ROTV165${SUF}`.toUpperCase(),
  centro: `CTA165${SUF}`.toUpperCase(),
  centroNovo: `CTN165${SUF}`.toUpperCase(),
};
const NOME_CENTRO_NOVO = `Serra de fita ${MARCA} ${SUF}`;
const NOME_CENTRO_EDITADO = `Prensa revista ${MARCA} ${SUF}`;

const ACTIVAR = /^\s*a(c)?tivar\b/i;
const DESACTIVAR = /^\s*desa(c)?tivar\b/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function dbUrl(): string {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // já carregado ou inexistente
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function statusDe(tabela: 'EstruturaProduto' | 'Roteiro', id: string): Promise<string> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string }>(`SELECT status::text AS status FROM "${tabela}" WHERE id = $1`, [id]);
    return r.rows[0]?.status;
  });
}

type Centro = { id: string; tenantId: string; codigo: string; nome: string; tipo: string; custoHora: string; capacidade: string | null; ativo: boolean };

async function centroPorCodigo(codigo: string): Promise<Centro | undefined> {
  return withPg(async (c) => {
    const r = await c.query<Centro>(
      `SELECT id, "tenantId", codigo, nome, tipo::text AS tipo, "custoHora"::text AS "custoHora",
              "capacidadeHorasDia"::text AS capacidade, ativo
         FROM "CentroTrabalho" WHERE "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'demo') AND codigo = $1`,
      [codigo],
    );
    return r.rows[0];
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** Clica no botão; se aparecer uma confirmação, tem de ser AlertDialog sem campos — confirma-a. */
async function accionar(page: Page, nome: RegExp): Promise<void> {
  await page.getByRole('button', { name: nome }).click();
  const confirmar = page.getByRole('alertdialog');
  const houveConfirmacao = await confirmar
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  await expect(page.getByRole('dialog'), 'recolha/confirmação em Dialog (proibido)').toHaveCount(0);
  if (houveConfirmacao) {
    await expect(confirmar.getByRole('textbox')).toHaveCount(0);
    await confirmar.getByRole('button', { name: new RegExp(`${nome.source}|^\\s*confirmar`, 'i') }).click();
    await expect(confirmar).toHaveCount(0, { timeout: 15_000 });
  }
}

/** Escolhe o tipo, quer o campo seja um Select Radix quer um <select> nativo. */
async function escolherTipo(page: Page, rotulo: RegExp, valor: string): Promise<void> {
  const campo = page.getByRole('combobox', { name: /tipo/i }).first();
  const tag = await campo.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    await campo.selectOption(valor);
    return;
  }
  await campo.click();
  await page.getByRole('option', { name: rotulo }).first().click();
}

test.describe(`Activar BOM/roteiro e gerir centros de trabalho (#165, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
      const tenantId = t.rows[0].id;
      const p = await c.query<{ id: string }>(
        `SELECT id FROM "Produto" WHERE "tenantId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!p.rows[0]) throw new Error('STOP: o demo não tem produtos');
      const produtoId = p.rows[0].id;

      await c.query('BEGIN');
      try {
        for (const [id, codigo, status] of [
          [ID_BOM_RASC, COD.bomRasc, 'RASCUNHO'],
          [ID_BOM_SUBS, COD.bomSubs, 'SUBSTITUIDO'],
        ] as const) {
          await c.query(
            `INSERT INTO "EstruturaProduto" (id, "tenantId", "produtoId", codigo, nome, versao, status,
               "unidadeProducao", observacoes, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $4, $6::"StatusBOM", 'UN', $7, now(), now())`,
            [id, tenantId, produtoId, codigo, `BOM ${MARCA} ${codigo}`, status, `Oráculo ${MARCA}`],
          );
        }
        for (const [id, codigo, status] of [
          [ID_ROT_RASC, COD.rotRasc, 'RASCUNHO'],
          [ID_ROT_REV, COD.rotRev, 'EM_REVISAO'],
        ] as const) {
          await c.query(
            `INSERT INTO "Roteiro" (id, "tenantId", codigo, nome, versao, status, observacoes, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, '1', $5::"StatusRoteiro", $6, now(), now())`,
            [id, tenantId, codigo, `Roteiro ${MARCA} ${codigo}`, status, `Oráculo ${MARCA}`],
          );
        }
        await c.query(
          `INSERT INTO "CentroTrabalho" (id, "tenantId", codigo, nome, tipo, "custoHora", "capacidadeHorasDia",
             ativo, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'MAQUINA', 700, 8, true, now(), now())`,
          [ID_CENTRO, tenantId, COD.centro, `Prensa ${MARCA} ${SUF}`],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  // ─── BOM ───────────────────────────────────────────────────────────────────

  test('BOM: Activar (RASCUNHO → ATIVO), depois Desactivar (ATIVO → INATIVO), sem sair do detalhe', async ({ page }) => {
    const url = `${BASE}/producao/estrutura/${ID_BOM_RASC}`;
    const reDetalhe = new RegExp(`/producao/estrutura/${ID_BOM_RASC}$`);
    await abrir(page, url);
    await expect(page.getByText(COD.bomRasc).first()).toBeVisible();
    await expect(page.getByRole('button', { name: ACTIVAR })).toBeVisible();
    await expect(page.getByRole('button', { name: DESACTIVAR })).toHaveCount(0);

    await accionar(page, ACTIVAR);
    await expect.poll(() => statusDe('EstruturaProduto', ID_BOM_RASC), { timeout: 15_000 }).toBe('ATIVO');
    await expect(page).toHaveURL(reDetalhe);
    await expect(page.getByRole('button', { name: DESACTIVAR })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: ACTIVAR })).toHaveCount(0);

    await accionar(page, DESACTIVAR);
    await expect.poll(() => statusDe('EstruturaProduto', ID_BOM_RASC), { timeout: 15_000 }).toBe('INATIVO');
    await expect(page).toHaveURL(reDetalhe);
    await expect(page.getByRole('button', { name: ACTIVAR })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: DESACTIVAR })).toHaveCount(0);
  });

  test('BOM: a lista leva ao detalhe, que existe (não é 404)', async ({ page }) => {
    await abrir(page, `${BASE}/producao/estrutura?search=${encodeURIComponent(COD.bomRasc)}`);
    await page.getByText(COD.bomRasc).first().click();
    await page.waitForURL(new RegExp(`/producao/estrutura/${ID_BOM_RASC}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(COD.bomRasc).first()).toBeVisible();
  });

  test('BOM SUBSTITUIDO: nem Activar nem Desactivar', async ({ page }) => {
    await abrir(page, `${BASE}/producao/estrutura/${ID_BOM_SUBS}`);
    await expect(page.getByText(COD.bomSubs).first()).toBeVisible();
    await expect(page.getByRole('button', { name: ACTIVAR })).toHaveCount(0);
    await expect(page.getByRole('button', { name: DESACTIVAR })).toHaveCount(0);
    expect(await statusDe('EstruturaProduto', ID_BOM_SUBS)).toBe('SUBSTITUIDO');
  });

  // ─── Roteiro ───────────────────────────────────────────────────────────────

  test('Roteiro: Activar (RASCUNHO → ATIVO), depois Desactivar (ATIVO → INATIVO), sem sair do detalhe', async ({ page }) => {
    const reDetalhe = new RegExp(`/producao/roteiros/${ID_ROT_RASC}$`);
    await abrir(page, `${BASE}/producao/roteiros/${ID_ROT_RASC}`);
    await expect(page.getByText(COD.rotRasc).first()).toBeVisible();
    await expect(page.getByRole('button', { name: DESACTIVAR })).toHaveCount(0);

    await accionar(page, ACTIVAR);
    await expect.poll(() => statusDe('Roteiro', ID_ROT_RASC), { timeout: 15_000 }).toBe('ATIVO');
    await expect(page).toHaveURL(reDetalhe);
    await expect(page.getByRole('button', { name: DESACTIVAR })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: ACTIVAR })).toHaveCount(0);

    await accionar(page, DESACTIVAR);
    await expect.poll(() => statusDe('Roteiro', ID_ROT_RASC), { timeout: 15_000 }).toBe('INATIVO');
    await expect(page).toHaveURL(reDetalhe);
    await expect(page.getByRole('button', { name: ACTIVAR })).toBeVisible({ timeout: 15_000 });
  });

  test('Roteiro EM_REVISAO: Activar grava ATIVO', async ({ page }) => {
    await abrir(page, `${BASE}/producao/roteiros/${ID_ROT_REV}`);
    await expect(page.getByText(COD.rotRev).first()).toBeVisible();
    await expect(page.getByRole('button', { name: DESACTIVAR })).toHaveCount(0);
    await accionar(page, ACTIVAR);
    await expect.poll(() => statusDe('Roteiro', ID_ROT_REV), { timeout: 15_000 }).toBe('ATIVO');
    await expect(page).toHaveURL(new RegExp(`/producao/roteiros/${ID_ROT_REV}$`));
  });

  // ─── Centros de trabalho ───────────────────────────────────────────────────

  test('Centros: a lista mostra o centro do tenant, liga a «novo» e leva ao centro', async ({ page }) => {
    await abrir(page, `${BASE}/producao/centros-trabalho`);
    await expect(page.getByText(COD.centro).first()).toBeVisible();
    await expect(page.locator('a[href="/producao/centros-trabalho/novo"]').first()).toBeVisible();

    await page.getByText(COD.centro).first().click();
    await page.waitForURL(new RegExp(`/producao/centros-trabalho/${ID_CENTRO}(/editar)?$`), { timeout: 15_000 });
  });

  test('Centros: «novo» é uma rota (sem Dialog) e grava o centro no tenant', async ({ page }) => {
    await abrir(page, `${BASE}/producao/centros-trabalho/novo`);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByLabel(/^\s*c[oó]digo/i).first().fill(COD.centroNovo);
    await page.getByLabel(/^\s*nome/i).first().fill(NOME_CENTRO_NOVO);
    await escolherTipo(page, /m[aá]quina/i, 'MAQUINA');
    await page.getByLabel(/custo/i).first().fill('850');
    await page.getByLabel(/capacidade/i).first().fill('8');
    await page.getByRole('button', { name: /^\s*(criar|guardar|gravar)/i }).click();

    await expect.poll(async () => (await centroPorCodigo(COD.centroNovo))?.nome, { timeout: 15_000 }).toBe(NOME_CENTRO_NOVO);
    const c = (await centroPorCodigo(COD.centroNovo))!;
    expect(c.tipo).toBe('MAQUINA');
    expect(Number(c.custoHora)).toBe(850);
    expect(Number(c.capacidade)).toBe(8);
    expect(c.ativo).toBe(true);
    await page.waitForURL((u) => !/\/novo$/.test(u.pathname), { timeout: 15_000 });
  });

  test('Centros: «editar» vem preenchido, muda o nome e desactiva o centro', async ({ page }) => {
    await abrir(page, `${BASE}/producao/centros-trabalho/${ID_CENTRO}/editar`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel(/^\s*c[oó]digo/i).first()).toHaveValue(COD.centro);
    const nome = page.getByLabel(/^\s*nome/i).first();
    await expect(nome).toHaveValue(new RegExp(esc(`Prensa ${MARCA} ${SUF}`)));

    await nome.fill(NOME_CENTRO_EDITADO);
    const activo = page
      .getByRole('switch', { name: /a(c)?tivo/i })
      .or(page.getByRole('checkbox', { name: /a(c)?tivo/i }))
      .first();
    await expect(activo).toBeChecked();
    await activo.click();
    await expect(activo).not.toBeChecked();
    await page.getByRole('button', { name: /^\s*(guardar|gravar|a(c)?tualizar)/i }).click();

    await expect.poll(async () => (await centroPorCodigo(COD.centro))?.nome, { timeout: 15_000 }).toBe(NOME_CENTRO_EDITADO);
    const c = (await centroPorCodigo(COD.centro))!;
    expect(c.id).toBe(ID_CENTRO);
    expect(c.ativo).toBe(false);
    expect(c.tipo).toBe('MAQUINA');
    expect(Number(c.custoHora)).toBe(700);
    await page.waitForURL((u) => !/\/editar$/.test(u.pathname), { timeout: 15_000 });
  });
});
