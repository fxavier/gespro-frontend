/**
 * Oráculo E2E — editar colaborador: o submit do react-hook-form chama o `dispatch` do
 * `useActionState` FORA de uma transição.
 *
 * Contrato (CLAUDE.md, «Server Action que redirecciona, chamada pelo handleSubmit»): o
 * `handleSubmit` corre o callback fora de uma transição; o `dispatch` tem de ir dentro de
 * `startTransition`, senão o React avisa na consola do browser — «An async function with
 * useActionState was called outside of a transition» — e a acção não fica ligada ao estado
 * pendente nem às redirecções. Nenhum outro teste lê a consola, por isso nada o apanhava.
 *
 * Fluxo: abre /rh/colaboradores/[id]/editar de um colaborador do `demo`, muda o telefone,
 * grava; espera o toast de sucesso e a ida para o detalhe, e nenhum aviso de transição.
 *
 * Dois oráculos, porque o aviso de consola só existe no build de DESENVOLVIMENTO do React:
 *   - em `next dev`, a consola não pode ter «outside of a transition»;
 *   - em qualquer build (`next start` incluído), o efeito observável: com o POST da Server
 *     Action atrasado de propósito, o botão passa a «A guardar…» e fica `disabled` enquanto
 *     a acção está pendente. Fora de uma transição o `isPending` não actualiza e o botão
 *     continua clicável (duplo envio possível) — contra `next start` só este apanha o defeito.
 *
 * Dados: o telefone do colaborador é reposto por SQL no afterAll (fica o AuditLog da edição).
 *
 * Correr: BASE_URL=http://localhost:3000 npx playwright test e2e/66-editar-colaborador-transicao.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 */

import { test, expect } from '@playwright/test';
import { comBaseDados } from './helpers/db';
import { loginAs, USERS } from './helpers/auth';

const TELEFONE_TESTE = '+258 84 066 0066';

let colaborador: { id: string; telefone: string | null } | null = null;

test.beforeAll(async () => {
  colaborador = await comBaseDados(async (c) => {
    const r = await c.query<{ id: string; telefone: string | null }>(
      `SELECT co.id, co.telefone
         FROM "Colaborador" co JOIN "Tenant" t ON t.id = co."tenantId"
        WHERE t.slug = 'demo' AND co."deletedAt" IS NULL
        ORDER BY co.codigo LIMIT 1`,
    );
    return r.rows[0] ?? null;
  });
  if (!colaborador) throw new Error('STOP: nenhum colaborador no tenant demo');
});

test.afterAll(async () => {
  if (!colaborador) return;
  const { id, telefone } = colaborador;
  await comBaseDados((c) => c.query(`UPDATE "Colaborador" SET telefone = $2 WHERE id = $1`, [id, telefone]));
});

test('editar colaborador grava dentro de uma transição e volta ao detalhe', async ({ page }) => {
  const avisos: string[] = [];
  page.on('console', (m) => {
    if (/outside of a transition/i.test(m.text())) avisos.push(m.text());
  });

  await loginAs(page, USERS.admin);
  const id = colaborador!.id;
  await page.goto(`/rh/colaboradores/${id}/editar`);
  await page.waitForLoadState('networkidle');

  const telefone = page.getByLabel('Telefone');
  await telefone.fill(TELEFONE_TESTE);
  // Atrasa o POST da Server Action (header `next-action`) para o pendente ser observável.
  await page.route(`**/rh/colaboradores/${id}/editar`, async (route) => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
      await new Promise((r) => setTimeout(r, 2_000));
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Guardar Alterações' }).click();
  await expect(page.getByRole('button', { name: 'A guardar…' }), 'isPending não acompanhou a acção').toBeDisabled({
    timeout: 1_500,
  });

  await expect(page.getByText('Colaborador actualizado com sucesso!').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForURL(new RegExp(`/rh/colaboradores/${id}$`), { timeout: 15_000 });

  const gravado = await comBaseDados((c) =>
    c.query<{ telefone: string }>(`SELECT telefone FROM "Colaborador" WHERE id = $1`, [id]),
  );
  expect(gravado.rows[0]?.telefone).toBe(TELEFONE_TESTE);
  expect(avisos, 'o dispatch do useActionState correu fora de uma transição').toEqual([]);
});
