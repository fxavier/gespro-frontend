/**
 * E2E — ciclo de fim de exercício COMPLETO pela UI (issue #366 parte B; nó P6-v, oráculo).
 *
 * Cobre a UI das #138 / #363 / #364 / #365 que não tinha E2E de sucesso: encerrar provisoriamente,
 * arquivo dos PDF do encerramento, abertura gerada no exercício seguinte (balanço), aplicar e anular
 * a aplicação do resultado, reabrir, voltar a encerrar e encerrar em definitivo.
 *
 * ISOLAMENTO: cada corrida regista um tenant NOVO por `/registo` (ADR-0031) e é o ADMIN dele. O
 * `demo` partilhado nunca é tocado. O registo público tem limite de 3/h por IP e por e-mail
 * (`registoLimiter`, memória por processo com `RATE_LIMIT_DRIVER=memory`) e NÃO há bandeira de
 * dev/teste que o desligue: este spec corre no máximo três vezes por hora contra o mesmo servidor.
 * O captcha: sem `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, o formulário submete a sentinela e o servidor,
 * com `CAPTCHA_PROVIDER` por omissão (`none`), aceita-a.
 *
 * ESCRITA DIRECTA NA BASE — este é o primeiro E2E que ESCREVE por SQL (os outros só lêem). Faz uma
 * única coisa: marca `FECHADO` os doze períodos mensais do exercício 2020 do tenant acabado de
 * registar. Porquê: fechar pela UI exige apurar o IVA e fechar mês a mês (12 × 2 rotas) — o caminho
 * lento, e já coberto por outros testes —, enquanto o que aqui se prova é o ciclo do EXERCÍCIO. O
 * UPDATE está preso ao `tenantId` do utilizador registado nesta corrida (pelo e-mail, único) e ao
 * exercício `2020` desse tenant, e afirma que tocou exactamente 12 linhas.
 *
 * Dados: dois lançamentos em 2020 — D 111 / C 711 1 000,00 e D 622 / C 111 300,00 — e estimativa do
 * imposto 100,00. Resultado antes de imposto 700,00, resultado líquido 600,00. A abertura de 2021
 * fica com Caixa 700,00 (activo), 4411 100,00 (passivo) e 88 600,00 (capital próprio).
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

test.use({ storageState: { cookies: [], origins: [] } });

const LISTA = '/contabilidade/exercicios';
const MAIN = '#main-content';

// ─── dados únicos por corrida ────────────────────────────────────────────────

const STAMP = `${Date.now()}`;
const EMPRESA = `Ciclo E2E 366 ${STAMP}`;
const EMAIL = `e2e366.${STAMP}@exemplo.mz`;
const SENHA = 'Ciclo-366-Segura!';
// NUIT: 9 dígitos, nunca todos iguais.
const NUIT = `4${STAMP.slice(-8)}`;

// ─── utilitários ─────────────────────────────────────────────────────────────

function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado — usa o que estiver em process.env
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

/**
 * Fecha os 12 períodos mensais do exercício 2020 do tenant do utilizador `email` — e só desse.
 * Devolve o número de linhas tocadas (tem de ser 12).
 */
async function fecharMesesDe2020(email: string): Promise<number> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    const r = await c.query(
      `UPDATE "PeriodoContabil" p
          SET estado = 'FECHADO', "fechadoEm" = now(), "fechadoPorId" = u.id, "updatedAt" = now()
         FROM "User" u, "ExercicioContabil" e
        WHERE u.email = $1
          AND p."tenantId" = u."tenantId"
          AND e."tenantId" = u."tenantId"
          AND e.id = p."exercicioId"
          AND e.codigo = '2020'
          AND p.ordem BETWEEN 1 AND 12`,
      [email],
    );
    return r.rowCount ?? 0;
  } finally {
    await c.end();
  }
}

/** O cartão do exercício `codigo` na lista. */
function cartao(page: Page, codigo: string): Locator {
  return page
    .locator(`${MAIN} div.rounded-lg.border.bg-card`)
    .filter({ has: page.getByRole('heading', { name: `Exercício ${codigo}`, exact: true }) });
}

