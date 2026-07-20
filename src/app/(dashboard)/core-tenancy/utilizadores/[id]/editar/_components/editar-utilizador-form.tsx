'use client';

/**
 * Formulário de edição de utilizador.
 * Padrão: react-hook-form + zodResolver + useActionState.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import { actualizarUtilizador } from '@/server/actions/plataforma.actions';
import { UpdateUserSchema, type UpdateUserInput } from '@/lib/validations/plataforma';
import type { UserRow, RoleRow } from '@/server/services/plataforma/user-admin.interface';

// Schema composto para o formulário (inclui o id)
const EditarUtilizadorSchema = z.object({
  id: z.string().cuid(),
  data: UpdateUserSchema,
});

type EditarUtilizadorInput = z.infer<typeof EditarUtilizadorSchema>;

type FormState = {
  ok: true;
  data: unknown;
} | {
  ok: false;
  error: { code: string; message: string; details?: unknown };
} | null;

interface EditarUtilizadorFormProps {
  utilizador: UserRow;
  roles: RoleRow[];
}

export function EditarUtilizadorForm({ utilizador, roles }: EditarUtilizadorFormProps) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<FormState, EditarUtilizadorInput>(
    (_prev, data) => actualizarUtilizador(data),
    null
  );

  const form = useForm<EditarUtilizadorInput>({
    resolver: zodResolver(EditarUtilizadorSchema),
    defaultValues: {
      id: utilizador.id,
      data: {
        nome: utilizador.nome,
        email: utilizador.email,
        ativo: utilizador.ativo,
        password: '',
      },
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(`data.${field}` as keyof EditarUtilizadorInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao actualizar o utilizador.');
      }
    } else {
      toast.success('Utilizador actualizado com sucesso!');
      router.push('/core-tenancy/utilizadores');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((formData) => {
    // Não enviar password vazia
    const payload: EditarUtilizadorInput = {
      id: formData.id,
      data: {
        nome: formData.data.nome,
        email: formData.data.email,
        ativo: formData.data.ativo,
        ...(formData.data.password ? { password: formData.data.password } : {}),
      },
    };
    dispatch(payload);
  });

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Pretende sair mesmo assim?');
      if (!confirmed) return;
    }
    router.push('/core-tenancy/utilizadores');
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
        <FormSection title="Dados do Utilizador" description="Informações de identificação">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="data.nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: João Mahumane Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="data.email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ex.: joao@empresa.co.mz" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="data.password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nova Palavra-passe</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Deixar em branco para não alterar" {...field} />
                </FormControl>
                <FormDescription>Preencha apenas se pretender alterar a palavra-passe actual.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="data.ativo"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">Utilizador activo</FormLabel>
              </FormItem>
            )}
          />
        </FormSection>

        {/* Roles actuais (read-only — atribuição via acção separada) */}
        <FormSection title="Papéis Actuais" description="Papéis atribuídos a este utilizador (geridos via Gestão de Utilizadores)">
          <div className="space-y-1.5">
            {utilizador.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem papéis atribuídos.</p>
            ) : (
              utilizador.roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{role.nome}</p>
                    {role.descricao && (
                      <p className="text-xs text-muted-foreground">{role.descricao}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {role.permissions.length} permissões
                  </span>
                </div>
              ))
            )}
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
