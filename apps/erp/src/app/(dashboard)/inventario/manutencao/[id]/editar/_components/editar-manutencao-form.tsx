'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { actualizarManutencaoAction } from '@/server/actions/inventario.actions';
import { ManutencaoAtivoUpdateSchema, type ManutencaoAtivoUpdate } from '@/lib/validations/inventario-ativos';
import type { ManutencaoAtivoDto } from '@/server/services/inventario/manutencao.interface';
import { z } from 'zod';

const EditarManutencaoSchema = z.object({
  id: z.string().cuid(),
  data: ManutencaoAtivoUpdateSchema,
});
type EditarManutencaoInput = z.infer<typeof EditarManutencaoSchema>;

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface EditarManutencaoFormProps {
  manutencao: ManutencaoAtivoDto;
}

export function EditarManutencaoForm({ manutencao }: EditarManutencaoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, EditarManutencaoInput>(
    (_prev, input) => actualizarManutencaoAction(input),
    null
  );

  const form = useForm<ManutencaoAtivoUpdate>({
    resolver: zodResolver(ManutencaoAtivoUpdateSchema),
    defaultValues: {
      titulo: manutencao.titulo,
      descricao: manutencao.descricao,
      prioridade: manutencao.prioridade as 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA' | undefined,
      dataAgendada: manutencao.dataAgendada ? new Date(manutencao.dataAgendada) : undefined,
      procedimentos: manutencao.procedimentos ?? undefined,
      custoEstimado: manutencao.custoEstimado ? Number(manutencao.custoEstimado) : undefined,
      observacoes: manutencao.observacoes ?? undefined,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof ManutencaoAtivoUpdate, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao actualizar a manutenção.');
      }
    } else {
      toast.success('Manutenção actualizada com sucesso!');
      router.push(`/inventario/manutencao/${manutencao.id}`);
    }
  }, [state, form, router, manutencao.id]);

  const onSubmit = form.handleSubmit((data) => dispatch({ id: manutencao.id, data }));
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
              onClick={() => router.push(`/inventario/manutencao/${manutencao.id}`)}
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
        <FormSection title="Informações da Manutenção" description="Actualize os dados da manutenção">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar prioridade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="BAIXA">Baixa</SelectItem>
                      <SelectItem value="MEDIA">Média</SelectItem>
                      <SelectItem value="ALTA">Alta</SelectItem>
                      <SelectItem value="CRITICA">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataAgendada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Agendada</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
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
                    <Textarea className="resize-none" rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="custoEstimado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo Estimado (MT)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="tabular-nums"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none" rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
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
