'use client';

/**
 * Formulário de reabertura do exercício encerrado provisoriamente (ADR-0035 §1, #138).
 *
 * Motivo com a mesma regra da reabertura de período (`MotivoReaberturaSchema`). A reabertura
 * estorna os lançamentos do encerramento no período 13; os doze meses continuam fechados.
 * `useTransition` + `router.push` (a página muda de ramo com a revalidação).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info, Loader2, LockOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { ReabrirExercicioSchema, type ReabrirExercicioInput } from '@/lib/validations/contabilidade';
import { reabrirExercicio } from '@/server/actions/contabilidade.actions';

interface ReabrirExercicioFormProps {
  exercicioId: string;
  codigo: string;
}

export function ReabrirExercicioForm({ exercicioId, codigo }: ReabrirExercicioFormProps) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();
  const destino = '/contabilidade/exercicios';

  const form = useForm<ReabrirExercicioInput>({
    resolver: zodResolver(ReabrirExercicioSchema),
    defaultValues: { exercicioId, motivo: '' },
    mode: 'onBlur',
  });

  function onSubmit(valores: ReabrirExercicioInput) {
    iniciarTransicao(async () => {
      const res = await reabrirExercicio(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erroMotivo = details?.fieldErrors?.motivo?.[0];
        if (erroMotivo) {
          form.setError('motivo', { type: 'server', message: erroMotivo });
          return;
        }
        toast.error(res.error.message ?? 'Não foi possível reabrir o exercício.');
        // Estado mudou entretanto (ou o exercício desapareceu): a página cai no ramo sem formulário.
        if (res.error.code === 'TRANSICAO_INVALIDA' || res.error.code === 'NAO_ENCONTRADO') router.refresh();
        return;
      }
      toast.success(`Exercício ${codigo} reaberto.`);
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !form.formState.isSubmitSuccessful} />

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => router.push(destino)} disabled={aCorrer}>
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={aCorrer}>
                {aCorrer ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <LockOpen className="h-4 w-4 mr-1.5" />
                )}
                Reabrir exercício
              </Button>
            </>
          }
        >
          <FormSection title="Motivo da reabertura" description="O motivo fica gravado no trilho de auditoria">
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <p className="text-muted-foreground">
                A reabertura estorna, no período 13, os lançamentos do encerramento do exercício {codigo}. Os doze
                meses continuam fechados — cada um reabre-se depois, com o seu próprio motivo.
              </p>
            </div>

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Descreva o motivo da reabertura — por exemplo: ajuste de auditoria às contas do exercício."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Mínimo de 10 caracteres.</FormDescription>
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
