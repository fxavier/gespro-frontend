/**
 * Oráculo E2E — issue #163: /rh/documentos diz «Upload via ficha do colaborador», e a ficha não tem
 * upload nenhum.
 *
 * Contrato de UI (o do servidor está em `test/integration/rh-documentos-upload-163.test.ts` e o do
 * download em `src/app/api/documentos/__tests__/download-colaborador-163.test.ts`):
 *   - a ficha /rh/colaboradores/[id] tem um separador «Documentos»;
 *   - nele há um upload pelo fluxo existente (`<UploadDocumento recurso="colaborador">`: presign →
 *     PUT → action de registo) — um `<input type="file">`;
 *   - depois do upload o ficheiro aparece na lista desse separador, com uma ligação de download
 *     para `/api/documentos/{id}/download` que responde 302 (presigned GET) para o admin;
 *   - o documento aparece também na listagem global /rh/documentos.
 *
 * Dados (prefixo único `rh-documentos-upload-163`): o ficheiro carregado chama-se
 * `rh-documentos-upload-163-<sufixo>.pdf`; o `DocumentoColaborador` é apagado no beforeAll e no
 * afterAll. Usa o primeiro colaborador activo do tenant `demo`.
 *
 * ESTADO ESPERADO antes da implementação: RED — a ficha só tem o separador «Formação».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/58-rh-documentos-upload-163.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:rh-documentos-upload-163; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const MARCA = 'rh-documentos-upload-163';
const NOME_FICHEIRO = `${MARCA}-${randomUUID().slice(0, 8)}.pdf`;

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

async function limpar(): Promise<void> {
  await withPg((c) => c.query(`DELETE FROM "DocumentoColaborador" WHERE nome LIKE $1`, [`${MARCA}%`]));
}

let colaboradorId = '';

test.beforeAll(async () => {
  await limpar();
  colaboradorId = await withPg(async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT c.id FROM "Colaborador" c JOIN "Tenant" t ON t.id = c."tenantId"
        WHERE t.slug = 'demo' AND c."deletedAt" IS NULL AND c.status = 'ACTIVO'
        ORDER BY c.codigo LIMIT 1`,
    );
    if (!r.rows[0]) throw new Error('Nenhum colaborador activo no tenant demo — corre pnpm db:seed');
    return r.rows[0].id;
  });
});

test.afterAll(async () => {
  await limpar();
});

test('ficha do colaborador: separador «Documentos» com upload, lista e download (#163)', async ({ page }) => {
  await page.goto(`/rh/colaboradores/${colaboradorId}`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('tab', { name: /Documentos/ }).click();
  const painel = page.getByRole('tabpanel');

  const input = painel.locator('input[type="file"]');
  await expect(input).toHaveCount(1);
  await input.setInputFiles({
    name: NOME_FICHEIRO,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% oráculo #163\n%%EOF\n'),
  });

  // O registo grava e a página refresca: o ficheiro aparece na lista do separador. `exact: true`
  // é de propósito — o próprio uploader mostra «A carregar <nome>» / «A registar <nome>» /
  // «Documento carregado: <nome>», e um match por substring passava ANTES de a action gravar.
  // Só a linha da lista tem o nome sozinho.
  await expect(painel.getByText(NOME_FICHEIRO, { exact: true })).toBeVisible({ timeout: 15_000 });

  const lerDocs = () =>
    withPg(async (c) => {
      const r = await c.query<{ id: string; colaboradorId: string; url: string }>(
        `SELECT id, "colaboradorId", url FROM "DocumentoColaborador" WHERE nome = $1`,
        [NOME_FICHEIRO],
      );
      return r.rows;
    });
  // Ainda assim, a leitura à base espera pelo commit em vez de correr contra ele.
  await expect
    .poll(async () => (await lerDocs()).length, {
      message: 'o upload não gravou exactamente um DocumentoColaborador',
      timeout: 15_000,
    })
    .toBe(1);
  const doc = await lerDocs();
  expect(doc, 'o upload não gravou exactamente um DocumentoColaborador').toHaveLength(1);
  expect(doc[0].colaboradorId).toBe(colaboradorId);
  expect(doc[0].url).toMatch(/^gestpro-storage:tenant\/[^/]+\/colaborador\//);

  // Download: a ligação do documento aponta para a rota segura e responde 302.
  const ligacao = painel.locator(`a[href*="/api/documentos/${doc[0].id}/download"]`);
  await expect(ligacao).toHaveCount(1);
  const href = await ligacao.getAttribute('href');
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status(), `download respondeu ${res.status()}`).toBe(302);

  // Listagem global continua a mostrá-lo.
  await page.goto('/rh/documentos');
  await expect(page.getByText(NOME_FICHEIRO).first()).toBeVisible();
});
