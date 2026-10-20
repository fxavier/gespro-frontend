'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSection } from '@/components/patterns';
import { FecharPedidoCompraEmFaltaSchema, type FecharPedidoCompraEmFaltaInput } from '@/lib/validations/compras';
import { fecharPedidoCompraEmFaltaAction } from '@/server/actions/compras.actions';

interface Props {
  id: string;
  emFalta: Array<{ descricao: string; falta: number; unidade: string }>;
}

/** Motivo obrigatório do fecho em falta (#567); fica em `motivoFecho` do pedido. */
export function FecharPedidoForm({ id, emFalta }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/compras/pedidos/${id}`;

  const form = useForm<FecharPedidoCompraEmFaltaInput>({
    resolver: zodResolver(FecharPedidoCompraEmFaltaSchema),
    defaultValues: { id, motivo: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await fecharPedidoCompraEmFaltaAction(valores);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível fechar o pedido.');
        return;
      }
      toast.success('Pedido fechado em falta.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="O que fica por receber"
          description="O pedido deixa de aceitar recepções. O que já foi recebido continua em stock e a dívida de cada recepção mantém-se."
        >
          <ul className="text-sm space-y-1">
            {emFalta.map((i) => (
              <li key={i.descricao} className="flex justify-between gap-4">
                <span>{i.descricao}</span>
                <span className="tabular-nums text-muted-foreground">
                  {i.falta} {i.unidade}
                </span>
              </li>
            ))}
          </ul>
        </FormSection>

        <FormSection title="Motivo do fecho" description="Fica registado no pedido.">
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
                    placeholder="Ex.: o fornecedor descontinuou o artigo"
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
          <Button type="submit" size="sm" disabled={aCorrer}>
            <PackageX className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A fechar…' : 'Fechar em falta'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
