'use client';

/**
 * Formulário de criação de Equipa — CLIENT COMPONENT.
 * Padrão: useActionState + FormPage(actions=…) + UnsavedChangesGuard standalone.
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, UnsavedChangesGuard } from '@/components/patterns';
import { criarEquipaAction } from '@/server/actions/projetos.actions';
import { CreateEquipaSchema } from '@/lib/validations/projetos';
import type { z } from 'zod';

type FormValues = z.infer<typeof CreateEquipaSchema>;
type ActionState = { ok: true; data: { id: string } } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

export function NovaEquipaForm() {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    (_prev, data) => criarEquipaAction(data) as Promise<ActionState>,
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(CreateEquipaSchema),
    defaultValues: {
      nome: '',
      descricao: '',
      status: 'ATIVA',
    },
  });

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      toast.error(state.error.message ?? 'Erro ao criar equipa.');
    } else {
      toast.success('Equipa criada com sucesso.');
      router.push('/projetos/equipa');
    }
  }, [state, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const handleCancel = () => {
    if (isDirty) {
      if (!window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) return;
    }
    router.push('/projetos/equipa');
  };

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <Form {...form}>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
                <Save className="h-4 w-4 mr-1.5" />
                {isPending ? 'A criar…' : 'Criar Equipa'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4 max-w-lg">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Equipa de Desenvolvimento" maxLength={100} {...field} />
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
                      placeholder="Descrição opcional da equipa…"
                      maxLength={500}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormPage>
      </Form>
    </>
  );
}
