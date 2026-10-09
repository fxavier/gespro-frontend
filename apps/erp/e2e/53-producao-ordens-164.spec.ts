/**
 * Oráculo E2E — issue #164: ordens de produção sem transições, consumo de material nem entrada de
 * produto acabado.
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais de recolha, sem permissões
 * novas, sem endpoints públicos novos — o detalhe chama as actions EXISTENTES
 * `transitarStatusOrdemProducaoAction` e `registarConsumoOrdemAction`):
 *
 *   Detalhe `/producao/ordens/<id>` (Server Component), para quem tem `producao:ordens:update`:
 *     - PLANEADA: botões «Liberar ordem» e «Cancelar ordem»;
 *     - LIBERADA: «Iniciar produção» e «Cancelar ordem»;
 *     - EM_PRODUCAO: «Concluir ordem», «Cancelar ordem» e a ligação «Registar consumo» para a rota
 *       própria `/producao/ordens/<id>/registar-consumo` (recolher quantidades é formulário, logo é
 *       rota e não Dialog); pausar/retomar é opcional e não é afirmado;
 *     - CONCLUIDA e CANCELADA: nenhum destes botões nem a ligação;
 *     - cada transição pede confirmação num AlertDialog SEM campos, com o botão «Confirmar» (o de
 *       desistir chama-se «Voltar», para não colidir com «Cancelar ordem»); confirmar grava o novo
 *       estado e a página fica no detalhe;
 *     - os consumos registados (nome do material) aparecem no detalhe.
 *
 *   Rota `/producao/ordens/<id>/registar-consumo`: um combobox com nome acessível /material/
 *   (padrão `Combobox`/`ComboboxRemoto`), um campo com nome acessível /quantidade/ e o botão
 *   «Registar consumo». Qualquer outro campo é opcional ou vem preenchido (o custo unitário pode
 *   ser derivado no servidor). Sem material não grava e não sai da rota; com material e quantidade
 *   grava o consumo, BAIXA o stock do armazém `MP` (movimento gravado no consumo) e volta ao
 *   detalhe.
 *
 *   Concluir (depois de «Aprovar qualidade», #166) dá entrada do produto acabado no armazém `PA`
 *   pela quantidade da ordem.
 *
 * As regras de servidor (atomicidade, stock insuficiente, armazéns em falta, estados, permissões,
 * isolamento, modo de leitura) são provadas em `test/integration/producao-ordens-164.test.ts`.
 *
 * Dados (prefixo único `producao-ordens-164`), no tenant `demo`, por SQL: dois produtos novos
 * (acabado sem BOM — liberar não reserva nada — e material com 50 un. em `MP`), os armazéns `MP` e
 * `PA` (só se ainda não existirem) e duas ordens PLANEADA. Os números saem da série ORDEM_PRODUCAO
 * do demo, que fica avançada (nunca se inventa). Ficam no demo, como os dados do `47-…` a `52-…`.
 *
 * ESTADO ESPERADO antes da implementação: RED — o detalhe não tem os botões de transição e a rota
 * de registo de consumo não existe.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/53-producao-ordens-164.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:producao-ordens-164; um agente de implementação que o altere é
 * BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'producao-ordens-164';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_OP_CICLO = `copciclo164${SUF}`;
const ID_OP_CANC = `copcanc164${SUF}`;
const ID_PROD_PA = `cprodpa164${SUF}`;
const ID_PROD_MP = `cprodmp164${SUF}`;
const NOME_MATERIAL = `Cola ${MARCA} ${SUF}`;
const NOME_ACABADO = `Banco ${MARCA} ${SUF}`;

const numeros: Record<string, string> = {};
const locs: { mp?: string; pa?: string } = {};

const detalhe = (id: string) => `${BASE}/producao/ordens/${id}`;
const rotaConsumo = (id: string) => `/producao/ordens/${id}/registar-consumo`;
const reDetalhe = (id: string) => new RegExp(`/producao/ordens/${id}$`);

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

/** Ano civil de hoje em Africa/Maputo (a série é por ano fiscal). */
function anoMaputo(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
}

/** Próximo número da série ORDEM_PRODUCAO do demo — avança a série, como o serviço. */
async function proximoNumero(c: Client, tenantId: string): Promise<string> {
  const r = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = 'ORDEM_PRODUCAO' AND ativo = true AND ano = $2
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [tenantId, anoMaputo()],
  );
  const s = r.rows[0];
  if (!s) throw new Error('STOP: o demo não tem série ORDEM_PRODUCAO activa para o ano corrente');
  if (s.formatoNumero !== '{prefixo}/{ano}/{numero:06}') {
    throw new Error(`STOP: formato de série inesperado (${s.formatoNumero})`);
  }
  return `${s.prefixo}/${s.ano}/${String(s.numero).padStart(6, '0')}`;
}

