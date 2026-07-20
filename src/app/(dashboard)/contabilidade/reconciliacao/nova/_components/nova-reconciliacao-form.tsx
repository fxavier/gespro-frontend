'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { iniciarReconciliacao } from '@/server/actions/contabilidade.actions';
import {
  IniciarReconciliacaoSchema,
  type IniciarReconciliacaoInput,
} from '@/lib/validations/contabilidade';

export type ContaOption = { id: string; label: string };

// Tipo inline — evita importar server-only num Client Component.
type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const toDateInput = (v: unknown) =>
  v ? new Date(v as string | number | Date).toISOString().split('T')[0] : '';

export function NovaReconciliacaoForm({
  contas,
  contaBancariaIdInicial,
}: {
  contas: ContaOption[];
  contaBancariaIdInicial?: string;
}) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, IniciarReconciliacaoInput>(
    (_prev, data) => iniciarReconciliacao(data),
    null
  );

  const form = useForm<IniciarReconciliacaoInput>({
    resolver: zodResolver(IniciarReconciliacaoSchema),
    defaultValues: {
      contaBancariaId:
        contaBancariaIdInicial && contas.some((c) => c.id === contaBancariaIdInicial)
          ? contaBancariaIdInicial
          : '',
      dataInicio: undefined as unknown as Date,
      dataFim: undefined as unknown as Date,
      saldoInicialBanco: 0,
      saldoFinalBanco: 0,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof IniciarReconciliacaoInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao iniciar a reconciliação.');
      }
    } else {
      toast.success('Reconciliação iniciada — itens do razão gerados.');
      const recId = (state.data as { id?: string } | null)?.id;
      router.push(recId ? `/contabilidade/reconciliacao/${recId}` : '/contabilidade/reconciliacao');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende sair?')) return;
    router.push('/contabilidade/reconciliacao');
  };

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A iniciar...' : 'Iniciar Reconciliação'}
            </Button>
          </>
        }
      >
        <FormSection title="Conta e Período" description="Conta bancária e intervalo a reconciliar">
          <FormField
            control={form.control}
            name="contaBancariaId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conta Bancária</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar conta bancária" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dataInicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Início</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={toDateInput(field.value)}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataFim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Fim</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={toDateInput(field.value)}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Saldos do Extracto" description="Saldos do extracto bancário no período (MZN)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="saldoInicialBanco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saldo Inicial (Banco)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      className="tabular-nums"
                      placeholder="0,00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="saldoFinalBanco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saldo Final (Banco)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      className="tabular-nums"
                      placeholder="0,00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>Conforme o extracto do banco</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}