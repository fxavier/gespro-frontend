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
import { criarCliente } from '@/server/actions/clientes.actions';
import {
  CreateClienteSchema,
  type CreateClienteInput,
} from '@/lib/validations/clientes';
import { PROVINCIAS_MZ } from '@/lib/validations/common';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const DEFAULT_VALUES: CreateClienteInput = {
  nome: '',
  tipo: 'FISICA',
  nuit: '',
  email: '',
  telefone: '',
  diasPagamento: 30,
  limiteCreditoMT: 0,
  status: 'ATIVO',
  categoria: 'NOVO',
  tags: [],
  enderecos: [
    {
      tipo: 'FACTURACAO',
      rua: '',
      numero: '',
      bairro: '',
      cidade: '',
      provincia: PROVINCIAS_MZ[0],
      principal: true,
    },
  ],
};

export function NovoClienteForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateClienteInput>(
    (_prev, data) => criarCliente(data),
    null,
  );

  const form = useForm<CreateClienteInput>({
    resolver: zodResolver(CreateClienteSchema),
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
          form.setError(field as keyof CreateClienteInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar o cliente.');
      }
    } else {
      toast.success('Cliente criado com sucesso!');
      form.reset(DEFAULT_VALUES);
      router.push('/clientes');
    }
  }, [state, form, router]);

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
              onClick={() => router.push('/clientes')}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Cliente'}
            </Button>
          </>
        }
      >
        {/* Secção: Informações Gerais */}
        <FormSection title="Informações Gerais" description="Dados de identificação do cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Cliente</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="FISICA">Pessoa Física</SelectItem>
                      <SelectItem value="JURIDICA">Pessoa Jurídica</SelectItem>
                      <SelectItem value="REVENDEDOR">Revendedor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome / Razão Social</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo ou razão social" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nuit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NUIT</FormLabel>
                  <FormControl>
                    <Input placeholder="000000000" maxLength={9} className="tabular-nums" {...field} />
                  </FormControl>
                  <FormDescription>9 dígitos — Número Único de Identificação Tributária</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bi"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BI (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: 110100123456A" className="tabular-nums" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>12 dígitos + letra (opcional para pessoas físicas)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@exemplo.co.mz" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="+258 84 000 0000" className="tabular-nums" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="NOVO">Novo</SelectItem>
                      <SelectItem value="REGULAR">Regular</SelectItem>
                      <SelectItem value="VIP">VIP</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
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
          </div>

          <FormField
            control={form.control}
            name="observacoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Informações adicionais sobre o cliente (opcional)"
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

        {/* Secção: Condições Comerciais */}
        <FormSection title="Condições Comerciais" description="Prazos e limites de crédito">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="diasPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias de Pagamento</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                    />
                  </FormControl>
                  <FormDescription>Prazo de pagamento em dias (ex: 30)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limiteCreditoMT"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limite de Crédito (MT)</FormLabel>
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
                  <FormDescription>0 = sem limite de crédito</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Secção: Endereço Principal */}
        <FormSection title="Endereço Principal" description="Endereço de facturação">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="enderecos.0.rua"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Rua / Avenida</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: Av. Julius Nyerere" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enderecos.0.numero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: 123" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enderecos.0.bairro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bairro</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: Sommerschield" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enderecos.0.cidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: Maputo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enderecos.0.provincia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Província</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROVINCIAS_MZ.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Erro global */}
        {state && !state.ok && !((state.error.details as { fieldErrors?: unknown } | undefined)?.fieldErrors) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
