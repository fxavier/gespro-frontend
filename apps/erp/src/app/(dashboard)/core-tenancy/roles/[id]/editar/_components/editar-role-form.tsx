'use client';

/**
 * Formulário de edição de papel (role).
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarRole } from '@/server/actions/plataforma.actions';
import { UpdateRoleSchema } from '@/lib/validations/plataforma';
import type { RoleRow, PermissionRow } from '@/server/services/plataforma/user-admin.interface';

const EditarRoleSchema = z.object({
  id: z.string().cuid(),
  data: UpdateRoleSchema,
});

type EditarRoleInput = z.infer<typeof EditarRoleSchema>;

type FormState = {
  ok: true;
  data: unknown;
} | {
  ok: false;
  error: { code: string; message: string; details?: unknown };
} | null;

interface EditarRoleFormProps {
  role: RoleRow;
  permissoes: PermissionRow[];
}

function agruparPermissoes(permissoes: PermissionRow[]): Record<string, PermissionRow[]> {
  return permissoes.reduce<Record<string, PermissionRow[]>>((acc, p) => {
    const modulo = p.code.split(':')[0] ?? 'outros';
    if (!acc[modulo]) acc[modulo] = [];
    acc[modulo].push(p);
    return acc;
  }, {});
}

export function EditarRoleForm({ role, permissoes }: EditarRoleFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, EditarRoleInput>(
    (_prev, data) => actualizarRole(data),
    null
  );

  const form = useForm<EditarRoleInput>({
    resolver: zodResolver(EditarRoleSchema),
    defaultValues: {
      id: role.id,
      data: {
        nome: role.nome,
        descricao: role.descricao ?? '',
        permissionCodes: role.permissions.map((p) => p.code),
      },
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      toast.error(state.error.message ?? 'Erro ao actualizar o papel.');
    } else {
      toast.success('Papel actualizado com sucesso!');
      router.push('/core-tenancy/roles');
    }
  }, [state, router]);

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
            <Button type="submit" size="sm" disabled={isPending || role.isSystem} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Alterações'}
            </Button>
          </>
        }
      >
        {role.isSystem && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
            Este é um papel de sistema e não pode ser modificado.
          </div>
        )}

        <FormSection title="Identificação" description="Nome e descrição do papel">
          <FormField
            control={form.control}
            name="data.nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do Papel</FormLabel>
                <Input {...field} disabled={role.isSystem} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="data.descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  rows={2}
                  className="resize-none"
                  disabled={role.isSystem}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Permissões" description="Permissões associadas a este papel">
          <FormField
            control={form.control}
            name="data.permissionCodes"
            render={() => (
              <FormItem>
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
                            name="data.permissionCodes"
                            render={({ field }) => (
                              <FormItem className="flex items-start gap-2">
                                <FormControl>
                                  <Checkbox
                                    checked={(field.value ?? []).includes(perm.code)}
                                    disabled={role.isSystem}
                                    onCheckedChange={(checked) => {
                                      const current = field.value ?? [];
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
                <FormMessage />
              </FormItem>
            )}
          />
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
