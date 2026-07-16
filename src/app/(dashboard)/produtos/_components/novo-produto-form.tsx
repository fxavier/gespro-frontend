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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarProdutoAction } from '@/server/actions/inventario.actions';
import { ProdutoCreateSchema, type ProdutoCreate } from '@/lib/validations/produtos';
import type { CategoriaProdutoDto } from '@/server/services/inventario/catalogo.interface';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface NovoProdutoFormProps {
  categorias: CategoriaProdutoDto[];
}

export function NovoProdutoForm({ categorias }: NovoProdutoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, ProdutoCreate>(
    (_prev, input) => criarProdutoAction(input),
    null
  );

  const form = useForm<ProdutoCreate>({
    resolver: zodResolver(ProdutoCreateSchema),
    defaultValues: {
      sku: '',
      nome: '',
      descricao: '',
      categoriaId: '',
      marca: '',
      unidadeMedida: 'UN',
      precoVenda: 0,
      precoCompra: 0,
      taxaIva: 0.16,
      stockMinimo: 0,
      imagens: [],
      ativo: true,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof ProdutoCreate, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar o produto.');
      }
    } else {
      toast.success('Produto criado com sucesso!');
      router.push('/produtos');
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
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/produtos')} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Criar Produto'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Código e informações básicas do produto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: PROD-001" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do produto" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoriaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="marca"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
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
                  <FormLabel>Unidade de Medida *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? 'UN'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="UN">Unidade (UN)</SelectItem>
                      <SelectItem value="KG">Quilograma (KG)</SelectItem>
                      <SelectItem value="L">Litro (L)</SelectItem>
                      <SelectItem value="M">Metro (M)</SelectItem>
                      <SelectItem value="CX">Caixa (CX)</SelectItem>
                      <SelectItem value="PCT">Pacote (PCT)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none" rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Preços e Stock" description="Valores e limites de stock">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="precoCompra"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço de Compra (MT) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
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

            <FormField
              control={form.control}
              name="precoVenda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço de Venda (MT) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
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

            <FormField
              control={form.control}
              name="taxaIva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taxa de IVA</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(parseFloat(v))}
                    value={String(field.value ?? 0.16)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0">Isento (0%)</SelectItem>
                      <SelectItem value="0.16">16%</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stockMinimo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock Mínimo</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
