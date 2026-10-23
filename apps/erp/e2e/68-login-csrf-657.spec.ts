/**
 * E2E (#657): o login não pode depender de uma corrida no token CSRF.
 *
 * Com o `signIn` do cliente (`next-auth/react`), o ecrã `/auth/login` fazia
 * dois `GET /api/auth/session` no mount (StrictMode de dev); cada um emitia um
 * `Set-Cookie: authjs.csrf-token` diferente, o `GET /api/auth/csrf` devolvia
 * um deles e a resposta mais lenta sobrepunha o cookie com o outro. O
 * `POST /api/auth/callback/credentials` seguia com body ≠ cookie e o Auth.js
 * respondia `MissingCSRF` — o utilizador via «Não foi possível iniciar
 * sessão» com as credenciais certas.
 *
 * O teste faz o que a pessoa faz: contexto limpo, abre o ecrã e submete assim
 * que o formulário aparece — sem esperar `networkidle`, que é o que escondia a
 * corrida. Vinte vezes seguidas; todas têm de chegar ao dashboard e nenhuma
 * resposta do Auth.js pode trazer `MissingCSRF`.
 *
 * Localmente o servidor é rápido e as respostas de `session` chegam antes do
 * submit — a corrida só aparecia no CI, com o `next dev` lento. Para a tornar
 * determinística, o teste reproduz a ORDEM do trace do CI (#657): as respostas
 * de `GET /api/auth/session` do mount só chegam ao browser depois de o
 * formulário ter pedido o token CSRF e antes de o `POST` ao callback sair (ou
 * ao fim de 4 s, se esse `POST` nunca existir). Não altera nenhum conteúdo —
 * só atrasa respostas reais do servidor.
 *
 * Não deixa nada na base: só abre sessões.
 */

import { test, expect } from '@playwright/test';
import { USERS, preencherLogin } from './helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

const REPETICOES = 20;

test('login em contexto limpo, 20× seguidas, sem MissingCSRF (#657)', async ({ browser, baseURL }) => {
  test.setTimeout(REPETICOES * 45_000);

  const falhas: string[] = [];
  let missingCsrf = 0;

  for (let i = 1; i <= REPETICOES; i++) {
    const contexto = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await contexto.newPage();

    // Ordem do trace do CI (#657): dois `GET /api/auth/session` saem no mount
    // ao mesmo tempo, ambos sem cookie; o 1.º chega e grava o cookie T1; o 2.º
    // está lento e a resposta dele (cookie T2) só chega enquanto o
    // `GET /api/auth/csrf`, já enviado com T1, ainda está em voo.
    let sessoes = 0;
    let segundaVista!: () => void;
    const segunda = new Promise<void>((r) => (segundaVista = r));
    let soltar!: () => void;
    const solto = new Promise<void>((r) => (soltar = r));
    const retidas: Promise<unknown>[] = [];
    const ate = (p: Promise<unknown>, ms: number) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
    await page.route('**/api/auth/session', async (route) => {
      const n = ++sessoes;
      const cabecalhos = await route.request().allHeaders();
      if (n === 1) {
        await ate(segunda, 2_000);
        return route.continue({ headers: cabecalhos }).catch(() => {});
      }
      if (n === 2) {
        segundaVista();
        // Pedido feito JÁ, sem cookie (como no browser), mas com a resposta
        // retida: fora do Playwright, para o Set-Cookie só chegar ao browser
        // no `fulfill`.
        const pedido = fetch(route.request().url(), { headers: { ...cabecalhos, cookie: '' }, redirect: 'manual' });
        let entregue!: () => void;
        retidas.push(new Promise<void>((r) => (entregue = r)));
        await ate(solto, 4_000);
        const res = await pedido;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));
        const setCookie = res.headers.getSetCookie();
        if (setCookie.length) headers['set-cookie'] = setCookie.join('\n');
        await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) }).catch(() => {});
        entregue();
        return;
      }
      return route.continue().catch(() => {});
    });
    await page.route('**/api/auth/csrf', async (route) => {
      const cabecalhos = await route.request().allHeaders();
      soltar();
      await Promise.all(retidas);
      await route.continue({ headers: cabecalhos });
    });

    const pendentes: Promise<void>[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('MissingCSRF')) missingCsrf++;
      if (url.includes('/api/auth/') && res.request().method() === 'POST') {
        pendentes.push(
          (async () => {
            const local = res.headers()['location'] ?? '';
            const corpo = await res.text().catch(() => '');
            if (local.includes('MissingCSRF') || corpo.includes('MissingCSRF')) missingCsrf++;
          })(),
        );
      }
    });

    try {
      await page.goto('/auth/login');
      await preencherLogin(page, USERS.admin);
      await page.waitForURL(/\/dashboard/, { timeout: 40_000 });
    } catch (e) {
      const alerta = await page.getByRole('alert').textContent().catch(() => null);
      falhas.push(`#${i}: ${page.url()} ${alerta ?? (e as Error).message.split('\n')[0]}`);
    } finally {
      await Promise.all(pendentes);
      await contexto.close();
    }
  }

  expect(missingCsrf, 'respostas do Auth.js com MissingCSRF').toBe(0);
  expect(falhas, 'logins que não chegaram ao dashboard').toEqual([]);
});
