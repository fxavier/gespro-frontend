/**
 * Capturas de ecrã do Manual de Utilizador (docs/manual/img/**).
 *
 * Fonte das capturas: os marcadores nos próprios capítulos —
 *   <!-- captura: <capitulo>/<nome>.png | <rota> -->
 *   <!-- captura: <capitulo>/<nome>.png | <rota-lista> >primeiro -->         (abre a 1.ª linha da tabela)
 *   <!-- captura: <capitulo>/<nome>.png | <rota-lista> >editar-primeiro -->  (menu «Acções» da 1.ª linha › Editar)
 * Acrescentar uma captura é acrescentar um marcador; não se toca neste ficheiro.
 *
 * Pré-requisitos: `docker compose up -d`, `pnpm db:seed`, `pnpm dev` (ou o Playwright arranca-o).
 * Correr (a partir de apps/erp):
 *   npx playwright test --project=manual            # todas
 *   npx playwright test --project=manual -g vendas  # só as de um capítulo
 * Depois: `git checkout -- playwright/.auth/admin.json` (o setup reescreve-o).
 *
 * Sessão: admin@demo.mz (projecto `setup`). Rotas públicas (registo, login, contactos) são
 * capturadas num contexto sem sessão. Tema claro, 1440×900, fuso Africa/Maputo, locale pt-PT.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ_MANUAL = path.resolve(process.cwd(), '../../docs/manual');
const DIR_IMG = path.join(RAIZ_MANUAL, 'img');
const MARCADOR = /<!--\s*captura:\s*([^|]+?)\s*\|\s*(\S+)(?:\s+>(primeiro|editar-primeiro))?\s*-->/g;
const PUBLICAS = [/^\/registo/, /^\/auth\//, /^\/contactos/];

interface Captura {
  ficheiro: string;
  rota: string;
  accao?: 'primeiro' | 'editar-primeiro';
  capitulo: string;
}

function lerCapturas(): Captura[] {
  const out: Captura[] = [];
  for (const md of fs.readdirSync(RAIZ_MANUAL).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()) {
    const texto = fs.readFileSync(path.join(RAIZ_MANUAL, md), 'utf8');
    for (const m of texto.matchAll(MARCADOR)) {
      out.push({ ficheiro: m[1].trim(), rota: m[2].trim(), accao: m[3] as Captura['accao'], capitulo: md });
    }
  }
  return out;
}

async function estabilizar(page: Page) {
  await page.waitForLoadState('networkidle');
  // Esqueletos de <Suspense> e animações de entrada.
  await page.waitForFunction(() => !document.querySelector('[data-slot="skeleton"], .animate-pulse'), null, {
    timeout: 10_000,
  }).catch(() => undefined);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} nextjs-portal{display:none!important}' });
}

async function editarPrimeiraLinha(page: Page) {
  const antes = page.url();
  await page.locator('tbody tr').first().getByRole('button', { name: /^Acç(õ|o)es/ }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.waitForURL((u) => u.toString() !== antes, { timeout: 15_000 });
}

async function abrirPrimeiraLinha(page: Page) {
  const antes = page.url();
  const linha = page.locator('tbody tr.cursor-pointer').first();
  if (await linha.count()) {
    await linha.click();
  } else {
    const ligacao = page.locator('tbody a[href], main a[href*="/"]:has-text("Ver")').first();
    await expect(ligacao, 'lista sem linhas clicáveis — o seed tem dados?').toBeVisible();
    await ligacao.click();
  }
  await page.waitForURL((u) => u.toString() !== antes, { timeout: 15_000 });
}

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

for (const c of lerCapturas()) {
  test(`${c.capitulo} › ${c.ficheiro}`, async ({ page, browser }) => {
    test.setTimeout(90_000);
    const publica = PUBLICAS.some((re) => re.test(c.rota));
    const alvo = publica
      ? await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'pt-PT', timezoneId: 'Africa/Maputo' })).newPage()
      : page;

    const resposta = await alvo.goto(c.rota);
    expect(resposta?.status() ?? 200, `${c.rota} respondeu com erro`).toBeLessThan(400);
    if (c.accao) {
      await estabilizar(alvo);
      await (c.accao === 'primeiro' ? abrirPrimeiraLinha(alvo) : editarPrimeiraLinha(alvo));
    }
    await estabilizar(alvo);
    if (!publica) await expect(alvo, 'a sessão caiu no login').not.toHaveURL(/\/auth\/login/);

    const destino = path.join(DIR_IMG, c.ficheiro);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    await alvo.screenshot({ path: destino });
    if (publica) await alvo.context().close();
  });
}
