'use client';

/**
 * Conta a crédito de UMA natureza de nota de débito (ADR-0039 §1, issue #139).
 *
 * react-hook-form + zodResolver com o MESMO schema da action
 * (DefinirContaNaturezaNotaDebitoSchema). «Sem conta» é a opção sentinela
 * `SEM_CONTA` da combobox e chega à action como `null`.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ComboboxRemoto, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import {
  DefinirContaNaturezaNotaDebitoSchema,
  type DefinirContaNaturezaNotaDebitoInput,
} from '@/lib/validations/contabilidade';
import { rotuloContaPGC, type NATUREZAS_NOTA_DEBITO } from '@/lib/nota-debito';
import {
  definirContaNaturezaNotaDebitoAction,
  procurarContasNaturezaNotaDebitoAction,
} from '@/server/actions/contabilidade.actions';

type Natureza = (typeof NATUREZAS_NOTA_DEBITO)[number];

const SEM_CONTA = 'sem-conta';
const OPCAO_SEM_CONTA: ComboboxOption = { value: SEM_CONTA, label: 'Sem conta — escolhida em cada nota de débito' };

export function NaturezaNotaDebitoForm({
  natureza,
  rotulo,
  contaId,
  opcoesIniciais,
}: {
  natureza: Natureza;
  rotulo: string;
  contaId: string | null;
  /** Primeira página da classe admitida, já fundida com a conta actual. */
  opcoesIniciais: ComboboxOption[];
}) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const form = useForm<DefinirContaNaturezaNotaDebitoInput>({
    resolver: zodResolver(DefinirContaNaturezaNotaDebitoSchema),
    defaultValues: { natureza, contaId },
  });

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarContasNaturezaNotaDebitoAction({ natureza, q });
    return r.ok ? [OPCAO_SEM_CONTA, ...r.data.map((c) => ({ value: c.id, label: rotuloContaPGC(c) }))] : null;
  };

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await definirContaNaturezaNotaDebitoAction(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erroConta = details?.fieldErrors?.contaId?.[0];
        if (erroConta) form.setError('contaId', { type: 'server', message: erroConta });
        else toast.error(res.error.message ?? 'Não foi possível guardar a conta da natureza.');
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
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end" data-natureza={natureza}>
        <FormField
          control={form.control}
          name="contaId"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>{rotulo}</FormLabel>
              <FormControl>
                <ComboboxRemoto
                  aria-label={`Conta a crédito para ${rotulo}`}
                  opcoesIniciais={[OPCAO_SEM_CONTA, ...opcoesIniciais]}
                  procurar={procurar}
                  value={field.value ?? SEM_CONTA}
                  onChange={(v) => field.onChange(v === SEM_CONTA ? null : v)}
                  placeholder={OPCAO_SEM_CONTA.label}
                  searchPlaceholder="Pesquisar por código ou nome…"
                  emptyText="Nenhuma conta encontrada"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={aCorrer || !form.formState.isDirty}>
          <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {aCorrer ? 'A guardar…' : 'Guardar'}
        </Button>
      </form>
    </Form>
  );
}
