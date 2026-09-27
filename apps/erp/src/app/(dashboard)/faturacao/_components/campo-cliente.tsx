'use client';

/**
 * Cliente de um documento de faturação (#258): pesquisa por código, nome ou
 * NUIT no servidor (`procurarClientes`), nunca um id colado num campo de texto.
 */
import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { ComboboxRemoto } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { procurarClientes } from '@/server/actions/clientes.actions';

interface Props {
  opcoesIniciais: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  erro?: string;
}

export function CampoCliente({ opcoesIniciais, value, onChange, erro }: Props) {
  const buscar = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarClientes({ q });
    return res.ok ? res.data.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` })) : null;
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor="cliente-id">Cliente *</Label>
      <ComboboxRemoto
        id="cliente-id"
        opcoesIniciais={opcoesIniciais}
        procurar={buscar}
        value={value}
        onChange={onChange}
        placeholder="Seleccione o cliente"
        searchPlaceholder="Pesquisar por código, nome ou NUIT…"
        emptyText="Nenhum cliente encontrado."
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? 'cliente-id-erro' : undefined}
      />
      {erro && <p id="cliente-id-erro" className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
