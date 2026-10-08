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
import { CancelarPedidoCompraSchema, type CancelarPedidoCompraInput } from '@/lib/validations/compras';
import { cancelarPedidoCompraAction } from '@/server/actions/compras.actions';

interface Props {
  id: string;
}

/** Motivo obrigatório do cancelamento (#110); junta-se às observações do pedido. */
export function CancelarPedidoForm({ id }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/compras/pedidos/${id}`;

  const form = useForm<CancelarPedidoCompraInput>({
    resolver: zodResolver(CancelarPedidoCompraSchema),
    defaultValues: { id, motivo: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await cancelarPedidoCompraAction(valores);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível cancelar o pedido.');
        return;
      }
      toast.success('Pedido cancelado.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Motivo do cancelamento"
          description="O motivo fica registado nas observações do pedido, sem apagar as que já lá estão."
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
                    placeholder="Ex.: fornecedor sem stock"
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
            {aCorrer ? 'A cancelar…' : 'Cancelar pedido'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
