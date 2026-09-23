'use client';

/**
 * Formulário de abertura de exercício contabilístico.
 *
 * Padrão: useTransition + router.push após sucesso (CLAUDE.md «Server Action
 * que redirecciona, chamada pelo handleSubmit»). A action redireccionaria com
 * redirect() mas como revalida paths, segue o padrão EstornarForm: chamar
 * dentro de startTransition, depois router.push manualmente.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CalendarPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { AbrirExercicioSchema } from '@/lib/validations/contabilidade';
import type { AbrirExercicioInput } from '@/lib/validations/contabilidade';
import { abrirExercicio } from '@/server/actions/contabilidade.actions';

export function AbrirExercicioForm({ anoSugerido }: { anoSugerido: number }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const destino = '/contabilidade/exercicios';

  const form = useForm<AbrirExercicioInput>({
    resolver: zodResolver(AbrirExercicioSchema),
    defaultValues: { ano: anoSugerido },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await abrirExercicio(valores);

      if (!res.ok) {
        const details = res.error.details as
          | { fieldErrors?: Record<string, string[]> }
          | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([campo, erros]) => {
            form.setError(campo as keyof AbrirExercicioInput, {
              type: 'server',
              message: erros[0],
            });
          });
        } else {
          toast.error(res.error.message ?? 'Não foi possível abrir o exercício.');
        }
        return;
      }

      const { ano, seriesCriadas } = res.data;
      toast.success(
        seriesCriadas > 0
          ? `Exercício ${ano} aberto. ${seriesCriadas} série(s) de documento criadas.`
          : `Exercício ${ano} já existia — operação idempotente.`
      );
      router.push(destino);
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />

      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={aCorrer}
              onClick={() => router.push(destino)}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={aCorrer}
              onClick={onSubmit}
            >
              <CalendarPlus className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A abrir…' : 'Abrir exercício'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Ano do exercício"
          description="O exercício inclui os treze períodos (12 mensais + período de encerramento) e as séries de documento para o ano escolhido"
        >
          <FormField
            control={form.control}
            name="ano"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>Ano</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={2020}
                    max={2099}
                    {...field}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormDescription>
                  O cron abre automaticamente em Dezembro para o ano seguinte.
                  Use esta página para abrir um exercício manualmente — a operação
                  é idempotente e pode ser repetida sem riscos.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
