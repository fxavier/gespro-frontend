'use client';

/**
 * Selector do balanço (#365): exercício e período final. Cada escolha empurra o URL e o
 * Server Component faz a leitura — sem estado local, logo nada a dessincronizar quando só os
 * search params mudam. O rótulo escolhido vai como filho do `SelectValue` (o Radix só resolve o
 * texto do item depois de a lista abrir).
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const OPCOES_PERIODO = [
  ...NOMES_MES.map((nome, i) => ({ value: String(i + 1), label: `${String(i + 1).padStart(2, '0')} — ${nome}` })),
  { value: '13', label: '13 — Encerramento' },
];

export function SeletorBalanco({
  exercicios,
  exercicio,
  periodoFinal,
}: {
  exercicios: { codigo: string }[];
  exercicio: string;
  periodoFinal: number;
}) {
  const router = useRouter();
  const [aCarregar, iniciarTransicao] = useTransition();

  const ir = (codigo: string, ate: string | null) => {
    const q = new URLSearchParams({ exercicio: codigo });
    if (ate) q.set('ate', ate);
    iniciarTransicao(() => router.push(`/contabilidade/balanco?${q.toString()}`));
  };

  const periodo = OPCOES_PERIODO.find((o) => o.value === String(periodoFinal));

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4" aria-busy={aCarregar}>
      <div className="space-y-1.5">
        <Label htmlFor="balanco-exercicio">Exercício</Label>
        {/* Mudar de exercício volta à omissão do período (13 encerrado, 12 aberto). */}
        <Select value={exercicio} onValueChange={(v) => ir(v, null)}>
          <SelectTrigger id="balanco-exercicio" className="w-40">
            <SelectValue placeholder="Exercício">{exercicio}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {exercicios.map((e) => (
              <SelectItem key={e.codigo} value={e.codigo}>
                {e.codigo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="balanco-periodo-final">Até ao período</Label>
        <Select value={String(periodoFinal)} onValueChange={(v) => ir(exercicio, v)}>
          <SelectTrigger id="balanco-periodo-final" className="w-56">
            <SelectValue placeholder="Período final">{periodo?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {OPCOES_PERIODO.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
