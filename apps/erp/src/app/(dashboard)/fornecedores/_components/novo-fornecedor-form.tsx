'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X, Plus, Trash2 } from 'lucide-react';
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
import { criarFornecedorAction } from '@/server/actions/fornecedores.actions';
import {
  CreateFornecedorSchema,
  type CreateFornecedorInput,
} from '@/lib/validations/fornecedores';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const DEFAULT_VALUES: CreateFornecedorInput = {
  codigo: '',
  nome: '',
  tipo: 'PESSOA_JURIDICA',
  nuit: '',
  email: '',
  telefone: '',
  classificacao: 'REGULAR',
  diasPagamento: 30,
  prazoMedioPagamento: 30,
  formasPagamento: [],
  tags: [],
  contactos: [],
};

const CONTACTO_TIPOS = [
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'SECUNDARIO', label: 'Secundário' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
] as const;

export function NovoFornecedorForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateFornecedorInput>(
    (_prev, data) => criarFornecedorAction(data),
    null
  );

  const form = useForm<CreateFornecedorInput>({
    resolver: zodResolver(CreateFornecedorSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
  });

  const contactos = useFieldArray({ control: form.control, name: 'contactos' });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CreateFornecedorInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar o fornecedor.');
      }
    } else {
      toast.success('Fornecedor criado com sucesso!');
      form.reset(DEFAULT_VALUES);
      router.push('/fornecedores/lista');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const isDirty = form.formState.isDirty;

  // A confirmação de alterações não guardadas é responsabilidade única do
  // <UnsavedChangesGuard>; não duplicar com window.confirm.
  const handleCancel = () => {
    router.push('/fornecedores/lista');
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
              {isPending ? 'A guardar…' : 'Guardar Fornecedor'}
            </Button>
          </>
        }
      >
        {/* Secção: Identificação */}
        <FormSection
          title="Identificação"
          description="Dados de identificação do fornecedor"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Código */}
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: FOR-0001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo */}
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PESSOA_FISICA">Pessoa Física</SelectItem>
                      <SelectItem value="PESSOA_JURIDICA">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Nome */}
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nome / Razão Social</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo ou razão social" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* NUIT */}
            <FormField
              control={form.control}
              name="nuit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NUIT</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="000000000"
                      maxLength={9}
                      className="tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@empresa.co.mz" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Telefone */}
            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+258 84 000 0000"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Secção: Condições Comerciais */}
        <FormSection
          title="Condições Comerciais"
          description="Classificação e condições de pagamento"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Classificação */}
            <FormField
              control={form.control}
              name="classificacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Classificação</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar classificação" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PREFERENCIAL">Preferencial</SelectItem>
                      <SelectItem value="REGULAR">Regular</SelectItem>
                      <SelectItem value="NOVO">Novo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dias de pagamento */}
            <FormField
              control={form.control}
              name="diasPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias para Pagamento</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Condições de pagamento */}
            <FormField
              control={form.control}
              name="condicoesPagamento"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Condições de Pagamento</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ex.: 30 dias, transferência bancária"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Observações */}
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informações adicionais sobre o fornecedor (opcional)"
                      className="resize-none min-h-[80px]"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Secção: Contactos */}
        <FormSection
          title="Contactos"
          description="Pessoas de contacto (opcional — pode gerir depois no detalhe)"
        >
          <div className="space-y-4">
            {contactos.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sem contactos. Adicione o primeiro contacto abaixo.
              </p>
            )}

            {contactos.fields.map((linha, index) => (
              <div
                key={linha.id}
                className="rounded-lg border p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Contacto {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => contactos.remove(index)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Remover
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name={`contactos.${index}.nome`}
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Nome</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome do contacto" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactos.${index}.cargo`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo</FormLabel>
                        <FormControl>
                          <Input placeholder="ex.: Gestor de conta" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactos.${index}.tipo`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? 'PRINCIPAL'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONTACTO_TIPOS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactos.${index}.email`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="email@empresa.co.mz"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`contactos.${index}.telefone`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+258 84 000 0000"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                contactos.append({ nome: '', tipo: 'PRINCIPAL', ativo: true })
              }
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar contacto
            </Button>
          </div>
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
