'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X, AlertTriangle, ArrowRight, ArrowDownToLine, ArrowUpFromLine, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { registarTransferenciaStockAction } from '@/server/actions/inventario.actions';
import { TransferenciaStockSchema, type TransferenciaStockInput } from '@/lib/validations/stock';
import type { ProdutoOpcao, LocalizacaoOpcao } from '../_data';
import { EntityCombobox } from './entity-combobox';

interface MovimentoResumo {
  id: string;
  tipo: string;
  quantidade: string;
}
interface TransferenciaResultado {
  movimentoSaida: MovimentoResumo;
  movimentoEntrada: MovimentoResumo;
}
type FormState =
  | { ok: true; data: TransferenciaResultado }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface Props {
  produtos: ProdutoOpcao[];
  localizacoes: LocalizacaoOpcao[];
}

export function TransferenciaStockForm({ produtos, localizacoes }: Props) {
  const router = useRouter();
  const [resultado, setResultado] = useState<TransferenciaResultado | null>(null);

  const [state, dispatch, isPending] = useActionState<FormState, TransferenciaStockInput>(
    (_prev, data) => registarTransferenciaStockAction(data) as Promise<FormState>,
    null,
  );

  const form = useForm<TransferenciaStockInput>({
    resolver: zodResolver(TransferenciaStockSchema),
    defaultValues: {
      produtoId: '',
      varianteProdutoId: undefined,
      localizacaoOrigemId: '',
      localizacaoDestinoId: '',
      quantidade: 1,
      motivo: '',
      observacoes: '',
    },
    mode: 'onBlur',
  });

  const produtoId = form.watch('produtoId');
  const origemId = form.watch('localizacaoOrigemId');
  const produtoSel = produtos.find((p) => p.id === produtoId);
  const globalError = state && !state.ok && !(state.error.details as { fieldErrors?: unknown })?.fieldErrors;

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof TransferenciaStockInput, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao registar a transferência de stock.');
      }
    } else {
      toast.success('Transferência registada com sucesso.');
      setResultado(state.data);
      form.reset(form.getValues());
    }
  }, [state, form]);

  const onSubmit = form.handleSubmit((data) =>
    dispatch({ ...data, varianteProdutoId: data.varianteProdutoId || undefined }),
  );

  const isDirty = form.formState.isDirty;
  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende sair?')) return;
    router.push('/inventario/transferencias');
  };

  const produtoOptions = produtos.map((p) => ({ value: p.id, label: p.nome, hint: `SKU: ${p.sku}` }));
  const localizacaoOptions = localizacoes.map((l) => ({
    value: l.id,
    label: l.nome,
    hint: `Código: ${l.codigo}`,
  }));

  if (resultado) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Transferência concluída
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Foram gerados dois movimentos de stock (saída na origem, entrada no destino). O saldo
            total do produto mantém-se inalterado.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                Movimento de saída
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Referência</p>
              <p className="font-mono text-xs">{resultado.movimentoSaida.id}</p>
              <p className="mt-2 text-xs text-muted-foreground">Quantidade</p>
              <p className="tabular-nums font-medium">{resultado.movimentoSaida.quantidade}</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ArrowDownToLine className="h-4 w-4 text-primary" />
                Movimento de entrada
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Referência</p>
              <p className="font-mono text-xs">{resultado.movimentoEntrada.id}</p>
              <p className="mt-2 text-xs text-muted-foreground">Quantidade</p>
              <p className="tabular-nums font-medium">{resultado.movimentoEntrada.quantidade}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm">
              <Link href="/inventario/transferencias">Ver transferências</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setResultado(null);
                form.reset();
              }}
            >
              Registar outra
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
              {isPending ? 'A guardar...' : 'Registar Transferência'}
            </Button>
          </>
        }
      >
        <FormSection title="Produto" description="Item e variante a transferir">
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

        <FormSection title="Origem e destino" description="Localizações entre as quais o stock se move">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-4">
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
                      onChange={(v) => {
                        field.onChange(v);
                        if (form.getValues('localizacaoDestinoId') === v) {
                          form.setValue('localizacaoDestinoId', '');
                        }
                      }}
                      placeholder="Seleccionar origem"
                      searchPlaceholder="Pesquisar localização…"
                      emptyText="Nenhuma localização encontrada."
                      ariaInvalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="hidden sm:flex items-center justify-center pb-2.5">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>

            <FormField
              control={form.control}
              name="localizacaoDestinoId"
              render={({ field, fieldState }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Localização de destino</FormLabel>
                  <FormControl>
                    <EntityCombobox
                      options={localizacaoOptions.filter((o) => o.value !== origemId)}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Seleccionar destino"
                      searchPlaceholder="Pesquisar localização…"
                      emptyText="Nenhuma localização encontrada."
                      ariaInvalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="quantidade"
            render={({ field }) => (
              <FormItem className="max-w-xs">
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
                {produtoSel && <FormDescription>Unidade: {produtoSel.unidadeMedida}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Referência" description="Motivo da transferência">
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Reposição de prateleira" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>Obrigatório</FormDescription>
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

        {globalError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
