'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { criarRequisicaoAction } from '@/server/actions/compras.actions';
import {
  CreateRequisicaoCompraSchema,
  type CreateRequisicaoCompraInput,
} from '@/lib/validations/compras';

// Tipos inline — evita importar server-only num Client Component.
type FormState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

const DEFAULT_VALUES: CreateRequisicaoCompraInput = {
  data: new Date(),
  departamento: '',
  prioridade: 'MEDIA',
  justificativa: '',
  observacoes: '',
  itens: [
    {
      descricao: '',
      quantidade: 1,
      unidadeMedida: 'UN',
      precoEstimado: 0,
    },
  ],
};

/**
 * Formulário de criação de requisição de compra.
 *
 * Padrão: react-hook-form + zodResolver + useActionState.
 * Erros do servidor são mapeados de volta para os campos via setError.
 * UnsavedChangesGuard bloqueia navegação com alterações não guardadas.
 */
export function NovaRequisicaoForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateRequisicaoCompraInput>(
    (_prev, data) => criarRequisicaoAction(data),
    null
  );

  const form = useForm<CreateRequisicaoCompraInput>({
    resolver: zodResolver(CreateRequisicaoCompraSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'itens',
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
          form.setError(field as keyof CreateRequisicaoCompraInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar a requisição.');
      }
    } else {
      toast.success('Requisição criada com sucesso!');
      form.reset(DEFAULT_VALUES);
      router.push('/compras/requisicoes');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?'
      );
      if (!confirmed) return;
    }
    router.push('/compras/requisicoes');
  };

  // Calcular valor total dos itens
  const itensValues = form.watch('itens');
  const valorTotal = itensValues.reduce(
    (sum, item) => sum + (Number(item.quantidade) || 0) * (Number(item.precoEstimado) || 0),
    0
  );

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
              {isPending ? 'A guardar...' : 'Guardar Requisição'}
            </Button>
          </>
        }
      >
        {/* Secção: Informações Gerais */}
        <FormSection
          title="Informações Gerais"
          description="Dados principais da requisição de compra"
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Input placeholder="ex.: Tecnologias de Informação" {...field} />
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

        {/* Secção: Itens */}
        <FormSection
          title="Itens da Requisição"
          description="Produtos ou serviços a adquirir"
        >
          <div className="space-y-3">
            {fields.map((fieldItem, index) => (
              <div
                key={fieldItem.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-start border rounded-lg p-3"
              >
                {/* Descrição */}
                <div className="col-span-5">
                  <FormField
                    control={form.control}
                    name={`itens.${index}.descricao`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Descrição do Item</FormLabel>
                        <FormControl>
                          <Input placeholder="Descreva o produto ou serviço" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="col-span-5 grid grid-cols-4 gap-2">
                  {/* Quantidade */}
                  <FormField
                    control={form.control}
                    name={`itens.${index}.quantidade`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Quantidade</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="tabular-nums"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Unidade de medida */}
                  <FormField
                    control={form.control}
                    name={`itens.${index}.unidadeMedida`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Unidade</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="UN">UN</SelectItem>
                            <SelectItem value="KG">KG</SelectItem>
                            <SelectItem value="L">L</SelectItem>
                            <SelectItem value="M">M</SelectItem>
                            <SelectItem value="M2">M²</SelectItem>
                            <SelectItem value="CX">CX</SelectItem>
                            <SelectItem value="PC">PC</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Preço estimado */}
                  <FormField
                    control={form.control}
                    name={`itens.${index}.precoEstimado`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Preço Est. (MZN)</FormLabel>
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

                  {/* Subtotal calculado + botão remover */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Subtotal</Label>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-9 flex items-center px-3 text-sm tabular-nums font-medium rounded-md border bg-muted/30">
                        MT{' '}
                        {(
                          (Number(itensValues[index]?.quantidade) || 0) *
                          (Number(itensValues[index]?.precoEstimado) || 0)
                        ).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                      </div>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => remove(index)}
                          aria-label={`Remover item ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                append({
                  descricao: '',
                  quantidade: 1,
                  unidadeMedida: 'UN',
                  precoEstimado: 0,
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
          </div>

          {/* Total geral */}
          {fields.length > 0 && (
            <div className="flex justify-end pt-2 border-t">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Valor Total Estimado</p>
                <p className="text-xl font-bold tabular-nums">
                  MT{' '}
                  {valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
        </FormSection>

        {/* Erros globais do servidor */}
        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
