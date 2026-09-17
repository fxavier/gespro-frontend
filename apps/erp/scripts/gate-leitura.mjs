#!/usr/bin/env node
/**
 * Gate CI: toda a Server Action decide, explicitamente, o que faz em Leitura
 *
 * Em Leitura o tenant vê e exporta tudo o que é seu e não grava nada
 * (ADR-0027 §6). O `createSafeAction` recusa por omissão, e quem passa
 * declara-se com `permiteEmLeitura: true`, ao lado da permissão.
 *
 * O sinal barato de «isto é uma escrita» é o `revalidate`: quem muda dados
 * revalida as rotas afectadas. Logo, uma action **sem `revalidate` e sem
 * `permiteEmLeitura`** é uma de duas coisas, e nenhuma delas é aceitável em
 * silêncio:
 *
 *   - uma **leitura** por marcar — e então prende o cliente em Leitura, que
 *     fica sem conseguir ver o que é seu;
 *   - uma **escrita** que não revalida — e então alguém tem de olhar para ela
 *     e decidir, porque a omissão não é decisão.
 *
 * Este gate não adivinha qual das duas é. Obriga a que esteja escrito — e
 * `permiteEmLeitura: false` conta como escrito. É a saída para o caso raro da
 * escrita que não tem nada em Postgres para revalidar (ex.: uma que só toca no
 * Keycloak): o valor não muda nada em execução, e é essa a intenção. Serve de
 * declaração, não de interruptor.
 *
 * Exit code 0 = OK; 1 = violações encontradas.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DIR_ACTIONS = join(ROOT, 'src', 'server', 'actions');

const BLOCO = /export const (\w+)\s*=\s*createSafeAction\(\{(.*?)\n\}\);/gs;

const violacoes = [];

for (const nomeFicheiro of readdirSync(DIR_ACTIONS)) {
  if (!nomeFicheiro.endsWith('.ts')) continue;
  const caminho = join(DIR_ACTIONS, nomeFicheiro);
  const conteudo = readFileSync(caminho, 'utf8');

  for (const m of conteudo.matchAll(BLOCO)) {
    const [bloco, nome, corpo] = m;
    if (corpo.includes('revalidate:') || corpo.includes('permiteEmLeitura')) continue;
    const linha = conteudo.slice(0, m.index + bloco.indexOf(nome)).split('\n').length;
    violacoes.push({ ficheiro: relative(ROOT, caminho), linha, nome });
  }
}

if (violacoes.length > 0) {
  console.error('\nActions sem `revalidate` que também não declaram `permiteEmLeitura`:\n');
  for (const v of violacoes) {
    console.error(`  ${v.ficheiro}:${v.linha}  ${v.nome}`);
  }
  console.error(
    '\nDecida e escreva:\n' +
      '  - é uma LEITURA (listar/obter/procurar/calcular)? acrescente `permiteEmLeitura: true`\n' +
      '  - é uma ESCRITA? acrescente `revalidate: { paths: [...] }` — e, se for de subscrição\n' +
      '    (pagar, portal, cancelar), também `permiteEmLeitura: true`, porque sair da Leitura\n' +
      '    nunca se trava (ADR-0027 §6, ADR-0032 §2).\n',
  );
  process.exit(1);
}

console.log('OK: todas as Server Actions declaram o que fazem em Leitura.');
process.exit(0);
