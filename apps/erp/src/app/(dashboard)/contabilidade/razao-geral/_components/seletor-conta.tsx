'use client';

/**
 * Escolha da conta e do intervalo para o razão geral.
 *
 * Dois modos seleccionáveis por radio:
 *   «Por datas»:    contaId + dataInicio + dataFim
 *   «Por períodos»: contaId + exercicio (código) + de + ate [+ p13=1]
 *
 * O estado reflecte os parâmetros do URL (padrão React «ajustar estado quando
 * uma prop muda»: guarda a chave anterior em estado e repõe quando difere) —
 * não com useEffect+setState, que o lint recusa.
 *
 * Issue #297.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, type ComboboxOption } from '@/components/patterns';

type Modo = 'datas' | 'periodos';

export function SeletorConta({
  contas,
  exercicios,
  contaId,
  modo: modoProp = 'datas',
  // Exercício por omissão quando o utilizador muda para o modo «Por períodos»
  // sem ter um exercício seleccionado (passado pela página — exercicios[0] ou
  // o exercício que está a ser mostrado).
  exercicioOmissao = '',
  // Modo datas
  dataInicio: dataInicioProp = '',
  dataFim: dataFimProp = '',
  // Modo períodos
  exercicio: exercicioProp = '',
  periodoInicial: periodoInicialProp = 1,
  periodoFinal: periodoFinalProp = 12,
  incluir13: incluir13Prop = false,
}: {
  contas: ComboboxOption[];
  exercicios: Array<{ codigo: string }>;
  contaId?: string;
  modo?: Modo;
  exercicioOmissao?: string;
  dataInicio?: string;
  dataFim?: string;
  exercicio?: string;
  periodoInicial?: number;
  periodoFinal?: number;
  incluir13?: boolean;
}) {
  const router = useRouter();

  // ── Estado local ─────────────────────────────────────────────────────────
  const [conta, setConta] = useState(contaId ?? '');
  const [modo, setModo] = useState<Modo>(modoProp);
  // Datas
  const [dataInicio, setDataInicio] = useState(dataInicioProp);
  const [dataFim, setDataFim] = useState(dataFimProp);
  // Períodos
  const [exercicio, setExercicio] = useState(exercicioProp || exercicioOmissao);
  const [periodoInicial, setPeriodoInicial] = useState(String(periodoInicialProp));
  const [periodoFinal, setPeriodoFinal] = useState(String(periodoFinalProp));
  const [incluir13, setIncluir13] = useState(incluir13Prop);

  // ── Sincronização de URL → estado (padrão «ajustar estado quando prop muda») ──
  const chaveUrl = [modoProp, contaId, dataInicioProp, dataFimProp, exercicioProp, periodoInicialProp, periodoFinalProp, incluir13Prop].join('|');
  const [prevChave, setPrevChave] = useState(chaveUrl);
  if (prevChave !== chaveUrl) {
    setPrevChave(chaveUrl);
    setConta(contaId ?? '');
    setModo(modoProp);
    setDataInicio(dataInicioProp);
    setDataFim(dataFimProp);
    setExercicio(exercicioProp || exercicioOmissao);
    setPeriodoInicial(String(periodoInicialProp));
    setPeriodoFinal(String(periodoFinalProp));
    setIncluir13(incluir13Prop);
  }

  // ── Submissão ─────────────────────────────────────────────────────────────
  const consultar = () => {
    const params = new URLSearchParams();
    params.set('contaId', conta);

    if (modo === 'periodos') {
      params.set('exercicio', exercicio);
      params.set('de', periodoInicial);
      params.set('ate', periodoFinal);
      if (incluir13) params.set('p13', '1');
    } else {
      params.set('dataInicio', dataInicio);
      params.set('dataFim', dataFim);
    }

    router.push(`/contabilidade/razao-geral?${params.toString()}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* Seletor de conta */}
      <div className="grid gap-3 sm:grid-cols-[2fr_auto] sm:items-end">
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

        {/* Botão na linha da conta em mobile; em sm fica alinhado à direita */}
        <div className="sm:self-end">
          <Button type="button" onClick={consultar} disabled={!conta} className="w-full sm:w-auto">
            <Search className="h-4 w-4 mr-2" aria-hidden="true" />
            Consultar
          </Button>
        </div>
      </div>

      {/* Selector de modo */}
      <fieldset className="space-y-3">
        <legend className="sr-only">Modo de filtragem</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="modo-razao"
              value="datas"
              checked={modo === 'datas'}
              onChange={() => setModo('datas')}
              className="accent-primary"
            />
            <span className="text-sm">Por datas</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="modo-razao"
              value="periodos"
              checked={modo === 'periodos'}
              onChange={() => {
                setModo('periodos');
                // Se ainda não há exercício seleccionado, usa o exercício por omissão
                // para que o URL enviado pelo Consultar nunca fique com exercicio= vazio.
                if (!exercicio) setExercicio(exercicioOmissao);
              }}
              className="accent-primary"
            />
            <span className="text-sm">Por períodos</span>
          </label>
        </div>

        {/* Campos consoante o modo */}
        {modo === 'datas' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="razao-data-inicio">De</Label>
              <Input
                id="razao-data-inicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="razao-data-fim">Até</Label>
              <Input
                id="razao-data-fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="razao-exercicio">Exercício</Label>
              <select
                id="razao-exercicio"
                value={exercicio}
                onChange={(e) => setExercicio(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {exercicios.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="razao-periodo-inicial">Do período</Label>
              <Input
                id="razao-periodo-inicial"
                type="number"
                min={1}
                max={13}
                value={periodoInicial}
                onChange={(e) => setPeriodoInicial(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="razao-periodo-final">Ao período</Label>
              <Input
                id="razao-periodo-final"
                type="number"
                min={1}
                max={13}
                value={periodoFinal}
                onChange={(e) => setPeriodoFinal(e.target.value)}
              />
            </div>

            <div className="sm:col-span-4 flex items-center gap-2 pt-1">
              <Checkbox
                id="razao-incluir13"
                checked={incluir13}
                onCheckedChange={(v) => setIncluir13(v === true)}
              />
              <Label htmlFor="razao-incluir13" className="cursor-pointer">
                Incluir período 13
              </Label>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
