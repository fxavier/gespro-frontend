'use client';

/**
 * Escolha do período para os mapas contabilísticos (balancete, DRE).
 *
 * O balancete e a DRE exigem `dataInicio` e `dataFim` e não tinham por onde os
 * receber: a ligação da barra lateral não leva query nenhuma, e a página
 * limitava-se a pedir ao utilizador que editasse a URL à mão — o balancete
 * abria sempre vazio. É o mesmo problema que o `SeletorConta` já resolveu no
 * razão geral, e a solução é a mesma: escrever os parâmetros por ele.
 *
 * Preserva os restantes parâmetros da URL (`incluirZeradas`, `centroCustoId`),
 * senão consultar um período limpava o filtro que estivesse activo.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SeletorPeriodo({
  rota,
  dataInicio,
  dataFim,
}: {
  /** Rota para onde submeter, ex.: `/contabilidade/balancete`. */
  rota: string;
  dataInicio: string;
  dataFim: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inicio, setInicio] = useState(dataInicio);
  const [fim, setFim] = useState(dataFim);

  const consultar = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('dataInicio', inicio);
    params.set('dataFim', fim);
    router.push(`${rota}?${params.toString()}`);
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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

      <Button type="button" onClick={consultar} disabled={!inicio || !fim}>
        <Search className="h-4 w-4 mr-2" aria-hidden="true" />
        Consultar
      </Button>
    </div>
  );
}
