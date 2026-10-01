'use client';

/**
 * Seletor de exercício e períodos para o balancete de verificação PHC.
 *
 * ADR-0040, issue #280. Empurra a URL; o Server Component faz a leitura.
 *
 * Os ids nos SelectTrigger são obrigatórios para que o `<Label htmlFor>` funcione
 * e o Playwright consiga usar `getByLabel('Período inicial')`.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Dados estáticos de períodos
// ---------------------------------------------------------------------------

const NOMES_MES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Separador em traço (U+2014 — em dash), como o PHC usa. */
const SEP = '—';

const OPCOES_PERIODO = [
  ...NOMES_MES.map((nome, i) => ({
    value: String(i + 1),
    label: `${String(i + 1).padStart(2, '0')} ${SEP} ${nome}`,
  })),
  { value: '13', label: `13 ${SEP} Encerramento` },
];

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface Props {
  exercicios: { id: string; codigo: string }[];
  exercicioAtual: string;
  periodoInicial: number;
  periodoFinal: number;
  incluir13: boolean;
}

export function SeletorBalanceteVerificacao({
  exercicios,
  exercicioAtual,
  periodoInicial,
  periodoFinal,
  incluir13,
}: Props) {
  const router = useRouter();

  const [exercicio, setExercicio] = useState(exercicioAtual);
  const [pInicial, setPInicial] = useState(periodoInicial);
  const [pFinal, setPFinal] = useState(periodoFinal);
  const [incl13, setIncl13] = useState(incluir13);

  // «Adjusting state when a prop changes» (React docs) — no effect needed.
  // Next.js App Router updates client components in-place across RSC navigations
  // (key remount does not occur); this pattern resets local state during render
  // when the server sends new clamped values.
  const chave = `${exercicioAtual}-${periodoInicial}-${periodoFinal}-${incluir13}`;
  const [chaveAnterior, setChaveAnterior] = useState(chave);
  if (chave !== chaveAnterior) {
    setChaveAnterior(chave);
    setExercicio(exercicioAtual);
    setPInicial(periodoInicial);
    setPFinal(periodoFinal);
    setIncl13(incluir13);
  }

  const labelInicial = OPCOES_PERIODO.find((o) => o.value === String(pInicial))?.label ?? '';
  const labelFinal = OPCOES_PERIODO.find((o) => o.value === String(pFinal))?.label ?? '';

  const handleAplicar = () => {
    // Clamp before push so the URL already carries the normalised values
    const ateEfetivo = incl13 ? pFinal : Math.min(pFinal, 12);
    const deEfetivo = Math.min(pInicial, ateEfetivo);
    const params = new URLSearchParams();
    params.set('exercicio', exercicio);
    params.set('de', String(deEfetivo));
    params.set('ate', String(ateEfetivo));
    if (incl13) params.set('p13', '1');
    router.push(`/contabilidade/balancete?${params.toString()}`);
  };

  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      {/* Exercício */}
      <div className="space-y-2">
        <Label htmlFor="bv-exercicio">Exercício</Label>
        <Select value={exercicio} onValueChange={setExercicio}>
          <SelectTrigger id="bv-exercicio">
            <SelectValue placeholder="Exercício">{exercicio}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {exercicios.map((ex) => (
              <SelectItem key={ex.id} value={ex.codigo}>
                {ex.codigo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Período inicial */}
      <div className="space-y-2">
        <Label htmlFor="bv-periodo-inicial">Período inicial</Label>
        <Select
          value={String(pInicial)}
          onValueChange={(v) => setPInicial(Number(v))}
        >
          <SelectTrigger id="bv-periodo-inicial">
            <SelectValue placeholder="Período inicial">{labelInicial}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {OPCOES_PERIODO.filter((o) => o.value !== '13' || incl13).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Período final */}
      <div className="space-y-2">
        <Label htmlFor="bv-periodo-final">Período final</Label>
        <Select
          value={String(pFinal)}
          onValueChange={(v) => setPFinal(Number(v))}
        >
          <SelectTrigger id="bv-periodo-final">
            <SelectValue placeholder="Período final">{labelFinal}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {OPCOES_PERIODO.filter((o) => o.value !== '13' || incl13).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Aplicar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="bv-incluir13"
            checked={incl13}
            onCheckedChange={(v) => {
              const novo = Boolean(v);
              setIncl13(novo);
              // NIT-2: ao destickr p13, clamp os períodos a 12
              if (!novo) {
                if (pInicial > 12) setPInicial(12);
                if (pFinal > 12) setPFinal(12);
              }
            }}
          />
          <Label htmlFor="bv-incluir13" className="cursor-pointer text-sm font-normal">
            Incluir período 13 (encerramento)
          </Label>
        </div>
        <Button type="button" onClick={handleAplicar}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}
