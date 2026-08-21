#!/usr/bin/env node
/**
 * Campanha de linha de base (ADR-0018): corre os cenários k6 em sequência e
 * consolida os summaries num único JSON versionável.
 *
 * A medição é LOCAL (ADR-0026): os números valem como GRANDEZA RELATIVA —
 * comparação entre consultas, entre execuções, entre índices — e não como
 * valores absolutos de produção. Essa nota fica gravada no próprio ficheiro.
 *
 * Uso:
 *   node perf/scripts/run-baseline.mjs [--out perf/baseline-pre-keycloak.json]
 *
 * Env:
 *   BASE_URL   alvo (padrão http://localhost:3000; na fase B, o proxy da pilha)
 *   PROFILE    smoke | baseline (padrão baseline)
 *   K6_BIN     binário k6 (padrão: docker run grafana/k6)
 *   SCENARIOS  lista separada por vírgulas (padrão: todos os seis)
 *   PERF_META  JSON extra para o bloco `ambiente` (ex.: '{"instancias":2}')
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const perfDir = path.join(raiz, 'perf');
const resultsDir = path.join(perfDir, 'results');
mkdirSync(resultsDir, { recursive: true });

const argOut = process.argv.indexOf('--out');
const outPath =
  argOut !== -1 ? path.resolve(process.argv[argOut + 1]) : path.join(perfDir, 'baseline-pre-keycloak.json');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PROFILE = process.env.PROFILE || 'baseline';
const TODOS = [
  'pos-venda',
  'movimentos-stock',
  'balancete-razao',
  'fatura-pdf',
  'payroll',
  'export-xlsx',
];
const cenarios = (process.env.SCENARIOS ? process.env.SCENARIOS.split(',') : TODOS).map((s) => s.trim());

function correK6(cenario) {
  const script = path.join(perfDir, 'k6', 'scenarios', `${cenario}.js`);
  const summary = path.join(resultsDir, `${cenario}.summary.json`);
  const envs = {
    BASE_URL,
    PROFILE,
    TENANT_INDEX: process.env.TENANT_INDEX || '1',
    RUN_OFFSET: process.env.RUN_OFFSET || '0',
  };

  let cmd, args;
  if (process.env.K6_BIN) {
    cmd = process.env.K6_BIN;
    args = ['run', '--summary-export', summary, script];
  } else {
    // Sem k6 instalado: contentor grafana/k6 com o perf/ montado.
    // host.docker.internal permite atingir a app no anfitrião (macOS/Windows).
    cmd = 'docker';
    args = [
      'run', '--rm', '--add-host=host.docker.internal:host-gateway',
      '-v', `${perfDir}:/perf`,
      ...Object.entries(envs).map(([k, v]) => ['-e', `${k}=${v}`]).flat(),
      '-e', `BASE_URL=${BASE_URL.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal')}`,
      'grafana/k6:0.57.0',
      'run', '--summary-export', `/perf/results/${cenario}.summary.json`,
      `/perf/k6/scenarios/${cenario}.js`,
    ];
  }

  console.log(`\n── ${cenario} ──────────────────────────────`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...envs } });
  if (r.status !== 0) console.error(`AVISO: ${cenario} terminou com código ${r.status} (thresholds?)`);
  if (!existsSync(summary)) return null;
  return JSON.parse(readFileSync(summary, 'utf8'));
}

function extrairOperacoes(summary) {
  if (!summary) return null;
  const out = {};
  for (const [nome, m] of Object.entries(summary.metrics ?? {})) {
    const match = nome.match(/^http_req_duration\{operation:(\w+)\}$/);
    if (match) {
      out[match[1]] = {
        p50_ms: round(m.med), p95_ms: round(m['p(95)']), p99_ms: round(m['p(99)'] ?? null),
        avg_ms: round(m.avg), max_ms: round(m.max), amostras: m.count ?? null,
      };
    }
    const falhas = nome.match(/^http_req_failed\{operation:(\w+)\}$/);
    if (falhas && out[falhas[1]]) out[falhas[1]].taxa_erro = m.value ?? m.rate ?? null;
  }
  return out;
}
const round = (v) => (v == null ? null : Math.round(v * 10) / 10);

const inicio = new Date();
const porCenario = {};
for (const c of cenarios) {
  porCenario[c] = extrairOperacoes(correK6(c));
}

let manifesto = null;
try {
  manifesto = JSON.parse(readFileSync(path.join(perfDir, '.generated', 'seed-manifest.json'), 'utf8'));
} catch { /* seed-manifest ausente — regista-se null */ }

const baseline = {
  $schema: 'gespro/perf-baseline@1',
  nota:
    'Medição LOCAL (ADR-0026): válida como grandeza RELATIVA (comparações, regressões), ' +
    'NÃO como valor absoluto de produção. Alterar este ficheiro exige PR com justificação (ADR-0018).',
  geradoEm: inicio.toISOString(),
  perfilCarga: PROFILE,
  alvo: BASE_URL,
  ambiente: {
    so: `${os.platform()} ${os.release()}`,
    cpus: os.cpus().length,
    modeloCpu: os.cpus()[0]?.model ?? null,
    memoriaGB: Math.round(os.totalmem() / 1e9),
    ...(process.env.PERF_META ? JSON.parse(process.env.PERF_META) : {}),
  },
  seed: manifesto
    ? { perfil: manifesto.perfil, tenants: manifesto.tenants, scale: manifesto.scale, volumesPorTenant: manifesto.volumesPorTenant }
    : null,
  cenarios: porCenario,
};

writeFileSync(outPath, JSON.stringify(baseline, null, 2));
console.log(`\nLinha de base escrita em ${outPath}`);
