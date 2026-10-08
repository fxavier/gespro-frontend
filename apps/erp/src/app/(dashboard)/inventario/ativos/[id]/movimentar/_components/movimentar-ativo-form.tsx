'use client';

/**
 * Formulário de transferência de um ativo (#118).
 *
 * react-hook-form + zodResolver com o MESMO schema da action
 * (`MovimentacaoAtivoCreateSchema`). A origem não vai no pedido: o servidor lê-a do ativo.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowRightLeft, X } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ComboboxRemoto, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { MovimentacaoAtivoCreateSchema } from '@/lib/validations/inventario-ativos';
import {
  procurarLocalizacoesDestinoAction,
  procurarResponsaveisAtivoAction,
  registarMovimentacaoAtivoAction,
} from '@/server/actions/inventario.actions';

type Entrada = z.input<typeof MovimentacaoAtivoCreateSchema>;
type Dados = z.output<typeof MovimentacaoAtivoCreateSchema>;

const rotulo = (o: { nome: string; detalhe: string | null }) => (o.detalhe ? `${o.nome} (${o.detalhe})` : o.nome);

interface Props {
  ativoId: string;
  localizacaoActual: string | null;
  responsavelActual: string | null;
  localizacoesIniciais: ComboboxOption[];
  responsaveisIniciais: ComboboxOption[];
}

export function MovimentarAtivoForm({
  ativoId,
  localizacaoActual,
  responsavelActual,
  localizacoesIniciais,
  responsaveisIniciais,
}: Props) {
  const router = useRouter();
  const [aGravar, iniciarTransicao] = useTransition();

  const form = useForm<Entrada, unknown, Dados>({
    resolver: zodResolver(MovimentacaoAtivoCreateSchema),
    defaultValues: {
      ativoId,
      tipo: 'TRANSFERENCIA',
      dataMovimentacao: new Date(),
      motivo: '',
    },
  });

  const procurarLocalizacoes = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarLocalizacoesDestinoAction({ q });
    return r.ok ? r.data.map((l) => ({ value: l.id, label: rotulo(l) })) : null;
  };
  const procurarResponsaveis = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarResponsaveisAtivoAction({ q });
    return r.ok ? r.data.map((u) => ({ value: u.id, label: rotulo(u) })) : null;
  };

  const onSubmit = form.handleSubmit((dados) => {
    iniciarTransicao(async () => {
      const res = await registarMovimentacaoAtivoAction({ ...dados, dataMovimentacao: new Date() });
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([campo, mensagens]) => {
            form.setError(campo as keyof Entrada, { type: 'server', message: mensagens[0] });
          });
        } else {
          toast.error(res.error.message ?? 'Não foi possível registar a movimentação.');
        }
        return;
      }
      toast.success('Movimentação registada.');
      form.reset(form.getValues());
      router.push(`/inventario/ativos/${ativoId}`);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aGravar} />
      <form onSubmit={onSubmit} noValidate>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => router.push(`/inventario/ativos/${ativoId}`)}>
                <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Cancelar
              </Button>
              <Button type="submit" disabled={aGravar}>
                <ArrowRightLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {aGravar ? 'A registar…' : 'Registar movimentação'}
              </Button>
            </>
          }
        >
          <FormSection
            title="Transferência"
            description={`Origem: ${localizacaoActual ?? 'localização actual'}${responsavelActual ? ` · responsável ${responsavelActual}` : ''}. Indique o destino — localização, responsável ou ambos.`}
          >
            <FormField
              control={form.control}
              name="localizacaoDestinoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização de destino</FormLabel>
                  <FormControl>
                    <ComboboxRemoto
                      aria-label="Localização de destino"
                      opcoesIniciais={localizacoesIniciais}
                      procurar={procurarLocalizacoes}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v || undefined)}
                      placeholder="Seleccionar localização…"
                      emptyText="Nenhuma localização encontrada"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="responsavelDestinoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável de destino</FormLabel>
                  <FormControl>
                    <ComboboxRemoto
                      aria-label="Responsável de destino"
                      opcoesIniciais={responsaveisIniciais}
                      procurar={procurarResponsaveis}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v || undefined)}
                      placeholder="Manter o responsável actual"
                      emptyText="Nenhum utilizador encontrado"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} maxLength={500} className="resize-none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                      rows={3}
                      maxLength={2000}
                      className="resize-none"
                    />
                  </FormControl>
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
