'use client';

/**
 * Formulário de criação de Centro de Custo — CLIENT COMPONENT.
 * Padrão: useActionState + FormPage(actions=…) + UnsavedChangesGuard standalone.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import type { z } from 'zod';

import { CriarCentroCustoSchema } from '@/lib/validations/contabilidade';
import { criarCentroCusto } from '@/server/actions/contabilidade.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, UnsavedChangesGuard } from '@/components/patterns';

type FormValues = z.infer<typeof CriarCentroCustoSchema>;
type ActionState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

const TIPO_LABELS: Record<string, string> = {
  DEPARTAMENTO: 'Departamento',
  PROJETO: 'Projecto',
  FILIAL: 'Filial',
  OUTRO: 'Outro',
};

export function NovoCentroCustoForm() {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    (_prev, data) => criarCentroCusto(data) as Promise<ActionState>,
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(CriarCentroCustoSchema),
    defaultValues: {
      codigo: '',
      nome: '',
      descricao: '',
      tipo: 'DEPARTAMENTO',
    },
  });

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof FormValues, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao criar centro de custo.');
      }
    } else {
      toast.success('Centro de custo criado com sucesso.');
      router.push('/contabilidade/centros-custo');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const handleCancel = () => {
    if (isDirty) {
      if (!window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) return;
    }
    router.push('/contabilidade/centros-custo');
  };

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <Form {...form}>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
                <Save className="h-4 w-4 mr-1.5" />
                {isPending ? 'A criar…' : 'Criar Centro de Custo'}
              </Button>
            </>
          }
        >
          <div className="p-6 grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: CC-001" maxLength={20} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do centro de custo" maxLength={100} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(TIPO_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="orcamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Orçamento Anual (MZN)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descrição opcional do centro de custo…"
                      maxLength={500}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormPage>
      </Form>
    </>
  );
}
