'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormPage, FormSection } from '@/components/patterns';
import { TransitarAgendamentoSchema } from '@/lib/validations/servicos';
import { transitarAgendamentoAction } from '@/server/actions/servicos.actions';

const NotasSchema = TransitarAgendamentoSchema.pick({ notasConclusao: true });

export function ConcluirAgendamentoForm({ id }: { id: string }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const destino = `/servicos/agendamentos/${id}`;
  const form = useForm<{ notasConclusao?: string }>({
    resolver: zodResolver(NotasSchema),
    defaultValues: { notasConclusao: '' },
  });

  // useTransition + router.push (padrão da casa): a página de origem muda de ramo com a gravação.
  const onSubmit = form.handleSubmit(({ notasConclusao }) => {
    startTransition(async () => {
      const r = await transitarAgendamentoAction({
        agendamentoId: id,
        novoStatus: 'CONCLUIDO',
        notasConclusao: notasConclusao?.trim() || undefined,
      });
      if (r.ok) {
        toast.success('Agendamento concluído.');
        router.push(destino);
      } else {
        toast.error(r.error.message ?? 'Não foi possível concluir o agendamento.');
      }
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => router.push(destino)} disabled={pendente}>
                <X className="h-4 w-4 mr-1.5" />
                Voltar
              </Button>
              <Button type="submit" size="sm" disabled={pendente}>
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {pendente ? 'A gravar…' : 'Concluir'}
              </Button>
            </>
          }
        >
          <FormSection title="Conclusão">
            <FormField
              control={form.control}
              name="notasConclusao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas de conclusão</FormLabel>
                  <FormControl>
                    <Textarea rows={5} placeholder="O que foi feito, material usado, observações…" {...field} />
                  </FormControl>
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
