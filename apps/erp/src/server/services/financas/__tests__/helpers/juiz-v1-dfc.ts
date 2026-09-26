// ---------------------------------------------------------------------------
// JUIZ do V1 (nó `config-v` do grafo dfc) — verificador-fluxo-caixa.
// FICHEIRO PROTEGIDO (doutrina 00 §2). Usado por `dfc-config.test.ts` e posto
// à prova em `duplo-config-dfc.autoteste.test.ts` (tem de acusar adulterações).
// ---------------------------------------------------------------------------
import { expect } from 'vitest';
import type { InstantaneoMapeamento } from '../../dfc.interface';
import { mudou } from '../../mapeamento-versao.model';

/** V1 — o juiz (exportado para o autoteste). Lança se a versão mais recente não for igual, ao elemento, ao vivo. */
export function afirmarV1(versoes: ReadonlyArray<Record<string, unknown>>, vivo: InstantaneoMapeamento): void {
  const recente = versoes[versoes.length - 1];
  if (!recente) throw new Error('V1: não há versão nenhuma');
  const inst = recente.instantaneo as InstantaneoMapeamento;
  if (mudou(inst, vivo)) {
    throw new Error(`V1: a versão ${String(recente.numero)} não é igual ao mapeamento vivo`);
  }
  // Juiz independente do núcleo: a forma canónica, calculada aqui.
  const canon = (i: InstantaneoMapeamento) => ({
    rubricas: [...i.rubricas]
      .map((r) => ({ id: r.id, codigo: r.codigo, designacao: r.designacao, atividade: r.atividade, sinal: r.sinal, ordem: r.ordem, origem: r.origem, ativo: r.ativo }))
      .sort((x, y) => (x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0)),
    mapeamentos: [...i.mapeamentos]
      .map((m) => ({ contaId: m.contaId, rubricaId: m.rubricaId }))
      .sort((x, y) => (x.contaId < y.contaId ? -1 : x.contaId > y.contaId ? 1 : 0)),
  });
  expect(canon(inst)).toEqual(canon(vivo));
}
