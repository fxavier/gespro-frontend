/**
 * Oráculo E2E comissoes-vendedores-131 — aprovar, pagar e cancelar comissões; editar e
 * desactivar vendedores; perfil do vendedor com as comissões dele (#131, #135).
 *
 * As actions `aprovarComissao`, `marcarComissaoPaga` e `cancelarComissao` existiam sem ecrã; o
 * vendedor só se criava; o perfil filtrava `Comissao.vendedorId` (um User) pelo id do Vendedor e
 * mostrava sempre «Nenhuma comissão», com o id no título em vez do nome.
 *
 * Contrato da UI (sem modais — AlertDialog só para confirmar; recolher dados é rota):
 *   Comissões
 *   - Cada linha da tabela de comissões (em `/vendas/comissoes` e em
 *     `/vendas/vendedores/[id]/comissoes`) liga ao detalhe `/vendas/comissoes/[id]`.
 *   - Detalhe: título com «Comissão»; estado pelo StatusBadge (Pendente/Aprovada/Paga/Cancelada,
 *     nunca em bruto).
 *   - PENDENTE: botão «Aprovar» (AlertDialog cujo botão de confirmação se chama «Aprovar»; voltar
 *     atrás não aprova) e ligação «Cancelar comissão» → rota `/vendas/comissoes/[id]/cancelar`.
 *     Sem «Marcar como paga».
 *   - APROVADA: botão «Marcar como paga» (AlertDialog, confirmação «Marcar como paga») e a
 *     ligação «Cancelar comissão». Sem «Aprovar».
 *   - Rota de cancelar: título «Cancelar Comissão», campo «Motivo» (≥ 10 caracteres; um motivo
 *     curto não sai da rota e mostra o erro), botão «Cancelar Comissão». Volta ao detalhe com
 *     «Cancelada» e o motivo à vista.
 *   - PAGA / CANCELADA: sem «Aprovar», «Marcar como paga» nem «Cancelar comissão».
 *   Vendedores
 *   - Perfil `/vendas/vendedores/[id]`: o título é o NOME do vendedor (#135); ligação «Editar» →
 *     `/vendas/vendedores/[id]/editar`; botão «Desactivar» (AlertDialog, confirmação
 *     «Desactivar»). Nada de «Excluir»/«Eliminar» — desactivar, não apagar.
 *   - Editar: título «Editar Vendedor», «Nome *» já preenchido, botão «Guardar …»; volta ao perfil
 *     com o nome novo.
 *   - Desactivado: o perfil continua a abrir, com «Inactivo»; a listagem continua a mostrá-lo.
 *   - Perfil de um vendedor ligado a um utilizador mostra as comissões desse utilizador
 *     (#135: a chave é `Vendedor.userId`).
 *
 * Dados (prefixo único `comissoes-vendedores-131`): no tenant `demo`, duas comissões PENDENTE do
 * utilizador do vendedor «Gestor Demo» sobre uma venda existente do seed (`detalhes` = a marca),
 * e um vendedor novo sem utilizador. Cada corrida deixa no `demo` uma comissão PAGA, uma
 * CANCELADA e um vendedor INATIVO com a marca no nome. Limpeza:
 *   DELETE FROM "Comissao" WHERE detalhes LIKE '%comissoes-vendedores-131%' OR detalhes LIKE 'Motivo E2E comissoes-vendedores-131%';
 *   DELETE FROM "Vendedor" WHERE nome LIKE '%comissoes-vendedores-131%';
 *
 * ESTADO ESPERADO antes da implementação: RED — rotas e botões não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/52-comissoes-vendedores-131.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó C:comissoes-vendedores-131; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const MARCA = 'comissoes-vendedores-131';
const MOTIVO = `Motivo E2E ${MARCA}: venda devolvida`;
const ESTADO_EM_BRUTO = /\b(PENDENTE|APROVADA|PAGA|CANCELADA|ATIVO|INATIVO)\b/;

/** Id no formato cuid (as actions validam `z.string().cuid()`). */
const novoId = () => `c${randomBytes(12).toString('hex')}`;

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

type Dados = {
  tenantId?: string;
  gestorVendedorId?: string;
  aPagar?: string;
  aCancelar?: string;
  vendedorNovo?: { id: string; nome: string };
};
const dados: Dados = {};