/** Armazém `MP`/`PA` activo do demo; cria-o se não existir (o serviço exige-os por código). */
async function armazem(c: Client, tenantId: string, codigo: 'MP' | 'PA'): Promise<string> {
  const r = await c.query<{ id: string }>(
    `SELECT id FROM "Localizacao" WHERE "tenantId" = $1 AND codigo = $2 AND tipo::text = 'ARMAZEM'
       AND ativa = true AND "deletedAt" IS NULL LIMIT 1`,
    [tenantId, codigo],
  );
  if (r.rows[0]) return r.rows[0].id;
  const id = `cloc${codigo.toLowerCase()}164${SUF}`;
  await c.query(
    `INSERT INTO "Localizacao" (id, "tenantId", codigo, nome, tipo, ativa, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ARMAZEM', true, now(), now())`,
    [id, tenantId, codigo, codigo === 'MP' ? 'Armazém de matérias-primas' : 'Armazém de produto acabado'],
  );
  return id;
}

async function status(id: string): Promise<string> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string }>(`SELECT status::text FROM "OrdemProducao" WHERE id = $1`, [id]);
    return r.rows[0].status;
  });
}

async function saldo(produtoId: string, localizacaoId: string): Promise<number> {
  return withPg(async (c) => {
    const r = await c.query<{ s: string | null }>(
      `SELECT sum(saldo)::text AS s FROM "SaldoStock" WHERE "produtoId" = $1 AND "localizacaoId" = $2`,
      [produtoId, localizacaoId],
    );
    return Number(r.rows[0]?.s ?? 0);
  });
}

