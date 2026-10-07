/**
 * Oráculo E2E — issue #157: «Marcar como Contratado» impede «Admitir como Colaborador».
 *
 * Contrato de UI (decisão do orquestrador: admitir funciona a partir de CONTRATADO enquanto a
 * candidatura não tiver colaborador):
 *   - o detalhe de uma candidatura CONTRATADO SEM colaborador mostra «Admitir como Colaborador»;
 *     o link leva a `/rh/recrutamento/candidaturas/<id>/admitir`, e essa página abre o formulário
 *     (hoje redirige de volta ao detalhe para tudo o que não seja PROPOSTA/ENTREVISTA);
 *   - uma candidatura CONTRATADO COM colaborador não mostra o botão, mostra «Ver ficha do
 *     colaborador», e `/admitir` devolve ao detalhe (sem dupla admissão pela UI).
 *
 * A gravação (colaborador criado, candidatura ligada, vaga) é provada no oráculo de integração
 * `test/integration/recrutamento-admitir-157.test.ts`; aqui só a porta de entrada na UI.
 *
 * Dados (prefixo único `recrutamento-admitir-157`): no tenant `demo`, por SQL, uma vaga, dois
 * candidatos e duas candidaturas CONTRATADO — uma sem colaborador, outra ligada a um colaborador
 * já existente do demo. Limpeza idempotente no beforeAll e no afterAll (por código da vaga; a
 * candidatura leva o histórico em cascata).
 *
 * ESTADO ESPERADO antes da implementação: RED — o botão não aparece em CONTRATADO.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/46-recrutamento-admitir-157.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó D:recrutamento-admitir-157; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'recrutamento-admitir-157';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: o AdmitirSchema valida `candidaturaId` com `.cuid()`.
const ID_VAGA = `cvagarec157${SUF}`;
const ID_CAND_SEM = `ccandsemrec157${SUF}`;
const ID_CAND_COM = `ccandcomrec157${SUF}`;
const ID_CANDIDATURA_SEM = `cctsemrec157${SUF}`;
const ID_CANDIDATURA_COM = `cctcomrec157${SUF}`;

const detalhe = (id: string) => `${BASE}/rh/recrutamento/candidaturas/${id}`;

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

async function limpar(c: Client, tenantId: string): Promise<void> {
  await c.query(
    `DELETE FROM "Candidatura" WHERE "tenantId" = $1
       AND "vagaId" IN (SELECT id FROM "Vaga" WHERE "tenantId" = $1 AND codigo LIKE $2)`,
    [tenantId, `${MARCA}%`],
  );
  await c.query(`DELETE FROM "Candidato" WHERE "tenantId" = $1 AND observacoes = $2`, [tenantId, MARCA]);
  await c.query(`DELETE FROM "Vaga" WHERE "tenantId" = $1 AND codigo LIKE $2`, [tenantId, `${MARCA}%`]);
}

test.describe(`/rh/recrutamento — admitir a partir de CONTRATADO (#157, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      const col = await c.query<{ id: string }>(
        `SELECT id FROM "Colaborador" WHERE "tenantId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!col.rows[0]) throw new Error('STOP: o tenant demo não tem colaboradores (pnpm db:seed)');

      await c.query(
        `INSERT INTO "Vaga" (id, "tenantId", codigo, titulo, descricao, "numeroPosicoes", "posicoesPreenchidas",
           "regimeTrabalho", "tipoContrato", requisitos, status, "dataAbertura", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 3, 1, 'TEMPO_INTEGRAL', 'EFECTIVO', '{}', 'ABERTA', now(), now(), now())`,
        [ID_VAGA, tenantId, `${MARCA}-${SUF}`, `Vaga ${MARCA}`, `Vaga do oráculo ${MARCA}`],
      );
      for (const [id, nome] of [
        [ID_CAND_SEM, `Candidato Sem Colaborador ${SUF}`],
        [ID_CAND_COM, `Candidato Com Colaborador ${SUF}`],
      ] as const) {
        await c.query(
          `INSERT INTO "Candidato" (id, "tenantId", nome, email, telefone, observacoes, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, '+258840000003', $5, now(), now())`,
          [id, tenantId, nome, `${id}@${MARCA}.test.mz`, MARCA],
        );
      }
      for (const [id, candidatoId, colaboradorId] of [
        [ID_CANDIDATURA_SEM, ID_CAND_SEM, null],
        [ID_CANDIDATURA_COM, ID_CAND_COM, col.rows[0].id],
      ] as const) {
        await c.query(
          `INSERT INTO "Candidatura" (id, "tenantId", "vagaId", "candidatoId", etapa, "colaboradorId",
             "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'CONTRATADO', $5, now(), now())`,
          [id, tenantId, ID_VAGA, candidatoId, colaboradorId],
        );
      }
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('CONTRATADO sem colaborador: o detalhe oferece «Admitir como Colaborador» e o formulário abre', async ({ page }) => {
    await page.goto(detalhe(ID_CANDIDATURA_SEM));
    await page.waitForLoadState('networkidle');

    const admitir = page.getByRole('link', { name: /admitir como colaborador/i });
    await expect(admitir).toBeVisible();
    await expect(admitir).toHaveAttribute('href', `/rh/recrutamento/candidaturas/${ID_CANDIDATURA_SEM}/admitir`);

    await admitir.click();
    await page.waitForURL(new RegExp(`/rh/recrutamento/candidaturas/${ID_CANDIDATURA_SEM}/admitir$`));
    await page.waitForLoadState('networkidle');
    // A página não redirigiu para o detalhe: o formulário de admissão está lá.
    expect(new URL(page.url()).pathname).toBe(`/rh/recrutamento/candidaturas/${ID_CANDIDATURA_SEM}/admitir`);
    await expect(page.getByRole('heading', { name: /admitir como colaborador/i })).toBeVisible();
    await expect(page.locator('form')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('CONTRATADO com colaborador: sem botão de admitir, e /admitir devolve ao detalhe', async ({ page }) => {
    await page.goto(detalhe(ID_CANDIDATURA_COM));
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /ver ficha do colaborador/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /admitir como colaborador/i })).toHaveCount(0);

    await page.goto(`${detalhe(ID_CANDIDATURA_COM)}/admitir`);
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe(`/rh/recrutamento/candidaturas/${ID_CANDIDATURA_COM}`);
  });
});
