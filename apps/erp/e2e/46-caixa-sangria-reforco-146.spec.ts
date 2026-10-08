/**
 * E2E — sangria, reforço e cancelamento a partir do detalhe da sessão de caixa (issue #146;
 * nó C:caixa-sangria-reforco-146, oráculo do VERIFICADOR — alterá-lo do lado de quem implementa
 * é BLOCKER). Prefixo único de dados: `caixa-sangria-reforco-146`.
 *
 * O defeito: os serviços e as Server Actions existem (`registarSangria`, `registarReforco`,
 * `cancelarSessaoCaixa`), mas nenhum ecrã os chama — o detalhe `/caixa/[id]` só oferece «Fechar caixa».
 *
 * Contrato (sem modais; o motivo é um campo, logo é rota; AlertDialog só confirma o cancelamento):
 * - No detalhe de uma sessão ABERTA, ligações «…sangria», «…reforço» e «Cancelar sessão», cada uma
 *   para a sua rota: `/caixa/[id]/sangria`, `/caixa/[id]/reforco`, `/caixa/[id]/cancelar`.
 *   As ligações só aparecem a quem tem a permissão da action (caixa:sangria / caixa:reforco /
 *   caixa:cancelar) e, a de cancelar, só enquanto a ABERTURA for o único movimento.
 * - Sangria/reforço: campos «Valor» e «Motivo» (rótulos associados ao input); o botão de submissão
 *   começa por «Registar» ou «Confirmar». Sem motivo, o formulário MOSTRA «Motivo obrigatório» e
 *   não grava. Com sucesso volta a `/caixa/[id]` e o movimento aparece no extracto.
 * - Cancelar: campo «Motivo»; o botão «Cancelar sessão» abre um AlertDialog (role=alertdialog)
 *   cuja confirmação é um botão com «Confirmar»; ao confirmar, volta a `/caixa/[id]`, a sessão
 *   fica CANCELADA com o motivo nas observações, e as três ligações desaparecem.
 * - Sem a permissão de cancelar, a rota `/caixa/[id]/cancelar` não oferece o formulário.
 *
 * Utilizadores: operador@demo.mz (caixa:sangria e caixa:reforco, SEM caixa:cancelar) para
 * sangria/reforço; gestor@demo.mz (tem caixa:cancelar) para o cancelamento. Se não tiverem sessão
 * aberta, abrem-na pela UI. A sessão do operador fica aberta com os dois movimentos marcados (o 42
 * já sabe trabalhar sobre uma sessão existente); a do gestor termina CANCELADA.
 *
 * Nenhuma escrita directa na base. Leituras SQL: a sessão aberta do utilizador e o que as
 * acções gravaram.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { loginAs, USERS } from './helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

const MARCA = `caixa-sangria-reforco-146-${Date.now()}`;

function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function comBase<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

type SessaoAberta = { id: string; tenantId: string; extras: number };

/** A sessão ABERTA do utilizador e quantos movimentos tem além da ABERTURA. */
async function sessaoAbertaDe(email: string): Promise<SessaoAberta | null> {
  return comBase(async (c) => {
    const r = await c.query(
      `SELECT s.id, s."tenantId",
              (SELECT COUNT(*)::int FROM "MovimentoCaixa" m
                WHERE m."sessaoCaixaId" = s.id AND m."tenantId" = s."tenantId" AND m.tipo <> 'ABERTURA') AS extras
         FROM "SessaoCaixa" s JOIN "User" u ON u.id = s."responsavelId" AND u."tenantId" = s."tenantId"
        WHERE u.email = $1 AND s.status = 'ABERTA'`,
      [email],
    );
    expect(r.rowCount, 'um responsável tem no máximo uma sessão ABERTA').toBeLessThanOrEqual(1);
    return (r.rows[0] as SessaoAberta | undefined) ?? null;
  });
}

