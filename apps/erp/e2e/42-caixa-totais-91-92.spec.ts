/**
 * E2E — assistente de fecho de caixa compara o contado com o SALDO ESPERADO (issue #91;
 * nó A:caixa-totais-91-92, oráculo do verificador — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * O defeito: o passo «Confirmação» de /caixa/fechamento calculava `contado − fundoInicial`,
 * ignorando vendas, reforços, sangrias…; e o servidor gravava `contado − (fundo + ABERTURA + …)`.
 * Com fundo 1000 e 300 entrados, contar 1300 mostrava «+300» no ecrã e gravava −1000 na base.
 * Contrato: o assistente MOSTRA o saldo esperado do servidor (fundo + entradas − saídas, a
 * ABERTURA fora) e a diferença é `contado − saldoEsperado`; o que grava é o mesmo número.
 *
 * Utilizador: financeiro@demo.mz (tem caixa:*). Se não tiver sessão aberta, abre-a pela UI com
 * fundo 1000; o fecho no fim devolve o tenant demo ao estado de partida. Se já tiver uma (corrida
 * anterior interrompida), usa-a e o esperado é apurado por SQL independente.
 *
 * ESCRITA DIRECTA NA BASE — uma só: um MovimentoCaixa REFORCO de 300,00 na sessão do utilizador
 * (marcado `caixa-totais-91-92`). Porquê: o ERP não tem UI de reforço, e uma venda POS pela UI é
 * outro fluxo, já coberto pelo 27. O INSERT está preso ao tenant e à sessão ABERTA do utilizador.
 * Leituras de SQL: o saldo esperado independente e, no fim, a linha gravada pelo fecho.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { loginAs, USERS } from './helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

const STAMP = `${Date.now()}`;
const MARCA = `caixa-totais-91-92-${STAMP}`;
const REFORCO = '300.00';

const DENOMINACOES: Array<{ label: string; valor: number }> = [
  { label: 'Nota MT 1000', valor: 1000 },
  { label: 'Nota MT 500', valor: 500 },
  { label: 'Nota MT 200', valor: 200 },
  { label: 'Nota MT 100', valor: 100 },
  { label: 'Nota MT 50', valor: 50 },
  { label: 'Nota MT 20', valor: 20 },
  { label: 'Moeda MT 10', valor: 10 },
  { label: 'Moeda MT 5', valor: 5 },
  { label: 'Moeda MT 2', valor: 2 },
  { label: 'Moeda MT 1', valor: 1 },
];

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

type SessaoAberta = { id: string; tenantId: string; userId: string };

async function sessaoAbertaDe(email: string): Promise<SessaoAberta | null> {
  return comBase(async (c) => {
    const r = await c.query(
      `SELECT s.id, s."tenantId", u.id AS "userId"
         FROM "SessaoCaixa" s JOIN "User" u ON u.id = s."responsavelId" AND u."tenantId" = s."tenantId"
        WHERE u.email = $1 AND s.status = 'ABERTA'`,
      [email],
    );
    expect(r.rowCount, 'um responsável tem no máximo uma sessão ABERTA').toBeLessThanOrEqual(1);
    return (r.rows[0] as SessaoAberta | undefined) ?? null;
  });
}

/** Saldo esperado em CÊNTIMOS, por SQL independente: fundo + Σ entradas − Σ saídas (ABERTURA e FECHAMENTO fora). */
async function esperadoEmCentimos(sessaoId: string, tenantId: string): Promise<number> {
  return comBase(async (c) => {
    const r = await c.query(
      `SELECT ROUND(100 * (s."fundoInicial"
                + COALESCE(SUM(m.valor) FILTER (WHERE m.tipo IN ('VENDA','RECEBIMENTO','REFORCO')), 0)
                - COALESCE(SUM(m.valor) FILTER (WHERE m.tipo IN ('SANGRIA','DEVOLUCAO','PAGAMENTO')), 0)))::bigint AS c
         FROM "SessaoCaixa" s LEFT JOIN "MovimentoCaixa" m ON m."sessaoCaixaId" = s.id AND m."tenantId" = s."tenantId"
        WHERE s.id = $1 AND s."tenantId" = $2
        GROUP BY s.id, s."fundoInicial"`,
      [sessaoId, tenantId],
    );
    return Number(r.rows[0].c);
  });
}

