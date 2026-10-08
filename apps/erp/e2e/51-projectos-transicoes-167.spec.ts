/**
 * Oráculo E2E — issue #167: projectos sem mudar estado, criar/editar tarefas, aprovar timesheets
 * nem criar marcos.
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais — `AlertDialog` só para
 * confirmar o destrutivo —, sem endpoints novos; as rotas chamam as actions de
 * `src/server/actions/projetos.actions.ts`):
 *
 *   Projecto — detalhe `/projetos/lista/<id>`:
 *     - mostra UM botão por transição permitida por `TRANSICOES_PROJETO` a partir do estado
 *       actual, e nenhum para as outras. Nomes acessíveis: EM_ANDAMENTO «Iniciar» (a partir de
 *       PAUSADO pode ser «Retomar»), PAUSADO «Pausar», CONCLUIDO «Concluir», CANCELADO
 *       «Cancelar projecto», ARQUIVADO «Arquivar»;
 *     - clicar grava a transição (`transitarStatusProjetoAction`) e a página passa a mostrar os
 *       botões do novo estado.
 *
 *   Tarefas:
 *     - «Nova Tarefa» em `/projetos/tarefas` leva a `/projetos/tarefas/novo` (hoje leva à lista
 *       de projectos — é a queixa da issue);
 *     - o formulário tem Projecto (combobox /projecto/, opção pelo NOME), Código, Título e Prazo
 *       (`input type="date"`, rótulo /prazo|data.*(fim|prevista)/); «Criar tarefa» cria a tarefa
 *       A_FAZER e leva ao detalhe `/projetos/tarefas/<id>` (a ligação da tabela já aponta para
 *       lá e hoje dá 404);
 *     - o detalhe tem a ligação «Editar» para `/projetos/tarefas/<id>/editar`; aí, «Guardar»
 *       grava o título novo e volta ao detalhe.
 *
 *   Timesheets:
 *     - cada linha de `/projetos/timesheet` liga a `/projetos/timesheet/<id>`;
 *     - o detalhe de um registo por aprovar mostra «Aprovar» (grava `aprovado`) e o caminho
 *       para rejeitar: um campo «Motivo» (rótulo /motivo/) e o botão «Rejeitar» — na própria
 *       página ou numa rota a que se chega pela ligação/botão «Rejeitar» (recolher texto é
 *       formulário, logo nunca Dialog); rejeitar grava `motivoRejeicao` e o registo aparece como
 *       rejeitado (/rejeitad/); um registo aprovado ou rejeitado já não mostra «Aprovar».
 *
 *   Marcos:
 *     - «Novo Marco» em `/projetos/marcos` leva a `/projetos/marcos/novo`; o formulário tem
 *       Projecto (combobox /projecto/), Nome e Data prevista (`input type="date"`); «Criar marco»
 *       cria o marco PENDENTE no projecto e sai de `/novo`.
 *
 * As regras de servidor (máquinas de estado, projecto de outro tenant, rejeitar sem motivo,
 * rejeitar terminal, permissões) são provadas em `test/integration/projectos-transicoes-167.test.ts`.
 *
 * Dados (prefixo único `projectos-transicoes-167`), no tenant `demo`, por SQL: dois projectos
 * (um PLANEAMENTO para as transições, um EM_ANDAMENTO para tarefas/marcos/timesheets) e dois
 * timesheets por aprovar de um colaborador já existente no demo. Ficam no demo, como os dados
 * dos `47-…` a `50-…`.
 *
 * ESTADO ESPERADO antes da implementação: RED — o detalhe do projecto não tem botões de estado,
 * «Nova Tarefa» aponta para `/projetos/lista`, não existem `/projetos/tarefas/novo`,
 * `/projetos/tarefas/<id>`, `/projetos/timesheet/<id>` nem `/projetos/marcos/novo`.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/51-projectos-transicoes-167.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó D:projectos-transicoes-167; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'projectos-transicoes-167';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_PROJ_ESTADOS = `cprjest167${SUF}`;
const ID_PROJ_TRABALHO = `cprjtrb167${SUF}`;
const NOME_PROJ_TRABALHO = `Projecto PT167 ${SUF}`;
const ID_TS_APROVAR = `ctsapr167${SUF}`;
const ID_TS_REJEITAR = `ctsrej167${SUF}`;
const COD_TAREFA = `T167${SUF}`.slice(0, 20);
const TITULO_TAREFA = `Levantamento de requisitos ${SUF}`;
const TITULO_REVISTO = `Levantamento revisto ${SUF}`;
const NOME_MARCO = `Entrega da fase 1 ${SUF}`;
const MOTIVO = `Horas fora do âmbito ${SUF}`;

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

async function tenantDemo(c: Client): Promise<string> {
  const r = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
  if (!r.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  return r.rows[0].id;
}

/** Dia civil de Maputo daqui a `dias`, como `aaaa-mm-dd` (para `input type="date"`). */
function diaMaputo(dias: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(new Date(Date.now() + dias * 86_400_000));
}

