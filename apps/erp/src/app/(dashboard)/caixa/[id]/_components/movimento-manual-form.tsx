'use client';

/**
 * Sangria / reforço de uma sessão de caixa aberta (#146) — formulário em rota dedicada.
 * Padrão: react-hook-form + zodResolver com o MESMO schema da action, submit em `startTransition`.
 */
import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { UnsavedChangesGuard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { registarReforco, registarSangria } from '@/server/actions/caixa.actions';
import { SangriaSchema, type SangriaInput } from '@/lib/validations/caixa';

type Tipo = 'sangria' | 'reforco';

const TEXTOS: Record<Tipo, { botao: string; sucesso: string; erro: string }> = {
  sangria: { botao: 'Registar sangria', sucesso: 'Sangria registada.', erro: 'Erro ao registar a sangria.' },
  reforco: { botao: 'Registar reforço', sucesso: 'Reforço registado.', erro: 'Erro ao registar o reforço.' },
};

export function MovimentoManualForm({ sessaoId, tipo }: { sessaoId: string; tipo: Tipo }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const textos = TEXTOS[tipo];
  // SangriaSchema e ReforcoSchema têm a mesma forma; a action escolhida valida com o seu.
  const form = useForm<SangriaInput>({
    resolver: zodResolver(SangriaSchema),
    defaultValues: { sessaoCaixaId: sessaoId, valor: 0, motivo: '' },
  });

  const submeter = (dados: SangriaInput) => {
    iniciarTransicao(async () => {
      const res = tipo === 'sangria' ? await registarSangria(dados) : await registarReforco(dados);
      if (!res.ok) {
        toast.error(res.error.message ?? textos.erro);
        return;
      }
      toast.success(textos.sucesso);
      router.push(`/caixa/${sessaoId}`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
          <form onSubmit={form.handleSubmit(submeter)} className="space-y-4 max-w-lg" noValidate>
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (MZN) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                  <FormLabel>Motivo *</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={255} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={aCorrer}>
                {aCorrer ? 'A registar…' : textos.botao}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/caixa/${sessaoId}`}>Voltar</Link>
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
