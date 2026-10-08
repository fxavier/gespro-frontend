'use client';

/**
 * Formulário de categoria de produto (#119) — criar (`/produtos/categorias/nova`) e editar
 * (`/produtos/categorias/[id]/editar`). Mesmo schema Zod do servidor.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import {
  actualizarCategoriaProdutoAction,
  criarCategoriaProdutoAction,
} from '@/server/actions/inventario.actions';
import {
  CategoriaProdutoCreateSchema,
  type CategoriaProdutoCreate,
} from '@/lib/validations/produtos';

const URL_LISTA = '/produtos/categorias';

interface CategoriaProdutoFormProps {
  /** Ausente → criar; presente → editar. */
  categoria?: { id: string; nome: string; descricao: string | null; cor: string; ativo: boolean };
}

export function CategoriaProdutoForm({ categoria }: CategoriaProdutoFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const edicao = categoria !== undefined;

  const form = useForm<CategoriaProdutoCreate>({
    resolver: zodResolver(CategoriaProdutoCreateSchema),
    defaultValues: {
      nome: categoria?.nome ?? '',
      descricao: categoria?.descricao ?? '',
      cor: categoria?.cor ?? '#6366f1',
      ativo: categoria?.ativo ?? true,
    },
    mode: 'onBlur',
  });

  const submeter = (dados: CategoriaProdutoCreate) => {
    startTransition(async () => {
      const r = edicao
        ? await actualizarCategoriaProdutoAction({ id: categoria.id, data: dados })
        : await criarCategoriaProdutoAction(dados);
      if (!r.ok) {
        const details = r.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([campo, msgs]) => {
            form.setError(campo as keyof CategoriaProdutoCreate, { type: 'server', message: msgs[0] });
          });
        } else if (r.error.code === 'CATEGORIA_DUPLICADA') {
          form.setError('nome', { type: 'server', message: r.error.message });
        } else {
          toast.error(r.error.message ?? 'Ocorreu um erro ao guardar a categoria.');
        }
        return;
      }
      toast.success(edicao ? 'Categoria actualizada.' : 'Categoria criada.');
      form.reset(dados);
      router.push(URL_LISTA);
    });
  };

  const onSubmit = form.handleSubmit(submeter);

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />

      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(URL_LISTA)} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : edicao ? 'Guardar alterações' : 'Criar categoria'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Nome e descrição da categoria">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Bebidas" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cor</FormLabel>
                  <FormControl>
                    <Input type="color" className="h-9 w-20 p-1" {...field} value={field.value ?? '#6366f1'} />
                  </FormControl>
                  <FormDescription>Identifica a categoria nas listagens.</FormDescription>
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
                    <Textarea className="resize-none" rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Estado" description="Disponibilidade da categoria">
          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel>Categoria activa</FormLabel>
                  <FormDescription>Categorias inactivas ficam fora dos filtros de categorias activas.</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