async function abrirCaixaPelaUI(page: Page, fundo: string): Promise<void> {
  await page.goto('/caixa/abertura');
  await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  const caixas = page.locator('[role="checkbox"]');
  const n = await caixas.count();
  for (let i = 0; i < n; i++) await caixas.nth(i).click();
  await page.getByRole('button', { name: 'Prosseguir' }).click();
  await expect(page.getByText('Dados da Abertura')).toBeVisible({ timeout: 10_000 });
  await page.getByLabel(/Fundo Inicial/i).fill(fundo);
  await page.getByRole('button', { name: 'Confirmar Abertura' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/caixa') && !u.pathname.includes('/abertura'), {
    timeout: 30_000,
  });
}

async function garantirSessaoAberta(page: Page, email: string): Promise<SessaoAberta> {
  let sessao = await sessaoAbertaDe(email);
  if (!sessao) {
    await abrirCaixaPelaUI(page, '1000');
    sessao = await sessaoAbertaDe(email);
  }
  expect(sessao, `a sessão de caixa de ${email} tem de estar ABERTA`).not.toBeNull();
  return sessao!;
}

async function abrirDetalhe(page: Page, sessaoId: string): Promise<void> {
  await page.goto(`/caixa/${sessaoId}`);
  await expect(page.getByRole('heading', { name: /^Sessão / })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

const ligacaoSangria = (page: Page) => page.getByRole('link', { name: /sangria/i });
const ligacaoReforco = (page: Page) => page.getByRole('link', { name: /refor[çc]o/i });
const ligacaoCancelar = (page: Page) => page.getByRole('link', { name: /cancelar sess[ãa]o/i });
const botaoSubmeter = (page: Page) => page.getByRole('button', { name: /^(registar|confirmar)/i });

/** Abre a rota pela ligação do detalhe, preenche e submete; volta ao detalhe. */
async function registarMovimento(
  page: Page,
  sessaoId: string,
  ligacao: ReturnType<typeof ligacaoSangria>,
  segmento: 'sangria' | 'reforco',
  valor: string,
  motivo: string,
): Promise<void> {
  await abrirDetalhe(page, sessaoId);
  await ligacao.click();
  await page.waitForURL((u) => u.pathname === `/caixa/${sessaoId}/${segmento}`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  // Sem motivo: o erro aparece e nada é gravado (CLAUDE.md — formulário que recusa em silêncio).
  await page.getByLabel(/^Valor/i).fill(valor);
  await botaoSubmeter(page).click();
  await expect(page.getByText('Motivo obrigatório')).toBeVisible({ timeout: 10_000 });
  expect(new URL(page.url()).pathname).toBe(`/caixa/${sessaoId}/${segmento}`);

  await page.getByLabel(/^Motivo/i).fill(motivo);
  await botaoSubmeter(page).click();
  await page.waitForURL((u) => u.pathname === `/caixa/${sessaoId}`, { timeout: 30_000 });
}

async function movimentosMarcados(sessaoId: string, tenantId: string, tipo: string) {
  return comBase(async (c) => {
    const r = await c.query(
      `SELECT ROUND(100 * valor)::bigint AS centimos, descricao
         FROM "MovimentoCaixa"
        WHERE "sessaoCaixaId" = $1 AND "tenantId" = $2 AND tipo = $3 AND descricao LIKE $4`,
      [sessaoId, tenantId, tipo, `%${MARCA}%`],
    );
    return r.rows as Array<{ centimos: string; descricao: string }>;
  });
}

test.describe('caixa-sangria-reforco-146 — acções no detalhe da sessão de caixa', () => {
  test('operador regista reforço e sangria por rotas dedicadas; não vê «Cancelar sessão»', async ({ page }) => {
    test.setTimeout(150_000);
    await loginAs(page, USERS.operador);
    const { id: sessaoId, tenantId } = await garantirSessaoAberta(page, USERS.operador.email);

    await abrirDetalhe(page, sessaoId);
    await expect(ligacaoSangria(page)).toBeVisible();
    await expect(ligacaoReforco(page)).toBeVisible();
    await expect(ligacaoSangria(page)).toHaveAttribute('href', new RegExp(`/caixa/${sessaoId}/sangria$`));
    await expect(ligacaoReforco(page)).toHaveAttribute('href', new RegExp(`/caixa/${sessaoId}/reforco$`));
    // OPERADOR não tem caixa:cancelar.
    await expect(ligacaoCancelar(page)).toHaveCount(0);

    const motivoReforco = `${MARCA} troco`;
    await registarMovimento(page, sessaoId, ligacaoReforco(page), 'reforco', '250', motivoReforco);
    await expect(page.getByText(motivoReforco, { exact: false })).toBeVisible({ timeout: 10_000 });

    const motivoSangria = `${MARCA} cofre`;
    await registarMovimento(page, sessaoId, ligacaoSangria(page), 'sangria', '100', motivoSangria);
    await expect(page.getByText(motivoSangria, { exact: false })).toBeVisible({ timeout: 10_000 });

    // O que a base gravou: um movimento de cada, com o valor e o motivo escritos (o envio sem
    // motivo não gravou nada — senão haveria dois).
    const reforcos = await movimentosMarcados(sessaoId, tenantId, 'REFORCO');
    expect(reforcos).toHaveLength(1);
    expect(Number(reforcos[0].centimos)).toBe(25_000);
    expect(reforcos[0].descricao).toContain(motivoReforco);
    const sangrias = await movimentosMarcados(sessaoId, tenantId, 'SANGRIA');
    expect(sangrias).toHaveLength(1);
    expect(Number(sangrias[0].centimos)).toBe(10_000);
    expect(sangrias[0].descricao).toContain(motivoSangria);

    // Sem caixa:cancelar, a rota de cancelamento não oferece o formulário.
    await page.goto(`/caixa/${sessaoId}/cancelar`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/^Motivo/i)).toHaveCount(0);
    expect((await sessaoAbertaDe(USERS.operador.email))?.id, 'a sessão do operador continua ABERTA').toBe(sessaoId);
  });

  test('gestor cancela uma sessão só com a abertura, com motivo e confirmação em AlertDialog', async ({ page }) => {
    test.setTimeout(150_000);
    await loginAs(page, USERS.gestor);
    const sessao = await garantirSessaoAberta(page, USERS.gestor.email);
    expect(
      sessao.extras,
      'pré-condição: a sessão aberta do gestor só tem a ABERTURA (resíduo de outra corrida? feche-a pela UI)',
    ).toBe(0);
    const { id: sessaoId, tenantId } = sessao;

    await abrirDetalhe(page, sessaoId);
    await expect(ligacaoCancelar(page)).toBeVisible();
    await expect(ligacaoCancelar(page)).toHaveAttribute('href', new RegExp(`/caixa/${sessaoId}/cancelar$`));
    await ligacaoCancelar(page).click();
    await page.waitForURL((u) => u.pathname === `/caixa/${sessaoId}/cancelar`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const motivo = `${MARCA} aberto por engano`;
    await page.getByLabel(/^Motivo/i).fill(motivo);
    await page.getByRole('button', { name: /cancelar sess[ãa]o/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible({ timeout: 10_000 });
    // Ainda nada mudou antes de confirmar.
    expect((await sessaoAbertaDe(USERS.gestor.email))?.id).toBe(sessaoId);
    await dialogo.getByRole('button', { name: /confirmar/i }).click();

    await page.waitForURL((u) => u.pathname === `/caixa/${sessaoId}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const gravada = await comBase(async (c) => {
      const r = await c.query(
        `SELECT status, observacoes, "dataFechamento" IS NOT NULL AS fechada
           FROM "SessaoCaixa" WHERE id = $1 AND "tenantId" = $2`,
        [sessaoId, tenantId],
      );
      return r.rows[0] as { status: string; observacoes: string | null; fechada: boolean };
    });
    expect(gravada.status).toBe('CANCELADA');
    expect(gravada.observacoes ?? '').toContain(motivo);
    expect(gravada.fechada).toBe(true);

    // Sessão cancelada: nenhuma das três acções.
    await expect(ligacaoSangria(page)).toHaveCount(0);
    await expect(ligacaoReforco(page)).toHaveCount(0);
    await expect(ligacaoCancelar(page)).toHaveCount(0);
  });
});
