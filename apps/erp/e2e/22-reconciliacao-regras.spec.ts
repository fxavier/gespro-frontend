/**
 * E2E — issue #140: regras de sugestão de lançamento e tolerâncias da conta
 * bancária (ORÁCULO, escrito pelo verificador; contrato em
 * docs/agentic/issue-140/tickets.md, T6).
 *
 * Escreve dados — corre contra a base ISOLADA (`gespro_e2e77`), NUNCA contra
 * `gespro`, pelo método do `17-iva-isento`/`21-nc-proforma-cotacao`:
 *
 *   DATABASE_URL=…/gespro_e2e77 DIRECT_URL=…/gespro_e2e77 npx next dev -p 3012
 *   BASE_URL=http://localhost:3012 npx playwright test e2e/22-reconciliacao-regras.spec.ts
 *
 * ADMIN, só pela UI:
 *   1. `/contabilidade/reconciliacao` tem o link «Regras de sugestão» → `/regras`;
 *   2. cria uma regra (padrão único desta corrida, Saída, contrapartida 6981, todas as contas);
 *   3. edita a prioridade; 4. desactiva e reactiva (AlertDialog);
 *   5. altera a «Tolerância de dias» de uma conta bancária, vê-a persistida, e repõe-na.
 * OPERADOR (`financas:leitura` pelo `isReadOnly`, SEM `financas:banca:reconciliacao` —
 * confirmado em prisma/seed/rbac.ts): vê a lista sem «Nova regra» nem acções.
 *
 * Estado da base: não há eliminar regra (decisão da #140). A regra desta corrida
 * fica INACTIVA no fim, com um padrão que nenhum extracto contém; a tolerância
 * da conta volta ao valor original.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

const ROTA_RECONCILIACAO = '/contabilidade/reconciliacao';
const ROTA = `${ROTA_RECONCILIACAO}/regras`;

const SUFIXO = Date.now().toString(36).toUpperCase();
/** Padrão único por corrida (maiúsculas: a comparação do motor é sem maiúsculas). */
const PADRAO = `E2E140X${SUFIXO}`;
const DESCRICAO = `Regra E2E #140 ${SUFIXO}`;
const PRIORIDADE = '900';
const PRIORIDADE_EDITADA = '901';

// ─── utilitários ────────────────────────────────────────────────────────────

function principal(page: Page): Locator {
  return page.locator('#main-content');
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}

/** Linha da lista de regras desta corrida (o padrão é único). */
function linhaRegra(page: Page): Locator {
  return principal(page).getByRole('row').filter({ hasText: PADRAO });
}

/** Estado na lista, pelo rótulo do StatusBadge (ATIVA → «Activa», INACTIVA → «Inactiva»). */
async function esperarEstado(page: Page, rotulo: 'Activa' | 'Inactiva'): Promise<void> {
  const l = linhaRegra(page);
  await expect(l.getByText(rotulo, { exact: true })).toBeVisible({ timeout: 20_000 });
  const outro = rotulo === 'Activa' ? 'Inactiva' : 'Activa';
  await expect(l.getByText(outro, { exact: true })).toHaveCount(0);
}

/** Abre um combobox (Select do Radix ou Combobox do patterns) e escolhe a opção. */
async function escolher(page: Page, campo: string, opcao: string | RegExp, pesquisa?: string): Promise<void> {
  const caixa = principal(page).getByRole('combobox', { name: campo });
  await caixa.click();
  if (pesquisa) {
    const procurar = page.getByPlaceholder(/Pesquisar/);
    if (await procurar.isVisible().catch(() => false)) await procurar.fill(pesquisa);
  }
  await page.getByRole('option', { name: opcao }).first().click();
  await expect(caixa).toContainText(opcao);
}

/** Botão ou ligação de acção numa linha — o nome pode ser «Editar» ou «Editar regra …». */
function accao(linha: Locator, nome: string): Locator {
  const re = new RegExp(`^${nome}\\b`);
  return linha.getByRole('button', { name: re }).or(linha.getByRole('link', { name: re }));
}

async function confirmar(page: Page, nome: 'Desactivar' | 'Activar'): Promise<void> {
  await accao(linhaRegra(page), nome).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: new RegExp(`^${nome}`) }).click();
  await expect(dialogo).toBeHidden({ timeout: 20_000 });
}