async function consumos(ordemId: string) {
  return withPg(async (c) => {
    const r = await c.query<{ produtoId: string; quantidadeReal: string; movimentoStockId: string | null }>(
      `SELECT "produtoId", "quantidadeReal"::text AS "quantidadeReal", "movimentoStockId"
         FROM "ConsumoProducao" WHERE "ordemProducaoId" = $1`,
      [ordemId],
    );
    return r.rows;
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** Clica no botão de transição, confirma no AlertDialog (sem campos) e espera o novo estado. */
async function transitarPelaUi(page: Page, id: string, botao: RegExp, esperado: string): Promise<void> {
  await page.getByRole('button', { name: botao }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('textbox')).toHaveCount(0);
  await dialogo.getByRole('button', { name: /^confirmar$/i }).click();
  await expect(dialogo).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => status(id), { timeout: 15_000 }).toBe(esperado);
  await expect(page).toHaveURL(reDetalhe(id));
}

const BOTOES = {
  liberar: /liberar ordem/i,
  iniciar: /iniciar produção/i,
  concluir: /concluir ordem/i,
  cancelar: /cancelar ordem/i,
};

async function semAccoes(page: Page, id: string): Promise<void> {
  for (const nome of Object.values(BOTOES)) {
    await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  }
  await expect(page.locator(`a[href="${rotaConsumo(id)}"]`)).toHaveCount(0);
}

test.describe(`Ciclo de vida da ordem de produção (#164, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
      const tenantId = t.rows[0].id;
      const u = await c.query<{ id: string }>(
        `SELECT id FROM "User" WHERE "tenantId" = $1 AND email = 'admin@demo.mz' LIMIT 1`,
        [tenantId],
      );
      if (!u.rows[0]) throw new Error('STOP: admin@demo.mz não encontrado no demo');
      const cat = await c.query<{ id: string }>(
        `SELECT id FROM "CategoriaProduto" WHERE "tenantId" = $1 ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!cat.rows[0]) throw new Error('STOP: o demo não tem categorias de produto');

      await c.query('BEGIN');
      try {
        locs.mp = await armazem(c, tenantId, 'MP');
        locs.pa = await armazem(c, tenantId, 'PA');

        for (const [id, sku, nome] of [
          [ID_PROD_PA, `PA-164-${SUF}`, NOME_ACABADO],
          [ID_PROD_MP, `MP-164-${SUF}`, NOME_MATERIAL],
        ] as const) {
          await c.query(
            `INSERT INTO "Produto" (id, "tenantId", sku, nome, "categoriaId", "unidadeMedida", "precoVenda",
               "precoCompra", "margemLucro", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, 'UN', 100, 40, 0.6, now(), now())`,
            [id, tenantId, sku, nome, cat.rows[0].id],
          );
        }
        await c.query(
          `INSERT INTO "SaldoStock" (id, "tenantId", "produtoId", "localizacaoId", saldo, "saldoReservado", "updatedAt")
           VALUES ($1, $2, $3, $4, 50, 0, now())`,
          [`csaldo164${SUF}`, tenantId, ID_PROD_MP, locs.mp],
        );

        for (const id of [ID_OP_CICLO, ID_OP_CANC]) {
          const numero = await proximoNumero(c, tenantId);
          numeros[id] = numero;
          await c.query(
            `INSERT INTO "OrdemProducao" (id, "tenantId", numero, "produtoId", "codigoProduto", "nomeProduto",
               quantidade, "unidadeMedida", status, prioridade, "dataPrevisaoInicio", "dataPrevisaoFim",
               "criadoPorId", observacoes, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, 5, 'UN', 'PLANEADA', 'MEDIA', now(),
               now() + interval '10 days', $7, $8, now(), now())`,
            [id, tenantId, numero, ID_PROD_PA, `PA-164-${SUF}`, NOME_ACABADO, u.rows[0].id, `Ordem do oráculo ${MARCA} ${SUF}`],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('PLANEADA mostra «Liberar ordem» e «Cancelar ordem», sem iniciar/concluir/consumo; liberar grava LIBERADA', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_CICLO));
    await expect(page.getByText(numeros[ID_OP_CICLO]).first()).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES.liberar })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES.cancelar })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES.iniciar })).toHaveCount(0);
    await expect(page.getByRole('button', { name: BOTOES.concluir })).toHaveCount(0);
    await expect(page.locator(`a[href="${rotaConsumo(ID_OP_CICLO)}"]`)).toHaveCount(0);

    await transitarPelaUi(page, ID_OP_CICLO, BOTOES.liberar, 'LIBERADA');
  });

  test('LIBERADA mostra «Iniciar produção»; iniciar grava EM_PRODUCAO', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_CICLO));
    await expect(page.getByRole('button', { name: BOTOES.liberar })).toHaveCount(0);
    await expect(page.getByRole('button', { name: BOTOES.cancelar })).toBeVisible();
    await transitarPelaUi(page, ID_OP_CICLO, BOTOES.iniciar, 'EM_PRODUCAO');
  });

  test('registar consumo é rota própria: sem material não grava; com material baixa o stock de MP e volta ao detalhe', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_CICLO));
    await expect(page.getByRole('button', { name: BOTOES.concluir })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES.cancelar })).toBeVisible();
    const ligacao = page.locator(`a[href="${rotaConsumo(ID_OP_CICLO)}"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/registar consumo/i);

    await ligacao.click();
    await page.waitForURL(new RegExp(`${esc(rotaConsumo(ID_OP_CICLO))}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Sem material: não grava e não sai da rota.
    await page.getByRole('button', { name: /registar consumo/i }).click();
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(new RegExp(`${esc(rotaConsumo(ID_OP_CICLO))}$`));
    expect(await consumos(ID_OP_CICLO)).toHaveLength(0);

    // Com material e quantidade: grava, baixa o stock e volta ao detalhe.
    await page.getByRole('combobox', { name: /material/i }).click();
    const popover = page.locator('[data-radix-popper-content-wrapper]').last();
    const pesquisa = popover.getByPlaceholder('Pesquisar…');
    if (await pesquisa.count()) await pesquisa.fill(NOME_MATERIAL);
    await popover.getByRole('option', { name: new RegExp(esc(NOME_MATERIAL)) }).click();
    await page.getByLabel(/quantidade/i).first().fill('3');
    await page.getByRole('button', { name: /registar consumo/i }).click();
    await page.waitForURL(reDetalhe(ID_OP_CICLO), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    const cs = await consumos(ID_OP_CICLO);
    expect(cs).toHaveLength(1);
    expect(cs[0].produtoId).toBe(ID_PROD_MP);
    expect(Number(cs[0].quantidadeReal)).toBe(3);
    expect(cs[0].movimentoStockId, 'consumo gravado sem movimento de stock').toBeTruthy();
    expect(await saldo(ID_PROD_MP, locs.mp!)).toBe(47);
    await expect(page.getByText(NOME_MATERIAL).first()).toBeVisible();
    expect(await status(ID_OP_CICLO)).toBe('EM_PRODUCAO');
  });

  test('aprovada a qualidade, «Concluir ordem» grava CONCLUIDA e dá entrada do produto acabado em PA', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_CICLO));
    // #166 — a conclusão exige a qualidade aprovada.
    await page.getByRole('button', { name: /aprovar qualidade/i }).click();
    const aprovar = page.getByRole('alertdialog');
    await aprovar.getByRole('button', { name: /^aprovar$/i }).click();
    await expect(aprovar).toHaveCount(0, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    const paAntes = await saldo(ID_PROD_PA, locs.pa!);
    await transitarPelaUi(page, ID_OP_CICLO, BOTOES.concluir, 'CONCLUIDA');
    expect(await saldo(ID_PROD_PA, locs.pa!)).toBe(paAntes + 5);
    // o consumo ad-hoc não volta a ser baixado
    expect(await saldo(ID_PROD_MP, locs.mp!)).toBe(47);

    await abrir(page, detalhe(ID_OP_CICLO));
    await semAccoes(page, ID_OP_CICLO);
  });

  test('«Cancelar ordem» numa PLANEADA pede confirmação e grava CANCELADA; depois não há acções', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_CANC));
    await expect(page.getByText(numeros[ID_OP_CANC]).first()).toBeVisible();

    // «Voltar» desiste sem gravar.
    await page.getByRole('button', { name: BOTOES.cancelar }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /^voltar$/i }).click();
    await expect(dialogo).toHaveCount(0);
    expect(await status(ID_OP_CANC)).toBe('PLANEADA');

    await transitarPelaUi(page, ID_OP_CANC, BOTOES.cancelar, 'CANCELADA');
    await abrir(page, detalhe(ID_OP_CANC));
    await semAccoes(page, ID_OP_CANC);
  });
});