async function estadoProjeto(id: string): Promise<string> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string }>(`SELECT status::text FROM "Projeto" WHERE id = $1`, [id]);
    return r.rows[0]?.status;
  });
}

async function tarefaPorCodigo(): Promise<{ id: string; status: string; titulo: string; projetoId: string } | undefined> {
  return withPg(async (c) => {
    const r = await c.query<{ id: string; status: string; titulo: string; projetoId: string }>(
      `SELECT id, status::text, titulo, "projetoId" FROM "TarefaProjeto" WHERE codigo = $1`,
      [COD_TAREFA],
    );
    return r.rows[0];
  });
}

async function timesheet(id: string): Promise<{ aprovado: boolean; motivo: string | null }> {
  return withPg(async (c) => {
    const r = await c.query<{ aprovado: boolean; motivo: string | null }>(
      `SELECT aprovado, "motivoRejeicao" AS motivo FROM "Timesheet" WHERE id = $1`,
      [id],
    );
    return r.rows[0];
  });
}

async function marcos(): Promise<Array<{ status: string; projetoId: string }>> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; projetoId: string }>(
      `SELECT status::text, "projetoId" FROM "Marco" WHERE nome = $1`,
      [NOME_MARCO],
    );
    return r.rows;
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function semModais(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

/** Escolhe uma opção num combobox (Select ou Combobox/ComboboxRemoto, com campo de pesquisa ou sem ele). */
async function escolher(page: Page, campo: RegExp, pesquisa: string, opcao: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: campo }).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  const procurar = popover.getByPlaceholder(/pesquisar|procurar/i);
  if (await procurar.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) {
    await procurar.fill(pesquisa);
  }
  await popover.getByRole('option', { name: opcao }).first().click();
}

const BOTOES_ESTADO = {
  iniciar: /^iniciar/i,
  retomar: /^(retomar|iniciar)/i,
  pausar: /^pausar/i,
  concluir: /^concluir/i,
  cancelar: /^cancelar projecto/i,
  arquivar: /^arquivar/i,
};

