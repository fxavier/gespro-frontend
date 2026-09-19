#!/usr/bin/env node
/**
 * Gate CI: nenhum ficheiro fora de contabilidade.service.ts escreve directamente
 * em `Lancamento` ou `PartidaLancamento` pelo Prisma.
 *
 * Toda a escrita nestas tabelas tem de passar por:
 *   - `criarLancamento` ou `registarLancamentoContabilistico` (que verificam o período)
 *
 * Sem este gate, o próximo domínio que precise de registar um lançamento fá-lo
 * pelo Prisma directamente e o trancamento de período fica com uma janela que
 * nenhum teste vê — que é exactamente como o ADR-0015 descobriu que a auditoria
 * tinha ficado num comentário.
 *
 * O que se detecta: chamadas `.create(`, `.createMany(`, `.upsert(`, `.update(`
 * prefixadas por `lancamento.` ou `partidaLancamento.` (case-insensitive para
 * os nomes de método do Prisma Client) em qualquer ficheiro *.ts fora do serviço
 * autorizado.
 *
 * Ficheiro autorizado (única excepção):
 *   src/server/services/financas/contabilidade.service.ts
 *
 * Exit code 0 = OK; 1 = violações encontradas.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const PRISMA_DIR = join(ROOT, 'prisma');

// Ficheiro autorizado — o único que pode escrever directamente nestas tabelas
const AUTORIZADO = resolve(join(SRC, 'server', 'services', 'financas', 'contabilidade.service.ts'));

// Padrão Prisma Client: prisma/tx.lancamento.create( etc.
const PADROES_PRISMA = [
  /\blancamento\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany|delete|deleteMany)\s*\(/i,
  /\bpartidaLancamento\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany|delete|deleteMany)\s*\(/i,
];

// Padrão SQL cru: INSERT INTO "Lancamento" ou INSERT INTO "PartidaLancamento"
// Detecta SQL em strings de template ou strings literais em ficheiros .ts
const PADROES_SQL = [
  /INSERT\s+INTO\s+"?Lancamento"?\s*\(/i,
  /INSERT\s+INTO\s+"?PartidaLancamento"?\s*\(/i,
];

/** Recolhe todos os ficheiros .ts recursivamente (excluindo node_modules e .next) */
function listarTs(dir) {
  const resultado = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next' || entrada === '__tests__') continue;
    const caminho = join(dir, entrada);
    const stat = statSync(caminho);
    if (stat.isDirectory()) {
      resultado.push(...listarTs(caminho));
    } else if (entrada.endsWith('.ts') || entrada.endsWith('.tsx')) {
      resultado.push(caminho);
    }
  }
  return resultado;
}

const violacoes = [];

// Varrer src/ — Prisma Client + SQL cru
for (const ficheiro of listarTs(SRC)) {
  if (resolve(ficheiro) === AUTORIZADO) continue; // ficheiro autorizado
  if (ficheiro.endsWith('.test.ts') || ficheiro.endsWith('.spec.ts')) continue; // testes não contam

  const conteudo = readFileSync(ficheiro, 'utf8');
  const linhas = conteudo.split('\n');

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const todosOsPadroes = [...PADROES_PRISMA, ...PADROES_SQL];
    for (const padrao of todosOsPadroes) {
      if (padrao.test(linha)) {
        violacoes.push({
          ficheiro: relative(ROOT, ficheiro),
          linha: i + 1,
          texto: linha.trim(),
        });
        break;
      }
    }
  }
}

// Varrer prisma/ — SQL cru em seeds e bulk loaders
for (const ficheiro of listarTs(PRISMA_DIR)) {
  if (ficheiro.endsWith('.test.ts') || ficheiro.endsWith('.spec.ts')) continue;

  const conteudo = readFileSync(ficheiro, 'utf8');
  const linhas = conteudo.split('\n');

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    // Só verificamos periodoId em INSERTs na tabela Lancamento (não PartidaLancamento)
    if (/INSERT\s+INTO\s+"?Lancamento"?\s*\(/i.test(linha)) {
      // Verificar se a coluna periodoId está presente na mesma instrução INSERT
      // (pode ser multi-linha — verificamos o bloco de 10 linhas seguintes)
      const bloco = linhas.slice(i, i + 10).join(' ');
      if (!bloco.includes('periodoId')) {
        violacoes.push({
          ficheiro: relative(ROOT, ficheiro),
          linha: i + 1,
          texto: `INSERT em Lancamento sem "periodoId": ${linha.trim()}`,
        });
      }
    }
  }
}

if (violacoes.length > 0) {
  console.error('\nEscrita directa em Lancamento/PartidaLancamento fora de contabilidade.service.ts:\n');
  for (const v of violacoes) {
    console.error(`  ${v.ficheiro}:${v.linha}`);
    console.error(`    ${v.texto}`);
  }
  console.error(
    '\nToda a escrita em Lancamento e PartidaLancamento tem de passar por:\n' +
      '  registarLancamentoContabilistico(tx, input, ctx)  — WS A, B, C\n' +
      '  criarLancamento(input, ctx)                       — WS D interno\n' +
      '\nIsso garante que o período é verificado e bloqueado (ADR-0033 §5).\n',
  );
  process.exit(1);
}

console.log(
  'OK: nenhum ficheiro fora de contabilidade.service.ts escreve directamente em Lancamento/PartidaLancamento.',
);
process.exit(0);
