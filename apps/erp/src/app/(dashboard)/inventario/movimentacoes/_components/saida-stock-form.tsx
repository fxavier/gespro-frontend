'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X, AlertTriangle } from 'lucide-react';
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
import { registarBaixaStockAction } from '@/server/actions/inventario.actions';
import { BaixaStockSchema, type BaixaStockInput } from '@/lib/validations/stock';
import type { ProdutoOpcao, LocalizacaoOpcao } from '../_data';
import { EntityCombobox } from './entity-combobox';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const TIPOS_DOCUMENTO = [
  { value: 'Venda', label: 'Venda' },
  { value: 'OrdemProducao', label: 'Ordem de produção' },
  { value: 'Perda', label: 'Perda / quebra' },
  { value: 'AjusteInventario', label: 'Ajuste de inventário' },
  { value: 'Manual', label: 'Manual' },
] as const;

interface Props {
  produtos: ProdutoOpcao[];
  localizacoes: LocalizacaoOpcao[];
}

export function SaidaStockForm({ produtos, localizacoes }: Props) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<FormState, BaixaStockInput>(
    (_prev, data) => registarBaixaStockAction(data),
    null,
  );

  const form = useForm<BaixaStockInput>({
    resolver: zodResolver(BaixaStockSchema),
    defaultValues: {
      produtoId: '',
      varianteProdutoId: undefined,
      localizacaoOrigemId: '',
      quantidade: 1,
      documentoReferenciaTipo: 'Manual',
      motivo: '',
      observacoes: '',
    },
    mode: 'onBlur',
  });

  const produtoId = form.watch('produtoId');
  const produtoSel = produtos.find((p) => p.id === produtoId);
  const stockInsuficiente = state && !state.ok && state.error.code === 'STOCK_INSUFICIENTE';

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      if (state.error.code === 'STOCK_INSUFICIENTE') {
        toast.error('Stock insuficiente para a quantidade indicada.');
        return;
      }
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof BaixaStockInput, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao registar a saída de stock.');
      }
    } else {
      toast.success('Saída de stock registada com sucesso.');
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
              {isPending ? 'A guardar...' : 'Registar Saída'}
            </Button>
          </>
        }
      >
        {stockInsuficiente && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Stock insuficiente na localização de origem para a quantidade indicada. Ajuste a
            quantidade ou escolha outra localização.
          </div>
        )}

        <FormSection title="Produto" description="Item e variante a dar saída de stock">
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

        <FormSection title="Origem e quantidade" description="De onde e quanto stock sai">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="localizacaoOrigemId"
              render={({ field, fieldState }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Localização de origem</FormLabel>
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
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Consumo interno" {...field} value={field.value ?? ''} />
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
      </FormPage>
    </Form>
  );
}
