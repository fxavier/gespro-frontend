'use client';

/**
 * Formulário de criação de vendedor — Client Component.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { criarVendedor } from '@/server/actions/vendas.actions';
import { CreateVendedorSchema } from '@/lib/validations/vendas';
import type { CreateVendedorInput } from '@/lib/validations/vendas';

export function NovoVendedorForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CreateVendedorInput>({
    resolver: zodResolver(CreateVendedorSchema),
    defaultValues: {
      nome: '',
      email: undefined,
      telefone: undefined,
      metaMensal: undefined,
      observacoes: '',
    },
  });

  function onSubmit(data: CreateVendedorInput) {
    startTransition(async () => {
      const result = await criarVendedor(data);
      if (result.ok) {
        toast.success('Vendedor criado com sucesso');
        router.push(`/vendas/vendedores/${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações do Vendedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                placeholder="Nome completo do vendedor"
                {...form.register('nome')}
              />
              {form.formState.errors.nome && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.nome.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.mz"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                placeholder="+258 84 000 0000"
                {...form.register('telefone')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaMensal">Meta Mensal (MT)</Label>
              <Input
                id="metaMensal"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                {...form.register('metaMensal', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              placeholder="Notas adicionais sobre o vendedor…"
              {...form.register('observacoes')}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/vendas/vendedores')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Vendedor
        </Button>
      </div>
    </form>
  );
}
