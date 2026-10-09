'use client';

/**
 * Formulário de criação de devolução — Client Component.
 */

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ComboboxRemoto } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { CampoProduto, type ProdutoOpcao } from '@/components/campos/campo-produto';
import { CampoCliente } from '../../../faturacao/_components/campo-cliente';
import { criarDevolucao, procurarVendas } from '@/server/actions/vendas.actions';
import { CreateDevolucaoSchema } from '@/lib/validations/vendas';
import type { CreateDevolucaoInput } from '@/lib/validations/vendas';

interface Props {
  clientesIniciais: ComboboxOption[];
  produtosIniciais: ProdutoOpcao[];
}

export function NovaDevolucaoForm({ clientesIniciais, produtosIniciais }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CreateDevolucaoInput>({
    resolver: zodResolver(CreateDevolucaoSchema),
    defaultValues: {
      clienteId: '',
      vendaId: undefined,
      faturaId: undefined,
      motivo: 'DEFEITO',
      reembolso: false,
      observacoes: '',
      itens: [
        {
          produtoId: '',
          nomeProduto: '',
          quantidade: 1,
          valorUnitario: 0,
          taxaIva: 0.16,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'itens',
  });
  const clienteId = useWatch({ control: form.control, name: 'clienteId' });

  // A venda procura-se pelo número, só entre as do cliente escolhido (#265).
  const buscarVendas = useCallback(
    async (q: string): Promise<ComboboxOption[] | null> => {
      const res = await procurarVendas({ q, clienteId: clienteId || undefined });
      return res.ok
        ? res.data.map((v) => ({ value: v.id, label: v.clienteNome ? `${v.numero} — ${v.clienteNome}` : v.numero }))
        : null;
    },
    [clienteId],
  );

  function onSubmit(data: CreateDevolucaoInput) {
    startTransition(async () => {
      const result = await criarDevolucao(data);
      if (result.ok) {
        toast.success('Devolução criada com sucesso');
        router.push('/vendas/devolucoes');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações da Devolução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="clienteId"
              render={({ field }) => (
                <CampoCliente
                  opcoesIniciais={clientesIniciais}
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    // A venda escolhida era do cliente anterior.
                    form.setValue('vendaId', undefined);
                  }}
                  erro={form.formState.errors.clienteId?.message}
                />
              )}
            />

            <div className="space-y-2">
              <Label htmlFor="vendaId">Venda (opcional)</Label>
              <Controller
                control={form.control}
                name="vendaId"
                render={({ field }) => (
                  <ComboboxRemoto
                    // Remonta ao trocar de cliente: a lista anterior era de outro cliente.
                    key={clienteId || 'sem-cliente'}
                    id="vendaId"
                    opcoesIniciais={[]}
                    procurar={buscarVendas}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Pesquisar pelo número da venda"
                    searchPlaceholder="Número da venda…"
                    emptyText="Escreva o número da venda."
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo *</Label>
              <Select
                defaultValue="DEFEITO"
                onValueChange={(v) =>
                  form.setValue('motivo', v as CreateDevolucaoInput['motivo'])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFEITO">Defeito</SelectItem>
                  <SelectItem value="PRODUTO_ERRADO">Produto errado</SelectItem>
                  <SelectItem value="INSATISFACAO">Insatisfação</SelectItem>
                  <SelectItem value="EXCESSO_PEDIDO">Excesso de pedido</SelectItem>
                  <SelectItem value="AVARIA_TRANSPORTE">Avaria no transporte</SelectItem>
                  <SelectItem value="OUTRO">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...form.register('reembolso')}
                  className="h-4 w-4"
                />
                Reembolso ao cliente
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              placeholder="Descrição detalhada da devolução…"
              {...form.register('observacoes')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Itens a Devolver</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                append({
                  produtoId: '',
                  nomeProduto: '',
                  quantidade: 1,
                  valorUnitario: 0,
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
              <div
                key={field.id}
                className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border rounded-md p-3"
              >
                <Controller
                  control={form.control}
                  name={`itens.${index}.produtoId`}
                  render={({ field: campo }) => (
                    <CampoProduto
                      id={`itens-${index}-produto`}
                      rotulo="Produto *"
                      className="col-span-2 space-y-1"
                      opcoesIniciais={produtosIniciais}
                      value={campo.value ?? ''}
                      onChange={(id, produto) => {
                        campo.onChange(id);
                        if (!produto) return;
                        form.setValue(`itens.${index}.nomeProduto`, produto.nome, { shouldDirty: true });
                        if (produto.precoVenda !== undefined) {
                          form.setValue(`itens.${index}.valorUnitario`, parseFloat(produto.precoVenda) || 0, {
                            shouldDirty: true,
                          });
                        }
                        if (produto.taxaIva !== undefined) {
                          form.setValue(`itens.${index}.taxaIva`, Number(produto.taxaIva), { shouldDirty: true });
                        }
                      }}
                      erro={form.formState.errors.itens?.[index]?.produtoId?.message}
                    />
                  )}
                />
                <div className="space-y-1">
                  <Label className="text-xs">Qtd.</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    {...form.register(`itens.${index}.quantidade`, {
                      valueAsNumber: true,
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor Unit. (MT)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    {...form.register(`itens.${index}.valorUnitario`, {
                      valueAsNumber: true,
                    })}
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
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/vendas/devolucoes')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Registar Devolução
        </Button>
      </div>
    </form>
  );
}
