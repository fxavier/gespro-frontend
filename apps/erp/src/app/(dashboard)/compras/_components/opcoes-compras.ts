/**
 * Rótulos e pesquisas das combobox dos formulários de compras (#265): fornecedor, requisição e
 * cotação escolhem-se pelo nome/número, nunca por um id colado. Módulo neutro — os rótulos servem
 * ao Server Component (opções iniciais) e as pesquisas ao formulário cliente, com o mesmo texto.
 */
import type { ComboboxOption } from '@/components/patterns';
import {
  procurarCotacoesCompraAction,
  procurarRequisicoesCompraAction,
} from '@/server/actions/compras.actions';
import { procurarFornecedoresAction } from '@/server/actions/fornecedores.actions';

export const rotuloFornecedor = (f: { nome: string; nuit?: string | null }) =>
  f.nuit ? `${f.nome} (${f.nuit})` : f.nome;
export const rotuloRequisicao = (r: { numero: string; departamento?: string | null }) =>
  r.departamento ? `${r.numero} — ${r.departamento}` : r.numero;
export const rotuloCotacao = (c: { numero: string }) => c.numero;

export async function procurarFornecedores(q: string): Promise<ComboboxOption[] | null> {
  const r = await procurarFornecedoresAction({ q });
  return r.ok ? r.data.map((f) => ({ value: f.id, label: rotuloFornecedor(f) })) : null;
}

export async function procurarRequisicoes(q: string): Promise<ComboboxOption[] | null> {
  const r = await procurarRequisicoesCompraAction({ q });
  return r.ok ? r.data.map((x) => ({ value: x.id, label: rotuloRequisicao(x) })) : null;
}

export async function procurarCotacoes(q: string): Promise<ComboboxOption[] | null> {
  const r = await procurarCotacoesCompraAction({ q });
  return r.ok ? r.data.map((x) => ({ value: x.id, label: rotuloCotacao(x) })) : null;
}
