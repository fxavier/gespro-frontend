#!/usr/bin/env node
/**
 * Extrai os IDs das Server Actions de um build do Next.js.
 *
 * Os IDs são hashes por build; os cenários k6 de mutação precisam deles para
 * invocar as actions por HTTP (`Next-Action: <id>`). O Next 16 regista cada
 * action em `.next/server/server-reference-manifest.json` com `exportedName`,
 * `filename` e os workers (páginas) onde está registada — usamos isso para
 * produzir o mapa nome → { id, paginas }.
 *
 * Uso:
 *   node perf/scripts/discover-actions.mjs [caminho-do-.next]
 *   (padrão: apps/erp/.next; para a pilha em contentor, extrai o manifesto com
 *    `docker cp <servico>:/app/apps/erp/.next/server/server-reference-manifest.json …`
 *    e passa o directório que o contém como argumento.)
 *
 * Saída: perf/.generated/actions.json
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const nextDir = path.resolve(process.argv[2] ?? path.join(raiz, 'apps', 'erp', '.next'));

// Aceita o directório .next, o directório server/ ou o próprio ficheiro.
const candidatos = [
  path.join(nextDir, 'server', 'server-reference-manifest.json'),
  path.join(nextDir, 'server-reference-manifest.json'),
  nextDir,
];
const manifestPath = candidatos.find((c) => existsSync(c) && c.endsWith('.json'));
if (!manifestPath) {
  console.error(`server-reference-manifest.json não encontrado em ${nextDir}`);
  process.exit(1);
}

/** Actions de que os cenários k6 precisam (fase 1). */
const NECESSARIAS = ['criarVenda', 'emitirFatura', 'processarFolhaMesAction'];

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/** 'app/(dashboard)/pos/page' → '/pos' */
function workerParaUrl(worker) {
  return (
    worker
      .replace(/^app/, '')
      .replace(/\/page$/, '')
      .replace(/\/\([^)]+\)/g, '') || '/'
  );
}

const mapa = {};
for (const [id, entrada] of Object.entries(manifest.node ?? {})) {
  const nome = entrada.exportedName;
  if (!nome) continue;
  const paginas = Object.keys(entrada.workers ?? {}).map(workerParaUrl);
  const ficheiro = entrada.filename ?? '';
  // Preferir actions "oficiais" (src/server/actions) a homónimos noutros módulos.
  const oficial = ficheiro.includes('server/actions');
  if (!mapa[nome] || (oficial && !mapa[nome].oficial)) {
    mapa[nome] = { id, paginas, ficheiro, oficial };
  }
}

const saida = {};
for (const [nome, v] of Object.entries(mapa)) {
  saida[nome] = { id: v.id, paginas: v.paginas };
}

const outDir = path.join(raiz, 'perf', '.generated');
mkdirSync(outDir, { recursive: true });
const destino = path.join(outDir, 'actions.json');
writeFileSync(destino, JSON.stringify(saida, null, 2));

const emFalta = NECESSARIAS.filter((n) => !saida[n]);
console.log(`actions.json: ${Object.keys(saida).length} actions → ${destino}`);
for (const n of NECESSARIAS.filter((x) => saida[x])) {
  console.log(`  ${n}: ${saida[n].id.slice(0, 12)}… páginas: ${saida[n].paginas.join(', ') || '(nenhuma)'}`);
}
if (emFalta.length) {
  console.error(`EM FALTA (os cenários de mutação vão falhar): ${emFalta.join(', ')}`);
  process.exitCode = 1;
}
