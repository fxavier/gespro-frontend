#!/usr/bin/env node
/**
 * Gate CI: Dialog fora de AlertDialog
 *
 * Falha se encontrar imports de `@/components/ui/dialog` (Dialog raw)
 * em ficheiros de `src/app/` — com excepção de AlertDialog (que é
 * importado de `@/components/ui/alert-dialog`, não de `dialog`).
 *
 * Regra: Dialog para criar/editar/detalhar = BLOCKER.
 * Única excepção: AlertDialog destrutivo (alert-dialog.tsx).
 *
 * Exit code 0 = OK; 1 = violações encontradas.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_APP = join(ROOT, 'src', 'app');

// Padrão que detecta import de dialog (não alert-dialog)
// Detecta: from '@/components/ui/dialog' ou from "...ui/dialog"
// NÃO detecta: from '@/components/ui/alert-dialog'
const DIALOG_IMPORT_RE = /from\s+['"].*\/components\/ui\/dialog['"]/;

let violations = 0;
const violationFiles = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Ignorar node_modules e .next
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const content = readFileSync(full, 'utf8');
      if (DIALOG_IMPORT_RE.test(content)) {
        const rel = relative(ROOT, full);
        violationFiles.push(rel);
        violations++;
        // Encontrar as linhas exactas para melhor diagnóstico
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (DIALOG_IMPORT_RE.test(line)) {
            console.error(`  BLOCKER ${rel}:${i + 1}  →  ${line.trim()}`);
          }
        });
      }
    }
  }
}

console.log('Gate: Dialog fora de AlertDialog em src/app/');
console.log('─'.repeat(60));

walk(SRC_APP);

if (violations === 0) {
  console.log('✓ Nenhuma violação encontrada. Dialog sem AlertDialog: 0');
  process.exit(0);
} else {
  console.error(`\n✗ ${violations} ficheiro(s) com import de Dialog (não AlertDialog):`);
  for (const f of violationFiles) {
    console.error(`  • ${f}`);
  }
  console.error(
    '\nRESOLUÇÃO: Substituir Dialog por rota dedicada (novo/[id]/editar).' +
    '\nÚnica excepção: AlertDialog destrutivo (importado de alert-dialog, não dialog).'
  );
  process.exit(1);
}
