'use client';

/**
 * Motivo da anulação de uma venda POS (ADR-0041 §8). Recolhe texto, por isso é uma rota e
 * não um AlertDialog. A action revalida e a página volta a renderizar noutro ramo (venda já
 * anulada), o que desmonta este formulário: navega-se dentro da transição, logo a seguir à
 * action, e não num efeito sobre o estado.
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
import { anularVenda } from '@/server/actions/vendas.actions';
import { AnularVendaSchema, type AnularVendaInput } from '@/lib/validations/vendas';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';

export function AnularVendaForm({ vendaId, numero }: { vendaId: string; numero: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const detalhe = `/vendas/${vendaId}`;

  const form = useForm<AnularVendaInput>({
    resolver: zodResolver(AnularVendaSchema),
    defaultValues: { vendaId, motivo: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await anularVenda(valores);
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível anular a venda.');
        return;
      }
      toast.success(`Venda ${numero} anulada — nota de crédito emitida.`);
      await navegarDepoisDaAccao(router, detalhe);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={aCorrer} onClick={() => router.push(detalhe)}>
              <X className="h-4 w-4 mr-1.5" />
              Voltar
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={aCorrer} onClick={onSubmit}>
              <Ban className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A anular…' : 'Anular venda'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Anulação"
          description="A anulação é irreversível: emite a nota de crédito e devolve o valor pelos meios com que foi pago."
        >
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="ex.: cliente desistiu da compra"
                    className="min-h-[100px] resize-none"
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormDescription>Fica na nota de crédito e no histórico da venda.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
