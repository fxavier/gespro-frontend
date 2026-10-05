'use client';

/**
 * Formulário da anulação da aplicação do resultado (ADR-0035 §5, #364). Motivo com a mesma regra
 * da reabertura (`MotivoReaberturaSchema`). `useTransition` + `router.push` (a página muda de ramo
 * com a revalidação).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info, Loader2, Undo2, X } from 'lucide-react';
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
import {
  AnularAplicacaoResultadoSchema,
  type AnularAplicacaoResultadoInput,
} from '@/lib/validations/contabilidade';
import { anularAplicacaoResultado } from '@/server/actions/contabilidade.actions';

const TEXTO_ERRO: Record<string, string> = {
  APLICACAO_JA_ANULADA: 'Esta aplicação do resultado já tinha sido anulada.',
  PERIODO_FECHADO:
    'O período da aplicação está fechado e não pode receber o estorno. Reabra esse período antes de anular.',
};

interface AnularAplicacaoFormProps {
  aplicacaoId: string;
  codigo: string;
  resumo: string;
}

export function AnularAplicacaoForm({ aplicacaoId, codigo, resumo }: AnularAplicacaoFormProps) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();
  const destino = '/contabilidade/exercicios';

  const form = useForm<AnularAplicacaoResultadoInput>({
    resolver: zodResolver(AnularAplicacaoResultadoSchema),
    defaultValues: { aplicacaoId, motivo: '' },
    mode: 'onBlur',
  });

  function onSubmit(valores: AnularAplicacaoResultadoInput) {
    iniciarTransicao(async () => {
      const res = await anularAplicacaoResultado(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erroMotivo = details?.fieldErrors?.motivo?.[0];
        if (erroMotivo) {
          form.setError('motivo', { type: 'server', message: erroMotivo });
          return;
        }
        toast.error(TEXTO_ERRO[res.error.code] ?? res.error.message ?? 'Não foi possível anular a aplicação.');
        if (res.error.code === 'APLICACAO_JA_ANULADA' || res.error.code === 'NAO_ENCONTRADO') router.refresh();
        return;
      }
      toast.success(`Aplicação do resultado do exercício ${codigo} anulada.`);
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
              <Button type="submit" size="sm" variant="destructive" disabled={aCorrer}>
                {aCorrer ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1.5" />}
                Anular aplicação
              </Button>
            </>
          }
        >
          <FormSection title="Motivo da anulação" description="O motivo fica no estorno e no trilho de auditoria">
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <p className="text-muted-foreground">
                {resumo}. A anulação estorna o lançamento da aplicação no mesmo período e devolve o resultado à
                conta 88. Depois pode registar-se uma nova aplicação, ou reabrir o exercício {codigo}.
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
                      placeholder="Descreva o motivo — por exemplo: a acta foi rectificada pela assembleia geral seguinte."
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
