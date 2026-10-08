'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSection } from '@/components/patterns';
import { CancelarComissaoSchema, type CancelarComissaoInput } from '@/lib/validations/vendas';
import { cancelarComissao } from '@/server/actions/comissoes.actions';

interface Props {
  id: string;
}

/** Motivo obrigatório do cancelamento da comissão (#131); fica registado na comissão. */
export function CancelarComissaoForm({ id }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/vendas/comissoes/${id}`;

  const form = useForm<CancelarComissaoInput>({
    resolver: zodResolver(CancelarComissaoSchema),
    defaultValues: { id, motivo: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await cancelarComissao(valores);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível cancelar a comissão.');
        return;
      }
      toast.success('Comissão cancelada.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Motivo do cancelamento"
          description="O motivo fica registado na comissão. Uma comissão cancelada não volta atrás."
        >
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    maxLength={500}
                    className="resize-none"
                    placeholder="Ex.: venda devolvida pelo cliente"
                    aria-required="true"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={detalhe}>Voltar</Link>
          </Button>
          <Button type="submit" size="sm" variant="destructive" disabled={aCorrer}>
            <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A cancelar…' : 'Cancelar Comissão'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