test.describe(`Projectos: estado, tarefas, timesheets e marcos (#167, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      const col = await c.query<{ id: string }>(
        `SELECT id FROM "Colaborador" WHERE "tenantId" = $1 ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!col.rows[0]) throw new Error('STOP: o demo não tem colaboradores');
      const colaboradorId = col.rows[0].id;

      await c.query('BEGIN');
      try {
        for (const [id, codigo, nome, status] of [
          [ID_PROJ_ESTADOS, `PRJ-E-${SUF}`, `Projecto Estados 167 ${SUF}`, 'PLANEAMENTO'],
          [ID_PROJ_TRABALHO, `PRJ-T-${SUF}`, NOME_PROJ_TRABALHO, 'EM_ANDAMENTO'],
        ] as const) {
          await c.query(
            `INSERT INTO "Projeto" (id, "tenantId", codigo, nome, descricao, tipo, status, prioridade, "dataInicio",
               "dataFimPrevista", tags, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, 'INTERNO', $6::"StatusProjeto", 'MEDIA', now() - interval '10 days',
               now() + interval '90 days', ARRAY[]::text[], now(), now())`,
            [id, tenantId, codigo, nome, `Projecto do oráculo ${MARCA}`, status],
          );
        }
        // Datas de amanhã: ficam no topo da lista (ordenada por data desc).
        for (const id of [ID_TS_APROVAR, ID_TS_REJEITAR]) {
          await c.query(
            `INSERT INTO "Timesheet" (id, "tenantId", "projetoId", "colaboradorId", data, "horaInicio", "horaFim",
               "duracaoHoras", descricao, tipo, faturavel, aprovado, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5::date, $5::date + time '08:00', $5::date + time '10:00', 2, $6,
               'DESENVOLVIMENTO', false, false, now(), now())`,
            [id, tenantId, ID_PROJ_TRABALHO, colaboradorId, diaMaputo(1), `Registo ${MARCA} ${id}`],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('detalhe do projecto: só as transições permitidas, e cada clique grava o estado novo', async ({ page }) => {
    const url = `${BASE}/projetos/lista/${ID_PROJ_ESTADOS}`;
    await abrir(page, url);
    await semModais(page);

    // PLANEAMENTO → [EM_ANDAMENTO, CANCELADO]
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.iniciar })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.cancelar })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.pausar })).toHaveCount(0);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.concluir })).toHaveCount(0);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.arquivar })).toHaveCount(0);

    await page.getByRole('button', { name: BOTOES_ESTADO.iniciar }).click();
    await expect.poll(() => estadoProjeto(ID_PROJ_ESTADOS), { timeout: 15_000 }).toBe('EM_ANDAMENTO');

    // EM_ANDAMENTO → [PAUSADO, CONCLUIDO, CANCELADO]
    await abrir(page, url);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.pausar })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.concluir })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.iniciar })).toHaveCount(0);

    await page.getByRole('button', { name: BOTOES_ESTADO.pausar }).click();
    await expect.poll(() => estadoProjeto(ID_PROJ_ESTADOS), { timeout: 15_000 }).toBe('PAUSADO');

    // PAUSADO → [EM_ANDAMENTO, CANCELADO]
    await abrir(page, url);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.pausar })).toHaveCount(0);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.concluir })).toHaveCount(0);
    await page.getByRole('button', { name: BOTOES_ESTADO.retomar }).click();
    await expect.poll(() => estadoProjeto(ID_PROJ_ESTADOS), { timeout: 15_000 }).toBe('EM_ANDAMENTO');

    await abrir(page, url);
    await page.getByRole('button', { name: BOTOES_ESTADO.concluir }).click();
    await expect.poll(() => estadoProjeto(ID_PROJ_ESTADOS), { timeout: 15_000 }).toBe('CONCLUIDO');

    // CONCLUIDO → [ARQUIVADO]
    await abrir(page, url);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.arquivar })).toBeVisible();
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.cancelar })).toHaveCount(0);
    await expect(page.getByRole('button', { name: BOTOES_ESTADO.iniciar })).toHaveCount(0);
  });

  test('«Nova Tarefa» abre o formulário; criar leva ao detalhe; editar grava o título', async ({ page }) => {
    await abrir(page, `${BASE}/projetos/tarefas`);
    const nova = page.getByRole('link', { name: /nova tarefa/i });
    await expect(nova).toHaveAttribute('href', '/projetos/tarefas/novo');
    await nova.click();
    await page.waitForURL(/\/projetos\/tarefas\/novo$/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await semModais(page);

    await escolher(page, /projecto/i, NOME_PROJ_TRABALHO, new RegExp(esc(NOME_PROJ_TRABALHO)));
    await page.getByLabel(/c[óo]digo/i).fill(COD_TAREFA);
    await page.getByLabel(/t[íi]tulo/i).fill(TITULO_TAREFA);
    await page.getByLabel(/prazo|data.*(fim|prevista)/i).fill(diaMaputo(30));
    await page.getByRole('button', { name: /criar tarefa/i }).click();

    await expect.poll(async () => (await tarefaPorCodigo())?.status, { timeout: 15_000 }).toBe('A_FAZER');
    const tarefa = (await tarefaPorCodigo())!;
    expect(tarefa).toMatchObject({ titulo: TITULO_TAREFA, projetoId: ID_PROJ_TRABALHO });
    await page.waitForURL(new RegExp(`/projetos/tarefas/${tarefa.id}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(TITULO_TAREFA).first()).toBeVisible();

    const editar = page.locator(`a[href="/projetos/tarefas/${tarefa.id}/editar"]`);
    await expect(editar.first()).toBeVisible();
    await editar.first().click();
    await page.waitForURL(new RegExp(`/projetos/tarefas/${tarefa.id}/editar$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await semModais(page);

    const titulo = page.getByLabel(/t[íi]tulo/i);
    await expect(titulo).toHaveValue(TITULO_TAREFA);
    await titulo.fill(TITULO_REVISTO);
    await page.getByRole('button', { name: /guardar/i }).click();

    await expect.poll(async () => (await tarefaPorCodigo())?.titulo, { timeout: 15_000 }).toBe(TITULO_REVISTO);
    await page.waitForURL(new RegExp(`/projetos/tarefas/${tarefa.id}$`), { timeout: 15_000 });
  });

  test('timesheet: a linha leva ao detalhe; «Aprovar» aprova', async ({ page }) => {
    await abrir(page, `${BASE}/projetos/timesheet`);
    const linha = page.locator(`a[href="/projetos/timesheet/${ID_TS_APROVAR}"]`);
    await expect(linha.first()).toBeVisible();
    await linha.first().click();
    await page.waitForURL(new RegExp(`/projetos/timesheet/${ID_TS_APROVAR}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^aprovar/i }).click();
    // Confirmação opcional por AlertDialog (único modal permitido).
    const confirmar = page.getByRole('alertdialog').getByRole('button', { name: /aprovar|confirmar/i });
    if (await confirmar.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false)) {
      await confirmar.click();
    }
    await expect.poll(async () => (await timesheet(ID_TS_APROVAR)).aprovado, { timeout: 15_000 }).toBe(true);

    await abrir(page, `${BASE}/projetos/timesheet/${ID_TS_APROVAR}`);
    await expect(page.getByRole('button', { name: /^aprovar/i })).toHaveCount(0);
    expect((await timesheet(ID_TS_APROVAR)).motivo).toBeNull();
  });

  test('timesheet: rejeitar exige motivo, grava-o e o registo fica rejeitado', async ({ page }) => {
    await abrir(page, `${BASE}/projetos/timesheet/${ID_TS_REJEITAR}`);
    await semModais(page);

    // O formulário de rejeição pode estar no detalhe ou numa rota própria (nunca Dialog).
    const motivo = page.getByLabel(/motivo/i);
    if ((await motivo.count()) === 0) {
      await page.getByRole('link', { name: /rejeitar/i }).or(page.getByRole('button', { name: /rejeitar/i })).first().click();
      await page.waitForLoadState('networkidle');
      await semModais(page);
    }
    await expect(page.getByLabel(/motivo/i)).toBeVisible();

    // Sem motivo: não grava.
    await page.getByRole('button', { name: /rejeitar/i }).last().click();
    await page.waitForTimeout(1_500);
    expect(await timesheet(ID_TS_REJEITAR)).toEqual({ aprovado: false, motivo: null });

    await page.getByLabel(/motivo/i).fill(MOTIVO);
    await page.getByRole('button', { name: /rejeitar/i }).last().click();
    await expect.poll(async () => (await timesheet(ID_TS_REJEITAR)).motivo, { timeout: 15_000 }).toBe(MOTIVO);
    expect((await timesheet(ID_TS_REJEITAR)).aprovado).toBe(false);

    await abrir(page, `${BASE}/projetos/timesheet/${ID_TS_REJEITAR}`);
    await expect(page.getByText(/rejeitad/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^aprovar/i })).toHaveCount(0);
  });

  test('«Novo Marco» abre o formulário e cria o marco PENDENTE no projecto', async ({ page }) => {
    await abrir(page, `${BASE}/projetos/marcos`);
    const novo = page.getByRole('link', { name: /novo marco/i });
    await expect(novo).toHaveAttribute('href', '/projetos/marcos/novo');
    await novo.click();
    await page.waitForURL(/\/projetos\/marcos\/novo$/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await semModais(page);

    await escolher(page, /projecto/i, NOME_PROJ_TRABALHO, new RegExp(esc(NOME_PROJ_TRABALHO)));
    await page.getByLabel(/^nome/i).fill(NOME_MARCO);
    await page.getByLabel(/data prevista/i).fill(diaMaputo(45));
    await page.getByRole('button', { name: /criar marco/i }).click();

    await expect.poll(async () => (await marcos()).length, { timeout: 15_000 }).toBe(1);
    expect(await marcos()).toEqual([{ status: 'PENDENTE', projetoId: ID_PROJ_TRABALHO }]);
    await page.waitForURL((u) => !u.pathname.endsWith('/novo'), { timeout: 15_000 });
  });
});
