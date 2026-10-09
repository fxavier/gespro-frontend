/**
 * Oráculo E2E — issues #101 e #265: onze formulários pediam o identificador interno (CUID) colado
 * num campo de texto. Critério da #265: «para cada módulo, um E2E que escolha a entidade pela
 * combobox».
 *
 * Contrato de UI (decisão do orquestrador + verificador):
 *   Em cada formulário, cada entidade escolhe-se numa combobox (`role="combobox"`, etiquetada pelo
 *   nome da entidade — «Fornecedor», «Requisição…», «Colaborador»…), com pesquisa (`Pesquisar…`
 *   ou equivalente dentro do popover). A combobox abre com uma primeira página (opções iniciais
 *   carregadas pelo Server Component — o `ComboboxRemoto` nunca pede `procurar('')`), escrever um
 *   fragmento do rótulo encontra a opção, e escolhê-la mostra o rótulo na caixa. Nenhum campo de
 *   texto etiquetado «ID…» nem placeholder com «cuid» sobra no formulário.
 *
 *   Excepções que o teste conhece: na nova devolução a venda depende do cliente escolhido, logo
 *   escolhe-se escrevendo o número (sem exigir opções iniciais); em «Fornecedores a convidar» da
 *   cotação a escolha é múltipla — o fornecedor escolhido tem de aparecer no formulário.
 *
 * O lado do servidor (pesquisas `procurar*`, tenant, Leitura, permissões) é provado em
 * `test/integration/combobox-ids-101-265.test.ts`; a ausência de campos de id no código, em
 * `src/app/(dashboard)/__tests__/combobox-ids-101-265.test.ts`.
 *
 * Dados: os do seed do tenant `demo` (fornecedores, requisições REQ-2024-*, cotação COT-2024-001,
 * clientes e vendas do funil, produtos, vendedores, colaboradores, projecto, benefícios,
 * utilizadores) e UM centro de custo criado por SQL com o prefixo único `combobox-ids-101-265`
 * (o seed demo não tem centros de custo) — apagado no fim. Nenhum formulário é submetido: o
 * teste não deixa documentos no `demo`.
 *
 * ESTADO ESPERADO antes da implementação: RED — os campos são `<input>` de texto, não há
 * combobox com aqueles nomes.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/53-combobox-ids-101-265.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:combobox-ids-101-265; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const MARCA = 'combobox-ids-101-265';
const SUF = Date.now().toString(36);
const ID_CENTRO = `ccc265${SUF}`;
const NOME_CENTRO = `Centro ${MARCA} ${SUF}`;

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

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A palavra mais longa do rótulo (com letras ou dígitos), para pesquisar por um fragmento. */
function fragmentoDe(rotulo: string): string {
  const palavras = rotulo.split(/[\s—–·|,()]+/).filter((p) => /[\p{L}\d]{3,}/u.test(p));
  expect(palavras.length, `rótulo sem palavra pesquisável: «${rotulo}»`).toBeGreaterThan(0);
  return palavras.sort((a, b) => b.length - a.length)[0];
}

/** O formulário não tem campos de id: nem etiqueta «ID…» nem placeholder com «cuid». */
async function semCamposDeId(page: Page): Promise<void> {
  await expect(page.getByLabel(/^\s*IDs?\b/), 'ainda há um campo etiquetado «ID…»').toHaveCount(0);
  await expect(page.getByPlaceholder(/cuid/i), 'ainda há um placeholder com «cuid»').toHaveCount(0);
  await expect(page.getByText(/integração comercial/i)).toHaveCount(0);
}

/**
 * Escolhe uma opção na combobox `nome`. Sem `termo`, exige opções iniciais, lê a primeira e
 * procura-a por um fragmento do rótulo (prova a pesquisa); com `termo`, escreve-o e escolhe a
 * opção que o contém. Devolve o rótulo escolhido.
 */
async function escolher(
  page: Page,
  nome: RegExp,
  opts: { termo?: string; multipla?: boolean } = {},
): Promise<string> {
  const caixa = page.getByRole('combobox', { name: nome }).first();
  await expect(caixa, `não há combobox ${nome}`).toBeVisible({ timeout: 15_000 });
  await caixa.click();
  const pop = page.locator('[data-radix-popper-content-wrapper]').last();
  await expect(pop).toBeVisible();

  let alvo: string;
  if (opts.termo) {
    alvo = opts.termo;
  } else {
    const primeira = pop.getByRole('option').first();
    await expect(primeira, `a combobox ${nome} abriu sem opções iniciais`).toBeVisible({ timeout: 15_000 });
    alvo = (await primeira.innerText()).split('\n')[0].trim();
  }
  const fragmento = opts.termo ?? fragmentoDe(alvo);
  await pop.locator('input').first().fill(fragmento);
  const opcao = pop.getByRole('option').filter({ hasText: new RegExp(escapar(fragmento), 'i') }).first();
  await expect(opcao, `pesquisar «${fragmento}» em ${nome} não encontrou a opção`).toBeVisible({ timeout: 15_000 });
  const escolhida = (await opcao.innerText()).split('\n')[0].trim();
  await opcao.click();

  if (opts.multipla) {
    await expect(page.locator('main').getByText(fragmento, { exact: false }).first()).toBeVisible();
  } else {
    await expect(caixa).toContainText(fragmento, { ignoreCase: true });
  }
  return escolhida;
}

