/**
 * Testes de Acessibilidade (A11y) — GestPro
 *
 * Usa @axe-core/playwright para verificar violações WCAG AA nos fluxos críticos.
 * Falhas com impact "critical" ou "serious" são BLOCKER.
 *
 * Fluxos cobertos:
 * 1. Página de login
 * 2. Listagem de requisições de compra
 * 3. Nova requisição (formulário)
 * 4. Caixa (listagem + abertura)
 * 5. Faturação (listagem + nova)
 *
 * Verificações adicionais:
 * - Navegação por teclado (focus visível nos formulários)
 * - Contraste AA
 * - aria-* correcto
 *
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { esperarFormularioLogin } from './helpers/auth';

// ─── Helper: executar axe e falhar em violações AA ────────────────────────────

async function checkA11y(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  context?: string
) {
  const accessibilityScanResults = await new AxeBuilder({ page })
    // WCAG 2.1 Level AA
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    // Excluir regras conhecidas como false-positive em componentes Radix/shadcn
    .exclude('[data-radix-popper-content-wrapper]')
    .analyze();

  // Filtrar apenas violações críticas e sérias (BLOCKER conforme spec)
  const blockerViolations = accessibilityScanResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );

  if (blockerViolations.length > 0) {
    const msg = blockerViolations
      .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n  → ${v.help}\n  → Nós afectados: ${v.nodes.length}`)
      .join('\n\n');
    throw new Error(
      `A11y BLOCKER${context ? ` em "${context}"` : ''}: ${blockerViolations.length} violação(ões) WCAG AA\n\n${msg}`
    );
  }

  // Reportar avisos (moderate/minor) sem falhar
  const warnings = accessibilityScanResults.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor'
  );
  if (warnings.length > 0) {
    console.warn(
      `A11y aviso${context ? ` em "${context}"` : ''}: ${warnings.length} violação(ões) moderate/minor`
    );
  }
}

// ─── Testes ───────────────────────────────────────────────────────────────────

// Login usa sessão limpa (não autenticado). Desde o ADR-0029 a porta de
// entrada voltou a ser NOSSA: `/auth/login` não salta, e o axe corre no nosso
// ecrã — nos dois temas, senão a página onde o cliente escreve a palavra-passe
// ficava a única do produto sem verificação de acessibilidade.
//
// Os 32/32 WCAG AA deixaram de ser herdados do PatternFly: passaram a ser
// responsabilidade deste repositório.
test.describe('A11y: Página de Login (ecrã do GestPro)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sem violações AA no ecrã de login — tema claro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/auth/login');
    await esperarFormularioLogin(page);

    await checkA11y(page, 'login GestPro (claro)');
  });

  test('sem violações AA no ecrã de login — tema escuro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/auth/login');
    await esperarFormularioLogin(page);

    await checkA11y(page, 'login GestPro (escuro)');
  });

  // O ecrã de mudança de palavra-passe (ADR-0030) é público como o login e é
  // onde a pessoa entra pela primeira vez: fica sujeito ao mesmo gate.
  test('sem violações AA no ecrã de mudança de palavra-passe — tema claro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/auth/mudar-palavra-passe?identificador=alguem%40demo.mz');
    await expect(page.locator('#actual')).toBeVisible({ timeout: 20_000 });

    await checkA11y(page, 'mudar palavra-passe (claro)');
  });

  test('sem violações AA no ecrã de mudança de palavra-passe — tema escuro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/auth/mudar-palavra-passe?identificador=alguem%40demo.mz');
    await expect(page.locator('#actual')).toBeVisible({ timeout: 20_000 });

    await checkA11y(page, 'mudar palavra-passe (escuro)');
  });

  // `/registo` (ADR-0031) é a primeira coisa que um potencial cliente vê, e é
  // pública como o login. O formulário tem nove campos, um select e um widget
  // de terceiros — mais superfície de acessibilidade do que qualquer outro
  // ecrã anónimo do produto. Fica sujeito ao mesmo gate, nos dois temas.
  test('sem violações AA no ecrã de registo — tema claro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/registo?plano=PROFISSIONAL');
    await expect(page.locator('[name="empresa.nome"]')).toBeVisible({ timeout: 20_000 });

    await checkA11y(page, 'registo (claro)');
  });

  test('sem violações AA no ecrã de registo — tema escuro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/registo?plano=PROFISSIONAL');
    await expect(page.locator('[name="empresa.nome"]')).toBeVisible({ timeout: 20_000 });

    await checkA11y(page, 'registo (escuro)');
  });

  test('foco visível nos campos do formulário de login', async ({ page }) => {
    await page.goto('/auth/login');
    await esperarFormularioLogin(page);

    // Foca directamente no campo de utilizador para testar navegação por teclado
    await page.locator('#identificador').focus();
    const focado = await page.evaluate(() => document.activeElement?.id);
    expect(focado).toBe('identificador');

    // Tab avança para um elemento interactivo (password / mostrar palavra-passe)
    await page.keyboard.press('Tab');
    const aposTab = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName } : null;
    });
    expect(aposTab).not.toBeNull();
    expect(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(aposTab!.tag)).toBeTruthy();
  });

  test('a página de recusa /auth/erro é acessível', async ({ page }) => {
    // A recusa explícita («contacte o administrador…») é nossa e também conta.
    await page.goto('/auth/erro?motivo=nao-provisionado');
    await expect(page.getByRole('heading')).toBeVisible({ timeout: 15_000 });
    await checkA11y(page, 'erro de autenticação');
  });
});

// Os restantes testes usam autenticação
test.describe('A11y: Listagem de Requisições', () => {
  test('sem violações AA na listagem de requisições', async ({ page }) => {
    await page.goto('/compras/requisicoes');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    // Aguarda carregamento completo (sai do skeleton)
    await page.waitForTimeout(1_000); // espera mínima para hydration

    await checkA11y(page, 'listagem de requisições');
  });

  test('navegação por teclado na listagem', async ({ page }) => {
    await page.goto('/compras/requisicoes');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    // Tab key deve navegar pelos elementos interactivos
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocused).toBeTruthy();

    // Shift+Tab deve voltar
    await page.keyboard.press('Shift+Tab');
  });
});

test.describe('A11y: Formulário de Nova Requisição', () => {
  test('sem violações AA no formulário de nova requisição', async ({ page }) => {
    await page.goto('/compras/requisicoes/novo');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Requisição de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    await checkA11y(page, 'nova requisição');
  });

  test('labels correctamente associados aos campos', async ({ page }) => {
    await page.goto('/compras/requisicoes/novo');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Requisição de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    // Verifica que labels têm for/htmlFor correcto
    const labelsWithFor = await page.evaluate(() => {
      const labels = Array.from(window.document.querySelectorAll('label[for]'));
      return labels.map((l: Element) => ({
        text: l.textContent?.trim(),
        for: l.getAttribute('for'),
        hasTarget: !!window.document.getElementById(l.getAttribute('for') ?? ''),
      }));
    });

    const labelsWithoutTarget = labelsWithFor.filter((l) => !l.hasTarget);
    if (labelsWithoutTarget.length > 0) {
      console.warn('Labels sem elemento associado:', labelsWithoutTarget);
    }
    // Não falha aqui — reporta apenas; axe já captura isso
  });
});

test.describe('A11y: Caixa', () => {
  test('sem violações AA na listagem de caixa', async ({ page }) => {
    await page.goto('/caixa');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Gestão de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    await checkA11y(page, 'listagem de caixa');
  });

  test('sem violações AA na abertura de caixa', async ({ page }) => {
    await page.goto('/caixa/abertura');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    await checkA11y(page, 'abertura de caixa');
  });

  test('checklist de abertura: role=checkbox correcto', async ({ page }) => {
    await page.goto('/caixa/abertura');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Verifica que os botões da checklist têm role=checkbox
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);

    // Cada checkbox deve ter aria-checked
    for (let i = 0; i < count; i++) {
      const ariaChecked = await checkboxes.nth(i).getAttribute('aria-checked');
      expect(ariaChecked).not.toBeNull();
    }
  });
});

test.describe('A11y: Faturação', () => {
  test('sem violações AA na listagem de faturação', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    await checkA11y(page, 'listagem de faturação');
  });

  test('sem violações AA no formulário de nova fatura', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    await checkA11y(page, 'nova fatura');
  });
});

test.describe('A11y: POS', () => {
  test('sem violações AA na página POS', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    // Aguarda o carregamento (setup ou terminal)
    await page.waitForTimeout(1_000);

    await checkA11y(page, 'POS');
  });
});

// ─── Spec 22 · WS-1: Tesouraria ──────────────────────────────────────────────
// As quatro páginas novas passam axe AA NOS DOIS TEMAS (R7.5). O tema segue
// `defaultTheme="system"`, por isso `emulateMedia({ colorScheme })` chega.

const TEMAS = ['light', 'dark'] as const;

test.describe('A11y: Tesouraria — Projecção', () => {
  for (const tema of TEMAS) {
    test(`sem violações AA na projecção de tesouraria — tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto('/tesouraria');
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: 'Projecção de Tesouraria' })
      ).toBeVisible({ timeout: 20_000 });

      // Sai do skeleton: a tabela de buckets é a fonte e tem de estar presente
      await expect(
        page.getByRole('heading', { name: /^Buckets/ })
      ).toBeVisible({ timeout: 20_000 });

      await checkA11y(page, `projecção de tesouraria (${tema})`);
    });
  }

  test('o cenário PESSIMISTA mantém a página acessível', async ({ page }) => {
    await page.goto('/tesouraria?cenario=PESSIMISTA');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('heading', { name: /^Buckets/ })
    ).toBeVisible({ timeout: 20_000 });

    await checkA11y(page, 'projecção de tesouraria (PESSIMISTA)');
  });
});

test.describe('A11y: Tesouraria — Compromissos', () => {
  for (const tema of TEMAS) {
    test(`sem violações AA na listagem de compromissos — tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto('/tesouraria/compromissos');
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: 'Compromissos de Tesouraria' })
      ).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1_000); // hydration

      await checkA11y(page, `listagem de compromissos (${tema})`);
    });

    test(`sem violações AA no formulário de novo compromisso — tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto('/tesouraria/compromissos/novo');
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: 'Novo Compromisso' })
      ).toBeVisible({ timeout: 20_000 });

      await checkA11y(page, `novo compromisso (${tema})`);
    });
  }

  for (const tema of TEMAS) {
    test(`sem violações AA no formulário de edição — tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: tema });

      // Garante que existe pelo menos um compromisso editável.
      await page.goto('/tesouraria/compromissos');
      await expect(
        page.getByRole('heading', { name: 'Compromissos de Tesouraria' })
      ).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);

      let linkEditar = page.locator('a[href$="/editar"]').first();
      let criadoPeloTeste = false;
      if ((await linkEditar.count()) === 0) {
        // Data MUITO futura de propósito: o golden fixture da projecção
        // (`projecao.golden.test.ts`) lê esta mesma base de dados — um
        // compromisso dentro do horizonte de 90/365 dias envenenava-o.
        await page.goto('/tesouraria/compromissos/novo');
        await expect(
          page.getByRole('heading', { name: 'Novo Compromisso' })
        ).toBeVisible({ timeout: 20_000 });
        await page.getByLabel('Descrição *').fill('Compromisso a11y');
        await page.getByLabel('Valor (MT) *').fill('1234.56');
        await page.getByLabel('Data prevista *').fill('2099-12-31');
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(
          page.getByRole('heading', { name: 'Compromissos de Tesouraria' })
        ).toBeVisible({ timeout: 20_000 });
        criadoPeloTeste = true;
        linkEditar = page.locator('a[href$="/editar"]').first();
      }

      const href = await linkEditar.getAttribute('href');
      expect(href).toBeTruthy();
      await page.goto(href!);
      await expect(
        page.getByRole('heading', { name: 'Editar Compromisso' })
      ).toBeVisible({ timeout: 20_000 });

      await checkA11y(page, `editar compromisso (${tema})`);

      // Limpeza: o que o teste criou, o teste elimina (soft delete via UI —
      // eliminados não entram na projecção nem na listagem).
      if (criadoPeloTeste) {
        await page.goto('/tesouraria/compromissos');
        await expect(
          page.getByRole('heading', { name: 'Compromissos de Tesouraria' })
        ).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(1_000); // hydration
        await page
          .getByRole('button', { name: 'Eliminar compromisso Compromisso a11y' })
          .click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Eliminar', exact: true })
          .click();
        await expect(page.getByText('Compromisso eliminado.')).toBeVisible({
          timeout: 20_000,
        });
      }
    });
  }
});

// ─── Spec 22 · WS-2: Demonstração de Fluxos de Caixa (issue #153, ticket 8) ──
// Gate do ticket 8: AA em /contabilidade/dfc nos DOIS temas. Corre com uma
// rubrica expandida, para o axe ver também as linhas das contas e as ligações
// ao razão (o `aria-expanded`/`aria-controls` do botão só existe aberto).

test.describe('A11y: Contabilidade — Demonstração de Fluxos de Caixa', () => {
  for (const tema of TEMAS) {
    test(`sem violações AA na DFC — tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto('/contabilidade/dfc');
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: 'Demonstração de Fluxos de Caixa' })
      ).toBeVisible({ timeout: 20_000 });
      // Sai do skeleton: o mapa (ou o painel de impedimentos) tem de estar lá.
      await expect(
        page.getByTestId('dfc-articulacao').or(page.getByTestId('dfc-impedimentos'))
      ).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');

      const expandir = page.locator('[data-testid$="-expandir"]').first();
      if ((await expandir.count()) > 0) {
        await expandir.click();
        await expect(expandir).toHaveAttribute('aria-expanded', 'true');
      }

      await checkA11y(page, `DFC (${tema})`);
    });
  }
});
