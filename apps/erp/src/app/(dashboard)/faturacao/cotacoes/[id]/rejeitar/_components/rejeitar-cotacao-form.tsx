'use client';

/**
 * Motivo da rejeição. Recolhe dados, por isso é rota e não modal.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { XCircle, X } from 'lucide-react';
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
import { rejeitarCotacaoComercial } from '@/server/actions/faturacao.actions';

const FormSchema = z.object({
  motivo: z
    .string()
    .min(1, 'O motivo é obrigatório — é o que fica no histórico da cotação')
    .max(500),
});

type FormValues = z.infer<typeof FormSchema>;

export function RejeitarCotacaoForm({ cotacaoId, numero }: { cotacaoId: string; numero: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const detalhe = `/faturacao/cotacoes/${cotacaoId}`;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { motivo: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await rejeitarCotacaoComercial({ id: cotacaoId, motivo: valores.motivo });

      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível rejeitar a cotação.');
        return;
      }

      toast.success(`${numero} rejeitada.`);
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
            <Button type="submit" size="sm" variant="destructive" disabled={aCorrer} onClick={onSubmit}>
              <XCircle className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A rejeitar…' : 'Rejeitar cotação'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Rejeição"
          description="A cotação fica REJEITADA e deixa de poder ser convertida. Nada se apaga."
        >
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="ex.: preço acima do orçamento do cliente"
                    className="min-h-[100px] resize-none"
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Fica nas observações da cotação — é o que explica, daqui a um ano, porque é que
                  esta proposta não avançou.
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
