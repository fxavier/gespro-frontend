'use client';

/**
 * Formulário de reabertura de período contabilístico.
 *
 * Exige motivo mínimo de 10 caracteres (ReabrirPeriodoSchema).
 * Grava ReaberturaPeriodo para o trilho de auditoria.
 *
 * useTransition para que o redirect() do servidor seja aplicado.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Info, X, LockOpen } from 'lucide-react';
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
import { ReabrirPeriodoSchema } from '@/lib/validations/contabilidade';
import type { ReabrirPeriodoInput } from '@/lib/validations/contabilidade';
import { reabrirPeriodo } from '@/server/actions/contabilidade.actions';

interface ReabrirPeriodoFormProps {
  periodoId: string;
  periodoCodigo: string;
}

export function ReabrirPeriodoForm({ periodoId, periodoCodigo }: ReabrirPeriodoFormProps) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();

  const form = useForm<ReabrirPeriodoInput>({
    resolver: zodResolver(ReabrirPeriodoSchema),
    defaultValues: {
      id: periodoId,
      motivo: '',
    },
    mode: 'onBlur',
  });

  function onSubmit(valores: ReabrirPeriodoInput) {
    iniciarTransicao(async () => {
      const res = await reabrirPeriodo(valores);
      if (!res.ok) {
        toast.error(res.error?.message ?? 'Erro ao reabrir período');
        return;
      }
      toast.success(`Período ${periodoCodigo} reaberto com sucesso`);
      router.push('/contabilidade/exercicios');
    });
  }

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !form.formState.isSubmitSuccessful} />

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormPage
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/contabilidade/exercicios')}
                disabled={aCorrer}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" disabled={aCorrer} size="sm">
                {aCorrer ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    A reabrir…
                  </>
                ) : (
                  <>
                    <LockOpen className="h-4 w-4 mr-1.5" />
                    Reabrir período
                  </>
                )}
              </Button>
            </>
          }
        >
          <FormSection
            title="Motivo da reabertura"
            description="O motivo fica gravado no trilho de auditoria"
          >
            <div className="flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm mb-4">
              <Info className="h-4 w-4 mt-0.5 text-info shrink-0" />
              <div className="text-muted-foreground space-y-1">
                <p>
                  A reabertura permite lançar novos documentos no período. O
                  apuramento de IVA existente mantém-se — se precisar de o
                  refazer, estorne-o separadamente em Apuramento de IVA.
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (mínimo 10 caracteres)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Descreva o motivo da reabertura — por exemplo: lançamento manual omitido, correcção de conta incorrecta, etc."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    O motivo fica visível no registo de reabertura do período.
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