async function inserirComissao(c: Client, tenantId: string, vendaId: string, userId: string, valor: string) {
  const id = novoId();
  await c.query(
    `INSERT INTO "Comissao" (id, "tenantId", "vendaId", "vendedorId", "percentualAplicado", "valorBase",
       "valorComissao", "regrasAplicadas", detalhes, status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 5, 2626.20, $5, ARRAY['Comissão Base Padrão'], $6, 'PENDENTE', now(), now())`,
    [id, tenantId, vendaId, userId, valor, `Padrão: 5.00% (${MARCA})`],
  );
  return id;
}

async function estadoComissao(id: string) {
  return withPg(async (c) => {
    const r = await c.query(`SELECT status::text AS status, "pagoEm" FROM "Comissao" WHERE id = $1`, [id]);
    return r.rows[0] as { status: string; pagoEm: Date | null };
  });
}

async function linhaVendedor(id: string) {
  return withPg(async (c) => {
    const r = await c.query(
      `SELECT nome, status::text AS status, "deletedAt" FROM "Vendedor" WHERE id = $1`,
      [id],
    );
    return r.rows[0] as { nome: string; status: string; deletedAt: Date | null };
  });
}

async function abrir(page: Page, caminho: string, titulo: RegExp | string) {
  await page.goto(caminho);
  await expect(page.getByRole('heading', { name: titulo }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function semAccoesComissao(page: Page) {
  await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Marcar como paga$/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Cancelar comissão$/i })).toHaveCount(0);
}

async function confirmar(page: Page, botao: RegExp | string) {
  const nome = typeof botao === 'string' ? { name: botao, exact: true } : { name: botao };
  await page.getByRole('button', nome).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', nome).click();
}

