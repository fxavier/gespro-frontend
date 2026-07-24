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
import { criarFormacaoAction } from '@/server/actions/rh.actions';
import {
  CreateFormacaoSchema,
  type CreateFormacaoInput,
} from '@/lib/validations/rh';

// Tipos inline — evita importar server-only num Client Component.
type FormState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

function isoDate(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

const DEFAULT_VALUES: CreateFormacaoInput = {
  titulo: '',
  descricao: '',
  categoria: '',
  instrutor: '',
  cargaHoraria: 8,
  dataInicio: isoDate(),
  dataFim: isoDate(),
  local: '',
  modalidade: 'PRESENCIAL',
  vagasDisponiveis: 10,
  custoTotal: 0,
  observacoes: '',
};

/**
 * Formulário de criação de formação.
 *
 * Padrão golden standard: react-hook-form + zodResolver(CreateFormacaoSchema)
 * (o MESMO schema do servidor) + useActionState. Erros de campo do servidor
 * mapeados via setError; UnsavedChangesGuard bloqueia navegação com alterações.
 */
export function NovaFormacaoForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateFormacaoInput>(
    (_prev, data) => criarFormacaoAction(data),
    null,
  );

  const form = useForm<CreateFormacaoInput>({
    resolver: zodResolver(CreateFormacaoSchema),
    defaultValues: DEFAULT_VALUES,
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
          form.setError(field as keyof CreateFormacaoInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar a formação.');
      }
    } else {
      toast.success('Formação criada com sucesso!');
      form.reset(DEFAULT_VALUES);
      router.push(`/rh/formacoes/${state.data.id}`);
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?',
      );
      if (!confirmed) return;
    }
    router.push('/rh/formacoes');
  };

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <form onSubmit={onSubmit}>
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
            <Button type="submit" size="sm" disabled={isPending}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar...' : 'Guardar Formação'}
            </Button>
          </>
        }
      >
        {/* Secção: Informações Gerais */}
        <FormSection
          title="Informações Gerais"
          description="Dados principais da acção de formação"
        >
          <FormField
            control={form.control}
            name="titulo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Título</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Segurança e Higiene no Trabalho" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Objectivos e conteúdos da formação"
                    className="resize-none min-h-[90px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="categoria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: Segurança" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="modalidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modalidade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar modalidade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PRESENCIAL">Presencial</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="HIBRIDO">Híbrido</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="instrutor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instrutor / Entidade</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: Instituto Nacional de..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="local"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Local</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: Sala de formação — Maputo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Secção: Planeamento */}
        <FormSection
          title="Planeamento"
          description="Datas, carga horária, vagas e custo"
        >
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
                      value={
                        field.value ? new Date(field.value).toISOString().split('T')[0] : ''
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

            <FormField
              control={form.control}
              name="dataFim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Fim</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={
                        field.value ? new Date(field.value).toISOString().split('T')[0] : ''
                      }
                      onChange={(e) =>
                        field.onChange(e.target.value ? new Date(e.target.value) : undefined)
                      }
                    />
                  </FormControl>
                  <FormDescription>Igual ou posterior à data de início</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cargaHoraria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Carga Horária (horas)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vagasDisponiveis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vagas Disponíveis</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="custoTotal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo Total (MZN)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
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
          </div>

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

        {/* Erros globais do servidor */}
        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
      </form>
    </Form>
  );
}
