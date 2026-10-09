'use client';

/**
 * Formulário de abertura de contagem de stock — CLIENT COMPONENT.
 * Padrão: react-hook-form + zodResolver + useActionState.
 * Erros do servidor mapeados de volta aos campos via setError.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Combobox, FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { abrirContagemAction } from '@/server/actions/inventario.actions';
import { AbrirContagemSchema, type AbrirContagemInput } from '@/lib/validations/inventario-contagem';

type ActionResult =
  | { ok: true; data: { id: string; numero: string } }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface NovaContagemFormProps {
  userId: string;
  /** Utilizadores activos do tenant (lista curta, filtro local). */
  opcoesResponsavel: ComboboxOption[];
  /** Localizações activas (lista curta, filtro local). */
  opcoesLocalizacao: ComboboxOption[];
  /** Categorias de produto activas (lista curta, filtro local). */
  opcoesCategoria: ComboboxOption[];
}

/**
 * Sentinela de «sem restrição» (o `SelectItem`/`CommandItem` não serve `value=""`): fica no fim da
 * lista e traduz-se para `undefined` antes de chegar ao formulário.
 */
const TODAS = '__todas__';

export function NovaContagemForm({
  userId,
  opcoesResponsavel,
  opcoesLocalizacao,
  opcoesCategoria,
}: NovaContagemFormProps) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionResult, AbrirContagemInput>(
    (_prev, data) => abrirContagemAction(data),
    null,
  );

  const form = useForm<AbrirContagemInput>({
    resolver: zodResolver(AbrirContagemSchema),
    defaultValues: {
      responsavelId: userId,
      cega: false,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(`Contagem ${state.data.numero} aberta com sucesso`);
      form.reset();
      router.push(`/inventario/contagens/${state.data.id}`);
    } else {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof AbrirContagemInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao abrir a contagem.');
      }
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?',
      );
      if (!confirmed) return;
    }
    router.push('/inventario/contagens');
  };

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
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A abrir...' : 'Abrir Contagem'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Configuração da Contagem"
          description="Defina o âmbito e o modo da contagem de stock."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="responsavelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável *</FormLabel>
                  <FormControl>
                    <Combobox
                      options={opcoesResponsavel}
                      value={field.value}
                      onChange={field.onChange}
                      pesquisaAPartirDe={0}
                      placeholder="Seleccione o responsável"
                      searchPlaceholder="Pesquisar por nome ou e-mail…"
                      emptyText="Nenhum utilizador encontrado."
                    />
                  </FormControl>
                  <FormDescription>
                    Utilizador responsável pela contagem.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cega"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contagem Cega</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === 'true')}
                    defaultValue={String(field.value ?? false)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar modo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="false">Não (saldos visíveis)</SelectItem>
                      <SelectItem value="true">Sim (saldos ocultos até fecho)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Na contagem cega, o operador não vê o saldo do sistema.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="localizacaoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização (opcional)</FormLabel>
                  <FormControl>
                    <Combobox
                      options={[...opcoesLocalizacao, { value: TODAS, label: 'Todas as localizações' }]}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v === TODAS ? undefined : v)}
                      pesquisaAPartirDe={0}
                      placeholder="Todas as localizações"
                      searchPlaceholder="Pesquisar localização…"
                      emptyText="Nenhuma localização encontrada."
                    />
                  </FormControl>
                  <FormDescription>
                    Restringe a contagem a uma localização.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoriaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria (opcional)</FormLabel>
                  <FormControl>
                    <Combobox
                      options={[...opcoesCategoria, { value: TODAS, label: 'Todas as categorias' }]}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v === TODAS ? undefined : v)}
                      pesquisaAPartirDe={0}
                      placeholder="Todos os produtos"
                      searchPlaceholder="Pesquisar categoria…"
                      emptyText="Nenhuma categoria encontrada."
                    />
                  </FormControl>
                  <FormDescription>
                    Limita a contagem a uma categoria de produto.
                  </FormDescription>
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
                    {...field}
                    value={field.value ?? ''}
                    placeholder="Notas adicionais sobre esta contagem..."
                    rows={3}
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
