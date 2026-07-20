#!/usr/bin/env node
/**
 * Gate CI: imports de @/data/ em src/app/
 *
 * Falha se encontrar imports de `@/data/` em ficheiros de `src/app/`.
 * Dados devem vir de serviços (`@/server/services/`) ou acções
 * (`@/server/actions/`), nunca de camadas de dados directamente.
 *
 * Exit code 0 = OK; 1 = violações encontradas.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_APP = join(ROOT, 'src', 'app');

// Padrão que detecta import de @/data/
const DATA_IMPORT_RE = /from\s+['"]@\/data\//;

let violations = 0;
const violationFiles = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const content = readFileSync(full, 'utf8');
      if (DATA_IMPORT_RE.test(content)) {
        const rel = relative(ROOT, full);
        violationFiles.push(rel);
        violations++;
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (DATA_IMPORT_RE.test(line)) {
            console.error(`  BLOCKER ${rel}:${i + 1}  →  ${line.trim()}`);
          }
        });
      }
    }
  }
}

console.log("Gate: imports de @/data/ em src/app/");
console.log('─'.repeat(60));

walk(SRC_APP);

if (violations === 0) {
  console.log("✓ Nenhuma violação encontrada. Imports de @/data/ em src/app/: 0");
  process.exit(0);
} else {
  console.error(`\n✗ ${violations} ficheiro(s) com import de @/data/ em src/app/:`);
  for (const f of violationFiles) {
    console.error(`  • ${f}`);
  }
  console.error(
    '\nRESOLUÇÃO: Substituir imports de @/data/ por chamadas a serviços:' +
    '\n  import { minhaEntidadeService } from "@/server/services/<dominio>"' +
    '\n  ou Server Actions: import { minhaAction } from "@/server/actions/<dominio>.actions"'
  );
  process.exit(1);
}
