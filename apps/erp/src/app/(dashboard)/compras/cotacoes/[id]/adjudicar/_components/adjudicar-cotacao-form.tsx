'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { AdjudicarCotacaoSchema, type AdjudicarCotacaoInput } from '@/lib/validations/compras';
import { adjudicarCotacaoAction } from '@/server/actions/compras.actions';
import { formatMZN } from '@/lib/format-currency';

interface Respondente {
  fornecedorId: string;
  nome: string;
  valorTotal: number | null;
  prazoEntregaDias: number | null;
}

interface Props {
  cotacaoId: string;
  respondentes: Respondente[];
}

/** Escolha do vencedor (#109): um radio por fornecedor que respondeu, com o valor da proposta. */
export function AdjudicarCotacaoForm({ cotacaoId, respondentes }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/compras/cotacoes/${cotacaoId}`;

  const form = useForm<AdjudicarCotacaoInput>({
    resolver: zodResolver(AdjudicarCotacaoSchema),
    defaultValues: { cotacaoId, fornecedorVencedorId: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await adjudicarCotacaoAction(valores);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível adjudicar a cotação.');
        return;
      }
      toast.success('Cotação adjudicada.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection title="Fornecedor vencedor" description="Só aparecem os fornecedores que responderam à cotação.">
          <FormField
            control={form.control}
            name="fornecedorVencedorId"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    aria-label="Fornecedor vencedor"
                    className="gap-3"
                  >
                    {respondentes.map((r) => {
                      const idCampo = `vencedor-${r.fornecedorId}`;
                      return (
                        <div key={r.fornecedorId} className="flex items-center gap-3 rounded-lg border p-3">
                          <RadioGroupItem id={idCampo} value={r.fornecedorId} />
                          <Label htmlFor={idCampo} className="flex-1 cursor-pointer font-medium">
                            {r.nome}
                          </Label>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {r.valorTotal !== null ? formatMZN(r.valorTotal) : '—'}
                            {r.prazoEntregaDias !== null ? ` · ${r.prazoEntregaDias} dias` : ''}
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
            <Link href={detalhe}>Voltar</Link>
          </Button>
          <Button type="submit" size="sm" disabled={aCorrer}>
            <Award className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A adjudicar…' : 'Adjudicar'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
