/**
 * E2E — issue #526 (nó C:gestao-planos, ADR-0049): o administrador de plataforma gere o catálogo
 * em `/plataforma/planos` (ORÁCULO, escrito pelo verificador — alterá-lo do lado de quem implementa
 * é BLOCKER).
 *
 * Contra um Keycloak REAL (`plataforma@gespro.mz`, papel `plataforma-admin`, sem `User` de tenant).
 *
 * Fluxo: criar GESTAO_PLANOS_E2E_<sufixo> → editar (acrescentar funcionalidade, subir o limite de
 * utilizadores) → aparece em GET /api/publico/planos com a funcionalidade e o limite novo →
 * arquivar → desaparece do catálogo público → apagar → some da lista.
 *
 * Contrato de UI que este E2E fixa (pt-PT):
 *   - menu da área com a ligação «Planos» → `/plataforma/planos`;
 *   - lista com ligação/botão «Novo plano» → `/plataforma/planos/novo`;
 *   - formulário com rótulos acessíveis: «Código» (só em novo), «Nome», «Descrição»,
 *     «Preço mensal (USD)», «Preço anual (USD)», «Price ID mensal», «Price ID anual»,
 *     «Limite de utilizadores», «Limite de armazéns», «Suporte», «Ordem»; cada funcionalidade é
 *     um campo com rótulo «Funcionalidade N» e há um botão «Acrescentar funcionalidade»;
 *     submeter com «Criar plano» / «Guardar alterações»;
 *   - na lista, o código do plano é (ou está numa linha que é) uma ligação para o detalhe
 *     `/plataforma/planos/<id>`; o detalhe tem «Editar», «Arquivar» e «Apagar», com
 *     confirmação num AlertDialog (botão de confirmação com o mesmo verbo).
 *
 * Deixa nada: o `afterAll` apaga o plano (e as linhas de trilho dele) se o fluxo parar a meio.
 * Prefixo único: gestao-planos.
 */
import { test, expect, type Page } from '@playwright/test';
import { preencherLogin } from './helpers/auth';
import { comBaseDados } from './helpers/db';

const PLATAFORMA = { email: 'plataforma@gespro.mz', password: 'demo1234' };
const SUFIXO = `${Date.now()}`.slice(-8);
const CODIGO = `GESTAO_PLANOS_E2E_${SUFIXO}`;
const NOME = `Plano E2E ${SUFIXO}`;
const FUNC_NOVA = `Funcionalidade E2E ${SUFIXO}`;

async function catalogoPublico(page: Page): Promise<Array<Record<string, any>>> {
  const r = await page.request.get('/api/publico/planos', { headers: { 'Cache-Control': 'no-cache' } });
  expect(r.status()).toBe(200);
  const corpo = await r.json();
  return corpo.data.planos as Array<Record<string, any>>;
}

