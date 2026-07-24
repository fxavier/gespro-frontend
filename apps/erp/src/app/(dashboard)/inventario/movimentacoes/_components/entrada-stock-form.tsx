'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X, ArrowDownToLine } from 'lucide-react';
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
import { registarEntradaStockAction } from '@/server/actions/inventario.actions';
import { EntradaStockSchema, type EntradaStockInput } from '@/lib/validations/stock';
import type { ProdutoOpcao, LocalizacaoOpcao } from '../_data';
import { EntityCombobox } from './entity-combobox';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const TIPOS_DOCUMENTO = [
  { value: 'RecebimentoCompra', label: 'Recebimento de compra' },
  { value: 'AjusteInventario', label: 'Ajuste de inventário' },
  { value: 'DevolucaoVenda', label: 'Devolução de venda' },
  { value: 'ProducaoOutput', label: 'Produção (saída)' },
  { value: 'Manual', label: 'Manual' },
] as const;

interface Props {
  produtos: ProdutoOpcao[];
  localizacoes: LocalizacaoOpcao[];
}

export function EntradaStockForm({ produtos, localizacoes }: Props) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<FormState, EntradaStockInput>(
    (_prev, data) => registarEntradaStockAction(data),
    null,
  );

  const form = useForm<EntradaStockInput>({
    resolver: zodResolver(EntradaStockSchema),
    defaultValues: {
      produtoId: '',
      varianteProdutoId: undefined,
      localizacaoDestinoId: '',
      quantidade: 1,
      documentoReferenciaTipo: 'Manual',
      motivo: '',
      observacoes: '',
    },
    mode: 'onBlur',
  });

  const produtoId = form.watch('produtoId');
  const produtoSel = produtos.find((p) => p.id === produtoId);

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof EntradaStockInput, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao registar a entrada de stock.');
      }
    } else {
      toast.success('Entrada de stock registada com sucesso.');
      router.push('/inventario/movimentacoes');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) =>
    dispatch({
      ...data,
      varianteProdutoId: data.varianteProdutoId || undefined,
      documentoReferenciaId: data.documentoReferenciaId || undefined,
    }),
  );

  const isDirty = form.formState.isDirty;
  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende sair?')) return;
    router.push('/inventario/movimentacoes');
  };

  const produtoOptions = produtos.map((p) => ({ value: p.id, label: p.nome, hint: `SKU: ${p.sku}` }));
  const localizacaoOptions = localizacoes.map((l) => ({
    value: l.id,
    label: l.nome,
    hint: `Código: ${l.codigo}`,
  }));

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar...' : 'Registar Entrada'}
            </Button>
          </>
        }
      >
        <FormSection title="Produto" description="Item e variante a dar entrada em stock">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="produtoId"
              render={({ field, fieldState }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Produto</FormLabel>
                  <FormControl>
                    <EntityCombobox
                      options={produtoOptions}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        form.setValue('varianteProdutoId', undefined);
                      }}
                      placeholder="Seleccionar produto"
                      searchPlaceholder="Pesquisar por nome ou SKU…"
                      emptyText="Nenhum produto encontrado."
                      ariaInvalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {produtoSel && produtoSel.variantes.length > 0 && (
              <FormField
                control={form.control}
                name="varianteProdutoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variante</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === 'NENHUMA' ? undefined : v)}
                      value={field.value ?? 'NENHUMA'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sem variante" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NENHUMA">Sem variante</SelectItem>
                        {produtoSel.variantes.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.nome}: {v.valor}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </FormSection>

        <FormSection title="Destino e quantidade" description="Onde e quanto stock entra">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="localizacaoDestinoId"
              render={({ field, fieldState }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Localização de destino</FormLabel>
                  <FormControl>
                    <EntityCombobox
                      options={localizacaoOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Seleccionar localização"
                      searchPlaceholder="Pesquisar localização…"
                      emptyText="Nenhuma localização encontrada."
                      ariaInvalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  {produtoSel && (
                    <FormDescription>Unidade: {produtoSel.unidadeMedida}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Referência" description="Motivo e documento associado (opcional)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="documentoReferenciaTipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de documento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? 'Manual'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map((t) => (
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
              name="documentoReferenciaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº do documento</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: FT 2026/001" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Opcional</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Recepção de mercadoria" {...field} value={field.value ?? ''} />
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

        {state && !state.ok && !(state.error.details as { fieldErrors?: unknown })?.fieldErrors && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 shrink-0" />
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
