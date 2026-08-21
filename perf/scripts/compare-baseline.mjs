#!/usr/bin/env node
/**
 * Gate de regressão (ADR-0018 §6): compara o summary do cenário reduzido de CI
 * com a linha de base versionada e FALHA se o p95 degradar mais de 20 %.
 *
 * Modo permissivo: enquanto `perf/baseline.json` (fase 2, pós-Keycloak) não
 * existir, o gate NÃO falha o merge — apenas relata. É deliberado (conflito 7
 * do handoff): a primeira linha de base é pré-Keycloak e ficaria inválida no
 * dia em que a identidade fundisse.
 *
 * Uso: node perf/scripts/compare-baseline.mjs <summary.json> [baseline.json]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIAR = Number(process.env.PERF_DEGRADACAO_MAX ?? 0.20);

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const summaryPath = process.argv[2];
const baselinePath = process.argv[3] ?? path.join(raiz, 'perf', 'baseline.json');

if (!summaryPath || !existsSync(summaryPath)) {
  console.error(`Summary não encontrado: ${summaryPath}`);
  process.exit(2);
}

if (!existsSync(baselinePath)) {
  console.log(
    `MODO PERMISSIVO: ${path.basename(baselinePath)} ainda não existe ` +
      '(só nasce na re-medição pós-Keycloak — ADR-0018). O gate não falha o merge.',
  );
  process.exit(0);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

// A linha de base de CI guarda p95 por operação em `cenarios.ci` (ver run-baseline).
const referencia = baseline.cenarios?.ci ?? baseline.cenarios?.['ci-smoke'] ?? null;
if (!referencia) {
  console.log('Baseline sem bloco de CI — gate permissivo.');
  process.exit(0);
}

let falhou = false;
for (const [nome, m] of Object.entries(summary.metrics ?? {})) {
  const match = nome.match(/^http_req_duration\{operation:(\w+)\}$/);
  if (!match) continue;
  const op = match[1];
  const base = referencia[op]?.p95_ms;
  if (base == null) continue;
  const actual = m['p(95)'];
  const razao = actual / base;
  const veredicto = razao > 1 + LIMIAR ? 'REGRESSÃO' : 'ok';
  if (razao > 1 + LIMIAR) falhou = true;
  console.log(
    `${op}: p95 ${actual.toFixed(0)} ms vs base ${base.toFixed(0)} ms ` +
      `(${((razao - 1) * 100).toFixed(1)} %) — ${veredicto}`,
  );
}

if (falhou) {
  console.error(`\nFALHA: degradação de p95 acima de ${LIMIAR * 100} % face à linha de base.`);
  process.exit(1);
}
console.log('\nSem regressões acima do limiar.');
