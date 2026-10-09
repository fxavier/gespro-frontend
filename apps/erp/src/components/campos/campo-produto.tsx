'use client';

/**
 * Produto de um formulário (#265): pesquisa por nome, SKU ou código de barras no servidor
 * (`procurarProdutos`), nunca um id colado num campo de texto. A primeira página chega por
 * `opcoesIniciais`, carregada pelo Server Component; ao escolher, `onChange` recebe também o
 * produto (nome, SKU, preço) para quem precisa de preencher o resto da linha.
 */
import { useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { ComboboxRemoto } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { procurarProdutos } from '@/server/actions/vendas.actions';

export interface ProdutoOpcao {
  id: string;
  nome: string;
  sku: string;
  /** Decimal serializado (string). */
  precoVenda?: string;
  taxaIva?: string | number;
}

interface Props {
  id: string;
  rotulo: string;
  opcoesIniciais: ProdutoOpcao[];
  value: string;
  onChange: (id: string, produto?: ProdutoOpcao) => void;
  erro?: string;
  className?: string;
}

const rotuloProduto = (p: ProdutoOpcao) => `${p.sku} — ${p.nome}`;

export function CampoProduto({ id, rotulo, opcoesIniciais, value, onChange, erro, className }: Props) {
  // Produtos já vistos (primeira página + resultados de pesquisa).
  const catalogo = useRef(new Map(opcoesIniciais.map((p) => [p.id, p])));

  const buscar = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarProdutos({ q });
    if (!res.ok) return null;
    for (const p of res.data) catalogo.current.set(p.id, p);
    return res.data.map((p) => ({ value: p.id, label: rotuloProduto(p) }));
  }, []);

  return (
    <div className={className ?? 'space-y-2'}>
      <Label htmlFor={id}>{rotulo}</Label>
      <ComboboxRemoto
        id={id}
        opcoesIniciais={opcoesIniciais.map((p) => ({ value: p.id, label: rotuloProduto(p) }))}
        procurar={buscar}
        value={value}
        onChange={(v) => onChange(v, catalogo.current.get(v))}
        placeholder="Seleccione o produto"
        searchPlaceholder="Pesquisar por nome ou SKU…"
        emptyText="Nenhum produto encontrado."
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      {erro && <p id={`${id}-erro`} className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