/** Valor monetário de uma linha do resumo, em cêntimos, independente do formato (MT 1 300,00 / 1.300,00 MT). */
async function centimosDaLinha(page: Page, rotulo: RegExp): Promise<number> {
  const linha = page.locator('div').filter({ has: page.getByText(rotulo) }).last();
  await expect(linha).toBeVisible({ timeout: 10_000 });
  const texto = (await linha.innerText()).replace(rotulo, '');
  const digitos = texto.replace(/[^\d]/g, '');
  expect(digitos.length, `a linha ${rotulo} não tem valor: «${texto}»`).toBeGreaterThan(0);
  const negativo = /[-−]/.test(texto);
  return (negativo ? -1 : 1) * Number(digitos);
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

test.describe('caixa-totais-91-92 — fecho compara o contado com o saldo esperado', () => {
  test('fundo + reforço 300: contar o esperado dá diferença 0 no ecrã e na base', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, USERS.financeiro);

    let sessao = await sessaoAbertaDe(USERS.financeiro.email);
    const abertaPorEsteTeste = !sessao;
    if (!sessao) {
      await abrirCaixaPelaUI(page, '1000');
      sessao = await sessaoAbertaDe(USERS.financeiro.email);
    }
    expect(sessao, 'a sessão de caixa do financeiro tem de estar ABERTA').not.toBeNull();
    const { id: sessaoId, tenantId, userId } = sessao!;

    // A única escrita directa: um reforço de 300,00 (ver cabeçalho).
    await comBase(async (c) => {
      const r = await c.query(
        `INSERT INTO "MovimentoCaixa" (id, "tenantId", "sessaoCaixaId", tipo, valor, descricao, "responsavelId")
         SELECT $1, s."tenantId", s.id, 'REFORCO', $2::numeric, $3, $4
           FROM "SessaoCaixa" s WHERE s.id = $5 AND s."tenantId" = $6 AND s.status = 'ABERTA'`,
        [MARCA, REFORCO, `${MARCA} reforço`, userId, sessaoId, tenantId],
      );
      expect(r.rowCount).toBe(1);
    });

    const esperado = await esperadoEmCentimos(sessaoId, tenantId);
    if (abertaPorEsteTeste) {
      // À mão: fundo 1000 + reforço 300 = 1300,00 (a ABERTURA de 1000 não conta outra vez).
      expect(esperado).toBe(130_000);
    }

    // Contagem: a parte inteira do esperado, decomposta em notas e moedas.
    let resto = Math.floor(esperado / 100);
    const contadoCentimos = resto * 100;
    const quantidades = DENOMINACOES.map((d) => {
      const q = Math.floor(resto / d.valor);
      resto -= q * d.valor;
      return { ...d, q };
    });

    await page.goto('/caixa/fechamento');
    await expect(page.getByRole('heading', { name: 'Fecho de Caixa' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Prosseguir para Contagem' }).click();
    await expect(page.getByText('Contagem Física', { exact: true })).toBeVisible({ timeout: 10_000 });

    for (const d of quantidades) {
      if (d.q === 0) continue;
      const campo = page.getByText(d.label, { exact: true }).locator('..').locator('input');
      await campo.fill(String(d.q));
      await expect(campo).toHaveValue(String(d.q));
    }
    await page.getByRole('button', { name: 'Prosseguir', exact: true }).click();
    await expect(page.getByText('Resumo do Fecho')).toBeVisible({ timeout: 10_000 });

    // O assistente mostra o saldo esperado do servidor…
    expect(await centimosDaLinha(page, /Saldo Esperado:?/i), 'linha «Saldo Esperado» do resumo').toBe(esperado);
    // …e a diferença é contado − esperado (hoje: contado − fundo, ou seja +300).
    const diferencaEcra = await centimosDaLinha(page, /^Diferença:?$/i);
    expect(diferencaEcra, 'Diferença = Total Contado − Saldo Esperado').toBe(contadoCentimos - esperado);
    if (abertaPorEsteTeste) expect(diferencaEcra).toBe(0);

    await page.getByRole('button', { name: 'Confirmar Fecho' }).click();
    await page.waitForURL((u) => u.pathname === '/caixa', { timeout: 30_000 });

    // O que a base gravou bate com o que o ecrã mostrou (hoje grava −1000,00).
    const gravada = await comBase(async (c) => {
      const r = await c.query(
        `SELECT status, ROUND(100 * diferenca)::bigint AS dif
           FROM "SessaoCaixa" WHERE id = $1 AND "tenantId" = $2`,
        [sessaoId, tenantId],
      );
      return r.rows[0] as { status: string; dif: string };
    });
    expect(gravada.status).toBe('FECHADA');
    expect(Number(gravada.dif), 'diferença gravada = diferença mostrada').toBe(contadoCentimos - esperado);
  });
});
