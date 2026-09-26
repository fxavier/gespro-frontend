/**
 * As linhas de uma secção da DFC nas colunas N e N-1 (nó `pagina`, ticket 8.1/8.3).
 *
 * Módulo puro: não calcula dinheiro nenhum, só EMPARELHA o que o serviço já
 * devolveu — a rubrica de N com a mesma rubrica de N-1 (por `id`), e dentro dela
 * cada conta de N com a mesma conta de N-1. O valor de cada lado é o `valor` da
 * rubrica e o `efeitoCaixa` da conta, tal como saíram de `gerarDFC`; a página
 * não soma nem subtrai nada.
 *
 * Uma rubrica (ou conta) só aparece numa coluna quando teve movimento nesse
 * intervalo. Aparece na tabela se tiver movimento em QUALQUER das duas — é a
 * união, ordenada como o serviço ordena (`ordem`, depois `codigo`). Do lado em
 * que falta, o valor é `null`: a página mostra 0,00 quando há exercício
 * anterior e «—» quando não há (`DFC.homologo === null`, E3). A mesma regra do
 * PDF (`dfc-pdf.tsx`).
 */
import type { LinhaRubricaDFC, RubricaResumo, SeccaoDFC, VariacaoClassificada } from '@/server/services/financas/dfc.interface';

export interface ContaComparada {
  conta: VariacaoClassificada['conta'];
  n: VariacaoClassificada | null;
  n1: VariacaoClassificada | null;
}

export interface RubricaComparada {
  rubrica: RubricaResumo;
  n: LinhaRubricaDFC | null;
  n1: LinhaRubricaDFC | null;
  contas: ContaComparada[];
}

const porCodigo = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function emparelharContas(n: LinhaRubricaDFC | null, n1: LinhaRubricaDFC | null): ContaComparada[] {
  const porId = new Map<string, ContaComparada>();
  for (const v of n?.contas ?? []) porId.set(v.conta.id, { conta: v.conta, n: v, n1: null });
  for (const v of n1?.contas ?? []) {
    const existente = porId.get(v.conta.id);
    if (existente) existente.n1 = v;
    else porId.set(v.conta.id, { conta: v.conta, n: null, n1: v });
  }
  return [...porId.values()].sort((a, b) => porCodigo(a.conta.codigo, b.conta.codigo));
}

/** Emparelha as rubricas de uma secção de N com as da mesma secção de N-1 (`null` sem exercício anterior). */
export function compararSeccao(atual: SeccaoDFC, homologo: SeccaoDFC | null): RubricaComparada[] {
  const porId = new Map<string, { rubrica: RubricaResumo; n: LinhaRubricaDFC | null; n1: LinhaRubricaDFC | null }>();
  for (const l of atual.rubricas) porId.set(l.rubrica.id, { rubrica: l.rubrica, n: l, n1: null });
  for (const l of homologo?.rubricas ?? []) {
    const existente = porId.get(l.rubrica.id);
    if (existente) existente.n1 = l;
    else porId.set(l.rubrica.id, { rubrica: l.rubrica, n: null, n1: l });
  }
  return [...porId.values()]
    .sort((a, b) => a.rubrica.ordem - b.rubrica.ordem || porCodigo(a.rubrica.codigo, b.rubrica.codigo))
    .map((r) => ({ ...r, contas: emparelharContas(r.n, r.n1) }));
}
