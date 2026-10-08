'use client';

/**
 * Escolha de projecto com pesquisa no servidor (`ComboboxRemoto` sobre
 * `listarProjetosAction`). A primeira página vem do Server Component; o resto procura-se,
 * para que os projectos fora dela não fiquem inalcançáveis. Usado pelos formulários de
 * tarefa e de marco (#167).
 */

import { useCallback } from 'react';
import { ComboboxRemoto, type ComboboxOption } from '@/components/patterns';
import { listarProjetosAction } from '@/server/actions/projetos.actions';

interface Props {
  id: string;
  opcoesIniciais: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  invalido?: boolean;
}

export function CampoProjeto({ id, opcoesIniciais, value, onChange, invalido }: Props) {
  const procurar = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await listarProjetosAction({ search: q, take: 25 });
    return r.ok ? r.data.items.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` })) : null;
  }, []);

  return (
    <ComboboxRemoto
      id={id}
      aria-label="Projecto"
      aria-invalid={invalido}
      opcoesIniciais={opcoesIniciais}
      procurar={procurar}
      value={value}
      onChange={onChange}
      placeholder="Seleccione o projecto"
      searchPlaceholder="Pesquisar por código ou nome…"
      emptyText="Nenhum projecto encontrado."
    />
  );
}
