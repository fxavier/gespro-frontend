'use client';

/**
 * Formulário de edição de colaborador.
 * Padrão: react-hook-form + zodResolver + useActionState + UnsavedChangesGuard.
 */

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarColaboradorAction } from '@/server/actions/rh.actions';
import { UpdateColaboradorSchema, type UpdateColaboradorInput } from '@/lib/validations/rh';
import { z } from 'zod';

const EditSchema = z.object({
  id: z.string().cuid(),
  data: UpdateColaboradorSchema,
});

type EditInput = z.infer<typeof EditSchema>;

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface ColaboradorBasico {
  id: string;
  codigo: string;
  nome: string;
  email: string;
  telefone: string | null;
  tipoContrato: string;
  regimeTrabalho: string;
  salarioBase: unknown;
  observacoes: string | null;
}

interface Props {
  colaborador: ColaboradorBasico;
}

export function EditarColaboradorForm({ colaborador }: Props) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, EditInput>(
    (_prev, data) => actualizarColaboradorAction(data),
    null
  );

  const form = useForm<EditInput>({
    resolver: zodResolver(EditSchema),
    defaultValues: {
      id: colaborador.id,
      data: {
        nome: colaborador.nome,
        email: colaborador.email,
        telefone: colaborador.telefone ?? undefined,
        tipoContrato: colaborador.tipoContrato as UpdateColaboradorInput['tipoContrato'],
        regimeTrabalho: colaborador.regimeTrabalho as UpdateColaboradorInput['regimeTrabalho'],
        salarioBase: Number(colaborador.salarioBase),
        observacoes: colaborador.observacoes ?? undefined,
      },
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(`data.${field}` as keyof EditInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao actualizar o colaborador.');
      }
    } else {
      toast.success('Colaborador actualizado com sucesso!');
      router.push(`/rh/colaboradores/${colaborador.id}`);
    }
  }, [state, form, router, colaborador.id]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

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
              onClick={() => router.push(`/rh/colaboradores/${colaborador.id}`)}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Alterações'}
            </Button>
          </>
        }
      >
        <FormSection title="Dados Gerais" description="Informações actualizáveis do colaborador">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="data.nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome Completo</FormLabel>
                <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="data.email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="data.telefone" render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone</FormLabel>
                <FormControl><Input placeholder="+258 84 000 0000" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="data.tipoContrato" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Contrato</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                    <SelectItem value="TERMO_CERTO">Termo Certo</SelectItem>
                    <SelectItem value="ESTAGIO">Estágio</SelectItem>
                    <SelectItem value="TEMPORARIO">Temporário</SelectItem>
                    <SelectItem value="PRESTACAO_SERVICOS">Prestação de Serviços</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="data.regimeTrabalho" render={({ field }) => (
              <FormItem>
                <FormLabel>Regime de Trabalho</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="TEMPO_INTEGRAL">Tempo Integral</SelectItem>
                    <SelectItem value="TEMPO_PARCIAL">Tempo Parcial</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="data.salarioBase" render={({ field }) => (
              <FormItem>
                <FormLabel>Salário Base (MZN)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="tabular-nums"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
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