// ─── ADMIN: regras ──────────────────────────────────────────────────────────

test.describe('Regras de sugestão — ADMIN', () => {
  test.beforeEach(({ page }) => {
    // Formulários com UnsavedChangesGuard pedem confirmação ao sair.
    page.on('dialog', (d) => void d.accept());
  });

  test('a reconciliação tem o link «Regras de sugestão» para /regras', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(ROTA_RECONCILIACAO);
    await expect(page.getByRole('heading', { name: 'Reconciliação Bancária', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await aguardar(page);
    await principal(page).getByRole('link', { name: 'Regras de sugestão' }).click();
    await page.waitForURL(new RegExp(`${ROTA}$`), { timeout: 60_000 });
    await expect(principal(page).getByRole('link', { name: 'Nova regra' })).toBeVisible({ timeout: 30_000 });
  });

  test('criar regra: Saída, contrapartida 6981, todas as contas → aparece activa na lista', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(ROTA);
    await aguardar(page);
    await principal(page).getByRole('link', { name: 'Nova regra' }).click();
    await page.waitForURL(new RegExp(`${ROTA}/nova$`), { timeout: 60_000 });
    await expect(principal(page).getByLabel('Padrão')).toBeVisible({ timeout: 30_000 });
    await aguardar(page);

    await principal(page).getByLabel('Padrão').fill(PADRAO);
    await escolher(page, 'Movimento', 'Saída');
    await escolher(page, 'Conta de contrapartida', /6981/, '6981');
    await escolher(page, 'Conta bancária', 'Todas as contas');
    await principal(page).getByLabel('Prioridade').fill(PRIORIDADE);
    await principal(page).getByLabel('Descrição').fill(DESCRICAO);

    await principal(page).getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(new RegExp(`${ROTA}$`), { timeout: 60_000 });

    const l = linhaRegra(page);
    await expect(l).toHaveCount(1, { timeout: 20_000 });
    await expect(l).toContainText('Saída');
    await expect(l).toContainText('6981');
    await expect(l).toContainText('Todas');
    await expect(l.getByRole('cell', { name: PRIORIDADE, exact: true })).toBeVisible();
    await esperarEstado(page, 'Activa');
  });

  test('editar a prioridade → valor novo na lista', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(ROTA);
    await aguardar(page);
    await accao(linhaRegra(page), 'Editar').click();
    await page.waitForURL(new RegExp(`${ROTA}/[^/]+/editar$`), { timeout: 60_000 });
    const campo = principal(page).getByLabel('Prioridade');
    await expect(campo).toHaveValue(PRIORIDADE, { timeout: 30_000 });
    await expect(principal(page).getByLabel('Padrão')).toHaveValue(PADRAO);
    await aguardar(page);

    await campo.fill(PRIORIDADE_EDITADA);
    await principal(page).getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(new RegExp(`${ROTA}$`), { timeout: 60_000 });

    const l = linhaRegra(page);
    await expect(l.getByRole('cell', { name: PRIORIDADE_EDITADA, exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(l.getByRole('cell', { name: PRIORIDADE, exact: true })).toHaveCount(0);
    // O resto da regra não mudou.
    await expect(l).toContainText('Saída');
    await expect(l).toContainText('6981');
    await esperarEstado(page, 'Activa');
  });

  test('desactivar e reactivar (AlertDialog)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(ROTA);
    await aguardar(page);
    await esperarEstado(page, 'Activa');

    await confirmar(page, 'Desactivar');
    await esperarEstado(page, 'Inactiva');
    await expect(accao(linhaRegra(page), 'Activar')).toBeVisible();

    await confirmar(page, 'Activar');
    await esperarEstado(page, 'Activa');
    await expect(accao(linhaRegra(page), 'Desactivar')).toBeVisible();

    // Persistiu (não é só estado do cliente).
    await page.reload();
    await aguardar(page);
    await esperarEstado(page, 'Activa');

    // Arrumação: não há eliminar; a regra desta corrida fica inactiva.
    await confirmar(page, 'Desactivar');
    await esperarEstado(page, 'Inactiva');
  });
});

// ─── ADMIN: tolerâncias da conta bancária ───────────────────────────────────

test.describe('Tolerâncias da conta bancária — ADMIN', () => {
  test.beforeEach(({ page }) => {
    page.on('dialog', (d) => void d.accept());
  });

  const CAMPOS_NUMERICOS = [
    'Tolerância de dias',
    'Tolerância de valor',
    'Limiar de confiança',
    'Máximo de movimentos agregados',
  ];
  const INTERRUPTORES = [
    'Correspondência por referência',
    'Correspondência por valor',
    'Correspondência por descrição',
    'Reconciliação automática',
    'Permitir agregação',
  ];

  async function abrirEditar(page: Page, url: string): Promise<void> {
    await page.goto(url);
    await expect(principal(page).getByLabel('Tolerância de dias')).toBeVisible({ timeout: 30_000 });
    await aguardar(page);
  }

  async function guardarConta(page: Page): Promise<void> {
    await principal(page).getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/\/contabilidade\/contas-bancarias$/, { timeout: 60_000 });
  }

  test('alterar a «Tolerância de dias», guardar, reabrir e ver o valor persistido; repor', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/contabilidade/contas-bancarias');
    await expect(page.getByRole('heading', { name: 'Contas Bancárias', level: 1 })).toBeVisible({ timeout: 30_000 });
    await aguardar(page);

    // A lista navega por clique na linha (rowHref), sem <a>: o id vem do URL.
    await principal(page).getByRole('row').nth(1).click();
    await page.waitForURL(/\/contabilidade\/contas-bancarias\/[^/]+\/editar$/, { timeout: 60_000 });
    const urlEditar = new URL(page.url()).pathname;
    await abrirEditar(page, urlEditar);

    // A secção e os nove campos existem.
    await expect(principal(page).getByRole('heading', { name: 'Reconciliação', exact: true })).toBeVisible();
    for (const rotulo of [...CAMPOS_NUMERICOS, ...INTERRUPTORES]) {
      await expect(principal(page).getByLabel(rotulo, { exact: true }), rotulo).toBeVisible();
    }

    const dias = principal(page).getByLabel('Tolerância de dias', { exact: true });
    const limiar = principal(page).getByLabel('Limiar de confiança', { exact: true });
    const original = await dias.inputValue();
    const limiarOriginal = await limiar.inputValue();
    expect(original, 'a página de editar tem de mostrar o valor actual').toMatch(/^\d+$/);
    const novo = String(Number(original) === 17 ? 18 : 17);

    try {
      await dias.fill(novo);
      await dias.blur();
      await guardarConta(page);

      await abrirEditar(page, urlEditar);
      await expect(dias).toHaveValue(novo);
      // Guardar um campo não repôs os outros.
      await expect(limiar).toHaveValue(limiarOriginal);
    } finally {
      // Repor o valor original pela UI.
      await abrirEditar(page, urlEditar);
      await dias.fill(original);
      await dias.blur();
      await guardarConta(page);
    }

    await abrirEditar(page, urlEditar);
    await expect(dias).toHaveValue(original);
  });
});

// ─── OPERADOR ───────────────────────────────────────────────────────────────

test.describe('Regras de sugestão — OPERADOR (só leitura)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('vê a lista sem «Nova regra» nem botões de acção', async ({ page }) => {
    test.setTimeout(150_000); // login real + compilação fria
    await loginAs(page, USERS.operador);

    await page.goto(ROTA);
    await aguardar(page);
    await expect(principal(page).getByText('Sem permissão')).toHaveCount(0);
    // A lista tem pelo menos a regra por omissão do seed (6981 — comissões e encargos).
    await expect(principal(page).getByRole('row').filter({ hasText: '6981' }).first()).toBeVisible({
      timeout: 30_000,
    });

    await expect(principal(page).getByRole('link', { name: 'Nova regra' })).toHaveCount(0);
    await expect(principal(page).getByRole('button', { name: 'Nova regra' })).toHaveCount(0);
    for (const nome of ['Editar', 'Desactivar', 'Activar']) {
      const re = new RegExp(`^${nome}\\b`);
      await expect(principal(page).getByRole('button', { name: re }), nome).toHaveCount(0);
      await expect(principal(page).getByRole('link', { name: re }), nome).toHaveCount(0);
    }
  });
});
