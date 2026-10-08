'use client';

/**
 * Formulário de edição de utilizador.
 * Padrão: react-hook-form + zodResolver; um só «Guardar» para dados e papéis (#176).
 * O submit corre dentro de `startTransition` (o `handleSubmit` chama fora de uma transição).
 */

import { useState, useTransition } from 'react';
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
import { actualizarUtilizador, atribuirRoles } from '@/server/actions/plataforma.actions';
import { UpdateUserSchema } from '@/lib/validations/plataforma';
import type { UserRow, RoleRow } from '@/server/services/plataforma/user-admin.interface';
import { PapeisUtilizadorForm } from './papeis-utilizador-form';

// Schema composto para o formulário (inclui o id)
const EditarUtilizadorSchema = z.object({
  id: z.string().cuid(),
  data: UpdateUserSchema,
});

type EditarUtilizadorInput = z.infer<typeof EditarUtilizadorSchema>;

interface EditarUtilizadorFormProps {
  utilizador: UserRow;
  roles: RoleRow[];
}

const mesmoConjunto = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export function EditarUtilizadorForm({ utilizador, roles }: EditarUtilizadorFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [erroPapeis, setErroPapeis] = useState<string | null>(null);

  const papeisIniciais = utilizador.roles.map((r) => r.id);
  const [papeisEscolhidos, setPapeisEscolhidos] = useState<string[]>(papeisIniciais);
  const papeisDirty = !mesmoConjunto(papeisEscolhidos, papeisIniciais);

  const form = useForm<EditarUtilizadorInput>({
    resolver: zodResolver(EditarUtilizadorSchema),
    defaultValues: {
      id: utilizador.id,
      data: {
        nome: utilizador.nome,
        ativo: utilizador.ativo,
      },
    },
    mode: 'onBlur',
  });

  const submeter = async (formData: EditarUtilizadorInput) => {
    setErro(null);
    setErroPapeis(null);

    // Papéis primeiro: uma recusa (último administrador, delegação) não deixa nada gravado.
    if (papeisDirty) {
      const r = await atribuirRoles({ userId: utilizador.id, roleIds: papeisEscolhidos });
      if (!r.ok) {
        setErroPapeis(r.error.message);
        toast.error(r.error.message);
        return;
      }
    }

    if (form.formState.isDirty) {
      const r = await actualizarUtilizador(formData);
      if (!r.ok) {
        const details = r.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([field, messages]) => {
            form.setError(`data.${field}` as keyof EditarUtilizadorInput, {
              type: 'server',
              message: messages[0],
            });
          });
        } else {
          setErro(r.error.message);
          toast.error(r.error.message ?? 'Erro ao actualizar o utilizador.');
        }
        return;
      }
    }

    toast.success('Utilizador actualizado com sucesso!');
    router.push('/core-tenancy/utilizadores');
  };

  const onSubmit = form.handleSubmit((formData) => {
    startTransition(() => submeter(formData));
  });

  const isDirty = form.formState.isDirty || papeisDirty;

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
            <Button type="submit" size="sm" disabled={isPending || papeisEscolhidos.length === 0} onClick={onSubmit}>
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
            {/* E-mail e palavra-passe são da Identidade (Keycloak — ADR-0013):
                a palavra-passe gere-se lá; corrigir um e-mail é desactivar e
                convidar o endereço certo. */}
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" value={utilizador.email} disabled readOnly />
              </FormControl>
              <FormDescription>
                O e-mail identifica a conta e não é editável. A palavra-passe é gerida pelo próprio
                utilizador no serviço de identidade.
              </FormDescription>
            </FormItem>
          </div>

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

        <PapeisUtilizadorForm
          roles={roles}
          escolhidos={papeisEscolhidos}
          onChange={(ids) => {
            setPapeisEscolhidos(ids);
            setErroPapeis(null);
          }}
          erro={erroPapeis}
          disabled={isPending}
        />

        {erro && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {erro}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
