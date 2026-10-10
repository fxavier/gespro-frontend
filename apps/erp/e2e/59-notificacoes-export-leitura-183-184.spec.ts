/**
 * E2E — issue #183 (notificacoes-export-leitura-183-184): pesquisa e paginação por cursor em
 * `/notificacoes`, e «Exportar Relatório» de `/analytics` (ORÁCULO, escrito pelo verificador —
 * alterá-lo do lado de quem implementa é BLOCKER).
 *
 * Escreve no tenant `demo`, para o ADMIN, 5 notificações IN_APP com o prefixo
 * `notificacoes-export-leitura-183-184` no título; o `afterAll` apaga-as.
 *
 * 1. Pesquisar pelo prefixo com `take=2` mostra 2 de 5; o controlo de página seguinte leva a um
 *    URL com `cursor` e com o `q` preservado, e mostra as 2 seguintes; a terceira página tem 1 e
 *    já não oferece página seguinte. As três páginas juntas mostram as 5, sem repetidas, da mais
 *    recente para a mais antiga.
 * 2. A caixa de pesquisa da página filtra: escrever o prefixo nela leva a `?q=<prefixo>`.
 * 3. `/analytics`: «Exportar Relatório» ou não existe, ou é uma ligação cujo destino responde 200.
 *
 * O modo Leitura (#184) é provado pelo unit `src/server/actions/__tests__/notificacoes-leitura-184.test.ts`:
 * o tenant `demo` está ATIVO e pô-lo em Leitura afectaria todos os outros E2E.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const PREFIXO = 'notificacoes-export-leitura-183-184';
const RE_SEGUINTE = /seguinte|pr[oó]xim|carregar mais|mais antigas|ver mais/i;

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

const cuid = () => 'c' + randomBytes(16).toString('hex').slice(0, 24);

/** Títulos por ordem de criação: o 5 é o mais recente. */
const TITULOS = [1, 2, 3, 4, 5].map((i) => `${PREFIXO} aviso ${i}`);

async function limpar(): Promise<void> {
  await comBase((c) => c.query(`DELETE FROM "Notificacao" WHERE titulo LIKE $1`, [`${PREFIXO}%`]));
}

test.beforeAll(async () => {
  await limpar();
  await comBase(async (c) => {
    const r = await c.query(
      `SELECT u.id, u."tenantId" FROM "User" u JOIN "Tenant" t ON t.id = u."tenantId" AND t.slug = 'demo'
        WHERE u.email = 'admin@demo.mz'`,
    );
    const admin = r.rows[0] as { id: string; tenantId: string } | undefined;
    if (!admin) throw new Error('admin@demo.mz não existe no tenant demo — corra pnpm db:seed');
    for (const [i, titulo] of TITULOS.entries()) {
      await c.query(
        `INSERT INTO "Notificacao" (id, "tenantId", "userId", tipo, titulo, mensagem, canal, lida, "estadoEnvio", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'ALERTA_SISTEMA', $4, $5, 'IN_APP', false, 'ENVIADO',
                 timestamp '2026-01-01 10:00:00' + ($6 || ' minutes')::interval, now())`,
        [cuid(), admin.tenantId, admin.id, titulo, `Mensagem do ${titulo}`, String(i)],
      );
    }
  });
});

test.afterAll(async () => {
  await limpar();
});

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}

async function titulosVisiveis(page: Page): Promise<string[]> {
  const textos = await page.locator('main').getByText(new RegExp(`^${PREFIXO} aviso \\d$`)).allInnerTexts();
  return textos.map((t) => t.trim());
}

function seguinte(page: Page) {
  return page
    .locator('main')
    .getByRole('link', { name: RE_SEGUINTE })
    .or(page.locator('main').getByRole('button', { name: RE_SEGUINTE }));
}

test.describe('notificacoes-export-leitura-183-184 — ADMIN', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('notificacoes-export-leitura-183-184: pesquisa + paginação por cursor percorrem as 5, sem repetidas', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/notificacoes?q=${encodeURIComponent(PREFIXO)}&take=2`);
    await aguardar(page);

    const vistos: string[] = [];

    await expect.poll(() => titulosVisiveis(page), { timeout: 30_000 }).toHaveLength(2);
    vistos.push(...(await titulosVisiveis(page)));

    for (const esperado of [2, 1]) {
      const ctrl = seguinte(page);
      await expect(ctrl.first(), 'controlo de página seguinte').toBeVisible();
      await ctrl.first().click();
      await page.waitForURL((u) => u.searchParams.has('cursor'), { timeout: 30_000 });
      await aguardar(page);
      const url = new URL(page.url());
      expect(url.searchParams.get('q'), 'o cursor não perde a pesquisa').toBe(PREFIXO);
      await expect.poll(() => titulosVisiveis(page), { timeout: 30_000 }).toHaveLength(esperado);
      vistos.push(...(await titulosVisiveis(page)));
    }

    await expect(seguinte(page), 'na última página não há página seguinte').toHaveCount(0);
    expect(new Set(vistos).size, `sem repetidas: ${JSON.stringify(vistos)}`).toBe(vistos.length);
    expect(vistos).toEqual([...TITULOS].reverse());
  });

  test('notificacoes-export-leitura-183-184: a caixa de pesquisa filtra pelo q', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/notificacoes');
    await aguardar(page);
    const caixa = page.locator('main').getByPlaceholder(/pesquisar/i).first();
    await expect(caixa).toBeVisible({ timeout: 30_000 });
    await caixa.fill(PREFIXO);
    await caixa.press('Enter');
    await page.waitForURL((u) => u.searchParams.get('q') === PREFIXO, { timeout: 30_000 });
    await aguardar(page);
    // Sem take no URL, a primeira página (20) cabe as 5 do prefixo — e só elas casam com o q.
    await expect.poll(() => titulosVisiveis(page), { timeout: 30_000 }).toEqual([...TITULOS].reverse());
  });

  test('notificacoes-export-leitura-183-184: «Exportar Relatório» em /analytics não é inerte', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/analytics');
    await aguardar(page);
    await expect(page.getByRole('heading', { name: 'Analytics' }).first()).toBeVisible({ timeout: 30_000 });

    const exportarBotao = page.locator('main').getByRole('button', { name: /exportar/i });
    await expect(exportarBotao, '«Exportar» como botão sem destino não pode existir').toHaveCount(0);

    const ligacoes = page.locator('main').getByRole('link', { name: /exportar/i });
    const n = await ligacoes.count();
    for (let i = 0; i < n; i++) {
      const href = await ligacoes.nth(i).getAttribute('href');
      expect(href, 'a ligação de exportação tem destino').toBeTruthy();
      const r = await page.request.get(href!);
      expect(r.status(), `${href} responde`).toBe(200);
    }
  });
});
