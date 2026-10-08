'use client';

/**
 * Formulário de edição de vendedor (#131) — Client Component.
 * O estado «Activo» reactiva um vendedor desactivado.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { UnsavedChangesGuard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { atualizarVendedor } from '@/server/actions/vendas.actions';
import { UpdateVendedorSchema } from '@/lib/validations/vendas';
import type { UpdateVendedorInput } from '@/lib/validations/vendas';

const ESTADOS = [
  { value: 'ATIVO', label: 'Activo' },
  { value: 'INATIVO', label: 'Inactivo' },
  { value: 'SUSPENSO', label: 'Suspenso' },
] as const;

/** Campo de texto opcional: vazio grava `null`, não uma string vazia. */
const vazioNulo = (v: unknown) => (v === '' || v == null ? null : v);

interface Props {
  id: string;
  valores: UpdateVendedorInput;
}

export function EditarVendedorForm({ id, valores }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const perfil = `/vendas/vendedores/${id}`;

  const form = useForm<UpdateVendedorInput>({
    resolver: zodResolver(UpdateVendedorSchema),
    defaultValues: valores,
  });

  function onSubmit(data: UpdateVendedorInput) {
    startTransition(async () => {
      const result = await atualizarVendedor({ id, data });
      if (result.ok) {
        toast.success('Vendedor actualizado');
        router.push(perfil);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const erros = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />
      <Card>
        <CardHeader>
          <CardTitle>Informações do Vendedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" aria-invalid={!!erros.nome} {...form.register('nome')} />
              {erros.nome && <p className="text-sm text-destructive">{erros.nome.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!erros.email}
                {...form.register('email', { setValueAs: vazioNulo })}
              />
              {erros.email && <p className="text-sm text-destructive">{erros.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" {...form.register('telefone', { setValueAs: vazioNulo })} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaMensal">Meta Mensal (MT)</Label>
              <Input
                id="metaMensal"
                type="number"
                min="0"
                step="0.01"
                aria-invalid={!!erros.metaMensal}
                {...form.register('metaMensal', {
                  setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                })}
              />
              {erros.metaMensal && (
                <p className="text-sm text-destructive">{erros.metaMensal.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Escolha o estado">
                        {ESTADOS.find((e) => e.value === field.value)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" {...form.register('observacoes', { setValueAs: vazioNulo })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(perfil)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar alterações
        </Button>
      </div>
    </form>
  );
}
