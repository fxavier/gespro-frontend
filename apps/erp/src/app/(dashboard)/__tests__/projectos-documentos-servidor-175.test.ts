/**
 * Oráculo estático — issue #175: `/projetos/documentos` guarda só no browser (localStorage).
 *
 * Contrato (decisão do orquestrador): ligar a página ao servidor com o modelo e o fluxo de
 * armazenamento EXISTENTES (presign + permissão do recurso, #194/#418) ou, se não houver modelo,
 * retirar a página e dizê-lo no PR.
 *
 * Verificado no código (origin/main, 8daf1c4): NÃO existe modelo de documento de projecto em
 * `prisma/schema/` (só `DocumentoColaborador`, `DocumentoFornecedor` e `AnexoTarefa`, que é anexo
 * de TAREFA), e `projeto` não está em `RECURSOS_DOCUMENTO` (`lib/storage/documento-config.ts`).
 * Logo vale o ramo «retirar a página» — a opção conservadora (sem modelo novo, sem migração,
 * sem endpoint novo). O oráculo fixa-o assim:
 *   1. Nenhum ficheiro da app (`src/app`, `src/components`) usa `DocumentoStorage` — o
 *      armazenamento fictício de documentos de projecto deixa de ter consumidores.
 *   2. `/projetos/documentos` deixa de ser uma página que grava no browser: ou o directório
 *      desaparece, ou o `page.tsx` é um Server Component que só faz `notFound()`/`redirect()`,
 *      e nenhum ficheiro do directório toca em `localStorage`/`DocumentoStorage`.
 *   3. Nenhuma ligação (menu, href, router.push, redirect…) aponta para `/projetos/documentos`.
 *   4. Guarda: a página não volta a aparecer na lista de páginas-protótipo do CLAUDE.md.
 *
 * ESTADO ESPERADO antes da implementação: RED em 1 e 2 (`documentos-content.tsx` é
 * `'use client'` e lê/escreve `DocumentoStorage`).
 *
 * Escrito pelo verificador do nó A:projectos-documentos-servidor-175; um agente de implementação
 * que o altere é BLOCKER.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../..'); // apps/erp/src
const APP = path.join(SRC, 'app');
const DASH = path.join(APP, '(dashboard)');
const PAGINA_DIR = path.join(DASH, 'projetos', 'documentos');
const RAIZ_REPO = path.resolve(SRC, '../../..');

function ficheiros(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      out.push(...ficheiros(p));
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string) => path.relative(SRC, p);

/** Remove comentários para que uma nota explicativa não conte como uso. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('#175 — /projetos/documentos deixa de guardar no browser', () => {
  it('1. nenhum ficheiro da app usa DocumentoStorage (armazenamento local de documentos de projecto)', () => {
    const consumidores = [...ficheiros(APP), ...ficheiros(path.join(SRC, 'components'))]
      .filter((f) => /\bDocumentoStorage\b/.test(semComentarios(fs.readFileSync(f, 'utf8'))))
      .map(rel);
    expect(consumidores).toEqual([]);
  });

  it('2. /projetos/documentos não existe ou é um Server Component que só faz notFound()/redirect()', () => {
    const fs_ = fs as unknown as { existsSync(p: string): boolean };
    if (!fs_.existsSync(PAGINA_DIR)) return; // página retirada: contrato cumprido

    const ofensores = ficheiros(PAGINA_DIR)
      .filter((f) => /\blocalStorage\b|\bDocumentoStorage\b|projeto-storage/.test(semComentarios(fs.readFileSync(f, 'utf8'))))
      .map(rel);
    expect(ofensores, 'ficheiros de /projetos/documentos que ainda gravam no browser').toEqual([]);

    const pagina = path.join(PAGINA_DIR, 'page.tsx');
    if (!fs_.existsSync(pagina)) return; // sem page.tsx a rota não existe
    const codigo = semComentarios(fs.readFileSync(pagina, 'utf8'));
    expect(codigo, 'page.tsx tem de ser Server Component').not.toMatch(/^\s*['"]use client['"]/m);
    expect(codigo, 'sem modelo de documento de projecto, a página só pode recusar ou redireccionar').toMatch(
      /\b(notFound|redirect|permanentRedirect)\s*\(/,
    );
  });

  it('3. nenhuma ligação aponta para /projetos/documentos', () => {
    const ligacoes: string[] = [];
    const varridos = [
      ...ficheiros(APP),
      ...ficheiros(path.join(SRC, 'components')),
      ...ficheiros(path.join(SRC, 'data')),
      ...ficheiros(path.join(SRC, 'lib')),
    ].filter((f) => !f.startsWith(PAGINA_DIR + path.sep));
    for (const f of varridos) {
      const linhas = semComentarios(fs.readFileSync(f, 'utf8')).split('\n');
      linhas.forEach((l, i) => {
        if (/['"`]\/projetos\/documentos(?=[/?'"`#$])/.test(l)) ligacoes.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(ligacoes).toEqual([]);
  });

  it('4. guarda: o CLAUDE.md não lista /projetos/documentos como página-protótipo', () => {
    const claude = path.join(RAIZ_REPO, 'CLAUDE.md');
    if (!fs.existsSync(claude)) return;
    const texto = fs.readFileSync(claude, 'utf8');
    const secao = texto.split('**Páginas-protótipo que parecem reais**')[1]?.split('\n\n')[0] ?? '';
    expect(secao).not.toMatch(/projetos\/documentos/);
  });
});
