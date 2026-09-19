'use client';

/**
 * Formulário de estorno de apuramento de IVA.
 *
 * Exige motivo mínimo de 10 caracteres (schema EstornarApuramentoSchema).
 * O estorno cria o lançamento de inversão e avança a versão do apuramento.
 * Fica o rasto das duas versões para auditoria.
 *
 * useTransition obrigatório para que o redirect() do servidor seja aplicado.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { RotateCcw, Loader2, Info, X } from 'lucide-react';
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
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { EstornarApuramentoSchema } from '@/lib/validations/apuramento-iva';
import type { EstornarApuramentoInput } from '@/lib/validations/apuramento-iva';
import { estornarApuramentoAction } from '@/server/actions/financas-iva.actions';

interface EstornarApuramentoFormProps {
  apuramentoId: string;
  versao: number;
  periodoCodigo: string;
  periodoId: string;
}

export function EstornarApuramentoForm({
  apuramentoId,
  versao,
  periodoCodigo,
  periodoId,
}: EstornarApuramentoFormProps) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();

  const form = useForm<EstornarApuramentoInput>({
    resolver: zodResolver(EstornarApuramentoSchema),
    defaultValues: {
      apuramentoId,
      motivo: '',
    },
    mode: 'onBlur',
  });

  function onSubmit(valores: EstornarApuramentoInput) {
    iniciarTransicao(async () => {
      const res = await estornarApuramentoAction(valores);
      if (!res.ok) {
        toast.error(res.error?.message ?? 'Erro ao estornar apuramento');
        return;
      }
      toast.success(
        `Apuramento v${versao} estornado. Pode agora apurar o período novamente.`
      );
      router.push(`/contabilidade/iva/${periodoId}`);
    });
  }

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !form.formState.isSubmitSuccessful} />

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormPage
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push(`/contabilidade/iva/${periodoId}`)}
                disabled={aCorrer}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" disabled={aCorrer} size="sm">
                {aCorrer ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    A estornar…
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Estornar apuramento
                  </>
                )}
              </Button>
            </>
          }
        >
          <FormSection
            title="Motivo do estorno"
            description="O motivo fica registado no trilho de auditoria"
          >
            <div className="flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm mb-4">
              <Info className="h-4 w-4 mt-0.5 text-info shrink-0" />
              <div className="space-y-1 text-muted-foreground">
                <p>
                  O estorno cancela o lançamento contabilístico do apuramento actual
                  (v{versao}) e permite executar um novo cálculo (versão {versao + 1}).
                </p>
                <p>
                  Ficam gravadas as duas versões para efeitos de auditoria —
                  nada é apagado.
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (mínimo 10 caracteres)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Descreva o motivo do estorno — por exemplo: lançamentos em falta no período, correcção de taxa, etc."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    O motivo fica associado ao registo de estorno e é visível no
                    detalhe do lançamento.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
        </FormPage>
      </form>
    </Form>
  );
}
