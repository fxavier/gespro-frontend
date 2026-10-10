/**
 * Oráculo estático — issues #282 e #301: o balancete legado em `localStorage`
 * (`/contabilidade/balancete/nova`, «Salvar» fictício) e a imagem do balancete no manual.
 *
 * Varre o CÓDIGO e a DOCUMENTAÇÃO (não precisa de servidor nem de dados).
 *
 * Contrato (decisão do orquestrador, ADR-0040 — o ecrã real é `/contabilidade/balancete`):
 *   #282
 *   1. A página `/contabilidade/balancete/nova` deixa de existir (nem `page.tsx` nem pasta).
 *   2. Nenhuma ligação para ela em `apps/erp/src` ou `apps/erp/e2e` (literal de rota e o
 *      botão «Registar Balancete Oficial»).
 *   3. Nenhum `localStorage` debaixo de `contabilidade/balancete/`.
 *   4. O manual (`docs/manual/`) deixa de citar `/contabilidade/balancete/nova` e o botão
 *      «Registar Balancete Oficial».
 *   5. O parágrafo «Páginas-protótipo que parecem reais» do CLAUDE.md da raiz continua a
 *      existir mas deixa de listar `balancete/nova`.
 *   #301 (opção conservadora: um agente não recaptura a imagem sem UI de captura acordada)
 *   6. A imagem `docs/manual/img/05-contabilidade/balancete.png` NÃO é inventada nem
 *      substituída: continua a existir, byte a byte igual à de hoje (sha256 trancado abaixo).
 *   7. Na secção «Como gerar o Balancete» de `docs/manual/05-contabilidade.md`:
 *      a. o marcador `<!-- captura: 05-contabilidade/balancete.png | /contabilidade/balancete -->`
 *         mantém-se (é por ele que a recaptura se fará);
 *      b. há uma nota (comentário HTML) de recaptura pendente que cita «recaptura» e «#301»;
 *      c. o texto VISÍVEL da secção (fora de comentários HTML) avisa o leitor de que a imagem
 *         mostra o ecrã anterior — uma frase com «imagem»/«captura» e «anterior»/«antig…»/
 *         «desactualizad…».
 *   8. Guarda: o manual não volta a dizer «são entregues pelas restantes fatias» (#301).
 *
 * ESTADO ESPERADO antes da implementação: RED em 1, 2, 3, 4, 5, 7b e 7c.
 *
 * Escrito pelo verificador do nó C:balancete-legado-282-301; um agente de implementação que o
 * altere é BLOCKER.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../../..'); // apps/erp/src
const ERP = path.resolve(SRC, '..'); // apps/erp
const RAIZ = path.resolve(ERP, '../..'); // raiz do repositório
const BALANCETE = path.join(SRC, 'app', '(dashboard)', 'contabilidade', 'balancete');
const MANUAL = path.join(RAIZ, 'docs', 'manual');
const MANUAL_CONTAB = path.join(MANUAL, '05-contabilidade.md');
const IMAGEM = path.join(MANUAL, 'img', '05-contabilidade', 'balancete.png');
const SHA_IMAGEM = '3f6e6ad9d9ba370cd9bbe96725e913da46e77034a351939715cbd3a27a586f58';

const ROTA_LEGADA = '/contabilidade/balancete/nova';
const BOTAO_LEGADO = 'Registar Balancete Oficial';

const ESTE_FICHEIRO = path.resolve(__filename);

function ficheiros(dir: string, extensoes: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      out.push(...ficheiros(p, extensoes));
    } else if (extensoes.test(e.name) && path.resolve(p) !== ESTE_FICHEIRO) {
      out.push(p);
    }
  }
  return out;
}

function ocorrencias(lista: string[], agulha: string | RegExp): string[] {
  const achados: string[] = [];
  for (const f of lista) {
    const linhas = fs.readFileSync(f, 'utf8').split('\n');
    linhas.forEach((l, i) => {
      const bate = typeof agulha === 'string' ? l.includes(agulha) : agulha.test(l);
      if (bate) achados.push(`${path.relative(RAIZ, f)}:${i + 1}`);
    });
  }
  return achados;
}

/** Secção «### Como gerar o Balancete» até ao próximo cabeçalho de nível ≤ 3. */
function seccaoBalancete(): string {
  const md = fs.readFileSync(MANUAL_CONTAB, 'utf8');
  const inicio = md.indexOf('### Como gerar o Balancete');
  expect(inicio, 'a secção «Como gerar o Balancete» desapareceu do manual').toBeGreaterThanOrEqual(0);
  const resto = md.slice(inicio + 1);
  const proximo = resto.search(/\n#{1,3} /);
  return proximo === -1 ? md.slice(inicio) : md.slice(inicio, inicio + 1 + proximo);
}

const CODIGO = /\.(tsx?|jsx?|mjs)$/;

describe('#282 — balancete legado em localStorage removido', () => {
  it('a rota /contabilidade/balancete/nova deixa de existir', () => {
    const pasta = path.join(BALANCETE, 'nova');
    expect(fs.existsSync(path.join(pasta, 'page.tsx')), `${path.relative(RAIZ, pasta)}/page.tsx ainda existe`).toBe(false);
    expect(fs.existsSync(pasta), `${path.relative(RAIZ, pasta)} ainda existe`).toBe(false);
  });

  it('nenhuma ligação para a rota legada em apps/erp/src nem em apps/erp/e2e', () => {
    const lista = [...ficheiros(SRC, CODIGO), ...ficheiros(path.join(ERP, 'e2e'), CODIGO)];
    expect(lista.length).toBeGreaterThan(0);
    expect(ocorrencias(lista, ROTA_LEGADA)).toEqual([]);
    expect(ocorrencias(lista, BOTAO_LEGADO)).toEqual([]);
  });

  it('nenhum localStorage debaixo de contabilidade/balancete/', () => {
    const lista = ficheiros(BALANCETE, CODIGO);
    expect(lista.length, 'o ecrã real /contabilidade/balancete tem de continuar a existir').toBeGreaterThan(0);
    expect(fs.existsSync(path.join(BALANCETE, 'page.tsx'))).toBe(true);
    expect(ocorrencias(lista, 'localStorage')).toEqual([]);
  });

  it('o manual deixa de citar a rota legada e o botão «Registar Balancete Oficial»', () => {
    const lista = ficheiros(MANUAL, /\.md$/);
    expect(lista.length).toBeGreaterThan(0);
    expect(ocorrencias(lista, ROTA_LEGADA)).toEqual([]);
    expect(ocorrencias(lista, BOTAO_LEGADO)).toEqual([]);
  });

  it('o CLAUDE.md da raiz deixa de listar balancete/nova como página-protótipo', () => {
    const claude = fs.readFileSync(path.join(RAIZ, 'CLAUDE.md'), 'utf8');
    const inicio = claude.indexOf('**Páginas-protótipo que parecem reais**');
    expect(inicio, 'o parágrafo «Páginas-protótipo que parecem reais» tem de continuar').toBeGreaterThanOrEqual(0);
    const fim = claude.indexOf('\n\n', inicio);
    const paragrafo = claude.slice(inicio, fim === -1 ? undefined : fim);
    expect(paragrafo).not.toMatch(/balancete\/nova/);
    expect(paragrafo).not.toMatch(/«Salvar» ainda é fictício/);
  });
});

describe('#301 — imagem do balancete no manual (sem recaptura por agente)', () => {
  it('a imagem não é inventada nem substituída: mesma imagem, byte a byte', () => {
    expect(fs.existsSync(IMAGEM)).toBe(true);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(IMAGEM)).digest('hex');
    expect(sha).toBe(SHA_IMAGEM);
  });

  it('a secção mantém o marcador de captura e a referência à imagem', () => {
    const s = seccaoBalancete();
    expect(s).toContain('<!-- captura: 05-contabilidade/balancete.png | /contabilidade/balancete -->');
    expect(s).toMatch(/!\[[^\]]*\]\(img\/05-contabilidade\/balancete\.png\)/);
  });

  it('a secção deixa uma nota (comentário HTML) de recaptura pendente que cita #301', () => {
    const comentarios = seccaoBalancete().match(/<!--[\s\S]*?-->/g) ?? [];
    const nota = comentarios.find((c) => /recaptur/i.test(c) && /#301\b/.test(c));
    expect(nota, `nenhum comentário com «recaptura» e «#301» em: ${JSON.stringify(comentarios)}`).toBeDefined();
  });

  it('o texto visível avisa que a imagem mostra o ecrã anterior', () => {
    const visivel = seccaoBalancete().replace(/<!--[\s\S]*?-->/g, '');
    const frases = visivel.split(/\n\s*\n/);
    const aviso = frases.find(
      (f) => /(imagem|captura)/i.test(f) && /(anterior|antig|desactualizad|desatualizad)/i.test(f),
    );
    expect(aviso, 'nenhum aviso visível de que a imagem é do ecrã anterior').toBeDefined();
  });

  it('o manual não volta a dizer «são entregues pelas restantes fatias»', () => {
    expect(ocorrencias(ficheiros(MANUAL, /\.md$/), /restantes fatias/i)).toEqual([]);
  });
});
