/**
 * Oráculo E2E — issue #118: sem UI para movimentação de activos nem para amortização mensal.
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais, sem permissões novas, sem
 * endpoints públicos novos — a rota de movimentação chama `registarMovimentacaoAtivoAction` e o
 * botão de amortização chama `processarAmortizacaoTenantAction`):
 *
 *   Detalhe `/inventario/ativos/<id>`:
 *     - ligação «Movimentar» para a rota própria `/inventario/ativos/<id>/movimentar` (recolher
 *       dados é formulário, logo é rota); num activo BAIXADO a ligação não aparece;
 *     - separador «Movimentações» (tab) com uma linha por movimentação, que mostra o NOME da
 *       localização de destino.
 *   Rota de movimentação — campo «Localização de destino» (combobox, com `Pesquisar…`), campo
 *     «Motivo» (texto) e botão «Registar movimentação», que grava a transferência e volta ao
 *     detalhe. O activo passa a estar na localização de destino.
 *   Listagem `/inventario/amortizacao` — botão «Processar amortização do mês», que processa o mês
 *     corrente de Maputo (pode pedir confirmação num AlertDialog cujo botão tem o mesmo nome).
 *     Carregar duas vezes não duplica: continua a haver UMA amortização do activo nesse mês.
 *
 * As regras de servidor (origem lida no servidor, isolamento, BAIXADO, sem alteração,
 * idempotência, mês futuro, activo adquirido depois do mês, sem lançamento contabilístico) são
 * provadas em `test/integration/activos-movimentacao-amortizacao-118.test.ts`.
 *
 * Dados (prefixo único `activos-movimentacao-amortizacao-118`), no tenant `demo`, por SQL: duas
 * localizações, uma categoria e dois activos (um EM_USO na localização de origem, um BAIXADO).
 * Ficam no demo, como os dados dos `47-…` a `51-…`. O botão de amortização processa o mês corrente
 * para TODOS os activos EM_USO do demo — deixa `AmortizacaoCalculo` no tenant `demo`.
 *
 * ESTADO ESPERADO antes da implementação: RED — o detalhe não tem «Movimentar» nem o separador
 * «Movimentações», a rota de movimentação não existe e a listagem de amortização não tem botão.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/52-activos-movimentacao-amortizacao-118.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:activos-movimentacao-amortizacao-118; um agente de
 * implementação que o altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'activos-movimentacao-amortizacao-118';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_LOC_ORIGEM = `clor118${SUF}`;
const ID_LOC_DESTINO = `clde118${SUF}`;
const ID_CAT = `ccat118${SUF}`;
const ID_AT = `cata118${SUF}`;
const ID_AT_BAIXADO = `catb118${SUF}`;
const COD_AT = `AT-118A-${SUF}`;
const COD_BAIXADO = `AT-118B-${SUF}`;
const NOME_DESTINO = `Armazém destino ${SUF}`;

const detalhe = (id: string) => `${BASE}/inventario/ativos/${id}`;
const reDetalhe = (id: string) => new RegExp(`/inventario/ativos/${id}$`);
const reMovimentar = (id: string) => new RegExp(`/inventario/ativos/${id}/movimentar$`);

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

function mesCorrenteMaputo(): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date());
  return {
    ano: Number(partes.find((p) => p.type === 'year')!.value),
    mes: Number(partes.find((p) => p.type === 'month')!.value),
  };
}

async function localizacaoDoActivo(id: string): Promise<string> {
  return withPg(async (c) => {
    const r = await c.query<{ loc: string }>(`SELECT "localizacaoId" AS loc FROM "Ativo" WHERE id = $1`, [id]);
    return r.rows[0].loc;
  });
}

async function movimentacoes(id: string) {
  return withPg(async (c) => {
    const r = await c.query<{ tipo: string; origem: string | null; destino: string | null }>(
      `SELECT tipo::text, "localizacaoOrigemId" AS origem, "localizacaoDestinoId" AS destino
         FROM "MovimentacaoAtivo" WHERE "ativoId" = $1`,
      [id],
    );
    return r.rows;
  });
}

async function amortizacoesDoMes(id: string, ano: number, mes: number): Promise<number> {
  return withPg(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "AmortizacaoCalculo" WHERE "ativoId" = $1 AND ano = $2 AND mes = $3`,
      [id, ano, mes],
    );
    return Number(r.rows[0].n);
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** Clica o botão; se a UI pedir confirmação (AlertDialog), confirma com o mesmo nome. */
async function carregarComConfirmacao(page: Page, nome: RegExp): Promise<void> {
  await page.getByRole('button', { name: nome }).first().click();
  const confirmacao = page.getByRole('alertdialog');
  if (await confirmacao.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false)) {
    await confirmacao.getByRole('button', { name: nome }).click();
    await expect(confirmacao).toHaveCount(0);
  }
  await page.waitForLoadState('networkidle');
}

