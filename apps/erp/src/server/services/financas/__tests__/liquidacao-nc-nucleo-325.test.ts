/**
 * Oráculo #325 — um só núcleo de liquidação de notas de crédito (escrito ANTES da implementação;
 * quem implementa não o altera).
 *
 * Contrato (decisão do orquestrador, refactor SEM mudança de comportamento):
 *   - Hoje há três escritores de `NotaCredito.status = LIQUIDADA` em `faturacao.service.ts`
 *     (`liquidarNotaCredito`, `devolverNotaCreditoPelosMeiosOriginaisEmTx`,
 *     `liquidarNotaCreditoEmTx`). Passa a haver UM núcleo, com as variantes explícitas, usado pela
 *     liquidação manual, pela anulação POS, pela devolução e pela troca.
 *   - A leitura dos meios originais do documento é uma função PURA exportada,
 *     `meiosOriginaisDe(partidas)` → `{ creditos: { contaCodigo, valor }[], compensado }`
 *     (forma do núcleo indicada na issue): soma por conta os DÉBITOS do lançamento do documento;
 *     o débito na 411 (parte a crédito) não se devolve — é o `compensado`; as outras contas
 *     são os `creditos` do lançamento de liquidação. Os CRÉDITOS do lançamento são ignorados.
 *   - O enum gravado (`FormaLiquidacaoNC`: DEVOLUCAO | COMPENSACAO) não muda — sem migração.
 *   - As três entradas públicas continuam publicadas (os oráculos de integração existentes
 *     chamam-nas pelo nome): `liquidarNotaCredito`, `devolverNotaCreditoPelosMeiosOriginaisEmTx`,
 *     `liquidarNotaCreditoEmTx`.
 *
 * Decisões conservadoras deste oráculo (tratadas como contrato):
 *   - `meiosOriginaisDe` vive em `faturacao.service.ts` (onde está hoje a lógica que substitui);
 *     cada partida de entrada traz `tipo`, `valor` e a conta em duas grafias
 *     (`conta.codigo` — a forma do `findMany` actual — e `contaCodigo`), para não fixar qual o
 *     núcleo lê; `valor` de saída é comparado por `toFixed(2)` (Decimal ou string servem).
 *   - «Um só escritor» prova-se pela fonte: uma só linha de código (não comentário) que grava
 *     `formaLiquidacao` e uma só transição de NC para LIQUIDADA em todo o `src/server`.
 *
 * O invariante comportamental nos quatro caminhos (e o enum gravado) está no oráculo de
 * integração `test/integration/liquidacao-nc-nucleo-325.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';

const dec = (v: unknown) => new Prisma.Decimal(String(v));

const RAIZ_SERVER = path.resolve(__dirname, '../../..');
const FICHEIRO_FATURACAO = path.resolve(__dirname, '../faturacao.service.ts');

/** Linhas de código (sem comentários de bloco/linha) de um ficheiro TS. */
function linhasDeCodigo(ficheiro: string): string[] {
  const fonte = readFileSync(ficheiro, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  return fonte.split('\n').map((l) => l.replace(/\/\/.*$/, ''));
}

function ficheirosTs(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === '__tests__' || nome === 'node_modules') continue;
      out.push(...ficheirosTs(p));
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      out.push(p);
    }
  }
  return out;
}

/** Ocorrências (ficheiro:linha) de um padrão nas linhas de código de `src/server`. */
function ocorrencias(padrao: RegExp): string[] {
  const achados: string[] = [];
  for (const f of ficheirosTs(RAIZ_SERVER)) {
    linhasDeCodigo(f).forEach((l, i) => {
      if (padrao.test(l)) achados.push(`${path.relative(RAIZ_SERVER, f)}:${i + 1}`);
    });
  }
  return achados;
}

type PartidaEntrada = {
  tipo: 'DEBITO' | 'CREDITO';
  valor: Prisma.Decimal;
  conta: { codigo: string };
  contaCodigo: string;
};

const p = (tipo: 'DEBITO' | 'CREDITO', codigo: string, valor: string): PartidaEntrada => ({
  tipo,
  valor: dec(valor),
  conta: { codigo },
  contaCodigo: codigo,
});

