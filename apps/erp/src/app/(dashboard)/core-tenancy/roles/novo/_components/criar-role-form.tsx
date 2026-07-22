'use client';

/**
 * Formulário de criação de papel (role).
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
import { Textarea } from '@/components/ui/textarea';
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
import { criarRole } from '@/server/actions/plataforma.actions';
import { CreateRoleSchema, type CreateRoleInput } from '@/lib/validations/plataforma';
import type { PermissionRow } from '@/server/services/plataforma/user-admin.interface';

type FormState = {
  ok: true;
  data: unknown;
} | {
  ok: false;
  error: { code: string; message: string; details?: unknown };
} | null;

interface CriarRoleFormProps {
  permissoes: PermissionRow[];
}

// Agrupar permissões por módulo
function agruparPermissoes(permissoes: PermissionRow[]): Record<string, PermissionRow[]> {
  return permissoes.reduce<Record<string, PermissionRow[]>>((acc, p) => {
    const modulo = p.code.split(':')[0] ?? 'outros';
    if (!acc[modulo]) acc[modulo] = [];
    acc[modulo].push(p);
    return acc;
  }, {});
}

const DEFAULT_VALUES: CreateRoleInput = {
  nome: '',
  descricao: '',
  permissionCodes: [],
};

export function CriarRoleForm({ permissoes }: CriarRoleFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateRoleInput>(
    (_prev, data) => criarRole(data),
    null
  );

  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(CreateRoleSchema),
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
          form.setError(field as keyof CreateRoleInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao criar o papel.');
      }
    } else {
      toast.success('Papel criado com sucesso!');
      router.push('/core-tenancy/roles');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Pretende sair mesmo assim?');
      if (!confirmed) return;
    }
    router.push('/core-tenancy/roles');
  };

  const grupos = agruparPermissoes(permissoes);

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
              {isPending ? 'A guardar…' : 'Criar Papel'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação do Papel" description="Nome e descrição do novo papel">
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do Papel</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Gestor de Vendas" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descreva as responsabilidades deste papel (opcional)"
                    className="resize-none"
                    rows={2}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Permissões" description="Seleccione as permissões a atribuir a este papel">
          <FormField
            control={form.control}
            name="permissionCodes"
            render={() => (
              <FormItem>
                {Object.keys(grupos).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem permissões disponíveis no catálogo.</p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(grupos).map(([modulo, perms]) => (
                      <div key={modulo} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {modulo}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {perms.map((perm) => (
                            <FormField
                              key={perm.code}
                              control={form.control}
                              name="permissionCodes"
                              render={({ field }) => (
                                <FormItem className="flex items-start gap-2">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value.includes(perm.code)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value;
                                        field.onChange(
                                          checked
                                            ? [...current, perm.code]
                                            : current.filter((c) => c !== perm.code)
                                        );
                                      }}
                                    />
                                  </FormControl>
                                  <div>
                                    <FormLabel className="text-xs font-mono cursor-pointer">
                                      {perm.code}
                                    </FormLabel>
                                    {perm.descricao && (
                                      <p className="text-xs text-muted-foreground">{perm.descricao}</p>
                                    )}
                                  </div>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
