/**
 * Oráculo da issue #527 (nó C:funcionalidades-cliente) — a documentação do contrato do catálogo
 * deixa de dizer que há três planos fixos. Escrito pelo VERIFICADOR; alterá-lo do lado de quem
 * implementa é BLOCKER.
 *
 * Desde o ADR-0049 / #524 / #529 o catálogo vive na tabela `Plano`, gerida pelo Administrador de
 * plataforma: pode haver mais (ou menos) planos, e um plano pode estar Arquivado.
 *
 * A. `CONTEXT.md`, entrada «Plano»: não diz «três escalões»; diz que o catálogo é gerido pelo
 *    Administrador de plataforma; o glossário define Arquivado.
 * B. `docs/handoff/site-provisionamento.md`: o `id` do plano (e o `planoId` do registo) deixa de
 *    ser a união fixa `"BASICO" | "PROFISSIONAL" | "EMPRESARIAL"`, não diz «três escalões», e o
 *    payload do §1 inclui `funcionalidades`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

/** Corpo de uma secção Markdown (do título até ao próximo título do mesmo nível ou superior). */
function seccao(md: string, titulo: RegExp, nivel: number): string {
  const linhas = md.split('\n');
  const i = linhas.findIndex((l) => titulo.test(l));
  if (i < 0) return '';
  const fim = linhas.findIndex(
    (l, j) => j > i && new RegExp(`^#{1,${nivel}}\\s`).test(l),
  );
  return linhas.slice(i, fim < 0 ? undefined : fim).join('\n');
}

const RE_TRES = /tr[êe]s\s+(escal[õo]es|planos)/i;
const UNIAO_FIXA = /"BASICO"\s*\|\s*"PROFISSIONAL"\s*\|\s*"EMPRESARIAL"/;

describe('#527 A — CONTEXT.md', () => {
  const ctx = ler('CONTEXT.md');
  const plano = seccao(ctx, /^###\s+Plano\s*$/, 3);

  it('a entrada «Plano» existe', () => {
    expect(plano).not.toBe('');
  });

  it('não diz «três escalões»', () => {
    expect(plano).not.toMatch(RE_TRES);
  });

  it('diz que o catálogo é gerido pelo Administrador de plataforma', () => {
    expect(plano).toMatch(/Administrador de plataforma/i);
  });

  it('o glossário define Arquivado', () => {
    expect(ctx).toMatch(/^#{2,4}\s+(Plano\s+)?Arquivad[oa]\b|\*\*Arquivad[oa]\*\*/m);
  });
});

describe('#527 B — docs/handoff/site-provisionamento.md', () => {
  const doc = ler('docs/handoff/site-provisionamento.md');
  const s1 = seccao(doc, /^##\s+1\.\s/, 2);

  it('o §1 existe', () => {
    expect(s1).not.toBe('');
  });

  it('o código do plano não é a união fixa dos três', () => {
    expect(doc).not.toMatch(UNIAO_FIXA);
  });

  it('não diz «três escalões»', () => {
    expect(doc).not.toMatch(RE_TRES);
  });

  it('o payload do §1 inclui `funcionalidades`', () => {
    expect(s1).toMatch(/"funcionalidades"\s*:/);
  });
});
