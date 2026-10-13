'use client';

/**
 * Escolha da conta e do intervalo para o razão geral.
 *
 * Dois modos seleccionáveis por radio:
 *   «Por datas»:    contaId + dataInicio + dataFim
 *   «Por períodos»: contaId + exercicio (código) + de + ate [+ p13=1]
 *                   — o mesmo URL do drill-down do balancete (`hrefRazaoPeriodos`)
 *                   e os mesmos controlos (`opcoesPeriodo`, `normalizarIntervaloPeriodos`;
 *                   issue #343).
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox, type ComboboxOption } from '@/components/patterns';
import {
  hrefRazaoPeriodos,
  normalizarIntervaloPeriodos,
  opcoesPeriodo,
} from '@/lib/balancete-params';

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
  const [periodoInicial, setPeriodoInicial] = useState(periodoInicialProp);
  const [periodoFinal, setPeriodoFinal] = useState(periodoFinalProp);
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
    setPeriodoInicial(periodoInicialProp);
    setPeriodoFinal(periodoFinalProp);
    setIncluir13(incluir13Prop);
  }

  const opcoesPer = opcoesPeriodo(incluir13);
  const labelInicial = opcoesPer.find((o) => o.value === String(periodoInicial))?.label ?? '';
  const labelFinal = opcoesPer.find((o) => o.value === String(periodoFinal))?.label ?? '';

  // ── Submissão ─────────────────────────────────────────────────────────────
  const consultar = () => {
    if (modo === 'periodos') {
      router.push(
        hrefRazaoPeriodos(
          conta,
          exercicio,
          normalizarIntervaloPeriodos({ periodoInicial, periodoFinal, incluir13 }),
        ),
      );
      return;
    }
    const params = new URLSearchParams();
    params.set('contaId', conta);
    params.set('dataInicio', dataInicio);
    params.set('dataFim', dataFim);
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
              <Select value={exercicio} onValueChange={setExercicio}>
                <SelectTrigger id="razao-exercicio">
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

            <div className="space-y-2">
              <Label htmlFor="razao-periodo-inicial">Do período</Label>
              <Select value={String(periodoInicial)} onValueChange={(v) => setPeriodoInicial(Number(v))}>
                <SelectTrigger id="razao-periodo-inicial">
                  <SelectValue placeholder="Do período">{labelInicial}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {opcoesPer.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="razao-periodo-final">Ao período</Label>
              <Select value={String(periodoFinal)} onValueChange={(v) => setPeriodoFinal(Number(v))}>
                <SelectTrigger id="razao-periodo-final">
                  <SelectValue placeholder="Ao período">{labelFinal}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {opcoesPer.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-4 flex items-center gap-2 pt-1">
              <Checkbox
                id="razao-incluir13"
                checked={incluir13}
                onCheckedChange={(v) => {
                  const novo = v === true;
                  setIncluir13(novo);
                  // Sem p13 o 13 deixa de existir: corta à vista, não em silêncio no servidor.
                  const n = normalizarIntervaloPeriodos({ periodoInicial, periodoFinal, incluir13: novo });
                  setPeriodoInicial(n.periodoInicial);
                  setPeriodoFinal(n.periodoFinal);
                }}
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
