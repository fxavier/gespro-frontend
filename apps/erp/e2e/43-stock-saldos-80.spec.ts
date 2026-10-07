/**
 * E2E — saldo de stock por localização no detalhe do produto (issue #80; nó A:stock-saldos-80,
 * oráculo do verificador — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * O defeito: `listarSaldos` não tinha consumidor e o detalhe do produto não mostrava stock.
 * Contrato da UI: /produtos/[id] tem a secção «Stock por localização» com uma tabela
 * Localização / Quantidade / Reservada / Disponível (uma linha por localização, via
 * `listarSaldos({ produtoId })`), e um estado vazio quando o produto não tem saldos.
 * Se a secção viver num separador, o teste abre o separador cujo nome contém «Stock».
 *
 * SÓ LEITURA: não escreve nada na base. Os produtos são escolhidos por SQL no tenant `demo`
 * (um com saldos, um sem); se o seed não tiver um produto sem saldos, o caso vazio salta.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { loginAs, USERS } from './helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

const PREFIXO = 'stock-saldos-80';

function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function comBase<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

type LinhaSaldo = { localizacao: string; saldo: string; reservado: string };

/** Produto do tenant demo com saldos em pelo menos uma localização, e as suas linhas. */
async function produtoComSaldos(): Promise<{ id: string; linhas: LinhaSaldo[] } | null> {
  return comBase(async (c) => {
    const p = await c.query(
      `SELECT s."produtoId" AS id
         FROM "SaldoStock" s
         JOIN "Tenant" t ON t.id = s."tenantId" AND t.slug = 'demo'
         JOIN "Produto" p ON p.id = s."produtoId" AND p."tenantId" = s."tenantId" AND p."deletedAt" IS NULL
        GROUP BY s."produtoId"
        ORDER BY count(*) DESC, s."produtoId"
        LIMIT 1`,
    );
    if (p.rowCount === 0) return null;
    const id = p.rows[0].id as string;
    const l = await c.query(
      `SELECT l.nome AS localizacao, s.saldo::text AS saldo, s."saldoReservado"::text AS reservado
         FROM "SaldoStock" s JOIN "Localizacao" l ON l.id = s."localizacaoId" AND l."tenantId" = s."tenantId"
        WHERE s."produtoId" = $1
        ORDER BY l.nome`,
      [id],
    );
    return { id, linhas: l.rows as LinhaSaldo[] };
  });
}

/** Produto do tenant demo sem nenhuma linha de SaldoStock. */
async function produtoSemSaldos(): Promise<string | null> {
  return comBase(async (c) => {
    const r = await c.query(
      `SELECT p.id
         FROM "Produto" p JOIN "Tenant" t ON t.id = p."tenantId" AND t.slug = 'demo'
        WHERE p."deletedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "SaldoStock" s WHERE s."produtoId" = p.id AND s."tenantId" = p."tenantId")
        ORDER BY p.id
        LIMIT 1`,
    );
    return (r.rows[0]?.id as string | undefined) ?? null;
  });
}

async function abrirSeccaoStock(page: Page, produtoId: string): Promise<void> {
  await page.goto(`/produtos/${produtoId}`);
  await page.waitForLoadState('networkidle');
  const separador = page.getByRole('tab', { name: /stock/i });
  if ((await separador.count()) > 0) await separador.first().click();
  await expect(page.getByText(/Stock por localização/i).first()).toBeVisible({ timeout: 30_000 });
}

/** Número de uma célula, independente do formato (1 200,50 / 1.200,50 / 1200.5). */
function numero(texto: string): number {
  const s = texto.replace(/[^\d,.-]/g, '');
  const dec = s.match(/[.,](\d{1,2})$/);
  const inteiro = (dec ? s.slice(0, -dec[0].length) : s).replace(/\D/g, '');
  return Number(inteiro || '0') + (dec ? Number(dec[1]) / 10 ** dec[1].length : 0);
}

test.describe(`${PREFIXO} — stock por localização no detalhe do produto`, () => {
  test('produto com saldos: uma linha por localização com quantidade, reservada e disponível', async ({ page }) => {
    test.setTimeout(120_000);
    const alvo = await produtoComSaldos();
    test.skip(!alvo, 'o tenant demo não tem saldos de stock — corre pnpm db:seed');
    await loginAs(page, USERS.admin);
    await abrirSeccaoStock(page, alvo!.id);

    const tabela = page.locator('table').filter({ has: page.getByRole('columnheader', { name: /Localização/i }) });
    await expect(tabela).toHaveCount(1);
    for (const cab of [/Localização/i, /Quantidade/i, /Reservada/i, /Disponível/i]) {
      await expect(tabela.getByRole('columnheader', { name: cab })).toBeVisible();
    }

    const cabecalhos = (await tabela.getByRole('columnheader').allInnerTexts()).map((t) => t.trim());
    const col = (re: RegExp) => cabecalhos.findIndex((t) => re.test(t));
    const iQtd = col(/Quantidade/i);
    const iRes = col(/Reservada/i);
    const iDisp = col(/Disponível/i);

    const linhas = tabela.locator('tbody tr');
    await expect(linhas).toHaveCount(alvo!.linhas.length);
    for (const esperado of alvo!.linhas) {
      const linha = linhas.filter({ hasText: esperado.localizacao });
      await expect(linha, `falta a linha de ${esperado.localizacao}`).toHaveCount(1);
      const celulas = (await linha.locator('td').allInnerTexts()).map((t) => t.trim());
      const saldo = Number(esperado.saldo);
      const reservado = Number(esperado.reservado);
      expect(numero(celulas[iQtd])).toBeCloseTo(saldo, 2);
      expect(numero(celulas[iRes])).toBeCloseTo(reservado, 2);
      expect(numero(celulas[iDisp])).toBeCloseTo(saldo - reservado, 2);
    }
  });

  test('produto sem saldos: a secção mostra estado vazio', async ({ page }) => {
    test.setTimeout(120_000);
    const id = await produtoSemSaldos();
    test.skip(!id, 'todos os produtos do tenant demo têm saldos');
    await loginAs(page, USERS.admin);
    await abrirSeccaoStock(page, id!);
    await expect(
      page.getByText(/sem stock|sem saldo|nenhum (stock|saldo)|não há stock|não tem stock/i).first(),
    ).toBeVisible();
  });
});
