/**
 * Oráculo E2E — issue #158: ecrãs de tabelas INSS e escalões IRPS por vigência.
 *
 * ESTADO ESPERADO: RED com falhas de tipo element-not-found. A ligação
 * «Tabelas INSS/IRPS» e as rotas /rh/payroll/tabelas/** ainda não existem.
 *
 * Dados de teste: vigência Janeiro 2099 (ano seguro no futuro distante) para
 * tanto INSS como IRPS. Descrição única via Date.now() para isolar corridas.
 *
 * Higiene de dados (CLEANUP idempotente):
 *   O serviço fecha a vigência anterior em inicio−1ms.
 *   O beforeAll e o afterAll fazem:
 *     1. DELETE TabelaINSS / EscalaoIRPS WHERE vigenciaInicio >= timestamp '2099-01-01 00:00:00'
 *     2. UPDATE vigenciaFim = NULL WHERE vigenciaFim >= timestamp '2098-12-31 23:59:59.999'
 *        (>= e não = : uma corrida parcial pode ter criado vigências noutro mês de 2099,
 *        fechando as de seed em datas como 2099-08-31 23:59:59.999)
 *   Todas as comparações usam literais SQL de timestamp (nunca parâmetros Date do JS):
 *   o node-pg interpreta timestamp without time zone no fuso LOCAL do processo, e em
 *   Africa/Maputo (UTC+2) um Date('2099-01-01T00:00:00.000Z') chegaria às 02:00 — o
 *   DELETE não apagaria nada e o UPDATE não reabriria nada.
 *   Após a limpeza, o tenant demo deve ter exactamente:
 *     - 1 linha TabelaINSS com vigenciaFim NULL (a de 2018-01-01)
 *     - 5 linhas EscalaoIRPS com vigenciaFim NULL (a de 2024-01-01)
 *
 * Determinismo: sem sleeps arbitrários; usa expect com auto-retry e waitForURL.
 *
 * Correr:
 *   BASE_URL=http://localhost:3107 \
 *   npx playwright test e2e/26-payroll-tabelas.spec.ts --project=e2e
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

// ─── constantes ────────────────────────────────────────────────────────────────

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/admin.json');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const TABELAS = `${BASE}/rh/payroll/tabelas`;
const INSS_NOVA = `${BASE}/rh/payroll/tabelas/inss/nova`;
const IRPS_NOVA = `${BASE}/rh/payroll/tabelas/irps/nova`;

/** 2099-01: mês seguro para os dados de teste — nunca colide com produção. */
const ANO_TESTE = 2099;
const MES_LABEL = 'Janeiro';

// ─── pg helpers ────────────────────────────────────────────────────────────────

