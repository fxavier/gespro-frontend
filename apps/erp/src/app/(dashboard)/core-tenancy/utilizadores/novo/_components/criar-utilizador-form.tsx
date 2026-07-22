'use client';

/**
 * Formulário de criação de utilizador.
 * Padrão: react-hook-form + zodResolver + useActionState.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
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
import { criarUtilizador } from '@/server/actions/plataforma.actions';
import { CreateUserSchema, type CreateUserInput } from '@/lib/validations/plataforma';
import type { RoleRow } from '@/server/services/plataforma/user-admin.interface';

type FormState = {
  ok: true;
  data: unknown;
} | {
  ok: false;
  error: { code: string; message: string; details?: unknown };
} | null;

interface CriarUtilizadorFormProps {
  roles: RoleRow[];
}

const DEFAULT_VALUES: CreateUserInput = {
  nome: '',
  email: '',
  password: '',
  roleIds: [],
  ativo: true,
};

export function CriarUtilizadorForm({ roles }: CriarUtilizadorFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateUserInput>(
    (_prev, data) => criarUtilizador(data),
    null
  );

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: DEFAULT_VALUES,
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
          form.setError(field as keyof CreateUserInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao criar o utilizador.');
      }
    } else {
      toast.success('Utilizador criado com sucesso!');
      router.push('/core-tenancy/utilizadores');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
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
              {isPending ? 'A guardar…' : 'Criar Utilizador'}
            </Button>
          </>
        }
      >
        <FormSection title="Dados de Acesso" description="Informações de identificação e autenticação">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nome"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Corporativo</FormLabel>
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Palavra-passe Inicial</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Mínimo 8 caracteres" {...field} />
                </FormControl>
                <FormDescription>O utilizador poderá alterar a palavra-passe após o primeiro acesso.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">Utilizador activo (com acesso imediato)</FormLabel>
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Papéis e Permissões" description="Seleccione os papéis a atribuir ao utilizador">
          <FormField
            control={form.control}
            name="roleIds"
            render={() => (
              <FormItem>
                <div className="space-y-2">
                  {roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Não existem papéis disponíveis. Crie um papel em{' '}
                      <a href="/core-tenancy/roles/novo" className="text-primary hover:underline">
                        Papéis e Permissões
                      </a>.
                    </p>
                  ) : (
                    roles.map((role) => (
                      <FormField
                        key={role.id}
                        control={form.control}
                        name="roleIds"
                        render={({ field }) => (
                          <FormItem className="flex items-start gap-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value.includes(role.id)}
                                onCheckedChange={(checked) => {
                                  const current = field.value;
                                  field.onChange(
                                    checked
                                      ? [...current, role.id]
                                      : current.filter((id) => id !== role.id)
                                  );
                                }}
                              />
                            </FormControl>
                            <div className="space-y-0.5">
                              <FormLabel className="font-medium cursor-pointer">{role.nome}</FormLabel>
                              {role.descricao && (
                                <p className="text-xs text-muted-foreground">{role.descricao}</p>
                              )}
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {role.permissions.length} permissões
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                    ))
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
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
