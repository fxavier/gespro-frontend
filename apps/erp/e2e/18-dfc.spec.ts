/**
 * E2E — Demonstração de Fluxos de Caixa, fluxo completo (spec 22 · WS-2 · issue #153,
 * ticket 10.1; nó `e2e-v` do grafo `dfc`, oráculo do `verificador-fluxo-caixa`).
 *
 * Segue o 10.1 à letra, como admin, só pela UI:
 *   1. desmapear uma conta COM movimento (rubricas → «Desmapear») e ver o impedimento na DFC;
 *   2. «Mapear» a partir do painel de impedimentos (ligação com `voltar`);
 *   3. voltar e gerar a DFC: sem impedimentos, diferença 0,00;
 *   4. validar a versão (rota /validar, com observação) e ver a faixa desaparecer;
 *   5. alterar uma rubrica (designação) e ver a faixa voltar, com a versão seguinte;
 *   6. exportar o PDF: `application/pdf`, e o PDF traz «Mapeamento por validar · versão N».
 *
 * A conta e a rubrica escolhem-se no ecrã (nenhum id fixo): a primeira rubrica operacional,
 * pela ordem da DFC, com uma conta de efeito ≠ 0 no intervalo por omissão.
 *
 * Estado da base. O `afterAll` repõe PELA UI o mapeamento vivo igual ao do seed (a conta
 * volta à rubrica de origem, a designação volta ao que era). As versões criadas ficam
 * (append-only): por corrida, 4 versões novas (desmapear, mapear, editar, repor designação),
 * uma delas VALIDATED. A sentinela da golden (`verificarVersoesDoMapeamento`, revisão de
 * 2026-09-26) aceita-as porque a mais recente e o vivo ficam iguais à v1 semeada.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

test.describe.configure({ mode: 'serial' });

const ROTA_DFC = '/contabilidade/dfc';
const ROTA_RUBRICAS = '/contabilidade/fluxo-caixa/rubricas';
/** Sufixo da designação alterada no passo 5 — nunca faz parte de uma designação do seed. */
const MARCA = ' (E2E 10.1)';

interface Alvo {
  contaCodigo: string;
  contaId: string;
  rubricaCodigo: string;
  rubricaId: string;
  designacaoOriginal: string;
}

let alvo: Alvo | null = null;

/**
 * Raiz do conteúdo da página. Com streaming, o React deixa por instantes uma cópia
 * escondida da árvore suspensa fora de `#main-content`; sem esta raiz, um
 * `getByTestId` resolve a dois elementos (strict mode).
 */
function principal(page: Page): Locator {
  return page.locator('#main-content');
}

// ─── utilitários ────────────────────────────────────────────────────────────