function dbUrl(): string {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // já carregado ou ficheiro não encontrado — usa o que estiver em process.env
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

async function obterTenantId(c: Client): Promise<string> {
  const r = await c.query<{ id: string }>(
    `SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`,
  );
  if (!r.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  return r.rows[0].id;
}

/**
 * Remove linhas de teste (vigência ≥ 2099-01-01) e repõe o vigenciaFim da
 * vigência anterior que o serviço terá fechado em timestamp '2098-12-31 23:59:59.999'.
 * Idempotente: não falha se já não houver linhas.
 *
 * IMPORTANTE: usa literais SQL de timestamp em vez de parâmetros Date do JS.
 * O node-pg interpreta colunas `timestamp without time zone` no fuso LOCAL do
 * processo; num servidor Africa/Maputo (UTC+2) um JS Date('2099-01-01T00:00:00.000Z')
 * chegaria às 02:00:00 e o DELETE/UPDATE falharia silenciosamente.
 */
async function limparDadosTeste(c: Client, tenantId: string): Promise<void> {
  await c.query(
    `DELETE FROM "TabelaINSS"
     WHERE "tenantId" = $1 AND "vigenciaInicio" >= timestamp '2099-01-01 00:00:00'`,
    [tenantId],
  );
  await c.query(
    `DELETE FROM "EscalaoIRPS"
     WHERE "tenantId" = $1 AND "vigenciaInicio" >= timestamp '2099-01-01 00:00:00'`,
    [tenantId],
  );
  // Reabre qualquer vigência que um teste de 2099 tenha fechado.
  // O serviço persiste vigenciaFim = vigenciaInicio_nova − 1ms; como os testes
  // usam Janeiro 2099 (2098-12-31 23:59:59.999) mas uma corrida parcial pode
  // ter usado outro mês (ex.: Setembro 2099 → fechou em 2099-08-31 23:59:59.999),
  // usa-se >= para apanhar qualquer fecho causado por uma vigência de 2099.
  // O DELETE acima já removeu as linhas com vigenciaInicio >= 2099-01-01, por
  // isso as únicas linhas com vigenciaFim >= 2098-12-31… são as pré-existentes
  // (seed) que ficaram fechadas por acidente.
  await c.query(
    `UPDATE "TabelaINSS" SET "vigenciaFim" = NULL
     WHERE "tenantId" = $1 AND "vigenciaFim" >= timestamp '2098-12-31 23:59:59.999'`,
    [tenantId],
  );
  await c.query(
    `UPDATE "EscalaoIRPS" SET "vigenciaFim" = NULL
     WHERE "tenantId" = $1 AND "vigenciaFim" >= timestamp '2098-12-31 23:59:59.999'`,
    [tenantId],
  );
}

async function contarVigenteINSS(c: Client, tenantId: string): Promise<number> {
  const r = await c.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM "TabelaINSS"
     WHERE "tenantId" = $1 AND "vigenciaFim" IS NULL`,
    [tenantId],
  );
  return Number(r.rows[0].n);
}

async function contarVigenteIRPS(c: Client, tenantId: string): Promise<number> {
  const r = await c.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM "EscalaoIRPS"
     WHERE "tenantId" = $1 AND "vigenciaFim" IS NULL`,
    [tenantId],
  );
  return Number(r.rows[0].n);
}

// ─── helper de formulário ──────────────────────────────────────────────────────

/**
 * Preenche um campo de selecção nativo (<select>) ou Radix (<button role="combobox">).
 * Mesmo padrão de escolherOpcao em e2e/25.
 */
async function escolherOpcao(
  page: import('@playwright/test').Page,
  label: string,
  visibleText: string,
): Promise<void> {
  const campo = page.getByLabel(label, { exact: true });
  await expect(campo).toBeVisible({ timeout: 10_000 });
  const tag = await campo.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    await campo.selectOption({ label: visibleText });
  } else {
    await campo.click();
    await page
      .getByRole('option', { name: visibleText })
      .or(page.getByRole('listitem').filter({ hasText: visibleText }))
      .first()
      .click();
  }
}

// ─── estado partilhado entre testes ───────────────────────────────────────────

let tenantId: string;
let descricaoINSS: string;
let descricaoIRPS: string;

// ─── suite (serial) ────────────────────────────────────────────────────────────

