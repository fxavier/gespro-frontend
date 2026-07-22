'use client';

/**
 * Formulário de criação de encomenda — Client Component.
 * Submit via Server Action criarEncomenda; fieldErrors do servidor aplicados com setError.
 */

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { criarEncomenda } from '@/server/actions/vendas.actions';
import { CreateEncomendaSchema } from '@/lib/validations/vendas';
import type { CreateEncomendaInput } from '@/lib/validations/vendas';

export function NovaEncomendaForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CreateEncomendaInput>({
    resolver: zodResolver(CreateEncomendaSchema),
    defaultValues: {
      clienteId: '',
      vendedorId: undefined,
      dataPrevista: undefined,
      notas: '',
      itens: [
        {
          produtoId: '',
          nomeProduto: '',
          quantidade: 1,
          precoUnitario: 0,
          desconto: 0,
          taxaIva: 0.16,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'itens',
  });

  function onSubmit(data: CreateEncomendaInput) {
    startTransition(async () => {
      const result = await criarEncomenda(data);
      if (result.ok) {
        toast.success('Encomenda criada com sucesso');
        router.push('/vendas/pedidos');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações da Encomenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clienteId">ID do Cliente *</Label>
              <Input
                id="clienteId"
                placeholder="cuid do cliente"
                {...form.register('clienteId')}
              />
              {form.formState.errors.clienteId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.clienteId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendedorId">ID do Vendedor</Label>
              <Input
                id="vendedorId"
                placeholder="cuid do vendedor (opcional)"
                {...form.register('vendedorId')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataPrevista">Data Prevista de Entrega</Label>
              <Input
                id="dataPrevista"
                type="date"
                {...form.register('dataPrevista')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              placeholder="Observações adicionais…"
              {...form.register('notas')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Itens da Encomenda</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                append({
                  produtoId: '',
                  nomeProduto: '',
                  quantidade: 1,
                  precoUnitario: 0,
                  desconto: 0,
                  taxaIva: 0.16,
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border rounded-md p-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Produto (ID)</Label>
                  <Input
                    placeholder="cuid produto"
                    {...form.register(`itens.${index}.produtoId`)}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Nome do Produto</Label>
                  <Input
                    placeholder="Nome"
                    {...form.register(`itens.${index}.nomeProduto`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qtd.</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    {...form.register(`itens.${index}.quantidade`, { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preço Unit. (MT)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    {...form.register(`itens.${index}.precoUnitario`, { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Desconto (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    {...form.register(`itens.${index}.desconto`, { valueAsNumber: true })}
                  />
                </div>
                <div className="flex items-end">
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {form.formState.errors.itens?.root && (
            <p className="text-sm text-destructive mt-2">
              {form.formState.errors.itens.root.message}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/vendas/pedidos')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Encomenda
        </Button>
      </div>
    </form>
  );
}
