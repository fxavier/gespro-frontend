/**
 * Oráculo E2E — issue #169: tickets sem atribuir agente, comentar ou avaliar; ABERTO →
 * EM_PROGRESSO exige agente e é inalcançável («Os Meus Tickets» sempre vazio).
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais — `AlertDialog` só para
 * confirmar o destrutivo —; as acções chamam as actions de `src/server/actions/tickets.actions.ts`):
 *
 *   Detalhe `/tickets/<id>`:
 *     - Atribuir agente: um combobox com nome acessível /agente|atribu/ (ComboboxRemoto alimentado
 *       por `procurarAgentesTicketAction`, campo «Pesquisar…» no popover; opção pelo NOME do
 *       utilizador) e o botão «Atribuir» (nome /^atribuir/). Gravado, a página mostra o nome
 *       do agente e o ticket aparece em `/tickets/meus` do agente.
 *     - Transições: o «Mudar Estado» existente passa a levar a EM_PROGRESSO («Em Progresso») depois
 *       de atribuir, e daí a RESOLVIDO («Resolvido») e FECHADO («Fechado»).
 *     - Comentários: um campo de texto com rótulo /coment/ e um botão /^(comentar|adicionar
 *       coment|publicar coment|enviar coment)/ — na própria página (aba «Actividades» incluída) ou
 *       numa rota a que se chega pela ligação «Comentar»; nunca Dialog. Gravado, o texto aparece
 *       no histórico do detalhe.
 *     - Avaliação: só depois do fecho; um grupo de opções (radiogroup) com nome /nota|avalia/ e
 *       uma opção (radio) por nota, cujo nome contém o algarismo (1..5); botão /avaliar|enviar
 *       avalia/. Antes do fecho não há grupo de nota. Gravada, a página mostra «4/5» e o grupo
 *       desaparece (a avaliação é única).
 *
 * As regras de servidor (nome do agente lido no servidor, agente de outro tenant/inactivo,
 * TICKET_SEM_AGENTE, só o solicitante avalia, avaliação única, permissões) são provadas em
 * `test/integration/tickets-agente-169.test.ts`.
 *
 * Dados (prefixo único `tickets-agente-169`), no tenant `demo`, por SQL: um ticket ABERTO sem
 * agente cujo solicitante é o admin. O `numero` usa o prefixo `E2E169-` — nunca colide com a série
 * `TKT/aaaa/nnnnnn` (não é número de série inventado, é uma marca de teste). Fica no demo, como os
 * dados dos `47-…` a `51-…`.
 *
 * ESTADO ESPERADO antes da implementação: RED — o detalhe não tem combobox de agente, campo de
 * comentário nem formulário de avaliação.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/52-tickets-agente-169.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó D:tickets-agente-169; um agente de implementação que o altere é
 * BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'tickets-agente-169';
const SUF = Date.now().toString(36);
// Id com forma de cuid: os schemas das actions validam `ticketId` com `.cuid()`.
const ID_TICKET = `ctktag169${SUF}`;
const NUMERO = `E2E169-${SUF}`;
const TITULO = `Impressora do piso 2 ${SUF}`;
const COMENTARIO = `Toner trocado, a aguardar teste ${SUF}`;

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

interface EstadoTicket {
  estado: string;
  atribuidoParaId: string | null;
  atribuidoParaNome: string | null;
  avaliacaoNota: number | null;
}

async function lerTicket(): Promise<EstadoTicket> {
  return withPg(async (c) => {
    const r = await c.query<EstadoTicket>(
      `SELECT estado::text, "atribuidoParaId", "atribuidoParaNome", "avaliacaoNota"
         FROM "Ticket" WHERE id = $1`,
      [ID_TICKET],
    );
    return r.rows[0];
  });
}

async function comentarios(): Promise<string[]> {
  return withPg(async (c) => {
    const r = await c.query<{ descricao: string }>(
      `SELECT descricao FROM "AtividadeTicket" WHERE "ticketId" = $1 AND tipo = 'COMENTARIO'`,
      [ID_TICKET],
    );
    return r.rows.map((x) => x.descricao);
  });
}

let admin: { id: string; nome: string };

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function semModais(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

/** Abre a aba «Actividades» do DetailShell, se a página a tiver. */
async function abaActividades(page: Page): Promise<void> {
  const aba = page.getByRole('tab', { name: /actividades/i });
  if ((await aba.count()) > 0) await aba.first().click();
}

async function mudarEstado(page: Page, rotulo: RegExp): Promise<void> {
  await page.getByRole('button', { name: /mudar estado/i }).click();
  await page.getByRole('menuitem', { name: rotulo }).click();
}

const URL_DETALHE = `${BASE}/tickets/${ID_TICKET}`;

