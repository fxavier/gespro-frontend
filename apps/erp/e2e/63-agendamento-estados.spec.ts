/**
 * Estado do agendamento de serviço mudado pelo detalhe /servicos/agendamentos/[id]:
 * Pendente → Confirmar → Iniciar → Concluir (rota própria, com notas), e o cancelamento
 * confirmado por AlertDialog.
 *
 * Dados: um serviço e dois agendamentos inseridos por SQL no tenant `demo` (prefixo `e2e-ag-63`),
 * apagados no afterAll.
 *
 * Correr: npx playwright test e2e/63-agendamento-estados.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 */

import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { comBaseDados } from './helpers/db';

const MARCA = 'e2e-ag-63';
const cuid = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const ID_SRV = cuid();
const ID_AG = cuid();
const ID_AG_CANCELAR = cuid();

async function limpar() {
  await comBaseDados(async (c) => {
    await c.query(`DELETE FROM "AgendamentoServico" WHERE codigo LIKE $1`, [`${MARCA}%`]);
    await c.query(`DELETE FROM "Servico" WHERE codigo LIKE $1`, [`${MARCA}%`]);
  });
}

test.beforeAll(async () => {
  await limpar();
  await comBaseDados(async (c) => {
    const { rows } = await c.query(`SELECT id FROM "Tenant" WHERE slug = 'demo'`);
    const tenantId = rows[0].id;
    await c.query(
      `INSERT INTO "Servico" (id, "tenantId", codigo, nome, preco, "duracaoEstimada", "updatedAt")
       VALUES ($1, $2, $3, 'Serviço E2E 63', 1000, 60, now())`,
      [ID_SRV, tenantId, `${MARCA}-SRV`],
    );
    for (const [id, sufixo] of [[ID_AG, 'A'], [ID_AG_CANCELAR, 'B']]) {
      await c.query(
        `INSERT INTO "AgendamentoServico" (id, "tenantId", codigo, "servicoId", "clienteId", "clienteNome",
           "clienteEmail", "clienteTelefone", "dataAgendamento", "horaInicio", "horaFim", "duracaoEstimada",
           local, endereco, cidade, provincia, "precoServico", total, "updatedAt")
         VALUES ($1, $2, $3, $4, 'cli-e2e-63', 'Cliente E2E 63', 'e2e63@test.mz', '840000000',
           timestamp '2026-12-01 10:00:00', '09:00', '10:00', 60, 'Escritório', 'Av. 24 de Julho',
           'Maputo', 'Maputo', 1000, 1160, now())`,
        [id, tenantId, `${MARCA}-${sufixo}`, ID_SRV],
      );
    }
  });
});

test.afterAll(limpar);

test('Pendente → Confirmado → Em andamento → Concluído, com notas', async ({ page }) => {
  await page.goto(`/servicos/agendamentos/${ID_AG}`);

  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
  await expect(page.getByText('Confirmado').first()).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Concluir', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Concluir', exact: true }).click();
  await page.waitForURL(`**/servicos/agendamentos/${ID_AG}/concluir`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Notas de conclusão').fill('Filtro substituído.');
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();

  await page.waitForURL(`**/servicos/agendamentos/${ID_AG}`);
  await expect(page.getByText('Filtro substituído.')).toBeVisible();
  await expect(page.getByText('Concluído').first()).toBeVisible();
  // Estado terminal: sem mais acções.
  await expect(page.getByRole('button', { name: /Confirmar|Iniciar|Cancelar agendamento/ })).toHaveCount(0);

  const { rows } = await comBaseDados((c) =>
    c.query(`SELECT status, "notasConclusao" FROM "AgendamentoServico" WHERE id = $1`, [ID_AG]),
  );
  expect(rows[0]).toEqual({ status: 'CONCLUIDO', notasConclusao: 'Filtro substituído.' });
});

test('Cancelar pede confirmação e fecha o agendamento', async ({ page }) => {
  await page.goto(`/servicos/agendamentos/${ID_AG_CANCELAR}`);
  await page.getByRole('button', { name: 'Cancelar agendamento' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('não pode voltar atrás');
  await dialogo.getByRole('button', { name: 'Cancelar agendamento' }).click();

  await expect(dialogo).toBeHidden();
  await expect(page.getByText('Cancelado').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
  const { rows } = await comBaseDados((c) =>
    c.query(`SELECT status FROM "AgendamentoServico" WHERE id = $1`, [ID_AG_CANCELAR]),
  );
  expect(rows[0].status).toBe('CANCELADO');
});
