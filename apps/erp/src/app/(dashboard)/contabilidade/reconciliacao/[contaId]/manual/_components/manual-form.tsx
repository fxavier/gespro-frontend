'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Link2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { ReconciliarManualmenteSchema } from '@/lib/validations/reconciliacao';
import { reconciliarManualmenteAction } from '@/server/actions/reconciliacao.actions';
import type { z } from 'zod';

type Valores = z.infer<typeof ReconciliarManualmenteSchema>;

/** RF §13 / CA07: a justificação é obrigatória e fica, com o autor, na correspondência. */
export function ManualForm({
  contaBancariaId, bancarios, contabilisticos, children,
}: { contaBancariaId: string; bancarios: string[]; contabilisticos: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const base = `/contabilidade/reconciliacao/${contaBancariaId}`;
  const form = useForm<Valores>({
    resolver: zodResolver(ReconciliarManualmenteSchema),
    defaultValues: { movimentosBancariosIds: bancarios, movimentosContabilisticosIds: contabilisticos, justificacao: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((v) =>
    iniciar(async () => {
      const r = await reconciliarManualmenteAction(v);
      if (!r.ok) return void toast.error(r.error.message);
      toast.success('Movimentos reconciliados manualmente.');
      router.push(`${base}?vista=reconciliados`);
      router.refresh();
    }),
  );

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={aCorrer} onClick={() => router.push(base)}>
              <X className="h-4 w-4 mr-1.5" /> Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={aCorrer} onClick={onSubmit}>
              <Link2 className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A reconciliar…' : 'Reconciliar'}
            </Button>
          </>
        }
      >
        {children}
        <FormSection title="Justificação" description="Porque é que estes movimentos correspondem. Fica no histórico de auditoria.">
          <FormField
            control={form.control}
            name="justificacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Justificação</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Ex.: transferência processada pelo banco dois dias após o lançamento." {...field} />
                </FormControl>
                <FormDescription>Obrigatória, com pelo menos 10 caracteres.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
