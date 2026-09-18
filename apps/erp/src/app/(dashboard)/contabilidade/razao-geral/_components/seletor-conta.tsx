'use client';

/**
 * Escolha da conta e do período para o razão.
 *
 * A página só sabia ler `?contaId=…` da URL — e dizia-o ao utilizador, a
 * pedir-lhe que a editasse à mão. Isto escreve os mesmos parâmetros por ele.
 *
 * O filtro da combobox é local: o plano de contas de um tenant são centenas de
 * linhas, não milhares, e vêm todas do servidor de uma vez.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox, type ComboboxOption } from '@/components/patterns';

export function SeletorConta({
  contas,
  contaId,
  dataInicio,
  dataFim,
}: {
  contas: ComboboxOption[];
  contaId?: string;
  dataInicio: string;
  dataFim: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conta, setConta] = useState(contaId ?? '');
  const [inicio, setInicio] = useState(dataInicio);
  const [fim, setFim] = useState(dataFim);

  const consultar = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('contaId', conta);
    params.set('dataInicio', inicio);
    params.set('dataFim', fim);
    router.push(`/contabilidade/razao-geral?${params.toString()}`);
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="conta">Conta</Label>
        <Combobox
          id="conta"
          options={contas}
          value={conta}
          onChange={setConta}
          placeholder="Seleccione a conta"
          searchPlaceholder="Pesquisar por código ou nome…"
          emptyText="Nenhuma conta encontrada."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="data-inicio">De</Label>
        <Input
          id="data-inicio"
          type="date"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="data-fim">Até</Label>
        <Input id="data-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
      </div>

      <Button type="button" onClick={consultar} disabled={!conta}>
        <Search className="h-4 w-4 mr-2" aria-hidden="true" />
        Consultar
      </Button>
    </div>
  );
}
