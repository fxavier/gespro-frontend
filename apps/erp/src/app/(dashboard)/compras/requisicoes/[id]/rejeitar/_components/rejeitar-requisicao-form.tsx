'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSection } from '@/components/patterns';
import { RejeitarRequisicaoSchema, type RejeitarRequisicaoInput } from '@/lib/validations/compras';
import { decidirAprovacaoAction } from '@/server/actions/compras.actions';

interface Props {
  id: string;
  nivel: number;
}

/**
 * Motivo obrigatório da rejeição (#108). react-hook-form + zodResolver; a action recusa
 * também um motivo vazio (MOTIVO_OBRIGATORIO), por isso o cliente é só conforto.
 */
export function RejeitarRequisicaoForm({ id, nivel }: Props) {
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/compras/requisicoes/${id}`;

  const form = useForm<RejeitarRequisicaoInput>({
    resolver: zodResolver(RejeitarRequisicaoSchema),
    defaultValues: { motivo: '' },
  });

  const onSubmit = form.handleSubmit(({ motivo }) => {
    iniciar(async () => {
      const r = await decidirAprovacaoAction({ documentoId: id, nivel, status: 'REJEITADO', observacoes: motivo });
      if (!r.ok) {
        if (r.error.code === 'MOTIVO_OBRIGATORIO') {
          form.setError('motivo', { type: 'server', message: r.error.message });
        } else {
          toast.error(r.error.message ?? 'Não foi possível rejeitar a requisição.');
        }
        return;
      }
      toast.success('Requisição rejeitada.');
      // Sem UnsavedChangesGuard de propósito: o `beforeunload` dele travaria esta navegação.
      // Navegação completa: um router.push para `/compras/requisicoes/<id>` dentro do layout
      // das requisições é apanhado pelo interceptor `@panel/(.)[id]` (ver AbrirRotaReal), e o
      // detalhe, com o separador «Aprovações», nunca apareceria.
      window.location.assign(detalhe);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Motivo da rejeição"
          description="O motivo fica registado na decisão e é o que o solicitante lê no separador «Aprovações»."
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
                    maxLength={1000}
                    className="resize-none"
                    placeholder="Ex.: orçamento do departamento esgotado"
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
            <Link href={detalhe}>Cancelar</Link>
          </Button>
          <Button type="submit" size="sm" variant="destructive" disabled={aCorrer}>
            <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A rejeitar…' : 'Rejeitar'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
