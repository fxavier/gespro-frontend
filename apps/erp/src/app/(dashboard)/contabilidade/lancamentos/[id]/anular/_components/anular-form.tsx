'use client';

/**
 * Motivo da anulação de um rascunho (#137, D3). É um formulário, por isso é
 * uma rota e não um modal — a excepção da regra sem-modais cobre confirmações,
 * não recolha de dados.
 *
 * A action revalida e a página volta a renderizar noutro ramo (já não é
 * rascunho), o que desmonta este formulário: por isso navega-se logo a seguir
 * à action, dentro da transição, e não num efeito sobre o estado.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Ban, X } from 'lucide-react';
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
import { anularLancamento } from '@/server/actions/contabilidade.actions';
import { AnularLancamentoSchema, type AnularLancamentoInput } from '@/lib/validations/contabilidade';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';

export function AnularForm({ lancamentoId, numero }: { lancamentoId: string; numero: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const detalhe = `/contabilidade/lancamentos/${lancamentoId}`;

  const form = useForm<AnularLancamentoInput>({
    resolver: zodResolver(AnularLancamentoSchema),
    defaultValues: { id: lancamentoId, motivo: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await anularLancamento(valores);
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível anular o lançamento.');
        return;
      }
      toast.success(`Lançamento ${numero} anulado.`);
      await navegarDepoisDaAccao(router, detalhe);
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
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={aCorrer}
              onClick={onSubmit}
            >
              <Ban className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A anular…' : 'Anular lançamento'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Anulação"
          description="Um rascunho anulado não se recupera. Se só precisa de o corrigir, edite-o."
        >
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="ex.: lançado em duplicado — o correcto é o 000012"
                    className="min-h-[100px] resize-none"
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Fica no lançamento e aparece no detalhe — é o que explica, mais tarde, porque é
                  que este número não tem movimento.
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
