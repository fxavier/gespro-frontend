'use client';

/**
 * Formulário de edição de Produto — CLIENT COMPONENT.
 * Padrão: useActionState + FormPage(actions=…) + UnsavedChangesGuard standalone.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarProdutoAction } from '@/server/actions/inventario.actions';
import type { CategoriaProdutoDto } from '@/server/services/inventario/catalogo.interface';

const Schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  categoriaId: z.string().min(1, 'Categoria obrigatória'),
  marca: z.string().max(100).optional(),
  unidadeMedida: z.string().min(1).max(20),
  precoVenda: z.coerce.number().nonnegative(),
  precoCompra: z.coerce.number().nonnegative(),
  taxaIva: z.coerce.number().min(0).max(1),
  stockMinimo: z.coerce.number().nonnegative(),
  stockMaximo: z.coerce.number().nonnegative().optional(),
  ativo: z.boolean().default(true),
});

type FormValues = z.infer<typeof Schema>;
type ActionState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface Props {
  id: string;
  categorias: Pick<CategoriaProdutoDto, 'id' | 'nome'>[];
  defaultValues: {
    nome: string;
    descricao?: string | null;
    categoriaId: string;
    marca?: string | null;
    unidadeMedida: string;
    precoVenda: string;
    precoCompra: string;
    taxaIva: string;
    stockMinimo: string;
    stockMaximo?: string | null;
    ativo: boolean;
  };
}

export function EditarProdutoForm({ id, categorias, defaultValues }: Props) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return actualizarProdutoAction({
        id,
        data: {
          nome: data.nome,
          descricao: data.descricao || undefined,
          categoriaId: data.categoriaId,
          marca: data.marca || undefined,
          unidadeMedida: data.unidadeMedida,
          precoVenda: data.precoVenda,
          precoCompra: data.precoCompra,
          taxaIva: data.taxaIva,
          stockMinimo: data.stockMinimo,
          stockMaximo: data.stockMaximo,
          ativo: data.ativo,
        },
      }) as Promise<ActionState>;
    },
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nome: defaultValues.nome,
      descricao: defaultValues.descricao ?? '',
      categoriaId: defaultValues.categoriaId,
      marca: defaultValues.marca ?? '',
      unidadeMedida: defaultValues.unidadeMedida,
      precoVenda: Number(defaultValues.precoVenda),
      precoCompra: Number(defaultValues.precoCompra),
      taxaIva: Number(defaultValues.taxaIva),
      stockMinimo: Number(defaultValues.stockMinimo),
      stockMaximo: defaultValues.stockMaximo ? Number(defaultValues.stockMaximo) : undefined,
      ativo: defaultValues.ativo,
    },
  });

  const isDirty = form.formState.isDirty;
  const errors = form.formState.errors;

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof FormValues, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao guardar alterações.');
      }
    } else {
      toast.success('Produto actualizado com sucesso.');
      router.push(`/produtos/${id}`);
      router.refresh();
    }
  }, [state, form, router, id]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const handleCancel = () => {
    if (isDirty) {
      if (!window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) return;
    }
    router.push(`/produtos/${id}`);
  };

  return (
    <>
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
              {isPending ? 'A guardar…' : 'Guardar Alterações'}
            </Button>
          </>
        }
      >
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="nome">Nome <span className="text-destructive">*</span></Label>
            <Input id="nome" {...form.register('nome')} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Categoria <span className="text-destructive">*</span></Label>
            <Select
              value={form.watch('categoriaId')}
              onValueChange={(v) => form.setValue('categoriaId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoriaId && <p className="text-xs text-destructive">{errors.categoriaId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marca">Marca</Label>
            <Input id="marca" {...form.register('marca')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unidadeMedida">Unidade de Medida <span className="text-destructive">*</span></Label>
            <Input id="unidadeMedida" {...form.register('unidadeMedida')} placeholder="UN, KG, L..." />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxaIva">Taxa IVA (0–1)</Label>
            <Input type="number" min="0" max="1" step="0.01" id="taxaIva" {...form.register('taxaIva')} placeholder="Ex.: 0.17" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="precoCompra">Preço de Compra (MT) <span className="text-destructive">*</span></Label>
            <Input type="number" min="0" step="0.01" id="precoCompra" {...form.register('precoCompra')} />
            {errors.precoCompra && <p className="text-xs text-destructive">{errors.precoCompra.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="precoVenda">Preço de Venda (MT) <span className="text-destructive">*</span></Label>
            <Input type="number" min="0" step="0.01" id="precoVenda" {...form.register('precoVenda')} />
            {errors.precoVenda && <p className="text-xs text-destructive">{errors.precoVenda.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stockMinimo">Stock Mínimo <span className="text-destructive">*</span></Label>
            <Input type="number" min="0" id="stockMinimo" {...form.register('stockMinimo')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stockMaximo">Stock Máximo</Label>
            <Input type="number" min="0" id="stockMaximo" {...form.register('stockMaximo')} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea rows={4} id="descricao" {...form.register('descricao')} />
          </div>
        </div>
      </FormPage>
    </>
  );
}
