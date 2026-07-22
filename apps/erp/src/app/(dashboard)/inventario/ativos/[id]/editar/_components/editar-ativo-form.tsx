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
import { actualizarAtivoAction } from '@/server/actions/inventario.actions';
import { AtivoUpdateSchema, type AtivoUpdate } from '@/lib/validations/inventario-ativos';
import type { AtivoDto, CategoriaAtivoDto } from '@/server/services/inventario/ativos.interface';
import type { LocalizacaoDto } from '@/server/services/inventario/stock.interface';
import { z } from 'zod';

const EditarAtivoSchema = z.object({ id: z.string().cuid(), data: AtivoUpdateSchema });
type EditarAtivoInput = z.infer<typeof EditarAtivoSchema>;

type FormState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface EditarAtivoFormProps {
  ativo: AtivoDto;
  categorias: CategoriaAtivoDto[];
  localizacoes: LocalizacaoDto[];
}

export function EditarAtivoForm({ ativo, categorias, localizacoes }: EditarAtivoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, EditarAtivoInput>(
    (_prev, input) => actualizarAtivoAction(input),
    null
  );

  const form = useForm<AtivoUpdate>({
    resolver: zodResolver(AtivoUpdateSchema),
    defaultValues: {
      nome: ativo.nome,
      descricao: ativo.descricao ?? undefined,
      categoriaId: ativo.categoriaId,
      marca: ativo.marca ?? undefined,
      modelo: ativo.modelo ?? undefined,
      numeroSerie: ativo.numeroSerie ?? undefined,
      valorCompra: Number(ativo.valorCompra),
      valorResidual: ativo.valorResidual ? Number(ativo.valorResidual) : undefined,
      vidaUtilAnos: ativo.vidaUtilAnos,
      localizacaoId: ativo.localizacaoId,
      metodoAmortizacao: ativo.metodoAmortizacao as 'LINEAR' | 'DIGITOS_ANOS' | 'UNIDADES_PRODUCAO' | 'SALDOS_DECRESCENTES',
      observacoes: ativo.observacoes ?? undefined,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof AtivoUpdate, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao actualizar o ativo.');
      }
    } else {
      toast.success('Ativo actualizado com sucesso!');
      router.push(`/inventario/ativos/${ativo.id}`);
    }
  }, [state, form, router, ativo.id]);

  const onSubmit = form.handleSubmit((data) => dispatch({ id: ativo.id, data }));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?');
      if (!confirmed) return;
    }
    router.push(`/inventario/ativos/${ativo.id}`);
  };

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
              {isPending ? 'A guardar…' : 'Guardar Alterações'}
            </Button>
          </>
        }
      >
        <FormSection title="Informações Básicas" description="Identificação e classificação do ativo">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="categoriaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
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
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Ativo</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do ativo" {...field} value={field.value ?? ''} />
                  </FormControl>
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
                    <Textarea
                      className="resize-none"
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
              name="modelo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Financeiro e Localização" description="Valores e posição do ativo">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="valorCompra"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor de Compra (MT)</FormLabel>
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
              name="vidaUtilAnos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vida Útil (anos)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="localizacaoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar localização" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {localizacoes.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
