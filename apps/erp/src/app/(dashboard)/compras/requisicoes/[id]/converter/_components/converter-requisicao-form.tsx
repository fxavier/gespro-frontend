'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { FormSection } from '@/components/patterns';
import {
  ConverterRequisicaoEmPedidoSchema,
  type ConverterRequisicaoEmPedidoInput,
} from '@/lib/validations/compras';
import { converterRequisicaoEmPedidoAction } from '@/server/actions/compras.actions';
import type { CotacaoAdjudicadaDto } from '@/server/services/compras/compras.service.interface';
import { formatMZN } from '@/lib/format-currency';

interface Props {
  requisicaoId: string;
  cotacoes: CotacaoAdjudicadaDto[];
}

/** Escolha da cotação adjudicada (#110): um radio por cotação desta requisição. */
export function ConverterRequisicaoForm({ requisicaoId, cotacoes }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/compras/requisicoes/${requisicaoId}`;

  const form = useForm<ConverterRequisicaoEmPedidoInput>({
    resolver: zodResolver(ConverterRequisicaoEmPedidoSchema),
    defaultValues: { requisicaoId, cotacaoId: cotacoes.length === 1 ? cotacoes[0].id : '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await converterRequisicaoEmPedidoAction(valores);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível converter a requisição.');
        return;
      }
      toast.success(`Pedido ${r.data.numero} criado em rascunho.`);
      router.push(`/compras/pedidos/${r.data.id}`);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Cotação adjudicada"
          description="O pedido usa o fornecedor vencedor e as condições da cotação escolhida."
        >
          <FormField
            control={form.control}
            name="cotacaoId"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    aria-label="Cotação adjudicada"
                    className="gap-3"
                  >
                    {cotacoes.map((c) => {
                      const idCampo = `cotacao-${c.id}`;
                      return (
                        <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                          <RadioGroupItem id={idCampo} value={c.id} />
                          <Label htmlFor={idCampo} className="flex-1 cursor-pointer font-medium">
                            {c.numero} — {c.vencedorNome}
                          </Label>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {c.valorTotal !== null ? formatMZN(c.valorTotal) : '—'}
                            {c.prazoEntregaDias !== null ? ` · ${c.prazoEntregaDias} dias` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            {/* Navegação completa: o interceptor `@panel/(.)[id]` apanharia um push para o detalhe. */}
            <a href={detalhe}>Voltar</a>
          </Button>
          <Button type="submit" size="sm" disabled={aCorrer}>
            <FileCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A converter…' : 'Converter em pedido'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
