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
import { criarCategoriaAtivoAction } from '@/server/actions/inventario.actions';
import { CategoriaAtivoCreateSchema, type CategoriaAtivoCreate } from '@/lib/validations/inventario-ativos';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

export function NovaCategoriaForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CategoriaAtivoCreate>(
    (_prev, input) => criarCategoriaAtivoAction(input),
    null
  );

  const form = useForm<CategoriaAtivoCreate>({
    resolver: zodResolver(CategoriaAtivoCreateSchema),
    defaultValues: {
      codigo: '',
      nome: '',
      descricao: '',
      metodoAmortizacao: 'LINEAR',
      vidaUtilAnos: 5,
      valorResidualPct: 0,
      ativa: true,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CategoriaAtivoCreate, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar a categoria.');
      }
    } else {
      toast.success('Categoria criada com sucesso!');
      router.push('/inventario/categorias');
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
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/inventario/categorias')} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Criar Categoria'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Código e nome da categoria de ativo">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: EQ-TI" {...field} value={field.value ?? ''} />
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
                    <Input placeholder="Nome da categoria" {...field} value={field.value ?? ''} />
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
                    <Textarea className="resize-none" rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Amortização" description="Configuração de amortização e vida útil">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="metodoAmortizacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de Amortização</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? 'LINEAR'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar método" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="LINEAR">Linear</SelectItem>
                      <SelectItem value="DIGITOS_ANOS">Dígitos dos Anos</SelectItem>
                      <SelectItem value="UNIDADES_PRODUCAO">Unidades de Produção</SelectItem>
                      <SelectItem value="SALDOS_DECRESCENTES">Saldos Decrescentes</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vidaUtilAnos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vida Útil (anos) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="100"
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
              name="valorResidualPct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Residual (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="tabular-nums"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) / 100 || 0)}
                      value={field.value != null ? (Number(field.value) * 100).toFixed(2) : ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="intervaloPreventivaDias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intervalo Preventiva (dias)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      className="tabular-nums"
                      placeholder="—"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
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
