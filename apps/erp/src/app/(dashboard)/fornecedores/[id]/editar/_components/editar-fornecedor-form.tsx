'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { z } from 'zod';
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
import { actualizarFornecedorAction } from '@/server/actions/fornecedores.actions';
import { UpdateFornecedorSchema } from '@/lib/validations/fornecedores';
import type { FornecedorDetalhe } from '@/server/services/compras/fornecedor.service.interface';

type UpdateFornecedorInput = z.infer<typeof UpdateFornecedorSchema>;

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface EditarFornecedorFormProps {
  fornecedor: FornecedorDetalhe;
}

export function EditarFornecedorForm({ fornecedor }: EditarFornecedorFormProps) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<
    FormState,
    { id: string; dados: UpdateFornecedorInput }
  >((_prev, data) => actualizarFornecedorAction(data), null);

  const defaultValues: UpdateFornecedorInput = {
    nome: fornecedor.nome,
    tipo: fornecedor.tipo,
    nuit: fornecedor.nuit,
    bi: fornecedor.bi ?? undefined,
    email: fornecedor.email,
    telefone: fornecedor.telefone ?? undefined,
    categoria: fornecedor.categoria ?? undefined,
    status: fornecedor.status,
    classificacao: fornecedor.classificacao,
    diasPagamento: fornecedor.diasPagamento,
    prazoMedioPagamento: fornecedor.prazoMedioPagamento,
    condicoesPagamento: fornecedor.condicoesPagamento ?? undefined,
    formasPagamento: fornecedor.formasPagamento,
    condicoesComerciaisDesconto: fornecedor.condicoesComerciaisDesconto ?? undefined,
    limiteCredito: fornecedor.limiteCredito ?? undefined,
    observacoes: fornecedor.observacoes ?? undefined,
    tags: fornecedor.tags,
  };

  const form = useForm<UpdateFornecedorInput>({
    resolver: zodResolver(UpdateFornecedorSchema),
    defaultValues,
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
          form.setError(field as keyof UpdateFornecedorInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao actualizar o fornecedor.');
      }
    } else {
      toast.success('Fornecedor actualizado com sucesso!');
      router.push(`/fornecedores/${fornecedor.id}`);
    }
  }, [state, form, router, fornecedor.id]);

  const onSubmit = form.handleSubmit((dados) =>
    dispatch({ id: fornecedor.id, dados })
  );

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?'
      );
      if (!confirmed) return;
    }
    router.push(`/fornecedores/${fornecedor.id}`);
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
              {isPending ? 'A guardar…' : 'Guardar Alterações'}
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
            {/* Tipo */}
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ATIVO">Activo</SelectItem>
                      <SelectItem value="INATIVO">Inactivo</SelectItem>
                      <SelectItem value="SUSPENSO">Suspenso</SelectItem>
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
                      value={field.value ?? ''}
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
                    <Input type="email" placeholder="email@empresa.co.mz" {...field} value={field.value ?? ''} />
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
                      value={field.value ?? 30}
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
