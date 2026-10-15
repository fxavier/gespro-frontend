/**
 * ORÁCULO — issue #526 (nó C:gestao-planos, ADR-0049 §5 «Pipeline»): o `gate-leitura` reconhece
 * `plataforma: true` como declaração válida. As actions de plataforma não são travadas pela
 * Leitura de um tenant (não actuam sobre tenant nenhum), por isso uma leitura de plataforma sem
 * `revalidate` (ex.: `listarPlanosAdmin`) não tem de declarar `permiteEmLeitura`.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de implementação
 * que altere este ficheiro é BLOCKER.
 *
 * Corre o script REAL (`scripts/gate-leitura.mjs`) com `cwd` num directório temporário que
 * imita `src/server/actions/`.
 *
 * ESTADO ESPERADO antes da implementação: RED no primeiro caso.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GATE = path.resolve(__dirname, '../../../scripts/gate-leitura.mjs');
const ERP = path.resolve(__dirname, '../../..');
const temporarios: string[] = [];

afterAll(() => {
  for (const d of temporarios) rmSync(d, { recursive: true, force: true });
});

function correrGate(ficheiros: Record<string, string>): { status: number | null; saida: string } {
  const raiz = mkdtempSync(path.join(tmpdir(), 'gate-leitura-526-'));
  temporarios.push(raiz);
  const dir = path.join(raiz, 'src', 'server', 'actions');
  mkdirSync(dir, { recursive: true });
  for (const [nome, conteudo] of Object.entries(ficheiros)) writeFileSync(path.join(dir, nome), conteudo);
  const r = spawnSync(process.execPath, [GATE], { cwd: raiz, encoding: 'utf8' });
  return { status: r.status, saida: `${r.stdout}\n${r.stderr}` };
}

const LEITURA_PLATAFORMA = `'use server';
import { createSafeAction } from '@/server/safe-action';

export const listarPlanosAdmin = createSafeAction({
  plataforma: true,
  handler: async () => [],
});
`;

const LEITURA_TENANT_SEM_DECLARACAO = `'use server';
import { createSafeAction } from '@/server/safe-action';

export const listarCoisas = createSafeAction({
  permission: 'coisas:ler',
  handler: async () => [],
});
`;

describe('#526 — gate-leitura e as actions de plataforma', () => {
  it('uma action `plataforma: true` sem `revalidate` passa o gate', () => {
    const r = correrGate({ 'plataforma-planos.actions.ts': LEITURA_PLATAFORMA });
    expect(r.status, r.saida).toBe(0);
  });

  it('controlo: uma action de tenant sem `revalidate` nem `permiteEmLeitura` continua a falhar', () => {
    const r = correrGate({ 'coisas.actions.ts': LEITURA_TENANT_SEM_DECLARACAO });
    expect(r.status).toBe(1);
    expect(r.saida).toContain('listarCoisas');
  });

  it('controlo: `plataforma: false` não é declaração — continua a falhar', () => {
    const r = correrGate({
      'x.actions.ts': LEITURA_TENANT_SEM_DECLARACAO.replace(
        "permission: 'coisas:ler',",
        "plataforma: false,\n  permission: 'coisas:ler',",
      ),
    });
    expect(r.status).toBe(1);
  });

  it('o gate continua verde sobre as actions reais do ERP', () => {
    const r = spawnSync(process.execPath, [GATE], { cwd: ERP, encoding: 'utf8' });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  });
});
