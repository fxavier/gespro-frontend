/**
 * Oráculo #328 (unitário) — `TRANSICOES_VENDA` descreve todas as arestas que o histórico grava.
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (decisão do orquestrador): o mapa alinha-se com as transições que o código executa.
 * A anulação por nota de crédito (`vendaService.anular`, ADR-0041 §8) grava no histórico
 * `CONCLUIDA → CANCELADA` (venda paga) e `FATURADA → CANCELADA` (venda a crédito/mista, #322):
 * as duas arestas têm de estar no mapa.
 *
 * Decisão conservadora deste oráculo (tratada como contrato): alargar o MAPA não alarga a porta
 * MANUAL. `vendaService.transitar` continua a recusar, com `TRANSICAO_INVALIDA`, as arestas que
 * só o serviço percorre (cancelar uma venda CONCLUIDA/FATURADA, concluir uma PENDENTE sem
 * factura) — provado contra Postgres em `test/integration/transicoes-venda-328.test.ts`.
 *
 * O teste de integração cobre as arestas que cada escritor grava de facto. Aqui fica a guarda
 * estática de que os escritores do histórico não se espalham: um escritor novo fora de
 * `venda.service.ts` passaria ao lado do oráculo de integração sem ninguém dar por isso.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as vendaInterface from '../venda.interface';

const ERP = path.resolve(__dirname, '../../../../..');

const mapa = (vendaInterface as any).TRANSICOES_VENDA as Record<string, string[]>;

describe('#328 — TRANSICOES_VENDA contém as arestas da anulação por nota de crédito', () => {
  it('CONCLUIDA → CANCELADA (anular venda POS paga) está no mapa', () => {
    expect(mapa.CONCLUIDA, 'aresta gravada por vendaService.anular numa venda paga').toContain('CANCELADA');
  });

  it('FATURADA → CANCELADA (anular venda POS a crédito/mista, #322) está no mapa', () => {
    expect(mapa.FATURADA, 'aresta gravada por vendaService.anular numa venda a crédito').toContain('CANCELADA');
  });

  it('CONCLUIDA continua sem outra saída que não a anulação (nada volta atrás de concluída)', () => {
    expect([...mapa.CONCLUIDA].sort()).toEqual(['CANCELADA']);
  });

  it('CANCELADA e DEVOLVIDA continuam terminais', () => {
    expect(mapa.CANCELADA).toEqual([]);
    expect(mapa.DEVOLVIDA).toEqual([]);
  });

  it('nenhuma aresta do mapa leva a RASCUNHO (o rascunho só existe à nascença)', () => {
    for (const [de, destinos] of Object.entries(mapa)) {
      expect(destinos, `${de} → RASCUNHO`).not.toContain('RASCUNHO');
    }
  });
});

describe('#328 — os escritores de HistoricoEstadoVenda vivem só em venda.service.ts', () => {
  it('nenhum ficheiro de src/ fora de comercial/venda.service.ts escreve no histórico da venda', () => {
    let saida = '';
    try {
      saida = execFileSync(
        'git',
        ['grep', '--untracked', '-l', '-E', 'historicoEstadoVenda\\.(create|createMany|createManyAndReturn|upsert|update|updateMany)[[:space:]]*\\(', '--', 'src'],
        { cwd: ERP, encoding: 'utf8' },
      );
    } catch (e: any) {
      // git grep sai com 1 quando não encontra nada.
      if (e?.status !== 1) throw e;
    }
    const ficheiros = saida
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes('__tests__/'));
    expect(ficheiros).toEqual(['src/server/services/comercial/venda.service.ts']);
  });
});