async function meiosOriginaisDe(partidas: PartidaEntrada[]): Promise<{ creditos: Array<[string, string]>; compensado: string }> {
  const mod: any = await import('@/server/services/financas/faturacao.service');
  expect(typeof mod.meiosOriginaisDe, 'meiosOriginaisDe exportada de faturacao.service (função pura, #325)').toBe('function');
  const r = mod.meiosOriginaisDe(partidas);
  expect(r, 'meiosOriginaisDe é síncrona (pura): devolve o resultado, não uma Promise').not.toBeInstanceOf(Promise);
  expect(Array.isArray(r?.creditos), 'resultado com `creditos[]`').toBe(true);
  const creditos = (r.creditos as Array<{ contaCodigo: string; valor: unknown }>)
    .map((c) => [c.contaCodigo, dec(c.valor).toFixed(2)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
  return { creditos, compensado: dec(r.compensado).toFixed(2) };
}

describe('#325 — meiosOriginaisDe(partidas): função pura dos meios originais', () => {
  it('Factura-Recibo em numerário (D 111 / C 711 / C 44331): devolve-se tudo pela 111, nada compensado', async () => {
    const r = await meiosOriginaisDe([p('DEBITO', '111', '1160'), p('CREDITO', '711', '1000'), p('CREDITO', '44331', '160')]);
    expect(r).toEqual({ creditos: [['111', '1160.00']], compensado: '0.00' });
  });

  it('venda mista (D 411 crédito + D 111 + D 121): a 411 é o compensado e NUNCA aparece nos créditos', async () => {
    const r = await meiosOriginaisDe([
      p('DEBITO', '411', '100'),
      p('DEBITO', '111', '20.28'),
      p('DEBITO', '121', '19'),
      p('CREDITO', '711', '120.08'),
      p('CREDITO', '44331', '19.20'),
    ]);
    expect(r).toEqual({ creditos: [['111', '20.28'], ['121', '19.00']], compensado: '100.00' });
  });

  it('a mesma conta debitada em várias partidas soma-se numa só entrada (incluindo a 411)', async () => {
    const r = await meiosOriginaisDe([
      p('DEBITO', '111', '10'),
      p('DEBITO', '121', '20'),
      p('DEBITO', '111', '5.5'),
      p('DEBITO', '411', '1'),
      p('DEBITO', '411', '2'),
      p('CREDITO', '711', '38.50'),
    ]);
    expect(r).toEqual({ creditos: [['111', '15.50'], ['121', '20.00']], compensado: '3.00' });
  });

  it('venda toda a crédito (só D 411): sem créditos de liquidação, compensado = total', async () => {
    const r = await meiosOriginaisDe([p('DEBITO', '411', '1160'), p('CREDITO', '711', '1000'), p('CREDITO', '44331', '160')]);
    expect(r).toEqual({ creditos: [], compensado: '1160.00' });
  });

  it('sem partidas: nada a devolver nem a compensar', async () => {
    expect(await meiosOriginaisDe([])).toEqual({ creditos: [], compensado: '0.00' });
  });

  it('é pura: não muta a entrada e dá o mesmo resultado duas vezes', async () => {
    const entrada = [p('DEBITO', '411', '7'), p('DEBITO', '111', '3'), p('CREDITO', '711', '10')];
    const copia = JSON.stringify(entrada);
    const a = await meiosOriginaisDe(entrada);
    const b = await meiosOriginaisDe(entrada);
    expect(JSON.stringify(entrada)).toBe(copia);
    expect(a).toEqual(b);
    expect(a).toEqual({ creditos: [['111', '3.00']], compensado: '7.00' });
  });
});

describe('#325 — um só escritor da liquidação de NC (prova pela fonte)', () => {
  it('as três entradas públicas continuam publicadas pelo faturacao.service', async () => {
    const mod: any = await import('@/server/services/financas/faturacao.service');
    for (const nome of ['liquidarNotaCredito', 'devolverNotaCreditoPelosMeiosOriginaisEmTx', 'liquidarNotaCreditoEmTx']) {
      expect(typeof mod[nome], `${nome} exportada`).toBe('function');
      expect(typeof mod.faturacaoService?.[nome], `faturacaoService.${nome}`).toBe('function');
    }
  });

  it('em todo o src/server há UMA só linha que grava `formaLiquidacao` (o núcleo)', () => {
    // Não são escritas: `formaLiquidacao: true` (select), nem declarações de tipo (ficheiros
    // `.interface.ts`/`.d.ts`, membros `x: T;` ou uniões `'A' | 'B'`).
    const escritas = ocorrencias(/\bformaLiquidacao\??\s*:(?!\s*true\b)/).filter((o) => {
      if (/\.(interface|d)\.ts:/.test(o)) return false;
      const [f, n] = [o.slice(0, o.lastIndexOf(':')), Number(o.slice(o.lastIndexOf(':') + 1))];
      const linha = linhasDeCodigo(path.join(RAIZ_SERVER, f))[n - 1];
      return !/;\s*$/.test(linha) && !/formaLiquidacao\??\s*:\s*'[A-Z_]+'\s*\|/.test(linha);
    });
    expect(escritas, `escritores de formaLiquidacao: ${escritas.join(', ')}`).toHaveLength(1);
    expect(escritas[0], 'o núcleo vive no faturacao.service').toMatch(/^services\/financas\/faturacao\.service\.ts:/);
  });

  it("em todo o src/server há UMA só transição de NC para LIQUIDADA (`transitarNC(…, 'LIQUIDADA')`)", () => {
    const transicoes = ocorrencias(/transitarNC\s*\([^)]*'LIQUIDADA'/);
    expect(transicoes, `transições NC → LIQUIDADA: ${transicoes.join(', ')}`).toHaveLength(1);
  });

  it("no faturacao.service só há uma escrita `status: 'LIQUIDADA'` de nota de crédito (a da ND é à parte)", () => {
    const linhas = linhasDeCodigo(FICHEIRO_FATURACAO);
    const escritas = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /status\s*:\s*'LIQUIDADA'/.test(l) && !/notaDebito/.test(l));
    expect(
      escritas.map(({ i }) => `faturacao.service.ts:${i + 1}`),
      'escritas de status LIQUIDADA em notas de crédito',
    ).toHaveLength(1);
  });

  it('nenhum serviço comercial (venda, devolução, troca) escreve a liquidação da NC por conta própria', () => {
    const fora = ocorrencias(/notaCredito\.update[\s\S]*LIQUIDADA|status\s*:\s*'LIQUIDADA'/).filter(
      (o) => !o.startsWith('services/financas/faturacao.service.ts:'),
    );
    expect(fora).toEqual([]);
  });
});