async function abrirDFC(page: Page, caminho = ROTA_DFC): Promise<void> {
  await page.goto(caminho);
  await expect(page.getByRole('heading', { name: 'Demonstração de Fluxos de Caixa' })).toBeVisible({ timeout: 30_000 });
  await expect(principal(page).getByTestId('dfc-articulacao').or(principal(page).getByTestId('dfc-impedimentos'))).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

async function abrirRubricas(page: Page): Promise<void> {
  await page.goto(ROTA_RUBRICAS);
  await expect(principal(page).getByTestId('dfc-versao-actual')).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

/** Texto de um montante tal como o ecrã o mostra é zero? («0,00 MT», com ou sem sinal). */
function ehZero(texto: string): boolean {
  return /^[-−]?\s*0,00\s*MT$/u.test(texto.trim());
}

/** Célula do valor N de uma linha da tabela (2.ª coluna). */
function celulaN(linha: Locator): Locator {
  return linha.locator('td').nth(1);
}

/** Número da versão escrito na faixa «Mapeamento por validar · versão N». */
async function versaoDaFaixa(page: Page): Promise<number> {
  const texto = await principal(page).getByTestId('dfc-faixa-por-validar').innerText();
  const m = /Mapeamento por validar\s*·\s*versão\s*(\d+)/.exec(texto);
  expect(m, `faixa sem número de versão: «${texto}»`).not.toBeNull();
  return Number(m![1]);
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escolhe a rubrica pelo início do rótulo «<código> · …» no Select do formulário de mapear. */
async function escolherRubricaNoMapear(page: Page, rubricaCodigo: string): Promise<void> {
  await principal(page).getByTestId('mapear-rubrica').click();
  await page.getByRole('option', { name: new RegExp(`^${escaparRegex(rubricaCodigo)} · `) }).click();
  await expect(principal(page).getByTestId('mapear-rubrica')).toContainText(`${rubricaCodigo} · `);
}

/** Texto de um PDF do @react-pdf/renderer (streams FlateDecode, strings hex/literais WinAnsi), sem espaços. */
function textoCompactoDoPdf(pdf: Buffer): string {
  const win1252 = new TextDecoder('windows-1252');
  const bruto = pdf.toString('latin1');
  const partes: string[] = [];
  const inicio = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(bruto))) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf('endstream', ini);
    if (fim < 0) break;
    const dados = pdf.subarray(ini, fim);
    let conteudo: string;
    try {
      conteudo = inflateSync(dados).toString('latin1');
    } catch {
      conteudo = dados.toString('latin1');
    }
    const mostra = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|(<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\))\s*Tj/g;
    let t: RegExpExecArray | null;
    while ((t = mostra.exec(conteudo))) {
      const operandos = t[1] ?? t[2] ?? '';
      const op = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)/g;
      let o: RegExpExecArray | null;
      while ((o = op.exec(operandos))) {
        if (o[1] !== undefined) {
          const hex = o[1].replace(/\s+/g, '');
          partes.push(win1252.decode(Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex')));
        } else {
          const lit = (o[2] ?? '').replace(/\\([0-7]{1,3})/g, (_, oct: string) =>
            String.fromCharCode(parseInt(oct, 8) & 0xff),
          ).replace(/\\(.)/g, '$1');
          partes.push(win1252.decode(Uint8Array.from(lit, (c) => c.charCodeAt(0) & 0xff)));
        }
      }
    }
    inicio.lastIndex = fim;
  }
  return partes.join('').replace(/[\s   ]+/g, '').toLowerCase();
}

/**
 * Lê do ecrã a conta e a rubrica do teste: a primeira rubrica operacional, pela ordem da
 * DFC, que tenha uma conta com efeito ≠ 0 no intervalo por omissão. Uma conta com efeito
 * ≠ 0 tem variação ≠ 0, logo tem movimento: desmapeada, TEM de impedir a DFC.
 */
async function escolherAlvo(page: Page): Promise<Alvo> {
  await abrirDFC(page);
  await expect(
    principal(page).getByTestId('dfc-impedimentos'),
    'a DFC por omissão já tem impedimentos: a base tem resíduos (mapeamento vivo diferente do seed)',
  ).toHaveCount(0);

  const expandir = principal(page).locator('[data-testid^="dfc-rubrica-OP-"][data-testid$="-expandir"]');
  const total = await expandir.count();
  expect(total, 'a DFC não mostra nenhuma rubrica operacional').toBeGreaterThan(0);

  let escolha: { contaCodigo: string; rubricaCodigo: string } | null = null;
  for (let i = 0; i < total && !escolha; i++) {
    const botao = expandir.nth(i);
    const testId = (await botao.getAttribute('data-testid'))!;
    const rubricaCodigo = testId.replace(/^dfc-rubrica-/, '').replace(/-expandir$/, '');
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    // Só esta rubrica está aberta: as linhas de conta visíveis são as dela.
    const contas = principal(page).locator('tr[data-testid^="dfc-conta-"]');
    const n = await contas.count();
    for (let j = 0; j < n; j++) {
      const linha = contas.nth(j);
      if (ehZero(await celulaN(linha).innerText())) continue;
      const contaCodigo = (await linha.getAttribute('data-testid'))!.replace(/^dfc-conta-/, '');
      escolha = { contaCodigo, rubricaCodigo };
      break;
    }
    if (!escolha) {
      await botao.click();
      await expect(botao).toHaveAttribute('aria-expanded', 'false');
    }
  }
  expect(escolha, 'nenhuma conta operacional com efeito ≠ 0 no intervalo por omissão').not.toBeNull();
  const { contaCodigo, rubricaCodigo } = escolha!;

  await abrirRubricas(page);
  const linhaRubrica = principal(page).getByTestId(`rubrica-${rubricaCodigo}`);
  await expect(linhaRubrica).toBeVisible();
  const conta = linhaRubrica.getByTestId(`conta-${contaCodigo}`);
  await expect(conta, `a conta ${contaCodigo} não aparece na rubrica ${rubricaCodigo}`).toBeVisible();

  const hrefReatribuir = await conta.getByRole('link', { name: 'Reatribuir' }).getAttribute('href');
  const contaId = new URL(hrefReatribuir!, 'http://x').searchParams.get('contaId');
  const hrefEditar = await linhaRubrica.getByRole('link', { name: 'Editar' }).getAttribute('href');
  const rubricaId = /\/rubricas\/([^/]+)\/editar$/.exec(hrefEditar!)?.[1];
  const designacao = (await linhaRubrica.locator('td').nth(1).locator('div.font-medium').innerText()).trim();
  expect(contaId).toBeTruthy();
  expect(rubricaId).toBeTruthy();

  const escolhido: Alvo = {
    contaCodigo,
    contaId: contaId!,
    rubricaCodigo,
    rubricaId: rubricaId!,
    designacaoOriginal: designacao.endsWith(MARCA) ? designacao.slice(0, -MARCA.length) : designacao,
  };
  // Uma corrida anterior que não chegou a repor deixou a MARCA: repõe-se pela UI antes de começar.
  if (designacao !== escolhido.designacaoOriginal) {
    await editarDesignacao(page, escolhido, designacao, escolhido.designacaoOriginal);
  }
  return escolhido;
}

