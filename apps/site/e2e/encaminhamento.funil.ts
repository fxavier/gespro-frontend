import { test, expect } from "@playwright/test";

/**
 * O funil do site termina no ERP (Requisito 2.1 / tarefa 6.5).
 *
 * O que se verifica aqui não é «a página abre» — é que o contexto comercial
 * atravessa a fronteira de domínio: sem `plano` o ecrã de registo não sabe o
 * que a pessoa escolheu na tabela de preços, e sem `utm_*` a conversão deixa de
 * ter origem (ADR-0031 §Consequências, Requisito 7.2).
 *
 * O destino é `NEXT_PUBLIC_APP_URL`, que na suite cai em `http://localhost:3000`
 * — o teste não abre o ERP (pode não estar a correr): lê o `Location` do 307,
 * que é exactamente o contrato desta lane.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

test("/comecar responde 307 para o registo do ERP", async ({ request }) => {
  const resposta = await request.get("/comecar", { maxRedirects: 0 });

  expect(resposta.status()).toBe(307);
  expect(resposta.headers().location).toBe(`${APP_URL}/registo`);
});

test("o encaminhamento preserva o plano e todos os utm_*", async ({
  request,
}) => {
  const resposta = await request.get(
    "/comecar?plano=PROFISSIONAL&utm_source=google&utm_medium=cpc&utm_campaign=erp-mz",
    { maxRedirects: 0 }
  );

  expect(resposta.status()).toBe(307);

  const destino = new URL(resposta.headers().location!);
  expect(destino.origin).toBe(new URL(APP_URL).origin);
  expect(destino.pathname).toBe("/registo");
  expect(destino.searchParams.get("plano")).toBe("PROFISSIONAL");
  expect(destino.searchParams.get("utm_source")).toBe("google");
  expect(destino.searchParams.get("utm_medium")).toBe("cpc");
  expect(destino.searchParams.get("utm_campaign")).toBe("erp-mz");
});

test("o botão da tabela de preços leva o plano até ao ERP", async ({
  page,
  request,
}) => {
  await page.goto("/precos");

  const ligacao = page.locator('a[href*="/comecar?plano="]').first();
  await expect(ligacao).toBeVisible();

  const href = await ligacao.getAttribute("href");
  const resposta = await request.get(href!, { maxRedirects: 0 });

  expect(resposta.status()).toBe(307);
  expect(resposta.headers().location).toContain("plano=");
});

test("a resposta traz uma ligação de reserva e nenhum formulário", async ({
  request,
}) => {
  const resposta = await request.get("/comecar?plano=BASICO", {
    maxRedirects: 0,
  });
  const corpo = await resposta.text();

  // A RFC 9110 §15.4 pede uma nota com ligação no corpo de um encaminhamento —
  // é o que serve quem tenha o salto bloqueado (Requisito 2.1).
  expect(corpo).toContain('<a href="http');
  expect(corpo).toContain("registo?plano=BASICO");

  // E o que não pode voltar: o site a recolher dados de registo.
  expect(corpo).not.toContain("<form");
  expect(corpo).not.toContain("challenges.cloudflare.com");
});
