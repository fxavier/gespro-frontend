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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarRequisicaoAction } from '@/server/actions/compras.actions';
import {
  UpdateRequisicaoCompraSchema,
  type UpdateRequisicaoCompraInput,
} from '@/lib/validations/compras';

// Tipos inline — evita importar server-only num Client Component.
type FormState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface EditarRequisicaoFormProps {
  id: string;
  defaultValues: {
    data?: Date;
    departamento?: string;
    prioridade?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
    justificativa?: string;
    observacoes?: string;
    dataEntregaDesejada?: Date;
  };
}

/**
 * Formulário de edição de requisição de compra.
 *
 * Padrão: react-hook-form + zodResolver + useActionState.
 * Só disponível para requisições em estado RASCUNHO.
 * Erros do servidor são mapeados para os campos via setError.
 */
export function EditarRequisicaoForm({ id, defaultValues }: EditarRequisicaoFormProps) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<FormState, UpdateRequisicaoCompraInput>(
    (_prev, dados) => actualizarRequisicaoAction({ id, dados }),
    null
  );

  const form = useForm<UpdateRequisicaoCompraInput>({
    resolver: zodResolver(UpdateRequisicaoCompraSchema),
    defaultValues: {
      data: defaultValues.data,
      departamento: defaultValues.departamento ?? '',
      prioridade: defaultValues.prioridade ?? 'MEDIA',
      justificativa: defaultValues.justificativa ?? '',
      observacoes: defaultValues.observacoes ?? '',
      dataEntregaDesejada: defaultValues.dataEntregaDesejada,
    },
    mode: 'onBlur',
  });

  // Aplicar erros do servidor nos campos
  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof UpdateRequisicaoCompraInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao actualizar a requisição.');
      }
    } else {
      toast.success('Requisição actualizada com sucesso!');
      form.reset();
      router.push(`/compras/requisicoes/${id}`);
    }
  }, [state, form, router, id]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?'
      );
      if (!confirmed) return;
    }
    router.push(`/compras/requisicoes/${id}`);
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
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              onClick={onSubmit}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar...' : 'Guardar Alterações'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Informações Gerais"
          description="Actualize os dados da requisição"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Data */}
            <FormField
              control={form.control}
              name="data"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data da Requisição</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={
                        field.value
                          ? new Date(field.value).toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) =>
                        field.onChange(e.target.value ? new Date(e.target.value) : undefined)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Prioridade */}
            <FormField
              control={form.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar prioridade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="BAIXA">Baixa</SelectItem>
                      <SelectItem value="MEDIA">Média</SelectItem>
                      <SelectItem value="ALTA">Alta</SelectItem>
                      <SelectItem value="URGENTE">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Departamento */}
            <FormField
              control={form.control}
              name="departamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departamento</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: Tecnologias de Informação" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data de entrega desejada */}
            <FormField
              control={form.control}
              name="dataEntregaDesejada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entrega Desejada</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={
                        field.value
                          ? new Date(field.value).toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) =>
                        field.onChange(e.target.value ? new Date(e.target.value) : undefined)
                      }
                    />
                  </FormControl>
                  <FormDescription>Opcional — data ideal de entrega</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Justificativa */}
          <FormField
            control={form.control}
            name="justificativa"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Justificativa</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descreva o motivo da requisição (mínimo 10 caracteres)"
                    className="resize-none min-h-[100px]"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Mínimo de 10 caracteres</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Observações */}
          <FormField
            control={form.control}
            name="observacoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Informações adicionais (opcional)"
                    className="resize-none min-h-[80px]"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* Aviso sobre itens — usa text-warning (contraste AA) em vez de text-warning-foreground */}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <p className="font-medium">Nota sobre itens</p>
          <p className="text-muted-foreground mt-1">
            Os itens da requisição não podem ser alterados após criação. Para modificar itens,
            cancele esta requisição e crie uma nova.
          </p>
        </div>

        {/* Erros globais do servidor */}
        {state && !state.ok && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