/**
 * Edita a designação da rubrica PELA UI: «Editar» na página de rubricas (navegação no
 * cliente) e «Guardar». Não se abre `/rubricas/<id>/editar` por `goto`: nessa carga o
 * `networkidle` nunca chega (ver o handoff: o fio de Ariadne liga a `/rubricas/<id>`,
 * que não tem página, e o prefetch dela fica pendente).
 */
async function editarDesignacao(page: Page, alvo: Alvo, antes: string, depois: string): Promise<void> {
  await abrirRubricas(page);
  await principal(page).getByTestId(`rubrica-${alvo.rubricaCodigo}`).getByRole('link', { name: 'Editar' }).click();
  await page.waitForURL((u) => u.pathname === `${ROTA_RUBRICAS}/${alvo.rubricaId}/editar`, { timeout: 30_000 });
  const campo = principal(page).getByLabel('Designação');
  await expect(campo).toHaveValue(antes, { timeout: 30_000 });
  await campo.fill(depois);
  await expect(campo).toHaveValue(depois);
  await principal(page).getByRole('button', { name: 'Guardar' }).click();
  // A prova da escrita é o toast e, a seguir, a página de rubricas relida do servidor. NÃO
  // se espera pelo regresso automático às rubricas: o `router.push` + `router.refresh` do
  // formulário não navega em ~30% das gravações (6/20 medidas em 2026-09-26, escalado ao
  // orquestrador em docs/handoff/dfc-e2e-v.md). O 10.1 pede «alterar uma rubrica», não o
  // regresso; o defeito fica registado e é do ticket 7.3.
  await expect(page.getByText('Rubrica actualizada.').last()).toBeVisible({ timeout: 30_000 });
  await abrirRubricas(page);
  await expect(
    principal(page).getByTestId(`rubrica-${alvo.rubricaCodigo}`).locator('td').nth(1).locator('div.font-medium'),
  ).toHaveText(depois, { timeout: 30_000 });
}

// ─── o fluxo ────────────────────────────────────────────────────────────────

