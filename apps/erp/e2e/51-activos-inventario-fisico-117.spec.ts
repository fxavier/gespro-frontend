/**
 * Oráculo E2E — issue #117: inventário físico de activos só cria e consulta (fica sempre «Planeado»).
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais, sem permissões novas, sem
 * endpoints novos — o detalhe chama `transitarStatusInventarioFisicoAction` e a rota de contagem
 * chama `registarContagemAction`):
 *
 *   Detalhe `/inventario/fisico/<id>` — transições da máquina existente, por botão no cabeçalho:
 *     - PLANEJADO: «Agendar»; AGENDADO: «Iniciar»; EM_ANDAMENTO: «Concluir» (e «Pausar»);
 *       PAUSADO: «Retomar»; em qualquer estado não terminal: «Cancelar inventário», que pede
 *       confirmação num AlertDialog (botão de confirmação também «Cancelar inventário»);
 *     - CONCLUIDO e CANCELADO não mostram botão de transição nenhum;
 *     - concluir com activos por contar não muda o estado e mostra a mensagem do servidor
 *       (a do serviço: «Existem N ativos por contar»).
 *   Separador «Contagem» (tab) — uma linha por activo do âmbito, com o CÓDIGO INTERNO e o NOME do
 *     activo; em EM_ANDAMENTO cada linha tem a ligação «Registar contagem» para a rota própria
 *     `/inventario/fisico/<id>/contagens/<contagemId>` (recolher dados é formulário, logo é rota);
 *     fora de EM_ANDAMENTO a ligação não aparece.
 *   Rota de contagem — escolha «Encontrado» / «Não encontrado» (radio), campo «Estado encontrado»
 *     (combobox) e botão «Registar contagem», que grava e volta ao detalhe.
 *
 * As regras de servidor (âmbito, discrepâncias, totais, contagem só EM_ANDAMENTO, isolamento) são
 * provadas em `test/integration/activos-inventario-fisico-117.test.ts`.
 *
 * Dados (prefixo único `activos-inventario-fisico-117`), no tenant `demo`, por SQL: uma
 * localização, uma categoria de activo, dois activos EM_USO nessa localização e dois inventários
 * PLANEJADO cujo âmbito é só essa localização. Ficam no demo, como os dados dos `47-…` a `50-…`.
 *
 * ESTADO ESPERADO antes da implementação: RED — o detalhe não tem botões de transição nem o
 * separador «Contagem», e a rota de contagem não existe.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/51-activos-inventario-fisico-117.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:activos-inventario-fisico-117; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'activos-inventario-fisico-117';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_LOC = `cloc117${SUF}`;
const ID_CAT = `ccat117${SUF}`;
const ID_AT_A = `cata117${SUF}`;
const ID_AT_B = `catb117${SUF}`;
const ID_INV = `cinv117${SUF}`;
const ID_INV_CANCELAR = `cinc117${SUF}`;
const COD_A = `AT-117A-${SUF}`;
const COD_B = `AT-117B-${SUF}`;
const NOME_A = `Portátil inventário ${SUF}`;
const NOME_B = `Projector inventário ${SUF}`;

const detalhe = (id: string) => `${BASE}/inventario/fisico/${id}`;
const reDetalhe = (id: string) => new RegExp(`/inventario/fisico/${id}$`);
const reContagem = (id: string) => new RegExp(`/inventario/fisico/${id}/contagens/[^/]+$`);

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

type EstadoInv = { status: string; contados: number | null; discrepancias: number | null };

async function estadoInventario(id: string): Promise<EstadoInv> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; contados: number | null; discrepancias: number | null }>(
      `SELECT status::text, "totalAtivosContados" AS contados, "totalDiscrepancias" AS discrepancias
         FROM "InventarioFisico" WHERE id = $1`,
      [id],
    );
    return r.rows[0];
  });
}

async function contagem(inventarioId: string, ativoId: string) {
  return withPg(async (c) => {
    const r = await c.query<{ id: string; encontrado: boolean; contado: boolean; discrepancia: boolean }>(
      `SELECT id, encontrado, ("dataContagem" IS NOT NULL) AS contado, "temDiscrepancia" AS discrepancia
         FROM "ContagemInventario" WHERE "inventarioId" = $1 AND "ativoId" = $2`,
      [inventarioId, ativoId],
    );
    return r.rows[0];
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** Clica um botão de transição; se a UI pedir confirmação (AlertDialog), confirma com o mesmo nome. */
async function transitar(page: Page, nome: RegExp): Promise<void> {
  await page.getByRole('button', { name: nome }).first().click();
  const confirmacao = page.getByRole('alertdialog');
  if (await confirmacao.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false)) {
    await confirmacao.getByRole('button', { name: nome }).click();
    await expect(confirmacao).toHaveCount(0);
  }
  await page.waitForLoadState('networkidle');
}

