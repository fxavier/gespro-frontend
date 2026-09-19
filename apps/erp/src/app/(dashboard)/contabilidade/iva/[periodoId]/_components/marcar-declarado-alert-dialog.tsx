'use client';

/**
 * AlertDialog para marcar o apuramento como declarado à AT.
 *
 * AlertDialog é a única excepção à regra "sem modais" — apenas para
 * confirmações destrutivas/irreversíveis (ui-conventions §1).
 *
 * Esta acção é irreversível: depois de declarado, o período não pode ser
 * reaberto (ADR-0033 §7, ADR-0034 §7). O texto diz isso por palavras.
 *
 * Como a acção redireciona após o sucesso, usa useTransition (CLAUDE.md,
 * «Server Action que redirecciona, chamada pelo handleSubmit»).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MarcarDeclaradoSchema } from '@/lib/validations/apuramento-iva';
import type { MarcarDeclaradoInput } from '@/lib/validations/apuramento-iva';
import { marcarDeclaradoAction } from '@/server/actions/financas-iva.actions';

interface MarcarDeclaradoAlertDialogProps {
  apuramentoId: string;
  periodoCodigo: string;
}

export function MarcarDeclaradoAlertDialog({
  apuramentoId,
  periodoCodigo,
}: MarcarDeclaradoAlertDialogProps) {
  const [open, setOpen] = useState(false);
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();

  const form = useForm<MarcarDeclaradoInput>({
    resolver: zodResolver(MarcarDeclaradoSchema),
    defaultValues: {
      apuramentoId,
      declaradoEm: undefined,
      referenciaEntrega: '',
    },
  });

  function onSubmit(valores: MarcarDeclaradoInput) {
    iniciarTransicao(async () => {
      const res = await marcarDeclaradoAction(valores);
      if (!res.ok) {
        toast.error(res.error?.message ?? 'Erro ao marcar como declarado');
        return;
      }
      toast.success('Apuramento marcado como declarado à AT');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="default">
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Marcar declarado
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Declarar à AT — período {periodoCodigo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Está prestes a registar que este apuramento foi entregue à
                Autoridade Tributária.
              </p>
              <p className="font-medium text-foreground">
                Esta acção é irreversível e tranca a reabertura do período.
              </p>
              <p className="text-muted-foreground">
                Após declarar, não é possível reabrir o período para corrigir
                lançamentos. Qualquer correcção terá de ser feita como
                regularização no período seguinte, nas contas 44341/44342 — que
                é o que a Declaração Periódica prevê (ADR-0034 §7).
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <input type="hidden" {...form.register('apuramentoId')} />

            <FormField
              control={form.control}
              name="declaradoEm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de entrega à AT</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={
                        field.value
                          ? field.value instanceof Date
                            ? field.value.toISOString().split('T')[0]
                            : String(field.value)
                          : ''
                      }
                      onChange={(e) => {
                        const [ano, mes, dia] = e.target.value.split('-').map(Number);
                        if (ano && mes && dia) {
                          field.onChange(new Date(ano, mes - 1, dia, 12));
                        } else {
                          field.onChange(undefined);
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="referenciaEntrega"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referência da entrega</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Número de referência ou recibo da AT"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AlertDialogFooter className="pt-2">
              <AlertDialogCancel disabled={aCorrer}>Cancelar</AlertDialogCancel>
              <Button type="submit" disabled={aCorrer}>
                {aCorrer ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    A registar…
                  </>
                ) : (
                  'Confirmar declaração'
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
