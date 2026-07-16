#!/usr/bin/env node
/**
 * Gate CI: 'use client' em page.tsx de listagem/detalhe
 *
 * Falha se encontrar 'use client' nos ficheiros page.tsx que deveriam
 * ser Server Components:
 *   - Listagens: page.tsx sem [id] ou /novo/ no caminho
 *   - Detalhes: page.tsx em directórios [id]
 *
 * EXCEPÇÕES LEGÍTIMAS (não bloqueiam):
 *   - page.tsx em /novo/ (formulários de criação são Client Components)
 *   - page.tsx em /editar/ (formulários de edição são Client Components)
 *   - page.tsx em /(auth)/ (login/auth pages)
 *   - page.tsx em /pos/ (terminal POS tem interactividade total)
 *
 * Exit code 0 = OK; 1 = violações encontradas.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_APP = join(ROOT, 'src', 'app');

// Segmentos que são legitimamente Client (formulários, wizards, terminais)
const ALLOWED_SEGMENTS = [
  '/novo/',
  '/nova/',
  '/editar/',
  '/(auth)/',
  '/pos/',
  '/abertura/',    // wizard de abertura de caixa
  '/fechamento/',  // wizard de fecho de caixa
  '/dev/',         // página de dev/patterns (apenas dev)
];

function isAllowed(relPath) {
  return ALLOWED_SEGMENTS.some((seg) => relPath.includes(seg));
}

function isListingOrDetail(relPath) {
  // É page.tsx de listagem: caminho sem [, sem novo, sem nova, sem editar
  // É page.tsx de detalhe: caminho contém [
  // Ambos devem ser Server Components
  return relPath.endsWith('/page.tsx');
}

let violations = 0;
const violationFiles = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full);
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      const rel = relative(ROOT, full);
      // Normalizar separadores para / em qualquer OS
      const relNorm = rel.replace(/\\/g, '/');

      if (!isListingOrDetail(relNorm)) continue;
      if (isAllowed(relNorm)) continue;

      const content = readFileSync(full, 'utf8');
      // Detecta 'use client' como DIRECTIVA (linha isolada, não comentário).
      // A directiva deve ser a primeira declaração não-whitespace do ficheiro.
      // Ignorar ocorrências em comentários (// ou /* */).
      const lines = content.split('\n');
      let isDirective = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        // Linha de comentário — não é directiva
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          continue;
        }
        // Primeira linha não-comentário: verifica se é a directiva (com ou sem ;)
        const bare = trimmed.replace(/;$/, '').trim();
        if (bare === "'use client'" || bare === '"use client"') {
          isDirective = true;
        }
        // Para depois da primeira linha de código (directivas são sempre primeiras)
        break;
      }

      if (isDirective) {
        violationFiles.push(relNorm);
        violations++;
        console.error(`  BLOCKER ${relNorm}  →  'use client' em page.tsx de listagem/detalhe`);
      }
    }
  }
}

console.log("Gate: 'use client' em page.tsx de listagem/detalhe em src/app/");
console.log('─'.repeat(60));

walk(SRC_APP);

if (violations === 0) {
  console.log("✓ Nenhuma violação encontrada. 'use client' em page.tsx: 0");
  process.exit(0);
} else {
  console.error(`\n✗ ${violations} page.tsx com 'use client' que deveria ser Server Component:`);
  for (const f of violationFiles) {
    console.error(`  • ${f}`);
  }
  console.error(
    "\nRESOLUÇÃO: Remover 'use client' da page.tsx e mover interactividade" +
    '\npara Client Components filho (ex: <TableClient />, <FilterBar />).'
  );
  process.exit(1);
}
