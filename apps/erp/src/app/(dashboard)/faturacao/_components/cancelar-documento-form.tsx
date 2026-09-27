'use client';

/**
 * Cancelar um documento de faturação — NC, proforma ou cotação (#148).
 *
 * Recolhe o motivo, por isso é rota e não modal. O schema é o MESMO da action
 * (`CancelarDocumentoSchema`: motivo de 3 a 500 caracteres); o motivo vai para
 * `motivoCancelamento` e as observações do documento ficam intactas.
 *
 * Submissão por `useTransition` + `navegarDepoisDaAccao`: a action revalida e
 * a página de origem passa a renderizar outro ramo (documento já cancelado).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Ban, X } from 'lucide-react';
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
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import { CancelarDocumentoSchema, type CancelarDocumentoInput } from '@/lib/validations/faturacao';
import {
  cancelarCotacaoComercial,
  cancelarNotaCredito,
  cancelarProforma,
} from '@/server/actions/faturacao.actions';

export type TipoDocumentoCancelavel = 'nota-credito' | 'proforma' | 'cotacao';

const ACCAO = {
  'nota-credito': cancelarNotaCredito,
  proforma: cancelarProforma,
  cotacao: cancelarCotacaoComercial,
} as const;

const NOME: Record<TipoDocumentoCancelavel, string> = {
  'nota-credito': 'nota de crédito',
  proforma: 'proforma',
  cotacao: 'cotação',
};

interface Props {
  tipo: TipoDocumentoCancelavel;
  id: string;
  numero: string;
  /** Para onde se volta — o detalhe do documento. */
  destino: string;
  /** Consequência que o utilizador tem de ler antes de confirmar. */
  aviso?: string;
}

export function CancelarDocumentoForm({ tipo, id, numero, destino, aviso }: Props) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const nome = NOME[tipo];

  const form = useForm<CancelarDocumentoInput>({
    resolver: zodResolver(CancelarDocumentoSchema),
    defaultValues: { id, motivo: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await ACCAO[tipo](valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erroMotivo = details?.fieldErrors?.motivo?.[0];
        if (erroMotivo) {
          form.setError('motivo', { type: 'server', message: erroMotivo }, { shouldFocus: true });
        } else {
          form.setError('root.servidor', { type: res.error.code, message: res.error.message });
          toast.error(res.error.message ?? `Não foi possível cancelar a ${nome}.`);
        }
        return;
      }
      toast.success(`${numero} cancelada.`);
      form.reset(form.getValues());
      await navegarDepoisDaAccao(router, destino);
    });
  });

  const erroServidor = form.formState.errors.root?.servidor?.message;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />

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
              <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Voltar
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={aCorrer} onClick={onSubmit}>
              <Ban className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {aCorrer ? 'A cancelar…' : `Cancelar ${nome}`}
            </Button>
          </>
        }
      >
        {erroServidor && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="cancelar-erro-servidor"
          >
            {erroServidor}
          </p>
        )}

        {aviso && (
          <p
            className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
            data-testid="cancelar-aviso"
          >
            {aviso}
          </p>
        )}

        <FormSection
          title="Cancelamento"
          description={`A ${nome} fica CANCELADA e deixa de poder avançar. Nada se apaga: o documento e o motivo ficam no histórico.`}
        >
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="ex.: emitido por engano; o cliente desistiu da compra"
                    className="min-h-[100px] resize-none"
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Obrigatório, entre 3 e 500 caracteres. Fica no documento, separado das observações.
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