test.describe(`/vendas/comissoes e /vendas/vendedores — acções pela UI (#131, #135, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
      const tenantId = t.rows[0].id;
      dados.tenantId = tenantId;

      const g = await c.query<{ id: string; userId: string }>(
        `SELECT id, "userId" FROM "Vendedor"
          WHERE "tenantId" = $1 AND nome = 'Gestor Demo' AND "deletedAt" IS NULL AND "userId" IS NOT NULL
          LIMIT 1`,
        [tenantId],
      );
      if (!g.rows[0]) throw new Error('STOP: vendedor «Gestor Demo» ligado a utilizador não encontrado (pnpm db:seed)');
      dados.gestorVendedorId = g.rows[0].id;

      const v = await c.query<{ id: string }>(
        `SELECT id FROM "Venda" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [tenantId],
      );
      if (!v.rows[0]) throw new Error('STOP: nenhuma venda no demo (pnpm db:seed)');

      dados.aPagar = await inserirComissao(c, tenantId, v.rows[0].id, g.rows[0].userId, '131.31');
      dados.aCancelar = await inserirComissao(c, tenantId, v.rows[0].id, g.rows[0].userId, '131.32');

      const id = novoId();
      const nome = `Vendedor ${MARCA} ${randomBytes(3).toString('hex')}`;
      await c.query(
        `INSERT INTO "Vendedor" (id, "tenantId", nome, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'ATIVO', now(), now())`,
        [id, tenantId, nome],
      );
      dados.vendedorNovo = { id, nome };
    });
  });

  test('comissoes-vendedores-131: pendente → aprovar (AlertDialog) → marcar como paga (AlertDialog)', async ({ page }) => {
    test.setTimeout(150_000);
    const id = dados.aPagar!;
    const caminho = `/vendas/comissoes/${id}`;

    // A listagem liga ao detalhe.
    await abrir(page, '/vendas/comissoes', 'Comissões');
    await expect(page.locator(`a[href="${caminho}"]`).first()).toBeVisible({ timeout: 30_000 });

    await abrir(page, caminho, /Comissão/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Pendente', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Cancelar comissão$/i })).toHaveAttribute('href', `${caminho}/cancelar`);
    await expect(page.getByRole('button', { name: /^Marcar como paga$/i })).toHaveCount(0);

    // Voltar atrás no AlertDialog não aprova.
    await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /Voltar|Cancelar|Não/ }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect((await estadoComissao(id)).status).toBe('PENDENTE');

    await confirmar(page, 'Aprovar');
    await expect(page.getByText('Aprovada', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    expect((await estadoComissao(id)).status).toBe('APROVADA');

    await page.reload();
    await expect(page.getByText('Aprovada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Cancelar comissão$/i })).toBeVisible();

    await confirmar(page, /^Marcar como paga$/i);
    await expect(page.getByText('Paga', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    const depois = await estadoComissao(id);
    expect(depois.status).toBe('PAGA');
    expect(depois.pagoEm).toBeTruthy();

    await page.reload();
    await expect(page.getByText('Paga', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
    await semAccoesComissao(page);
  });

  test('comissoes-vendedores-131: cancelar é rota própria com motivo obrigatório', async ({ page }) => {
    test.setTimeout(120_000);
    const id = dados.aCancelar!;
    const caminho = `/vendas/comissoes/${id}`;

    await abrir(page, caminho, /Comissão/);
    await page.getByRole('link', { name: /^Cancelar comissão$/i }).click();
    await page.waitForURL(`**${caminho}/cancelar`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Cancelar Comissão' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Motivo curto: não sai da rota e o erro fica à vista.
    await page.getByLabel(/Motivo/).fill('curto');
    await page.getByRole('button', { name: 'Cancelar Comissão' }).click();
    await expect(page.locator('[aria-invalid="true"], [role="alert"]').first()).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe(`${caminho}/cancelar`);
    expect((await estadoComissao(id)).status).toBe('PENDENTE');

    await page.getByLabel(/Motivo/).fill(MOTIVO);
    await page.getByRole('button', { name: 'Cancelar Comissão' }).click();
    await page.waitForURL((url) => url.pathname === caminho, { timeout: 60_000 });
    await expect(page.getByText('Cancelada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(MOTIVO).first(), 'o motivo fica à vista').toBeVisible();
    expect((await estadoComissao(id)).status).toBe('CANCELADA');

    await page.reload();
    await expect(page.getByText('Cancelada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
    await semAccoesComissao(page);
  });

  test('comissoes-vendedores-131: perfil do vendedor mostra o nome e as comissões do seu utilizador (#135)', async ({ page }) => {
    test.setTimeout(90_000);
    const vid = dados.gestorVendedorId!;

    await abrir(page, `/vendas/vendedores/${vid}`, 'Gestor Demo');
    await expect(page.getByRole('heading', { name: new RegExp(vid.slice(-8)) })).toHaveCount(0);
    await expect(page.getByText('Nenhuma comissão registada para este vendedor.')).toHaveCount(0);

    await abrir(page, `/vendas/vendedores/${vid}/comissoes`, /Comissões/);
    await expect(page.locator(`a[href="/vendas/comissoes/${dados.aPagar}"]`).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(`a[href="/vendas/comissoes/${dados.aCancelar}"]`).first()).toBeVisible();
  });

  test('comissoes-vendedores-131: editar vendedor (rota) e desactivar (AlertDialog), sem apagar', async ({ page }) => {
    test.setTimeout(150_000);
    const v = dados.vendedorNovo!;
    const perfil = `/vendas/vendedores/${v.id}`;
    const nomeNovo = `${v.nome} editado`;

    await abrir(page, perfil, v.nome);
    await expect(page.getByRole('button', { name: /Excluir|Eliminar|Apagar/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Excluir|Eliminar|Apagar/ })).toHaveCount(0);

    await page.getByRole('link', { name: /^Editar/ }).click();
    await page.waitForURL(`**${perfil}/editar`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Editar Vendedor' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const nome = page.getByLabel('Nome *');
    await expect(nome).toHaveValue(v.nome);
    await nome.fill(nomeNovo);
    await page.getByRole('button', { name: /^Guardar/ }).click();
    await page.waitForURL((url) => url.pathname === perfil, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: nomeNovo }).first()).toBeVisible({ timeout: 30_000 });
    expect((await linhaVendedor(v.id)).nome).toBe(nomeNovo);

    await page.waitForLoadState('networkidle');
    // Voltar atrás no AlertDialog não desactiva.
    await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /Voltar|Cancelar|Não/ }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect((await linhaVendedor(v.id)).status).toBe('ATIVO');

    await confirmar(page, 'Desactivar');
    await expect(page.getByText('Inactivo', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    const depois = await linhaVendedor(v.id);
    expect(depois.status).toBe('INATIVO');
    expect(depois.deletedAt, 'desactivar não apaga').toBeNull();

    // O perfil continua a abrir e a listagem continua a mostrá-lo.
    await abrir(page, perfil, nomeNovo);
    await expect(page.getByText('Inactivo', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);

    await page.goto(`/vendas/vendedores?q=${encodeURIComponent(nomeNovo)}`);
    const linha = page.getByRole('row').filter({ hasText: nomeNovo });
    await expect(linha.first()).toBeVisible({ timeout: 30_000 });
    await expect(linha.first().getByText('Inactivo', { exact: true })).toBeVisible();
  });
});