test('DFC: desmapear → impedimento → Mapear → gerar → validar → alterar → faixa → PDF', async ({ page }) => {
  test.setTimeout(300_000);

  alvo = await test.step('escolher a conta e a rubrica a partir do ecrã', () => escolherAlvo(page));
  const { contaCodigo, contaId, rubricaCodigo, designacaoOriginal } = alvo;
  test.info().annotations.push({ type: 'alvo', description: `${contaCodigo} em ${rubricaCodigo} («${designacaoOriginal}»)` });

  await test.step('1. desmapear uma conta com movimento e ver o impedimento', async () => {
    // (a página de rubricas já está aberta, de escolherAlvo)
    const conta = principal(page).getByTestId(`rubrica-${rubricaCodigo}`).getByTestId(`conta-${contaCodigo}`);
    await conta.getByRole('button', { name: 'Desmapear' }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toContainText(contaCodigo);
    await dialogo.getByRole('button', { name: 'Desmapear' }).click();
    await expect(conta).toHaveCount(0, { timeout: 30_000 });
    await expect(principal(page).getByTestId('dfc-contas-sem-mapeamento')).toContainText(contaCodigo);

    await abrirDFC(page);
    const painel = principal(page).getByTestId('dfc-impedimentos');
    await expect(painel).toBeVisible();
    await expect(principal(page).getByTestId('dfc-articulacao')).toHaveCount(0);
    const linha = principal(page).getByTestId(`dfc-nao-mapeada-${contaCodigo}`);
    await expect(linha).toBeVisible();
    await expect(linha).toContainText('Intervalo pedido');
    // Movimento no intervalo ≠ 0: foi por ter movimento que impediu.
    expect(ehZero(await linha.locator('td').nth(3).innerText())).toBe(false);
  });

  let caminhoDFC = '';
  await test.step('2. «Mapear» a partir do painel de impedimentos', async () => {
    const mapear = principal(page).getByTestId(`dfc-mapear-${contaCodigo}`);
    const href = (await mapear.getAttribute('href'))!;
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe(`${ROTA_RUBRICAS}/mapear`);
    expect(url.searchParams.get('contaId')).toBe(contaId);
    const voltar = url.searchParams.get('voltar');
    expect(voltar, 'a ligação «Mapear» tem de levar o voltar para a DFC').toMatch(
      /^\/contabilidade\/dfc\?dataInicio=\d{4}-\d{2}-\d{2}&dataFim=\d{4}-\d{2}-\d{2}$/,
    );
    caminhoDFC = voltar!;

    await mapear.click();
    await page.waitForURL((u) => u.pathname === `${ROTA_RUBRICAS}/mapear`, { timeout: 30_000 });
    await expect(principal(page).getByTestId('mapear-conta')).toHaveValue(new RegExp(`^${escaparRegex(contaCodigo)} · `));
    await expect(principal(page).getByText('Actualmente sem mapeamento.')).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await escolherRubricaNoMapear(page, rubricaCodigo);
    await principal(page).getByTestId('mapear-guardar').click();
  });

  let versaoPendente = 0;
  await test.step('3. voltar e gerar a DFC: sem impedimentos, diferença 0,00', async () => {
    await page.waitForURL(
      (u) => u.pathname === ROTA_DFC && `${u.pathname}${u.search}` === caminhoDFC,
      { timeout: 30_000 },
    );
    await expect(principal(page).getByTestId('dfc-articulacao')).toBeVisible({ timeout: 30_000 });
    await expect(principal(page).getByTestId('dfc-impedimentos')).toHaveCount(0);
    const diferenca = await celulaN(principal(page).getByTestId('dfc-articulacao-diferenca')).innerText();
    expect(ehZero(diferenca), `diferença da articulação: «${diferenca}»`).toBe(true);

    // A conta voltou à rubrica de onde saiu.
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await principal(page).getByTestId(`dfc-rubrica-${rubricaCodigo}-expandir`).click();
    await expect(principal(page).getByTestId(`dfc-conta-${contaCodigo}`)).toBeVisible();

    await expect(principal(page).getByTestId('dfc-faixa-por-validar')).toBeVisible();
    versaoPendente = await versaoDaFaixa(page);
    await expect(principal(page).getByTestId('dfc-versao')).toHaveText(`Mapeamento v${versaoPendente}`);
  });

  await test.step('4. validar a versão e ver a faixa desaparecer', async () => {
    await page.goto(`${ROTA_RUBRICAS}/validar?voltar=${encodeURIComponent(caminhoDFC)}`);
    await expect(principal(page).getByTestId('validar-versao-info')).toContainText(`Versão ${versaoPendente}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await principal(page).getByTestId('validar-observacao').fill(`E2E 10.1 — validação da versão ${versaoPendente}.`);
    await principal(page).getByTestId('validar-versao').click();

    await page.waitForURL((u) => `${u.pathname}${u.search}` === caminhoDFC, { timeout: 30_000 });
    await expect(principal(page).getByTestId('dfc-articulacao')).toBeVisible({ timeout: 30_000 });
    await expect(principal(page).getByTestId('dfc-faixa-por-validar')).toHaveCount(0);
    await expect(principal(page).getByTestId('dfc-versao')).toHaveText(`Mapeamento v${versaoPendente}`);
  });

  await test.step('5. alterar uma rubrica e ver a faixa voltar', async () => {
    await editarDesignacao(page, alvo!, designacaoOriginal, `${designacaoOriginal}${MARCA}`);

    await abrirDFC(page, caminhoDFC);
    await expect(principal(page).getByTestId('dfc-articulacao')).toBeVisible();
    await expect(principal(page).getByTestId('dfc-faixa-por-validar')).toBeVisible();
    expect(await versaoDaFaixa(page)).toBe(versaoPendente + 1);
    await expect(principal(page).getByTestId(`dfc-rubrica-${rubricaCodigo}`)).toContainText(`${designacaoOriginal}${MARCA}`);
  });

  await test.step('6. exportar o PDF', async () => {
    const [resposta, download] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/contabilidade/dfc/export', { timeout: 60_000 }),
      page.waitForEvent('download', { timeout: 60_000 }),
      principal(page).getByTestId('dfc-exportar-pdf').click(),
    ]);
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()['content-type']).toContain('application/pdf');
    expect(download.suggestedFilename()).toMatch(/^dfc-.*\.pdf$/);
    await expect(principal(page).getByTestId('dfc-exportar-erro')).toHaveCount(0);

    const pdf = await readFile((await download.path())!);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const texto = textoCompactoDoPdf(pdf);
    expect(texto, 'o PDF não traz a marca da versão por validar').toContain(
      `mapeamentoporvalidar·versão${versaoPendente + 1}`,
    );
  });
});

// ─── reposição: o mapeamento vivo volta a ser o do seed, pela UI ────────────

test.afterAll(async ({ browser }, testInfo) => {
  if (!alvo) return;
  testInfo.setTimeout(180_000);
  const { contaCodigo, contaId, rubricaCodigo, designacaoOriginal } = alvo;
  const contexto = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: 'playwright/.auth/admin.json',
    locale: 'pt-PT',
    timezoneId: 'Africa/Maputo',
  });
  const page = await contexto.newPage();
  try {
    await abrirRubricas(page);
    const linhaRubrica = principal(page).getByTestId(`rubrica-${rubricaCodigo}`);

    // A conta na rubrica de origem (desmapeada ou reatribuída por uma corrida interrompida).
    if ((await linhaRubrica.getByTestId(`conta-${contaCodigo}`).count()) === 0) {
      await page.goto(`${ROTA_RUBRICAS}/mapear?contaId=${encodeURIComponent(contaId)}`);
      await expect(principal(page).getByTestId('mapear-conta')).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 });
      await escolherRubricaNoMapear(page, rubricaCodigo);
      await principal(page).getByTestId('mapear-guardar').click();
      await page.waitForURL((u) => u.pathname === ROTA_RUBRICAS, { timeout: 30_000 });
    }

    // A designação de origem.
    await abrirRubricas(page);
    const designacaoViva = (await linhaRubrica.locator('td').nth(1).locator('div.font-medium').innerText()).trim();
    if (designacaoViva !== designacaoOriginal) await editarDesignacao(page, alvo, designacaoViva, designacaoOriginal);

    // Confirmação: o vivo é o do seed, e a DFC sai sem impedimentos.
    await abrirRubricas(page);
    await expect(linhaRubrica.getByTestId(`conta-${contaCodigo}`)).toBeVisible();
    await expect(linhaRubrica.locator('td').nth(1).locator('div.font-medium')).toHaveText(designacaoOriginal);
    await abrirDFC(page);
    await expect(principal(page).getByTestId('dfc-impedimentos')).toHaveCount(0);
  } finally {
    await contexto.close();
  }
});
