'use client';

/**
 * Colaborador de um formulário de RH (#265): pesquisa por código ou nome no servidor
 * (`procurarColaboradoresAction`), nunca um id colado num campo de texto. A primeira página
 * chega por `opcoesIniciais`, carregada pelo Server Component.
 */
import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { ComboboxRemoto } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { procurarColaboradoresAction } from '@/server/actions/rh.actions';

interface Props {
  opcoesIniciais: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  erro?: string;
}

const rotuloColaborador = (c: { codigo: string; nome: string }) => `${c.codigo} — ${c.nome}`;

export function CampoColaborador({ opcoesIniciais, value, onChange, erro }: Props) {
  const buscar = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarColaboradoresAction({ q });
    return res.ok ? res.data.map((c) => ({ value: c.id, label: rotuloColaborador(c) })) : null;
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor="colaboradorId">Colaborador *</Label>
      <ComboboxRemoto
        id="colaboradorId"
        opcoesIniciais={opcoesIniciais}
        procurar={buscar}
        value={value}
        onChange={onChange}
        placeholder="Seleccione o colaborador"
        searchPlaceholder="Pesquisar por código ou nome…"
        emptyText="Nenhum colaborador encontrado."
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? 'colaboradorId-erro' : undefined}
      />
      {erro && <p id="colaboradorId-erro" className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
