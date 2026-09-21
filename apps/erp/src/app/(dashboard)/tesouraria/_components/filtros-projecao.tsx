'use client';

/**
 * Filtros da projecção de tesouraria — CLIENT COMPONENT.
 *
 * Horizonte, granularidade e cenário vivem em `searchParams` (R7.1) — a URL é
 * partilhável e o Server Component relê e reprojecta. Usa `useSearchParams`,
 * logo TEM de ser montado dentro de `<Suspense>` pela página (o build
 * standalone parte o prerender sem isso, e nem `pnpm check` nem `pnpm dev`
 * o apanham).
 *
 * O tecto de horizonte por granularidade (ADR-0036 §5) é imposto AQUI por
 * escolha explícita — mudar a granularidade para uma com tecto inferior
 * ajusta o horizonte na URL, visivelmente; o schema do servidor continua a
 * recusar combinações inválidas vindas de URL manual.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  TECTO_HORIZONTE_DIAS,
  type Cenario,
  type Granularidade,
} from '@/lib/validations/tesouraria';

const GRANULARIDADES: { value: Granularidade; label: string }[] = [
  { value: 'DIARIA', label: 'Diária' },
  { value: 'SEMANAL', label: 'Semanal' },
  { value: 'MENSAL', label: 'Mensal' },
];

const CENARIOS: { value: Cenario; label: string }[] = [
  { value: 'OTIMISTA', label: 'Optimista' },
  { value: 'BASE', label: 'Base' },
  { value: 'PESSIMISTA', label: 'Pessimista' },
];

const HORIZONTES: Record<Granularidade, number[]> = {
  DIARIA: [7, 14, 30, 60, 90],
  SEMANAL: [30, 60, 90, 180],
  MENSAL: [90, 180, 270, 365],
};

interface FiltrosProjecaoProps {
  horizonteDias: number;
  granularidade: Granularidade;
  cenario: Cenario;
}

export function FiltrosProjecao({
  horizonteDias,
  granularidade,
  cenario,
}: FiltrosProjecaoProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const aplicar = useCallback(
    (mudancas: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(mudancas).forEach(([k, v]) => params.set(k, v));
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const mudarGranularidade = (g: Granularidade) => {
    const tecto = TECTO_HORIZONTE_DIAS[g];
    const horizonte = horizonteDias > tecto ? tecto : horizonteDias;
    aplicar({ granularidade: g, horizonteDias: String(horizonte) });
  };

  const opcoesHorizonte = HORIZONTES[granularidade].includes(horizonteDias)
    ? HORIZONTES[granularidade]
    : [...HORIZONTES[granularidade], horizonteDias].sort((a, b) => a - b);

  const granularidadeLabel = GRANULARIDADES.find(
    (g) => g.value === granularidade,
  )?.label;
  const cenarioLabel = CENARIOS.find((c) => c.value === cenario)?.label;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="filtro-horizonte">Horizonte</Label>
        <Select
          value={String(horizonteDias)}
          onValueChange={(v) => aplicar({ horizonteDias: v })}
        >
          <SelectTrigger id="filtro-horizonte" className="w-36">
            {/* Radix só resolve o texto do item depois de a lista abrir —
                sem o filho, o campo aparecia vazio com valor escolhido. */}
            <SelectValue placeholder="Horizonte">
              {horizonteDias} dias
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {opcoesHorizonte.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h} dias
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filtro-granularidade">Granularidade</Label>
        <Select
          value={granularidade}
          onValueChange={(v) => mudarGranularidade(v as Granularidade)}
        >
          <SelectTrigger id="filtro-granularidade" className="w-36">
            <SelectValue placeholder="Granularidade">
              {granularidadeLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GRANULARIDADES.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filtro-cenario">Cenário</Label>
        <Select
          value={cenario}
          onValueChange={(v) => aplicar({ cenario: v })}
        >
          <SelectTrigger id="filtro-cenario" className="w-36">
            <SelectValue placeholder="Cenário">{cenarioLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CENARIOS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
