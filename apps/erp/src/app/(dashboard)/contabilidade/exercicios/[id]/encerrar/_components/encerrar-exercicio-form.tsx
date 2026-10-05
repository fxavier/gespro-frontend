'use client';

/**
 * Formulário do encerramento provisório do exercício (ADR-0035, #138).
 *
 * O serviço devolve TODOS os impedimentos de uma vez (`{ ok:false, impedimentos }`), sem escrever
 * nada; mostram-se aqui em frases legíveis, nunca o código. Com sucesso, toast e volta à lista.
 * `useTransition` à volta da action (ver CLAUDE.md — action chamada a partir do `handleSubmit`).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import {
  EncerrarExercicioSchema,
  type EncerrarExercicioInput,
  type EncerrarExercicioDados,
} from '@/lib/validations/contabilidade';
import { encerrarExercicio } from '@/server/actions/contabilidade.actions';

// ─────────────────────────────────────────────────────────────────────────────
// Textos legíveis por código de impedimento (ADR-0035 §2)
// ─────────────────────────────────────────────────────────────────────────────

const TEXTO_IMPEDIMENTO: Record<string, string> = {
  PERIODOS_MENSAIS_ABERTOS:
    'Há meses do exercício ainda abertos. Feche todos os períodos mensais (Janeiro a Dezembro) antes de encerrar o exercício.',
  PERIODOS_MENSAIS_EM_FALTA:
    'O exercício não tem os doze períodos mensais. Contacte o suporte: o calendário do exercício está incompleto.',
  PERIODO_13_FECHADO:
    'O período 13 (período de encerramento) está fechado. Reabra-o antes de encerrar o exercício.',
  EXERCICIO_ANTERIOR_ABERTO:
    'O exercício anterior ainda não está encerrado. Os exercícios encerram-se por ordem: encerre primeiro o anterior.',
  RASCUNHOS_NO_PERIODO_13:
    'Existem lançamentos em rascunho no período 13. Confirme ou anule esses rascunhos antes de encerrar.',
  BALANCETE_DESEQUILIBRADO:
    'O balancete do exercício não está equilibrado — o total dos débitos é diferente do total dos créditos. Corrija os lançamentos antes de encerrar.',
};

function textoImpedimento(codigo: string): string {
  return TEXTO_IMPEDIMENTO[codigo] ?? 'Existe um impedimento ao encerramento que não foi possível descrever. Contacte o suporte.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulário
// ─────────────────────────────────────────────────────────────────────────────

interface EncerrarExercicioFormProps {
  exercicioId: string;
  codigo: string;
}

export function EncerrarExercicioForm({ exercicioId, codigo }: EncerrarExercicioFormProps) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const [impedimentos, setImpedimentos] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState(false);
  const destino = '/contabilidade/exercicios';

  const form = useForm<EncerrarExercicioInput, unknown, EncerrarExercicioDados>({
    resolver: zodResolver(EncerrarExercicioSchema),
    defaultValues: { exercicioId, estimativaImposto: '' },
    mode: 'onSubmit',
  });

  function onSubmit(valores: EncerrarExercicioDados) {
    setImpedimentos([]);
    iniciarTransicao(async () => {
      const res = await encerrarExercicio(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erroEstimativa = details?.fieldErrors?.estimativaImposto?.[0];
        if (erroEstimativa) {
          form.setError('estimativaImposto', { type: 'server', message: erroEstimativa });
          return;
        }
        toast.error(res.error.message ?? 'Não foi possível encerrar o exercício.');
        // Estado mudou entretanto (ou o exercício desapareceu): a página cai no ramo sem formulário.
        if (res.error.code === 'TRANSICAO_INVALIDA' || res.error.code === 'NAO_ENCONTRADO') router.refresh();
        return;
      }
      const resultado = res.data;
      if (!resultado.ok) {
        setImpedimentos(resultado.impedimentos);
        return;
      }
      setSucesso(true);
      toast.success(`Exercício ${codigo} encerrado provisoriamente.`);
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !sucesso} />

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        {impedimentos.length > 0 && (
          <div
            role="alert"
            className="max-w-3xl rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
          >
            <div className="mb-2 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <h2 className="font-medium text-foreground">Não é possível encerrar</h2>
            </div>
            <ul className="space-y-1 pl-6">
              {impedimentos.map((c) => (
                <li key={c} className="list-disc text-foreground">
                  {textoImpedimento(c)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <FormPage
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push(destino)}
                disabled={aCorrer}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={aCorrer}>
                {aCorrer ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-1.5" />
                )}
                Encerrar exercício
              </Button>
            </>
          }
        >
          <FormSection
            title="Imposto sobre o rendimento"
            description={`O encerramento apura o resultado do exercício ${codigo} em até três lançamentos no período 13 (só os que têm partidas). Pode ser revertido enquanto o exercício estiver encerrado provisoriamente.`}
          >
            <FormField
              control={form.control}
              name="estimativaImposto"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Estimativa do imposto</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormDescription>
                    Valor em meticais, maior ou igual a zero (ex.: 0 ou 1250,50). Use 0 se não houver imposto
                    a estimar.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
        </FormPage>
      </form>
    </Form>
  );
}
