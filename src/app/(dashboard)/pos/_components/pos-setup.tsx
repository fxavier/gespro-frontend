'use client';

/**
 * POSSetup — mostrado quando não há sessão POS activa.
 * Formulário simples para abrir uma sessão fornecendo o ID da sessão de caixa.
 * Sem modais; formulário inline (segue regra "zero Dialog").
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { MonitorPlay, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { abrirSessaoPOS } from '@/server/actions/vendas.actions';

const FormSchema = z.object({
  sessaoCaixaId: z.string().min(1, 'ID da sessão de caixa obrigatório'),
});

type FormValues = z.infer<typeof FormSchema>;

export function POSSetup() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { sessaoCaixaId: '' },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await abrirSessaoPOS({ sessaoCaixaId: values.sessaoCaixaId });
      if (result.ok) {
        toast.success('Sessão POS iniciada. Bem-vindo ao terminal!');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao abrir sessão POS.');
      }
    });
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <MonitorPlay className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Nenhuma sessão POS activa</h1>
          <p className="text-muted-foreground text-sm">
            Para iniciar vendas no POS, é necessário ter uma sessão de caixa aberta
            e iniciar uma sessão POS.
          </p>
        </div>

        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold">Iniciar sessão POS</h2>
          <p className="text-sm text-muted-foreground">
            Certifique-se de que a sessão de caixa está aberta em{' '}
            <strong>Finanças &gt; Caixa</strong> antes de continuar.
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="sessaoCaixaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID da Sessão de Caixa</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="cuid da sessão de caixa"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Obtido no módulo Finanças &gt; Caixa ao abrir uma sessão.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Iniciar Sessão POS
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