async function abrirDetalhe(page: Page): Promise<void> {
  await page.goto('/plataforma/planos');
  await page.waitForLoadState('networkidle');
  const linha = page.getByRole('row', { name: new RegExp(CODIGO) });
  await expect(linha).toBeVisible();
  const ligacao = linha.getByRole('link').first();
  if (await ligacao.count()) await ligacao.click();
  else await linha.click();
  await page.waitForURL(/\/plataforma\/planos\/(?!novo)[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function confirmar(page: Page, verbo: RegExp): Promise<void> {
  await page.getByRole('button', { name: verbo }).first().click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: verbo }).click();
  await expect(dialogo).toBeHidden({ timeout: 15_000 });
}

test.describe('gestao-planos — catálogo gerido em /plataforma/planos', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    await comBaseDados(async (c) => {
      await c.query(`DELETE FROM "Plano" WHERE codigo = $1`, [CODIGO]);
      try {
        await c.query(`DELETE FROM "AuditoriaPlataforma" WHERE codigo = $1`, [CODIGO]);
      } catch {
        // tabela ausente (fase vermelha) ou trilho só de acrescento — não é deste teste
      }
    });
  });

  test('gestao-planos: criar → editar → catálogo público → arquivar → apagar', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/auth/login');
    await preencherLogin(page, PLATAFORMA);
    await page.waitForURL(/\/plataforma(\/|\?|$)/, { timeout: 60_000 });

    // ── menu «Planos» → lista ────────────────────────────────────────────────
    await page.getByRole('navigation', { name: /plataforma/i }).getByRole('link', { name: /^planos$/i }).click();
    await page.waitForURL(/\/plataforma\/planos$/, { timeout: 30_000 });
    await expect(page.getByRole('row', { name: /BASICO/ })).toBeVisible();

    // ── criar ────────────────────────────────────────────────────────────────
    await page.getByRole('link', { name: /novo plano/i }).or(page.getByRole('button', { name: /novo plano/i })).first().click();
    await page.waitForURL(/\/plataforma\/planos\/novo$/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/^código/i).fill(CODIGO);
    await page.getByLabel(/^nome/i).fill(NOME);
    await page.getByLabel(/^descrição/i).fill('Plano criado pelo E2E da gestão de planos.');
    await page.getByLabel(/^preço mensal/i).fill('9.90');
    await page.getByLabel(/^preço anual/i).fill('99.00');
    await page.getByLabel(/^limite de utilizadores/i).fill('2');
    await page.getByLabel(/^limite de armazéns/i).fill('-1');
    await page.getByLabel(/^suporte/i).fill('Email (72h)');
    await page.getByLabel(/^ordem/i).fill('900');
    await page.getByRole('button', { name: /acrescentar funcionalidade/i }).click();
    await page.getByRole('textbox', { name: /^funcionalidade \d+$/i }).last().fill('Facturação');
    await page.getByRole('button', { name: /^criar plano$/i }).click();

    await page.waitForURL((u) => /\/plataforma\/planos(\/[^/]+)?$/.test(u.pathname) && !u.pathname.endsWith('/novo'), {
      timeout: 30_000,
    });
    await expect
      .poll(async () => (await catalogoPublico(page)).some((p) => p.id === CODIGO), { timeout: 15_000 })
      .toBe(true);

    // ── editar: acrescentar funcionalidade e subir o limite de utilizadores ──
    await abrirDetalhe(page);
    await page.getByRole('link', { name: /^editar/i }).or(page.getByRole('button', { name: /^editar/i })).first().click();
    await page.waitForURL(/\/plataforma\/planos\/[^/]+\/editar$/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // O código não é editável.
    await expect(page.getByRole('textbox', { name: /^código/i })).toHaveCount(0);
    await expect(page.getByLabel(/^nome/i)).toHaveValue(NOME);
    // O formulário diz quantas assinaturas estão no plano.
    await expect(page.getByText(/assinatura/i).first()).toBeVisible();

    await page.getByLabel(/^limite de utilizadores/i).fill('25');
    await page.getByRole('button', { name: /acrescentar funcionalidade/i }).click();
    await page.getByRole('textbox', { name: /^funcionalidade \d+$/i }).last().fill(FUNC_NOVA);
    await page.getByRole('button', { name: /^guardar/i }).click();
    await page.waitForURL((u) => !u.pathname.endsWith('/editar'), { timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const p = (await catalogoPublico(page)).find((x) => x.id === CODIGO);
          return p ? { funcs: p.funcionalidades, utilizadores: p.limites?.utilizadores } : null;
        },
        { timeout: 15_000 },
      )
      .toEqual({ funcs: ['Facturação', FUNC_NOVA], utilizadores: 25 });

    // ── arquivar → sai do catálogo público ───────────────────────────────────
    await abrirDetalhe(page);
    await confirmar(page, /^arquivar/i);
    await expect(page.getByText(/arquivado/i).first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await catalogoPublico(page)).some((p) => p.id === CODIGO), { timeout: 15_000 })
      .toBe(false);

    await page.goto('/plataforma/planos');
    await page.waitForLoadState('networkidle');
    const linhaArquivada = page.getByRole('row', { name: new RegExp(CODIGO) });
    await expect(linhaArquivada).toBeVisible();
    await expect(linhaArquivada.getByText(/arquivado/i)).toBeVisible();

    // ── apagar → some da lista ───────────────────────────────────────────────
    await abrirDetalhe(page);
    await confirmar(page, /^apagar/i);
    await page.waitForURL(/\/plataforma\/planos$/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('row', { name: new RegExp(CODIGO) })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /BASICO/ })).toBeVisible();

    const resto = await comBaseDados((c) => c.query(`SELECT 1 FROM "Plano" WHERE codigo = $1`, [CODIGO]));
    expect(resto.rowCount).toBe(0);
  });

  test('gestao-planos: administrador de tenant não chega a /plataforma/planos (404)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    const resp = await page.goto('/plataforma/planos');
    expect(resp?.status()).toBe(404);
    await ctx.close();
  });
});