test.describe('/rh/payroll — tabelas INSS/IRPS por vigência (#158)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    // Resolves tenantId e limpa resíduos de corridas anteriores
    await withPg(async (c) => {
      tenantId = await obterTenantId(c);
      await limparDadosTeste(c, tenantId);

      // Verificação pós-limpeza: base deve estar no estado de seed
      const nInss = await contarVigenteINSS(c, tenantId);
      const nIrps = await contarVigenteIRPS(c, tenantId);
      if (nInss !== 1)
        throw new Error(
          `STOP: após limpeza, INSS tem ${nInss} linhas vigentes (esperava 1). ` +
          'A base pode ter resíduos de outra corrida. Corre pnpm db:seed.',
        );
      if (nIrps !== 5)
        throw new Error(
          `STOP: após limpeza, IRPS tem ${nIrps} linhas vigentes (esperava 5). ` +
          'A base pode ter resíduos de outra corrida. Corre pnpm db:seed.',
        );
    });

    // Descricões únicas por corrida
    const ts = Date.now();
    descricaoINSS = `E2E #158 INSS ${ts}`;
    descricaoIRPS = `E2E #158 IRPS ${ts}`;

    // Garante sessão fresca (o storageState do projecto e2e já o faz, mas o
    // beforeAll usa um contexto próprio — precisamos de confirmar que o admin
    // consegue navegar para /rh/payroll antes dos testes).
    const ctx = await browser.newContext({ storageState: AUTH_FILE, baseURL: BASE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/rh/payroll`);
      await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    } finally {
      await ctx.close();
    }
  });

  test.afterAll(async () => {
    await withPg(async (c) => {
      await limparDadosTeste(c, tenantId);

      // Evidência de limpeza final (verificada nos artefactos do relatório)
      const nInss = await contarVigenteINSS(c, tenantId);
      const nIrps = await contarVigenteIRPS(c, tenantId);
      // Não lança — o afterAll não pode falhar o relatório, mas os valores
      // ficam nos logs do reporter.
      console.log(
        `[cleanup] TabelaINSS vigentes: ${nInss} (esperado: 1) | ` +
        `EscalaoIRPS vigentes: ${nIrps} (esperado: 5)`,
      );
    });
  });

  // ── AC1: link «Tabelas INSS/IRPS» em /rh/payroll ─────────────────────────────

  test('AC1 — /rh/payroll tem link «Tabelas INSS/IRPS» → /rh/payroll/tabelas', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto(`${BASE}/rh/payroll`);

    // ORACLE RED: o link não existe na UI actual.
    const link = page.getByRole('link', { name: 'Tabelas INSS/IRPS', exact: true });
    await expect(link).toBeVisible({ timeout: 20_000 });
    await expect(link).toHaveAttribute('href', /\/rh\/payroll\/tabelas/);

    await link.click();
    await page.waitForURL(/\/rh\/payroll\/tabelas$/, { timeout: 20_000 });

    // Headings e secções
    await expect(page.getByRole('heading', { name: 'INSS', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { name: 'IRPS', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('#main-content')).toContainText('Em vigor');

    // Links para criar novas vigências
    await expect(
      page.getByRole('link', { name: 'Nova vigência INSS', exact: true }),
    ).toHaveAttribute('href', /\/rh\/payroll\/tabelas\/inss\/nova/);
    await expect(
      page.getByRole('link', { name: 'Nova vigência IRPS', exact: true }),
    ).toHaveAttribute('href', /\/rh\/payroll\/tabelas\/irps\/nova/);
  });

  // ── AC2: formulário INSS — pré-preenchido, nova vigência, verificação BD ──────

  test('AC2 — INSS: pré-preenchido; guardar Janeiro 2099; lista actualizada; BD correcta', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(INSS_NOVA);
    // Aguarda hidratação completa antes de ler/escrever campos; sem networkidle
    // o react-hook-form pode repor o defaultValue após o fill (regra da casa).
    await page.waitForLoadState('networkidle');

    // ORACLE RED: a rota não existe → esta asserção falha.
    await expect(page.getByLabel('Mês', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Ano', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByLabel('Taxa do trabalhador (%)', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByLabel('Taxa da entidade (%)', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByLabel('Teto de incidência', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Descrição', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('button', { name: 'Guardar vigência', exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // D4: formulário pré-preenchido com as taxas vigentes (3% trabalhador, 4% entidade)
    const campTrab = page.getByLabel('Taxa do trabalhador (%)', { exact: true });
    await expect(campTrab).toHaveValue(/^3(\.0+)?$/);
    const campEnt = page.getByLabel('Taxa da entidade (%)', { exact: true });
    await expect(campEnt).toHaveValue(/^4(\.0+)?$/);

    // Preenche nova vigência: Janeiro 2099, trabalhador 3.5
    await escolherOpcao(page, 'Mês', MES_LABEL);
    await page.getByLabel('Ano', { exact: true }).fill(String(ANO_TESTE));
    await campTrab.fill('3.5');
    await page.getByLabel('Descrição', { exact: true }).fill(descricaoINSS);

    await page.getByRole('button', { name: 'Guardar vigência', exact: true }).click();

    // Redirige para a lista
    await page.waitForURL(/\/rh\/payroll\/tabelas$/, { timeout: 30_000 });

    // Nova linha «Em vigor» com 3,5 % (vírgula ou ponto — tolerante)
    await expect(page.locator('#main-content')).toContainText(/3[,.]5\s*%/, { timeout: 15_000 });

    // A vigência de 2018 já não está «Em vigor» — deve ter data de fim
    const secaoINSS = page.locator('section', { hasText: 'INSS' }).first();
    const linhas2018 = secaoINSS.locator('tr', { hasText: '2018' });
    await expect(linhas2018.first()).not.toContainText('Em vigor', { timeout: 10_000 });

    // AC2 tightened (G5): Fim deve ser «31/12/2098» — vigência UTC-ancorada.
    // O serviço persiste vigenciaFim = 2098-12-31T23:59:59.999Z; em Africa/Maputo
    // (UTC+2) isso é 01/01/2099 às 01:59 — um formatarData mal-corrigido mostraria
    // «01/01/2099». O oráculo exige o valor correcto: «31/12/2098».
    await expect(linhas2018.first()).toContainText('31/12/2098', { timeout: 10_000 });

    // Verificação BD: vigenciaInicio exacta e taxaTrabalhador em fracção.
    // Usa to_char para obter texto canónico: evita que node-pg interprete
    // timestamp without time zone no fuso local (UTC+2 em Africa/Maputo
    // poria a data como '2099-01-01T22:00:00.000Z' ao chamar toISOString()).
    await withPg(async (c) => {
      const r = await c.query<{ vi_text: string; taxa: string }>(
        `SELECT to_char("vigenciaInicio", 'YYYY-MM-DD HH24:MI:SS.MS') AS vi_text,
                "taxaTrabalhador"::text AS taxa
         FROM "TabelaINSS"
         WHERE "tenantId" = $1 AND "vigenciaFim" IS NULL
         LIMIT 1`,
        [tenantId],
      );
      expect(r.rows[0], 'linha INSS vigente não encontrada').toBeTruthy();
      expect(r.rows[0].vi_text).toBe('2099-01-01 00:00:00.000');
      expect(parseFloat(r.rows[0].taxa)).toBeCloseTo(0.035, 6);
    });
  });

  // ── AC3: formulário IRPS — pré-preenchido; guardar; 5 escalões na BD ──────────

  test('AC3 — IRPS: pré-preenchido (5 escalões); guardar Janeiro 2099; lista e BD correctas', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(IRPS_NOVA);
    await page.waitForLoadState('networkidle');

    // ORACLE RED: a rota não existe → esta asserção falha.
    await expect(page.getByLabel('Mês', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Ano', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Descrição', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('button', { name: 'Adicionar escalão', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'Guardar vigência', exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // D4: 5 linhas de escalão pré-preenchidas (uma por vigência 2024-01-01)
    const linhasEscalao = page.locator('[data-escalao-linha]').or(
      page.locator('fieldset[data-escalao]'),
    );
    await expect(linhasEscalao).toHaveCount(5, { timeout: 10_000 });

    // Preenche vigência Janeiro 2099; escalões ficam como estão (D3: só tabela geral)
    await escolherOpcao(page, 'Mês', MES_LABEL);
    await page.getByLabel('Ano', { exact: true }).fill(String(ANO_TESTE));
    await page.getByLabel('Descrição', { exact: true }).fill(descricaoIRPS);

    await page.getByRole('button', { name: 'Guardar vigência', exact: true }).click();

    // Redirige para a lista
    await page.waitForURL(/\/rh\/payroll\/tabelas$/, { timeout: 30_000 });

    // Novo grupo IRPS «Em vigor» com 5 linhas de escalão
    const secaoIRPS = page.locator('section', { hasText: 'IRPS' }).first();
    await expect(secaoIRPS).toContainText('Em vigor', { timeout: 15_000 });
    // 5 linhas de escalão sob o grupo «Em vigor».
    // Contrato de dados-atributo: o implementador deve marcar cada linha de
    // escalão vigente com data-vigente (ex.: <tr data-vigente>). O selector
    // tr[data-vigente] conta apenas linhas de dados; não inclui cabeçalhos.
    const linhasGrupoVigente = secaoIRPS.locator('tr[data-vigente]');
    await expect(linhasGrupoVigente).toHaveCount(5, { timeout: 10_000 });

    // Verificação BD: usa literal timestamp para comparar vigenciaInicio.
    await withPg(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM "EscalaoIRPS"
         WHERE "tenantId" = $1
           AND "vigenciaInicio" = timestamp '2099-01-01 00:00:00'
           AND "vigenciaFim" IS NULL`,
        [tenantId],
      );
      expect(Number(r.rows[0].n), '5 escalões IRPS esperados para 2099-01').toBe(5);
    });
  });

  // ── AC4: duplicar vigência INSS → erro inline; URL mantém-se ─────────────────

  test('AC4 — INSS Janeiro 2099 duplicado: role=alert visível; URL mantém-se em /inss/nova', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Após AC2, a vigência actual do INSS é 2099-01; tentar criar a mesma deve falhar.
    await page.goto(INSS_NOVA);
    await page.waitForLoadState('networkidle');

    // ORACLE RED: a rota não existe → falha aqui.
    await expect(page.getByLabel('Mês', { exact: true })).toBeVisible({ timeout: 20_000 });

    await escolherOpcao(page, 'Mês', MES_LABEL);
    await page.getByLabel('Ano', { exact: true }).fill(String(ANO_TESTE));
    await page.getByRole('button', { name: 'Guardar vigência', exact: true }).click();

    // Erro de negócio visível (VIGENCIA_INVALIDA) como role=alert dentro de #main-content
    const erroLocator = page.locator('#main-content').getByRole('alert');
    await expect(erroLocator.first()).toBeVisible({ timeout: 15_000 });
    await expect(erroLocator.first()).not.toBeEmpty();

    // URL mantém-se na página de criação
    expect(new URL(page.url()).pathname).toMatch(/\/rh\/payroll\/tabelas\/inss\/nova$/);
  });

  // ── AC4b: IRPS com escalões inválidos → erro inline; nada criado ──────────────

  test('AC4b — IRPS escalões inválidos (Até < De): erro visível; URL mantém-se; BD intacta', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto(IRPS_NOVA);
    // networkidle obrigatório: sem ele, o fill corre antes da hidratação do
    // useFieldArray e o register ref-callback repõe o defaultValue (3500),
    // submetendo uma tabela válida em vez de inválida.
    await page.waitForLoadState('networkidle');

    // Aguarda o formulário pré-preenchido com todos os escalões
    const primeiraLinha = page.locator('[data-escalao-linha]').first();
    await expect(primeiraLinha).toBeVisible({ timeout: 20_000 });

    // Corrompe escalão 2: «Até» = 1000 < «De» (3500) → validação cliente falha.
    // O input usa aria-label="Escalão 2 limite superior" (ver irps-nova-form.tsx).
    const ateEscalao2 = page.getByLabel('Escalão 2 limite superior', { exact: true });
    await expect(ateEscalao2).toBeVisible({ timeout: 10_000 });
    await ateEscalao2.fill('1000');
    // Garante que o valor ficou escrito APÓS a hidratação — se o RHF resetar, o
    // teste falha aqui (clara indicação de timing) em vez de no submit.
    await expect(ateEscalao2).toHaveValue('1000');

    await escolherOpcao(page, 'Mês', 'Fevereiro');
    await page.getByLabel('Ano', { exact: true }).fill(String(ANO_TESTE));

    await page.getByRole('button', { name: 'Guardar vigência', exact: true }).click();

    // A validação dos escalões pode ocorrer no cliente (superRefine do RHF,
    // mensagem «maior que De») ou no servidor (refine do Zod, role=alert).
    // Aceita ambos.
    const erroLocator = page.locator('#main-content').getByRole('alert').or(
      page.locator('#main-content').getByText(/maior que De|Escalões inválidos/i),
    );
    await expect(erroLocator.first()).toBeVisible({ timeout: 15_000 });
    await expect(erroLocator.first()).toContainText(/maior que De|Escalões inválidos/i);

    // URL mantém-se em /irps/nova
    expect(new URL(page.url()).pathname).toMatch(/\/rh\/payroll\/tabelas\/irps\/nova$/);

    // pg: nenhum escalão com vigenciaInicio 2099-02-01 (a action foi rejeitada)
    await withPg(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM "EscalaoIRPS"
         WHERE "tenantId" = $1
           AND "vigenciaInicio" = timestamp '2099-02-01 00:00:00'`,
        [tenantId],
      );
      expect(Number(r.rows[0].n), 'zero escalões IRPS esperados para 2099-02').toBe(0);
    });
  });
});