async function separadorContagem(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /contagem/i }).click();
}

function linhaDoActivo(page: Page, codigo: string) {
  return page.getByRole('row').filter({ hasText: codigo });
}

async function registarContagem(page: Page, inventarioId: string, codigo: string, encontrado: boolean): Promise<void> {
  await abrir(page, detalhe(inventarioId));
  await separadorContagem(page);
  await linhaDoActivo(page, codigo).getByRole('link', { name: /registar contagem/i }).click();
  await page.waitForURL(reContagem(inventarioId), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(codigo).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: /estado encontrado/i })).toBeVisible();
  await page.getByRole('radio', { name: encontrado ? /^encontrado$/i : /^não encontrado$/i }).check();
  await page.getByRole('button', { name: /registar contagem/i }).click();
  await page.waitForURL(reDetalhe(inventarioId), { timeout: 15_000 });
}

const BOTOES_TRANSICAO = [/^agendar$/i, /^iniciar$/i, /^concluir$/i, /^pausar$/i, /^retomar$/i, /cancelar invent/i];

test.describe(`Inventário físico de activos — contagem e transições (#117, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      const tenantId = t.rows[0]?.id;
      if (!tenantId) throw new Error('STOP: tenant demo não encontrado');
      const u = await c.query<{ id: string }>(
        `SELECT id FROM "User" WHERE "tenantId" = $1 AND email = 'admin@demo.mz' LIMIT 1`,
        [tenantId],
      );
      const adminId = u.rows[0]?.id;
      if (!adminId) throw new Error('STOP: admin@demo.mz não encontrado no demo');

      await c.query('BEGIN');
      try {
        await c.query(
          `INSERT INTO "Localizacao" (id, "tenantId", codigo, nome, tipo, "updatedAt")
           VALUES ($1, $2, $3, $4, 'SALA', now())`,
          [ID_LOC, tenantId, `LOC-${MARCA}-${SUF}`, `Sala inventário ${SUF}`],
        );
        await c.query(
          `INSERT INTO "CategoriaAtivo" (id, "tenantId", codigo, nome, "vidaUtilAnos", "updatedAt")
           VALUES ($1, $2, $3, 'Equipamento #117', 4, now())`,
          [ID_CAT, tenantId, `CAT-${MARCA}-${SUF}`],
        );
        for (const [id, codigo, nome] of [[ID_AT_A, COD_A, NOME_A], [ID_AT_B, COD_B, NOME_B]]) {
          await c.query(
            `INSERT INTO "Ativo" (id, "tenantId", "codigoInterno", nome, "categoriaId", "dataAquisicao", "valorCompra",
               "vidaUtilAnos", estado, "localizacaoId", imagens, "criadoPor", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, now() - interval '200 days', 45000.00, 4, 'EM_USO', $6, ARRAY[]::text[], $7, now())`,
            [id, tenantId, codigo, nome, ID_CAT, ID_LOC, adminId],
          );
        }
        for (const [id, tag] of [[ID_INV, 'P'], [ID_INV_CANCELAR, 'C']]) {
          await c.query(
            `INSERT INTO "InventarioFisico" (id, "tenantId", codigo, titulo, status, "dataInicio", "responsavelId",
               "localizacoesIncluidas", "categoriasIncluidas", "criadoPor", "updatedAt")
             VALUES ($1, $2, $3, $4, 'PLANEJADO', now(), $5, ARRAY[$6]::text[], ARRAY[]::text[], $5, now())`,
            [id, tenantId, `INV-117${tag}-${SUF}`, `Inventário ${MARCA} ${tag} ${SUF}`, adminId, ID_LOC],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('agendar e iniciar pelo detalhe: o separador «Contagem» lista os activos do âmbito', async ({ page }) => {
    await abrir(page, detalhe(ID_INV));
    await expect(page.getByRole('button', { name: /^iniciar$/i })).toHaveCount(0);
    await transitar(page, /^agendar$/i);
    await expect.poll(async () => (await estadoInventario(ID_INV)).status).toBe('AGENDADO');

    await abrir(page, detalhe(ID_INV));
    await transitar(page, /^iniciar$/i);
    await expect.poll(async () => (await estadoInventario(ID_INV)).status).toBe('EM_ANDAMENTO');

    await abrir(page, detalhe(ID_INV));
    await separadorContagem(page);
    for (const [codigo, nome] of [[COD_A, NOME_A], [COD_B, NOME_B]]) {
      const linha = linhaDoActivo(page, codigo);
      await expect(linha).toHaveCount(1);
      await expect(linha).toContainText(nome);
      await expect(linha.getByRole('link', { name: /registar contagem/i })).toBeVisible();
    }
  });

  test('contar um activo, tentar concluir com outro por contar, contar o segundo e concluir', async ({ page }) => {
    await registarContagem(page, ID_INV, COD_A, true);
    const a = await contagem(ID_INV, ID_AT_A);
    expect(a.contado).toBe(true);
    expect(a.encontrado).toBe(true);
    expect(a.discrepancia).toBe(false);
    expect((await estadoInventario(ID_INV)).contados).toBe(1);

    // Concluir com o B por contar: recusado, mensagem do servidor, estado intacto.
    await abrir(page, detalhe(ID_INV));
    await transitar(page, /^concluir$/i);
    await expect(page.getByText(/\d+\s+a(c)?tivos? por contar/i).first()).toBeVisible({ timeout: 10_000 });
    expect((await estadoInventario(ID_INV)).status).toBe('EM_ANDAMENTO');

    await registarContagem(page, ID_INV, COD_B, false);
    const b = await contagem(ID_INV, ID_AT_B);
    expect(b.contado).toBe(true);
    expect(b.encontrado).toBe(false);
    expect(b.discrepancia).toBe(true);
    const meio = await estadoInventario(ID_INV);
    expect(meio.contados).toBe(2);
    expect(meio.discrepancias).toBe(1);

    await abrir(page, detalhe(ID_INV));
    await transitar(page, /^concluir$/i);
    await expect.poll(async () => (await estadoInventario(ID_INV)).status).toBe('CONCLUIDO');

    // Concluído: sem transições nem ligações de contagem.
    await abrir(page, detalhe(ID_INV));
    for (const nome of BOTOES_TRANSICAO) {
      await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
    }
    await separadorContagem(page);
    await expect(linhaDoActivo(page, COD_A)).toHaveCount(1);
    await expect(page.getByRole('link', { name: /registar contagem/i })).toHaveCount(0);
  });

  test('cancelar pede confirmação (AlertDialog) e deixa o inventário sem transições', async ({ page }) => {
    await abrir(page, detalhe(ID_INV_CANCELAR));
    await page.getByRole('button', { name: /cancelar invent/i }).first().click();
    const confirmacao = page.getByRole('alertdialog');
    await expect(confirmacao).toBeVisible();
    expect((await estadoInventario(ID_INV_CANCELAR)).status).toBe('PLANEJADO');
    await confirmacao.getByRole('button', { name: /cancelar invent/i }).click();
    await expect.poll(async () => (await estadoInventario(ID_INV_CANCELAR)).status).toBe('CANCELADO');

    await abrir(page, detalhe(ID_INV_CANCELAR));
    await expect(page.getByText(/cancelado/i).first()).toBeVisible();
    for (const nome of BOTOES_TRANSICAO) {
      await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
    }
  });
});