async function abrirLista(page: Page, codigo = '2020') {
  await page.goto(LISTA);
  await expect(page.getByRole('heading', { name: `Exercício ${codigo}`, exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle');
}

/** Segue uma ligação do cartão de 2020 e espera pela rota dedicada. */
async function seguirLigacao(page: Page, nome: string, rota: RegExp) {
  await abrirLista(page);
  const link = cartao(page, '2020').getByRole('link', { name: nome, exact: true });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.click();
  await page.waitForURL(rota, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Um campo de formulário pelo rótulo, só entre os VISÍVEIS. Numa corrida em `pnpm dev` a página
 * de aplicar o resultado mostrou uma segunda instância do formulário, escondida (ids `_r_…` gerados
 * no cliente). A causa não está confirmada — a hipótese é a cache de segmentos do router do Next em
 * dev; o `page.tsx` só renderiza um formulário. O `getByLabel`, ao contrário do `getByRole`, não
 * ignora elementos escondidos, daí o filtro.
 */
function campo(page: Page, rotulo: string): Locator {
  return page.getByLabel(rotulo).filter({ visible: true });
}

/** Depois de uma acção com sucesso: toast e regresso à lista. */
async function esperarSucesso(page: Page, toast: RegExp) {
  await expect(page.getByText(toast).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForURL(new RegExp(`${LISTA}$`), { timeout: 60_000 });
}

async function escolherNoPopover(page: Page, caixa: Locator, pesquisa: string, opcao: RegExp) {
  await caixa.click();
  const input = page.locator('[data-radix-popper-content-wrapper]').last().getByPlaceholder('Pesquisar…');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(pesquisa);
  const op = page.getByRole('option', { name: opcao });
  await expect(op.first()).toBeVisible({ timeout: 20_000 });
  await op.first().click();
  await expect(caixa).toHaveText(opcao, { timeout: 10_000 });
}

/** Cria um lançamento em rascunho pela UI e confirma-o (RASCUNHO → LANÇADO). */
async function lancarEConfirmar(
  page: Page,
  dia: string,
  debito: { codigo: string; nome: RegExp },
  credito: { codigo: string; nome: RegExp },
  valor: string,
  rotulo: string,
) {
  const historico = `${rotulo} — E2E #366 ${STAMP}`;
  await page.goto('/contabilidade/lancamentos/novo');
  await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle');

  await page.locator(`${MAIN} input[type="date"]`).first().fill(dia);
  await escolherNoPopover(page, page.getByRole('combobox', { name: /Diário/ }), 'Outros', /Outros/);
  await page.getByPlaceholder('Descrição do lançamento').fill(historico);
  const contas = page.getByRole('combobox', { name: 'Conta' });
  await escolherNoPopover(page, contas.nth(0), debito.codigo, debito.nome);
  await escolherNoPopover(page, contas.nth(1), credito.codigo, credito.nome);
  await page.getByPlaceholder('0.00').nth(0).fill(valor);
  await page.getByPlaceholder('0.00').nth(1).fill(valor);

  await page.getByRole('button', { name: 'Guardar Lançamento' }).click();
  await page.waitForURL(/\/contabilidade\/lancamentos$/, { timeout: 60_000 });

  await page.goto('/contabilidade/lancamentos?status=RASCUNHO');
  const linha = page.locator('tbody tr', { hasText: historico });
  await expect(linha).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await linha.click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.locator(MAIN).getByText('Lançado', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
}

/** axe WCAG 2.1 AA; falha em violações `critical`/`serious` (a regra do `a11y.a11y.ts`). */
async function checkA11y(page: Page, contexto: string) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('[data-radix-popper-content-wrapper]')
    .analyze();
  const bloqueantes = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    bloqueantes.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nós)`),
    `A11y BLOCKER em "${contexto}"`,
  ).toEqual([]);
}

/**
 * A secção de uma massa do balanço, pelo título (`<h2>`). Não pelo papel `region`: o nome
 * acessível é afirmado à parte (`expect.soft` no passo 7), para um defeito de acessibilidade não
 * esconder os valores do resto do ciclo.
 */
function massaBalanco(page: Page, massa: string): Locator {
  return page
    .locator(`${MAIN} section`)
    .filter({ has: page.getByRole('heading', { level: 2, name: massa, exact: true }) });
}

/** A linha de uma massa do balanço pelo código da conta de razão. */
function linhaBalanco(page: Page, massa: string, codigo: string): Locator {
  return massaBalanco(page, massa)
    .locator('tr')
    .filter({ has: page.getByRole('cell', { name: codigo, exact: true }) });
}

function totalBalanco(page: Page, massa: string): Locator {
  return massaBalanco(page, massa).locator('tr').filter({ hasText: `Total — ${massa}` });
}

// ─── o ciclo ─────────────────────────────────────────────────────────────────

test.describe('ciclo de fim de exercício completo num tenant novo (#366)', () => {
  test('registo → lançamentos → encerrar → arquivo → abertura → aplicar/anular → reabrir → definitivo', async ({
    page,
  }) => {
    test.setTimeout(20 * 60_000);

    await test.step('1. registo de um tenant novo → sessão do admin', async () => {
      await page.goto('/registo?plano=PROFISSIONAL');
      await expect(page.locator('[name="empresa.nome"]')).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState('networkidle');

      await page.locator('[name="empresa.nome"]').fill(EMPRESA);
      await page.locator('[name="empresa.nuit"]').fill(NUIT);
      await escolherNoPopover(page, page.getByRole('combobox', { name: 'Província' }), 'Maputo', /Maputo/);
      await page.locator('[name="admin.nome"]').fill('Admin Ciclo E2E');
      await page.locator('[name="admin.email"]').fill(EMAIL);
      await page.locator('[name="senha"]').fill(SENHA);
      await page.locator('[name="confirmacao"]').fill(SENHA);
      await page.getByRole('button', { name: 'Criar conta e entrar' }).click();

      // Ou entra (o `#main-content` só existe nos layouts autenticados), ou o formulário recusa.
      // Só o alerta do formulário: o anunciador de rotas do Next também é `role=alert` (vazio).
      const recusa = page.locator('form [role=alert]');
      await expect(recusa.or(page.locator(MAIN)).first()).toBeVisible({ timeout: 120_000 });
      const motivo = (await recusa.count()) > 0 ? await recusa.first().innerText() : '';
      expect(
        motivo,
        /Demasiados pedidos/.test(motivo)
          ? 'registo recusado pelo limite de 3/h por IP (registoLimiter) — volte a correr depois de a janela passar'
          : 'o registo foi recusado',
      ).toBe('');
      await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
    });

    await test.step('2. abrir os exercícios 2020 e 2021', async () => {
      for (const ano of ['2020', '2021']) {
        await page.goto(`${LISTA}/novo`);
        await expect(campo(page, 'Ano')).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState('networkidle');
        await campo(page, 'Ano').fill(ano);
        await page.getByRole('button', { name: 'Abrir exercício' }).click();
        await expect(page.getByText(new RegExp(`Exercício ${ano} aberto`)).first()).toBeVisible({
          timeout: 60_000,
        });
        await page.waitForURL(new RegExp(`${LISTA}$`), { timeout: 60_000 });
      }
      await abrirLista(page);
      await expect(cartao(page, '2020')).toHaveCount(1);
      await expect(cartao(page, '2021')).toHaveCount(1);
    });

    await test.step('3. dois lançamentos em 2020, confirmados', async () => {
      await lancarEConfirmar(
        page,
        '2020-03-15',
        { codigo: '111', nome: /^111 — Caixa/ },
        { codigo: '711', nome: /^711 — Mercadorias/ },
        '1000',
        'Venda a dinheiro',
      );
      await lancarEConfirmar(
        page,
        '2020-03-20',
        { codigo: '622', nome: /^622 — Remunerações/ },
        { codigo: '111', nome: /^111 — Caixa/ },
        '300',
        'Salários pagos',
      );
    });

    await test.step('4. fechar os 12 meses de 2020 (SQL, só este tenant)', async () => {
      expect(await fecharMesesDe2020(EMAIL)).toBe(12);
      await abrirLista(page);
      await expect(cartao(page, '2020')).toContainText('1 abertos · 12 fechados');
    });

    await test.step('5. encerrar 2020 com estimativa 100 → Encerrado (Provisório)', async () => {
      await seguirLigacao(page, 'Encerrar exercício', /\/contabilidade\/exercicios\/[^/]+\/encerrar$/);
      await campo(page, 'Estimativa do imposto').fill('100');
      await page.getByRole('button', { name: 'Encerrar exercício' }).click();
      await esperarSucesso(page, /Exercício 2020 encerrado provisoriamente/);
      await abrirLista(page);
      await expect(cartao(page, '2020').getByText('Encerrado (Provisório)').first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step('6. arquivo do encerramento: três PDF, e um deles servido', async () => {
      await abrirLista(page);
      const c = cartao(page, '2020');
      const arquivar = c.getByRole('button', { name: 'Arquivar documentos' });
      if ((await arquivar.count()) > 0) {
        // Arquivo em falta: o caminho de recuperação tem de o repor.
        await arquivar.click();
        const toast = page.getByText('Documentos do encerramento arquivados.');
        await expect
          .poll(async () => (await toast.count()) > 0 || (await arquivar.count()) === 0, { timeout: 60_000 })
          .toBe(true);
      }
      // O arquivo corre em `after()`, depois da resposta: a lista (Server Component) não se
      // re-renderiza sozinha — recarrega-se até os três PDF aparecerem.
      await expect
        .poll(
          async () => {
            await page.reload();
            await page.waitForLoadState('networkidle');
            return cartao(page, '2020').getByRole('link', { name: /\(PDF\)$/ }).count();
          },
          { timeout: 90_000 },
        )
        .toBe(3);
      for (const nome of ['Balanço (PDF)', 'DRE (PDF)', 'Balancete (PDF)']) {
        await expect(cartao(page, '2020').getByRole('link', { name: nome })).toBeVisible();
      }
      const href = await cartao(page, '2020').getByRole('link', { name: 'Balanço (PDF)' }).getAttribute('href');
      expect(href).toMatch(/\/api\/contabilidade\/exercicios\/[^/]+\/encerramento\/balanco$/);
      const res = await page.request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/pdf');
      expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
    });

    await test.step('7. balanço de 2021: a abertura gerada (Caixa 700, 44 100, CP 600), equilibrado', async () => {
      await page.goto('/contabilidade/balanco?exercicio=2021');
      await expect(totalBalanco(page, 'Activo')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/Exercício 2021/).first()).toBeVisible();

      // Cada massa é uma região com nome (a secção declara `aria-labelledby` para o seu título).
      // Suave: um nome em falta é defeito de acessibilidade, não deve esconder os valores abaixo.
      for (const massa of ['Activo', 'Capital próprio', 'Passivo']) {
        await expect
          .soft(page.getByRole('region', { name: massa, exact: true }), `região «${massa}» sem nome acessível`)
          .toBeVisible();
      }

      await expect(linhaBalanco(page, 'Activo', '11')).toContainText('700,00');
      await expect(totalBalanco(page, 'Activo')).toContainText('700,00');
      await expect(linhaBalanco(page, 'Passivo', '44')).toContainText('100,00');
      await expect(totalBalanco(page, 'Passivo')).toContainText('100,00');
      await expect(linhaBalanco(page, 'Capital próprio', '88')).toContainText('600,00');
      await expect(totalBalanco(page, 'Capital próprio')).toContainText('600,00');
      // O 88 vem do encerramento (abertura gerada), não de um resultado por apurar em 2021.
      await expect(
        massaBalanco(page, 'Capital próprio').locator('tr').filter({ hasText: 'Resultado do período (por apurar)' }),
      ).toHaveCount(0);
      await expect(page.getByText('Equilibrado', { exact: true })).toBeVisible();
    });

    await test.step('7a. a11y do balanço — claro e escuro', async () => {
      for (const tema of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: tema });
        await page.goto('/contabilidade/balanco?exercicio=2021');
        await expect(totalBalanco(page, 'Activo')).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState('networkidle');
        await checkA11y(page, `balanço (${tema})`);
      }
      await page.emulateMedia({ colorScheme: 'light' });
    });

    await test.step('8. aplicar o resultado de 2020 e anular a aplicação', async () => {
      await seguirLigacao(page, 'Aplicar resultado', /\/contabilidade\/exercicios\/[^/]+\/aplicar-resultado$/);
      const rotaAplicar = page.url();

      // 8a. a11y da página de aplicar resultado, nos dois temas.
      for (const tema of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: tema });
        await page.goto(rotaAplicar);
        await expect(campo(page, 'Referência da acta')).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState('networkidle');
        await checkA11y(page, `aplicar resultado (${tema})`);
      }
      await page.emulateMedia({ colorScheme: 'light' });

      await campo(page, 'Data da deliberação').fill('2021-04-15');
      await campo(page, 'Referência da acta').fill('Acta n.º 1/2021');
      await page.getByRole('button', { name: 'Aplicar resultado' }).click();
      await esperarSucesso(page, /Resultado do exercício 2020 aplicado em 2021/);
      await abrirLista(page);
      await expect(cartao(page, '2020').getByRole('link', { name: /Resultado aplicado em/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(cartao(page, '2020')).toContainText('Acta n.º 1/2021');

      await seguirLigacao(page, 'Anular aplicação', /\/contabilidade\/exercicios\/[^/]+\/aplicacao\/anular$/);
      await campo(page, 'Motivo').fill('Acta rectificada pela assembleia geral seguinte — E2E #366.');
      await page.getByRole('button', { name: 'Anular aplicação' }).click();
      await esperarSucesso(page, /Aplicação do resultado do exercício 2020 anulada/);
      await abrirLista(page);
      await expect(cartao(page, '2020').getByRole('link', { name: 'Aplicar resultado', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(cartao(page, '2020').getByRole('link', { name: /Resultado aplicado em/ })).toHaveCount(0);
    });

    await test.step('9. reabrir 2020 e voltar a encerrar', async () => {
      await seguirLigacao(page, 'Reabrir exercício', /\/contabilidade\/exercicios\/[^/]+\/reabrir$/);
      await campo(page, 'Motivo').fill('Ajuste de auditoria às contas do exercício — E2E #366.');
      await page.getByRole('button', { name: 'Reabrir exercício' }).click();
      await esperarSucesso(page, /Exercício 2020 reaberto/);
      await abrirLista(page);
      await expect(cartao(page, '2020').getByRole('link', { name: 'Encerrar exercício', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(cartao(page, '2020').getByText('Encerrado (Provisório)')).toHaveCount(0);

      await seguirLigacao(page, 'Encerrar exercício', /\/contabilidade\/exercicios\/[^/]+\/encerrar$/);
      await campo(page, 'Estimativa do imposto').fill('100');
      await page.getByRole('button', { name: 'Encerrar exercício' }).click();
      await esperarSucesso(page, /Exercício 2020 encerrado provisoriamente/);
      await abrirLista(page);
      await expect(cartao(page, '2020').getByText('Encerrado (Provisório)').first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step('10. encerrar 2020 em definitivo (AlertDialog) → Encerrado, sem reabrir', async () => {
      await abrirLista(page);
      await cartao(page, '2020').getByRole('button', { name: 'Encerrar definitivamente' }).click();
      const dialogo = page.getByRole('alertdialog');
      await expect(dialogo).toContainText('Encerrar o exercício 2020 em definitivo?');
      await dialogo.getByRole('button', { name: 'Encerrar definitivamente' }).click();
      await expect(page.getByText(/Exercício 2020 encerrado em definitivo/).first()).toBeVisible({
        timeout: 60_000,
      });

      await abrirLista(page);
      const c = cartao(page, '2020');
      await expect(c).toContainText('Encerrado em definitivo em');
      await expect(c.getByText('Encerrado', { exact: true }).first()).toBeVisible();
      await expect(c.getByText('Encerrado (Provisório)')).toHaveCount(0);
      await expect(c.getByRole('link', { name: 'Reabrir exercício' })).toHaveCount(0);
      await expect(c.getByRole('button', { name: 'Encerrar definitivamente' })).toHaveCount(0);
    });
  });
});
