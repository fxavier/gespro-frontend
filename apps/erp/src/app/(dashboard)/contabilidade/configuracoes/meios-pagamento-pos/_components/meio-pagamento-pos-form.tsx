'use client';

/**
 * Conta a débito de UM meio de pagamento do POS (ADR-0041 §4).
 *
 * react-hook-form + zodResolver com o MESMO schema da action
 * (DefinirContaMeioPagamentoPOSSchema). «Sem conta» é a sentinela `SEM_CONTA`
 * no Select (o SelectItem descarta `value=""`) e chega à action como `null`.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UnsavedChangesGuard } from '@/components/patterns';
import {
  DefinirContaMeioPagamentoPOSSchema,
  type DefinirContaMeioPagamentoPOSInput,
} from '@/lib/validations/contabilidade';
import type { MetodoPOSConfiguravel } from '@/lib/meios-pagamento';
import { definirContaMeioPagamentoPOS } from '@/server/actions/contabilidade.actions';

const SEM_CONTA = 'sem-conta';
const ROTULO_SEM_CONTA = 'Sem conta — debita 121 Depósitos à ordem';

export interface OpcaoContaBancaria {
  id: string;
  label: string;
}

export function MeioPagamentoPOSForm({
  metodo,
  rotulo,
  contaBancariaId,
  contaBancariaInativa,
  opcoes,
}: {
  metodo: MetodoPOSConfiguravel;
  rotulo: string;
  contaBancariaId: string | null;
  /** A conta configurada (gravada) está inactiva — a venda continua a debitá-la. */
  contaBancariaInativa?: boolean;
  opcoes: OpcaoContaBancaria[];
}) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const form = useForm<DefinirContaMeioPagamentoPOSInput>({
    resolver: zodResolver(DefinirContaMeioPagamentoPOSSchema),
    defaultValues: { metodo, contaBancariaId },
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await definirContaMeioPagamentoPOS(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([campo, erros]) => {
            form.setError(campo as keyof DefinirContaMeioPagamentoPOSInput, {
              type: 'server',
              message: erros[0],
            });
          });
          // Só `contaBancariaId` tem <FormMessage>: um erro noutro campo não pode ficar mudo.
          if (Object.keys(details.fieldErrors).some((campo) => campo !== 'contaBancariaId')) {
            toast.error(res.error.message ?? 'Não foi possível guardar a conta do meio de pagamento.');
          }
        } else {
          toast.error(res.error.message ?? 'Não foi possível guardar a conta do meio de pagamento.');
        }
        return;
      }
      toast.success(`${rotulo}: conta guardada.`);
      form.reset(valores);
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end" data-metodo={metodo}>
        <FormField
          control={form.control}
          name="contaBancariaId"
          render={({ field }) => {
            const escolhida = opcoes.find((o) => o.id === field.value);
            return (
              <FormItem className="flex-1">
                <FormLabel>{rotulo}</FormLabel>
                <Select
                  value={field.value ?? SEM_CONTA}
                  onValueChange={(v) => field.onChange(v === SEM_CONTA ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger aria-label={`Conta a débito para ${rotulo}`}>
                      <SelectValue placeholder={ROTULO_SEM_CONTA}>
                        {escolhida?.label ?? ROTULO_SEM_CONTA}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_CONTA}>{ROTULO_SEM_CONTA}</SelectItem>
                    {opcoes.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                {contaBancariaInativa && (
                  <p className="text-sm text-destructive" role="alert">
                    A conta configurada está inactiva — as vendas continuam a debitá-la. Escolha outra ou «Sem conta».
                  </p>
                )}
              </FormItem>
            );
          }}
        />
        <Button type="submit" size="sm" disabled={aCorrer || !form.formState.isDirty}>
          <Save className="h-4 w-4 mr-1.5" />
          {aCorrer ? 'A guardar…' : 'Guardar'}
        </Button>
      </form>
    </Form>
  );
}
