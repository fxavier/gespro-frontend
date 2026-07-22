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
import { Switch } from '@/components/ui/switch';
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
import { criarServicoAction } from '@/server/actions/servicos.actions';
import { CreateServicoSchema, type CreateServicoInput } from '@/lib/validations/servicos';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const DEFAULT_VALUES: Partial<CreateServicoInput> = {
  codigo: '',
  nome: '',
  descricao: '',
  tipoServico: 'OUTRO',
  preco: 0,
  duracaoEstimada: 60,
  unidadeMedida: 'un',
  taxaIva: 0.16,
  disponivel: true,
  requerAgendamento: true,
  requerTecnico: false,
  incluiMaterial: false,
  diasDisponibilidade: [],
  observacoes: '',
};

export function NovoServicoForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateServicoInput>(
    (_prev, data) => criarServicoAction(data),
    null
  );

  const form = useForm<CreateServicoInput>({
    resolver: zodResolver(CreateServicoSchema),
    defaultValues: DEFAULT_VALUES as CreateServicoInput,
    mode: 'onBlur',
  });

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CreateServicoInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar o serviço.');
      }
    } else {
      toast.success('Serviço criado com sucesso!');
      router.push('/servicos/lista');
    }
  }, [state, form, router]);

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?');
      if (!confirmed) return;
    }
    router.push('/servicos/lista');
  };

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty && !form.formState.isSubmitSuccessful} />

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
              <Button type="submit" disabled={isPending} size="sm">
                <Save className="h-4 w-4 mr-1.5" />
                {isPending ? 'A guardar…' : 'Guardar Serviço'}
              </Button>
            </>
          }
        >
          <FormSection title="Informações básicas">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codigo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código *</FormLabel>
                    <FormControl>
                      <Input placeholder="SRV001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tipoServico"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de serviço *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="INSTALACAO">Instalação</SelectItem>
                        <SelectItem value="MANUTENCAO">Manutenção</SelectItem>
                        <SelectItem value="REPARACAO">Reparação</SelectItem>
                        <SelectItem value="CONSULTORIA">Consultoria</SelectItem>
                        <SelectItem value="LIMPEZA">Limpeza</SelectItem>
                        <SelectItem value="TRANSPORTE">Transporte</SelectItem>
                        <SelectItem value="OUTRO">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do serviço *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do serviço" {...field} />
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
                      placeholder="Descrição detalhada do serviço"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Preços e duração">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="preco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço (MT) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
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
                name="taxaIva"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taxa IVA</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseFloat(v))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="IVA" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="0.05">5%</SelectItem>
                        <SelectItem value="0.16">16%</SelectItem>
                        <SelectItem value="0.17">17%</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duracaoEstimada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (minutos) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="60"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unidadeMedida"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidade de medida</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unidade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="un">Unidade</SelectItem>
                        <SelectItem value="hora">Hora</SelectItem>
                        <SelectItem value="dia">Dia</SelectItem>
                        <SelectItem value="mes">Mês</SelectItem>
                        <SelectItem value="projeto">Projecto</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Configurações">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="disponivel"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Disponível</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requerAgendamento"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Requer agendamento</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requerTecnico"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Requer técnico</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
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
                      placeholder="Observações adicionais"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
        </FormPage>
      </form>
    </Form>
  );
}
