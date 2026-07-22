'use client';

/**
 * Formulário de criação de Inventário Físico — CLIENT COMPONENT.
 * Padrão: react-hook-form + zodResolver + useActionState.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import type { z } from 'zod';
import { InventarioFisicoCreateSchema } from '@/lib/validations/inventario-ativos';
import { criarInventarioFisicoAction } from '@/server/actions/inventario.actions';
import type { LocalizacaoDto } from '@/server/services/inventario/stock.interface';
import type { CategoriaAtivoDto } from '@/server/services/inventario/ativos.interface';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FormValues = z.infer<typeof InventarioFisicoCreateSchema>;
type FormState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface NovaFisicoFormProps {
  userId: string;
  localizacoes: Pick<LocalizacaoDto, 'id' | 'nome' | 'codigo'>[];
  categorias: Pick<CategoriaAtivoDto, 'id' | 'nome'>[];
}

export function NovaFisicoForm({ userId, localizacoes }: NovaFisicoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, FormValues>(
    (_prev, data) => criarInventarioFisicoAction(data),
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(InventarioFisicoCreateSchema),
    defaultValues: {
      codigo: '',
      titulo: '',
      descricao: '',
      dataInicio: new Date(),
      responsavelId: userId,
      localizacoesIncluidas: [],
      categoriasIncluidas: [],
      observacoes: '',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      toast.error(state.error.message ?? 'Erro ao criar inventário físico.');
    } else {
      toast.success('Inventário físico criado com sucesso!');
      form.reset();
      router.push('/inventario/fisico');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?');
      if (!confirmed) return;
    }
    router.push('/inventario/fisico');
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
              {isPending ? 'A criar...' : 'Criar Inventário'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Dados principais do inventário físico">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código *</FormLabel>
                  <FormControl>
                    <Input placeholder="INV-2026-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dataInicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Início *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value instanceof Date ? field.value.toISOString().slice(0, 10) : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : new Date())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Inventário anual 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dataPrevistaConclusao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Prevista de Conclusão</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value instanceof Date ? field.value.toISOString().slice(0, 10) : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {localizacoes.length > 0 && (
              <FormField
                control={form.control}
                name="localizacaoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização Principal</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar localização…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {localizacoes.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.codigo} — {loc.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Descrição do inventário…" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Observações adicionais…" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {state && !state.ok && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
