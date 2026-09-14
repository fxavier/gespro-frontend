'use client';

/**
 * Motivo do estorno. É um formulário, por isso é uma rota e não um modal —
 * a excepção da regra sem-modais cobre confirmações, não recolha de dados.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { estornarLancamento } from '@/server/actions/contabilidade.actions';

const FormSchema = z.object({
  motivo: z
    .string()
    .min(1, 'O motivo é obrigatório — é o que fica no histórico do contra-lançamento')
    .max(500),
  data: z.string().min(1, 'Indique a data do estorno'),
});

type FormValues = z.infer<typeof FormSchema>;

export function EstornarForm({ lancamentoId, numero }: { lancamentoId: string; numero: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const detalhe = `/contabilidade/lancamentos/${lancamentoId}`;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { motivo: '', data: new Date().toISOString().slice(0, 10) },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      // `aaaa-mm-dd` → Date pelos componentes, e não `new Date(string)`: a
      // segunda forma lê a data como UTC e, num fuso a leste, pode cair no dia
      // anterior — o que mudaria o período fiscal do contra-lançamento.
      const [ano, mes, dia] = valores.data.split('-').map(Number);

      const res = await estornarLancamento({
        lancamentoId,
        motivo: valores.motivo,
        data: new Date(ano, mes - 1, dia, 12),
      });

      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível estornar o lançamento.');
        return;
      }

      toast.success(`Lançamento ${numero} estornado.`);
      router.push(detalhe);
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />

      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={aCorrer}
              onClick={() => router.push(detalhe)}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={aCorrer} onClick={onSubmit}>
              <Undo2 className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A estornar…' : 'Estornar lançamento'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Estorno"
          description="O lançamento original mantém-se. O que se cria é um contra-lançamento com as partidas invertidas."
        >
          <FormField
            control={form.control}
            name="data"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>Data do estorno</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>
                  Determina o período fiscal onde o contra-lançamento entra.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="ex.: valor lançado em duplicado na factura FAT/2026/000012"
                    className="min-h-[100px] resize-none"
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Fica registado no contra-lançamento — é o que explica, daqui a um ano, porque é
                  que este movimento foi anulado.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
