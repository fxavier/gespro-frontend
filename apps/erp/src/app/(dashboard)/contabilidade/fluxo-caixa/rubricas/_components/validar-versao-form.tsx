'use client';

/**
 * Validar a versão actual do mapeamento (ADR-0037 E1, V3, E5). A observação é
 * um campo de texto, logo é formulário numa rota própria — não um
 * `AlertDialog`. O id da versão vem da página: o parecer fica preso à versão
 * que o utilizador viu, e se entretanto outra a ultrapassou o serviço recusa
 * com `VERSAO_DESACTUALIZADA` em vez de validar a errada.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import { ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { validarVersaoAction } from '@/server/actions/fluxo-caixa.actions';
import { ValidarVersaoSchema } from '@/lib/validations/fluxo-caixa';
import { ROTA_RUBRICAS } from './rotulos';

type Valores = z.input<typeof ValidarVersaoSchema>;

export function ValidarVersaoForm({ versaoId, numero, voltar }: { versaoId: string; numero: number; voltar: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const destino = voltar ?? ROTA_RUBRICAS;

  const form = useForm<Valores>({
    resolver: zodResolver(ValidarVersaoSchema),
    defaultValues: { versaoId, observacao: '' },
  });

  const onSubmit = form.handleSubmit((valores) => {
    const dados = ValidarVersaoSchema.parse(valores);
    startTransition(async () => {
      const res = await validarVersaoAction(dados);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors?.observacao) {
          form.setError('observacao', { type: 'server', message: details.fieldErrors.observacao[0] });
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      toast.success(`Versão ${numero} do mapeamento validada.`);
      form.reset(valores);
      await navegarDepoisDaAccao(router, destino);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => router.push(destino)}>
              <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit} data-testid="validar-versao">
              <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isPending ? 'A validar…' : `Validar a versão ${numero}`}
            </Button>
          </>
        }
      >
        <FormSection
          title="Parecer"
          description="A validação fica registada com o seu nome e a data, e presa a esta versão: qualquer alteração posterior cria outra versão, por validar."
        >
          <FormField
            control={form.control}
            name="observacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observação (opcional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    maxLength={1000}
                    placeholder="ex.: Classificação conforme o Decreto 70/2009, sem reservas."
                    data-testid="validar-observacao"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Até 1000 caracteres.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
