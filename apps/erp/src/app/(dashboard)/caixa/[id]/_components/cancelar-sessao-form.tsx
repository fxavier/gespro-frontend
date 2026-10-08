'use client';

/**
 * Cancelamento de uma sessão de caixa só com a abertura (#146). O motivo é um campo, logo vive
 * nesta rota; o `AlertDialog` só confirma a acção destrutiva. Submit em `startTransition`.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { UnsavedChangesGuard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cancelarSessaoCaixa } from '@/server/actions/caixa.actions';
import { CancelarSessaoCaixaSchema, type CancelarSessaoCaixaInput } from '@/lib/validations/caixa';

export function CancelarSessaoForm({ sessaoId, numero }: { sessaoId: string; numero: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const [aConfirmar, setAConfirmar] = useState(false);
  const form = useForm<CancelarSessaoCaixaInput>({
    resolver: zodResolver(CancelarSessaoCaixaSchema),
    defaultValues: { sessaoCaixaId: sessaoId, motivo: '' },
  });

  const confirmar = () => {
    iniciarTransicao(async () => {
      const res = await cancelarSessaoCaixa(form.getValues());
      setAConfirmar(false);
      if (!res.ok) {
        toast.error(res.error.message ?? 'Erro ao cancelar a sessão.');
        return;
      }
      toast.success(`Sessão ${numero} cancelada.`);
      router.push(`/caixa/${sessaoId}`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
          <form
            onSubmit={form.handleSubmit(() => setAConfirmar(true))}
            className="space-y-4 max-w-lg"
            noValidate
          >
            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo *</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={500} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={aCorrer}>
                Cancelar sessão
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/caixa/${sessaoId}`}>Voltar</Link>
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>

      <AlertDialog open={aConfirmar} onOpenChange={setAConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a sessão {numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão fica CANCELADA e deixa de aceitar movimentos. Esta operação não se desfaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aCorrer}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
              disabled={aCorrer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {aCorrer ? 'A cancelar…' : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
