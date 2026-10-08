'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSection, UnsavedChangesGuard } from '@/components/patterns';
import {
  RegistarRespostaCotacaoFormSchema,
  type RegistarRespostaCotacaoFormInput,
} from '@/lib/validations/compras';
import { registarRespostaCotacaoAction } from '@/server/actions/compras.actions';

interface ItemResposta {
  id: string;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  precoAnterior: number | null;
}

interface Props {
  cotacaoId: string;
  fornecedorId: string;
  itens: ItemResposta[];
  prazoAnterior: number | null;
  condicoesAnteriores: string | null;
}

/** `<input type="number">` ↔ número do formulário: vazio é NaN (o schema recusa-o com mensagem). */
const paraCampo = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : v);

/**
 * Resposta de um fornecedor (#109): um preço unitário por item e o prazo de entrega. O schema
 * do formulário é o de `lib/validations/compras.ts`; a action valida o seu próprio schema e o
 * serviço recusa itens de outra cotação.
 */
export function RegistarRespostaForm({ cotacaoId, fornecedorId, itens, prazoAnterior, condicoesAnteriores }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/compras/cotacoes/${cotacaoId}`;

  const form = useForm<RegistarRespostaCotacaoFormInput>({
    resolver: zodResolver(RegistarRespostaCotacaoFormSchema),
    defaultValues: {
      prazoEntregaDias: prazoAnterior ?? Number.NaN,
      condicoesPagamento: condicoesAnteriores ?? '',
      precos: itens.map((i) => ({ itemCotacaoId: i.id, precoUnitario: i.precoAnterior ?? Number.NaN })),
    },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await registarRespostaCotacaoAction({
        cotacaoId,
        fornecedorId,
        prazoEntregaDias: valores.prazoEntregaDias,
        condicoesPagamento: valores.condicoesPagamento || undefined,
        respostas: valores.precos.map((p) => ({
          itemCotacaoId: p.itemCotacaoId,
          precoUnitario: p.precoUnitario,
          prazoEntregaDias: valores.prazoEntregaDias,
        })),
      });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível registar a resposta.');
        return;
      }
      toast.success('Resposta registada.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection title="Preços por item" description="Preço unitário proposto pelo fornecedor para cada item, em MZN.">
          <div className="space-y-4">
            {itens.map((item, indice) => (
              <FormField
                key={item.id}
                control={form.control}
                name={`precos.${indice}.precoUnitario`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Preço unitário — {item.descricao} ({item.quantidade} {item.unidadeMedida})
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={paraCampo(field.value)}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        aria-required="true"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </FormSection>

        <FormSection title="Condições" description="Prazo de entrega e condições de pagamento da proposta.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="prazoEntregaDias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prazo de entrega (dias)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step="1"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={paraCampo(field.value)}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      aria-required="true"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="condicoesPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condições de pagamento</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} maxLength={200} placeholder="Ex.: 30 dias" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={detalhe}>Voltar</Link>
          </Button>
          <Button type="submit" size="sm" disabled={aCorrer}>
            <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A registar…' : 'Registar resposta'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
