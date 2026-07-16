#!/usr/bin/env node
/**
 * Gates CI — GestPro
 *
 * Executa os 3 gates de qualidade em sequência:
 *   1. Dialog fora de AlertDialog (gate-dialog)
 *   2. 'use client' em page.tsx de listagem/detalhe (gate-use-client)
 *   3. imports de @/data/ em src/app/ (gate-data-imports)
 *
 * Exit code 0 = todos passam; 1 = pelo menos um falhou.
 *
 * Uso:
 *   pnpm gates              # Corre todos os gates
 *   node scripts/gates.mjs  # Alternativa directa
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GATES = [
  { name: 'dialog', script: join(__dirname, 'gate-dialog.mjs') },
  { name: 'use-client', script: join(__dirname, 'gate-use-client.mjs') },
  { name: 'data-imports', script: join(__dirname, 'gate-data-imports.mjs') },
];

let allPassed = true;
const results = [];

console.log('=== GestPro - Gates de Qualidade CI ===\n');

for (const gate of GATES) {
  console.log(`--- Gate: ${gate.name} ---`);
  try {
    execFileSync('node', [gate.script], { stdio: 'inherit' });
    results.push({ name: gate.name, passed: true });
    console.log(`--- PASSED: ${gate.name}\n`);
  } catch {
    results.push({ name: gate.name, passed: false });
    console.error(`--- FAILED: ${gate.name}\n`);
    allPassed = false;
  }
}

console.log('\n=== Resumo dos Gates ===');
for (const r of results) {
  const icon = r.passed ? 'OK' : 'FAIL';
  console.log(`  [${icon}] ${r.name}`);
}
console.log('');

if (allPassed) {
  console.log('Todos os gates passaram!\n');
  process.exit(0);
} else {
  const failedCount = results.filter((r) => !r.passed).length;
  console.error(`${failedCount} gate(s) falharam. Corrija as violacoes antes do merge.\n`);
  process.exit(1);
}