test.describe(`Tickets: atribuir agente, comentar, avaliar (#169, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
      const tenantId = t.rows[0].id;
      const u = await c.query<{ id: string; nome: string; email: string }>(
        `SELECT id, nome, email FROM "User" WHERE email = 'admin@demo.mz' AND "tenantId" = $1`,
        [tenantId],
      );
      if (!u.rows[0]) throw new Error('STOP: admin@demo.mz não existe no demo');
      admin = { id: u.rows[0].id, nome: u.rows[0].nome };

      await c.query(
        `INSERT INTO "Ticket" (id, "tenantId", numero, titulo, descricao, tipo, prioridade, estado,
           "solicitanteId", "solicitanteNome", "solicitanteEmail",
           "slaTempoResposta", "slaTempoResolucao", "slaDataLimiteResposta", "slaDataLimiteResolucao",
           tags, "dataAbertura", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'INCIDENTE', 'NORMAL', 'ABERTO',
           $6, $7, $8,
           240, 2880, now() + interval '4 hours', now() + interval '48 hours',
           ARRAY[]::text[], now(), now(), now())`,
        [ID_TICKET, tenantId, NUMERO, TITULO, `Ticket do oráculo ${MARCA}`, admin.id, admin.nome, u.rows[0].email],
      );
      await c.query(
        `INSERT INTO "AtividadeTicket" (id, "tenantId", "ticketId", tipo, descricao, "autorId", "autorNome", visibilidade, "createdAt")
         VALUES ($1, $2, $3, 'SISTEMA', 'Ticket criado.', $4, $5, 'PUBLICA', now())`,
        [`catv169${SUF}`, tenantId, ID_TICKET, admin.id, admin.nome],
      );
    });
  });

  test('atribuir agente no detalhe: grava, mostra o nome e o ticket entra em «Os Meus Tickets»', async ({ page }) => {
    await abrir(page, URL_DETALHE);
    await semModais(page);
    // Antes do fecho não há avaliação.
    await expect(page.getByRole('radiogroup', { name: /nota|avalia/i })).toHaveCount(0);

    await page.getByRole('combobox', { name: /agente|atribu/i }).click();
    const popover = page.locator('[data-radix-popper-content-wrapper]').last();
    await popover.getByPlaceholder(/pesquisar|procurar/i).fill(admin.nome.slice(0, 5));
    await popover.getByRole('option', { name: new RegExp(esc(admin.nome), 'i') }).first().click();
    await page.getByRole('button', { name: /^atribuir/i }).click();

    await expect.poll(async () => (await lerTicket()).atribuidoParaId, { timeout: 15_000 }).toBe(admin.id);
    expect((await lerTicket()).atribuidoParaNome).toBe(admin.nome);
    await semModais(page);

    await abrir(page, URL_DETALHE);
    await expect(page.getByText(admin.nome).first()).toBeVisible();

    await abrir(page, `${BASE}/tickets/meus`);
    await expect(page.getByText(NUMERO).first()).toBeVisible();
  });

  test('ABERTO → EM_PROGRESSO passa a ser alcançável depois de atribuir', async ({ page }) => {
    await abrir(page, URL_DETALHE);
    await mudarEstado(page, /em progresso/i);
    await expect.poll(async () => (await lerTicket()).estado, { timeout: 15_000 }).toBe('EM_PROGRESSO');
  });

  test('comentar no detalhe (sem modal): grava e o texto aparece no histórico', async ({ page }) => {
    await abrir(page, URL_DETALHE);
    await abaActividades(page);

    let campo = page.getByRole('textbox', { name: /coment/i });
    if ((await campo.count()) === 0) {
      // Alternativa admitida pelo contrato: rota própria a partir da ligação «Comentar».
      await page.getByRole('link', { name: /comentar/i }).first().click();
      await page.waitForLoadState('networkidle');
      campo = page.getByRole('textbox', { name: /coment/i });
    }
    await semModais(page);
    await campo.first().fill(COMENTARIO);
    await page
      .getByRole('button', { name: /^(comentar|adicionar coment|publicar coment|enviar coment)/i })
      .first()
      .click();

    await expect.poll(comentarios, { timeout: 15_000 }).toContain(COMENTARIO);

    await abrir(page, URL_DETALHE);
    await abaActividades(page);
    await expect(page.getByText(COMENTARIO).first()).toBeVisible();
  });

  test('resolver, fechar e avaliar: a nota fica gravada, aparece «4/5» e não se avalia outra vez', async ({ page }) => {
    await abrir(page, URL_DETALHE);
    await expect(page.getByRole('radiogroup', { name: /nota|avalia/i })).toHaveCount(0);
    await mudarEstado(page, /^resolvido/i);
    await expect.poll(async () => (await lerTicket()).estado, { timeout: 15_000 }).toBe('RESOLVIDO');

    await abrir(page, URL_DETALHE);
    await mudarEstado(page, /^fechado/i);
    await expect.poll(async () => (await lerTicket()).estado, { timeout: 15_000 }).toBe('FECHADO');

    await abrir(page, URL_DETALHE);
    await semModais(page);
    const grupo = page.getByRole('radiogroup', { name: /nota|avalia/i });
    await expect(grupo).toBeVisible();
    await grupo.getByRole('radio', { name: /4/ }).first().click();
    await page.getByRole('button', { name: /^(avaliar|enviar avalia)/i }).first().click();

    await expect.poll(async () => (await lerTicket()).avaliacaoNota, { timeout: 15_000 }).toBe(4);

    await abrir(page, URL_DETALHE);
    const abaAvaliacao = page.getByRole('tab', { name: /avalia/i });
    if ((await abaAvaliacao.count()) > 0) await abaAvaliacao.first().click();
    await expect(page.getByText('4/5').first()).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /nota|avalia/i })).toHaveCount(0);
  });
});