test.describe(`Activos — movimentação e amortização do mês (#118, ${MARCA})`, () => {
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
        for (const [id, tag, nome] of [
          [ID_LOC_ORIGEM, 'O', `Sala origem ${SUF}`],
          [ID_LOC_DESTINO, 'D', NOME_DESTINO],
        ]) {
          await c.query(
            `INSERT INTO "Localizacao" (id, "tenantId", codigo, nome, tipo, "updatedAt")
             VALUES ($1, $2, $3, $4, 'SALA', now())`,
            [id, tenantId, `LOC-${MARCA}-${tag}-${SUF}`, nome],
          );
        }
        await c.query(
          `INSERT INTO "CategoriaAtivo" (id, "tenantId", codigo, nome, "vidaUtilAnos", "updatedAt")
           VALUES ($1, $2, $3, 'Equipamento #118', 4, now())`,
          [ID_CAT, tenantId, `CAT-${MARCA}-${SUF}`],
        );
        for (const [id, codigo, estado] of [[ID_AT, COD_AT, 'EM_USO'], [ID_AT_BAIXADO, COD_BAIXADO, 'BAIXADO']]) {
          await c.query(
            `INSERT INTO "Ativo" (id, "tenantId", "codigoInterno", nome, "categoriaId", "dataAquisicao", "valorCompra",
               "vidaUtilAnos", estado, "localizacaoId", imagens, "criadoPor", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, now() - interval '200 days', 48000.00, 4, $6::"EstadoAtivo", $7, ARRAY[]::text[], $8, now())`,
            [id, tenantId, codigo, `Portátil movimentação ${codigo}`, ID_CAT, estado, ID_LOC_ORIGEM, adminId],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('movimentar pelo detalhe: rota própria, grava a transferência e o activo muda de localização', async ({ page }) => {
    await abrir(page, detalhe(ID_AT));
    await page.getByRole('link', { name: /^movimentar$/i }).click();
    await page.waitForURL(reMovimentar(ID_AT), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('combobox', { name: /localiza[çc][ãa]o de destino/i }).click();
    const pesquisa = page.locator('[data-radix-popper-content-wrapper]').getByPlaceholder('Pesquisar…').last();
    await expect(pesquisa).toBeVisible({ timeout: 5_000 });
    await pesquisa.fill(SUF);
    await page.getByRole('option', { name: new RegExp(NOME_DESTINO) }).first().click();

    await page.getByRole('textbox', { name: /motivo/i }).fill(`Mudança ${MARCA}`);
    await page.getByRole('button', { name: /registar movimenta[çc][ãa]o/i }).click();
    await page.waitForURL(reDetalhe(ID_AT), { timeout: 15_000 });

    await expect.poll(() => localizacaoDoActivo(ID_AT)).toBe(ID_LOC_DESTINO);
    const movs = await movimentacoes(ID_AT);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toEqual({ tipo: 'TRANSFERENCIA', origem: ID_LOC_ORIGEM, destino: ID_LOC_DESTINO });

    await abrir(page, detalhe(ID_AT));
    await page.getByRole('tab', { name: /movimenta[çc][õo]es/i }).click();
    await expect(page.getByText(NOME_DESTINO).first()).toBeVisible();
  });

  test('activo BAIXADO não oferece «Movimentar»', async ({ page }) => {
    await abrir(page, detalhe(ID_AT_BAIXADO));
    await expect(page.getByText(COD_BAIXADO).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^movimentar$/i })).toHaveCount(0);
  });

  test('«Processar amortização do mês» amortiza o activo no mês corrente e não duplica ao repetir', async ({ page }) => {
    const { ano, mes } = mesCorrenteMaputo();
    expect(await amortizacoesDoMes(ID_AT, ano, mes)).toBe(0);

    await abrir(page, `${BASE}/inventario/amortizacao`);
    await carregarComConfirmacao(page, /processar amortiza[çc][ãa]o do m[êe]s/i);
    await expect.poll(() => amortizacoesDoMes(ID_AT, ano, mes), { timeout: 15_000 }).toBe(1);
    expect(await amortizacoesDoMes(ID_AT_BAIXADO, ano, mes)).toBe(0);

    await abrir(page, `${BASE}/inventario/amortizacao`);
    await carregarComConfirmacao(page, /processar amortiza[çc][ãa]o do m[êe]s/i);
    // Dá tempo à segunda corrida de gravar, se fosse gravar.
    await page.waitForTimeout(1_500);
    expect(await amortizacoesDoMes(ID_AT, ano, mes)).toBe(1);
  });
});