test.describe(`Formulários escolhem entidades por combobox, não por id colado (#101/#265, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  // Uma venda do demo com cliente (não o Consumidor Final), para a nova devolução.
  let vendaDemo: { numero: string; cliente: string } | null = null;

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      const tenantId = t.rows[0]?.id;
      expect(tenantId, 'tenant demo não existe — corra pnpm db:seed').toBeTruthy();
      await c.query(
        `INSERT INTO "CentroCusto" (id, "tenantId", codigo, nome, tipo, ativo, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'DEPARTAMENTO', true, now(), now())
         ON CONFLICT DO NOTHING`,
        [ID_CENTRO, tenantId, `CC-${MARCA}-${SUF}`, NOME_CENTRO],
      );
      const v = await c.query<{ numero: string; cliente: string }>(
        `SELECT v.numero, cl.nome AS cliente
           FROM "Venda" v JOIN "Cliente" cl ON cl.id = v."clienteId"
          WHERE v."tenantId" = $1 AND cl."deletedAt" IS NULL AND cl.status = 'ATIVO'
            AND cl.codigo <> 'CF-000000' AND v.status IN ('CONCLUIDA', 'FATURADA')
          ORDER BY v."dataVenda" DESC LIMIT 1`,
        [tenantId],
      );
      vendaDemo = v.rows[0] ?? null;
    });
  });

  test.afterAll(async () => {
    await withPg((c) => c.query(`DELETE FROM "CentroCusto" WHERE id = $1`, [ID_CENTRO]));
  });

  test('/compras/cotacoes/novo — requisição e fornecedores a convidar', async ({ page }) => {
    await abrir(page, '/compras/cotacoes/novo');
    await semCamposDeId(page);
    await escolher(page, /Requisi/i);
    await escolher(page, /Fornecedor/i, { multipla: true });
  });

  test('/compras/pedidos/novo — fornecedor, centro de custo, requisição e cotação', async ({ page }) => {
    await abrir(page, '/compras/pedidos/novo');
    await semCamposDeId(page);
    await escolher(page, /Fornecedor/i);
    await escolher(page, /Centro de custo/i, { termo: NOME_CENTRO });
    await escolher(page, /Requisi/i);
    await escolher(page, /Cota/i);
  });

  test('/vendas/devolucoes/nova — cliente, venda do cliente e produto da linha', async ({ page }) => {
    expect(vendaDemo, 'o demo não tem nenhuma venda concluída/facturada com cliente — corra pnpm db:seed').not.toBeNull();
    await abrir(page, '/vendas/devolucoes/nova');
    await semCamposDeId(page);
    await escolher(page, /Cliente/i, { termo: vendaDemo!.cliente });
    await escolher(page, /Venda/i, { termo: vendaDemo!.numero });
    await escolher(page, /Produto/i);
  });

  test('/vendas/comissoes/regras/nova — vendedor', async ({ page }) => {
    await abrir(page, '/vendas/comissoes/regras/nova');
    await semCamposDeId(page);
    await escolher(page, /Vendedor/i);
  });

  test('/servicos/contratos/novo — cliente', async ({ page }) => {
    await abrir(page, '/servicos/contratos/novo');
    await semCamposDeId(page);
    await escolher(page, /Cliente/i);
  });

  test('/producao/estrutura/nova — produto e componente', async ({ page }) => {
    await abrir(page, '/producao/estrutura/nova');
    await semCamposDeId(page);
    await escolher(page, /Produto/i);
    await page.getByRole('button', { name: /Adicionar Componente/i }).click();
    await escolher(page, /Componente/i);
  });

  test('/producao/ordens/nova — produto', async ({ page }) => {
    await abrir(page, '/producao/ordens/nova');
    await semCamposDeId(page);
    await escolher(page, /Produto/i);
  });

  test('/inventario/contagens/nova — responsável, localização e categoria', async ({ page }) => {
    await abrir(page, '/inventario/contagens/nova');
    await semCamposDeId(page);
    await escolher(page, /Respons/i);
    // #101: «contagens de stock (localização/categoria)» — o seed demo tem localizações e categorias.
    await escolher(page, /Localiza/i);
    await escolher(page, /Categoria/i);
  });

  test('/projetos/orcamento/novo — projecto', async ({ page }) => {
    await abrir(page, '/projetos/orcamento/novo');
    await semCamposDeId(page);
    await escolher(page, /Projec?to/i);
  });

  test('/rh/ausencias/nova — colaborador', async ({ page }) => {
    await abrir(page, '/rh/ausencias/nova');
    await semCamposDeId(page);
    await escolher(page, /Colaborador/i);
  });

  test('/rh/beneficios/atribuir — benefício e colaborador', async ({ page }) => {
    await abrir(page, '/rh/beneficios/atribuir');
    await semCamposDeId(page);
    await escolher(page, /Benef/i);
    await escolher(page, /Colaborador/i);
  });
});
