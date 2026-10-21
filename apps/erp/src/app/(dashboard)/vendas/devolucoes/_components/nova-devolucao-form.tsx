'use client';

/**
 * Formulário de criação de devolução — Client Component.
 *
 * #562: com uma venda facturada, os itens vêm da factura (preço e taxa só de leitura, quantidade
 * até facturado − já creditado); o operador escolhe quais devolve e quantos. Sem factura não há
 * nota de crédito, logo não há reembolso — só reentrada de stock, com itens à mão.
 */

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
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
import { criarDevolucao, obterLinhasDevolviveis, procurarVendas } from '@/server/actions/vendas.actions';
import { CreateDevolucaoSchema } from '@/lib/validations/vendas';
import type { CreateDevolucaoInput } from '@/lib/validations/vendas';
import type { LinhasDevolviveis } from '@/server/services/comercial/devolucao.service';
import { formatMZN } from '@/lib/format-currency';

interface Props {
  clientesIniciais: ComboboxOption[];
  produtosIniciais: ProdutoOpcao[];
}

const ITEM_VAZIO = { produtoId: '', nomeProduto: '', quantidade: 1, valorUnitario: 0, taxaIva: 0.16 };

export function NovaDevolucaoForm({ clientesIniciais, produtosIniciais }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /** Factura da venda escolhida: `undefined` sem venda, `faturaId: null` quando a venda não tem. */
  const [factura, setFactura] = useState<LinhasDevolviveis | undefined>(undefined);
  const [aCarregar, setACarregar] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);

  const form = useForm<z.input<typeof CreateDevolucaoSchema>, unknown, CreateDevolucaoInput>({
    resolver: zodResolver(CreateDevolucaoSchema),
    defaultValues: {
      clienteId: '',
      vendaId: undefined,
      faturaId: undefined,
      motivo: 'DEFEITO',
      reembolso: false,
      observacoes: '',
      itens: [ITEM_VAZIO],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'itens',
  });
  const clienteId = useWatch({ control: form.control, name: 'clienteId' });
  const comFactura = Boolean(factura?.faturaId);
  const linhaDe = (produtoId: string, valorUnitario: number) =>
    factura?.linhas.find((l) => l.produtoId === produtoId && Number(l.valorUnitario) === valorUnitario);

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

  function semVenda() {
    setFactura(undefined);
    form.setValue('vendaId', undefined);
    form.setValue('faturaId', undefined);
    form.setValue('reembolso', false);
    replace([ITEM_VAZIO]);
  }

  async function escolherVenda(vendaId: string) {
    form.setValue('vendaId', vendaId || undefined);
    setErroServidor(null);
    if (!vendaId) return semVenda();
    setACarregar(true);
    const res = await obterLinhasDevolviveis({ vendaId });
    setACarregar(false);
    if (!res.ok) {
      setErroServidor(res.error.message);
      return;
    }
    setFactura(res.data);
    form.setValue('faturaId', res.data.faturaId ?? undefined);
    if (!res.data.faturaId) {
      form.setValue('reembolso', false);
      replace([ITEM_VAZIO]);
      return;
    }
    replace(
      res.data.linhas
        .filter((l) => Number(l.quantidadeDevolvivel) > 0)
        .map((l) => ({
          produtoId: l.produtoId,
          nomeProduto: l.descricao,
          quantidade: Number(l.quantidadeDevolvivel),
          valorUnitario: Number(l.valorUnitario),
          taxaIva: Number(l.taxaIva),
        })),
    );
  }

  function onSubmit(data: CreateDevolucaoInput) {
    setErroServidor(null);
    startTransition(async () => {
      const result = await criarDevolucao(data);
      if (result.ok) {
        toast.success('Devolução criada com sucesso');
        router.push('/vendas/devolucoes');
      } else {
        setErroServidor(result.error.message);
        toast.error(result.error.message);
      }
    });
  }

  const erroItens = form.formState.errors.itens;

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
                    semVenda();
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
                    onChange={(id) => void escolherVenda(id)}
                    placeholder="Pesquisar pelo número da venda"
                    searchPlaceholder="Número da venda…"
                    emptyText="Escreva o número da venda."
                  />
                )}
              />
              {aCarregar && <p className="text-xs text-muted-foreground">A carregar a factura da venda…</p>}
              {factura?.faturaNumero && (
                <p className="text-xs text-muted-foreground">Factura de origem: {factura.faturaNumero}</p>
              )}
              {factura && !factura.faturaId && (
                <p className="text-xs text-muted-foreground" role="status">
                  Esta venda não tem factura: não há nota de crédito nem reembolso, só reentrada de stock.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo *</Label>
              <Select
                defaultValue="DEFEITO"
                onValueChange={(v) =>
                  form.setValue('motivo', v as CreateDevolucaoInput['motivo'])
                }
              >
                <SelectTrigger id="motivo">
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
                  disabled={!comFactura}
                  className="h-4 w-4"
                />
                Reembolso ao cliente
              </Label>
              {!comFactura && (
                <p className="text-xs text-muted-foreground">
                  O reembolso sai pela nota de crédito: escolha uma venda com factura.
                </p>
              )}
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
            {!comFactura && (
              <Button type="button" size="sm" variant="outline" onClick={() => append(ITEM_VAZIO)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {comFactura && fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Tudo o que foi facturado nesta venda já foi creditado: não há nada a devolver.
              </p>
            )}
            {fields.map((field, index) => {
              const linha = comFactura ? linhaDe(field.produtoId, field.valorUnitario) : undefined;
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border rounded-md p-3"
                >
                  {linha ? (
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Produto</Label>
                      <p className="text-sm">{linha.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMZN(linha.valorUnitario)} · IVA {Math.round(Number(linha.taxaIva) * 100)}% · até{' '}
                        {linha.quantidadeDevolvivel} de {linha.quantidadeFacturada} facturados
                      </p>
                    </div>
                  ) : (
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
                          erro={erroItens?.[index]?.produtoId?.message}
                        />
                      )}
                    />
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor={`itens-${index}-quantidade`}>
                      Qtd.
                    </Label>
                    <Input
                      id={`itens-${index}-quantidade`}
                      type="number"
                      min="0.01"
                      max={linha?.quantidadeDevolvivel}
                      step="0.01"
                      aria-invalid={Boolean(erroItens?.[index]?.quantidade)}
                      {...form.register(`itens.${index}.quantidade`, {
                        valueAsNumber: true,
                      })}
                    />
                    {erroItens?.[index]?.quantidade && (
                      <p className="text-xs text-destructive" role="alert">
                        {erroItens[index]?.quantidade?.message}
                      </p>
                    )}
                  </div>
                  {!linha && (
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor={`itens-${index}-valor`}>
                        Valor Unit. (MT)
                      </Label>
                      <Input
                        id={`itens-${index}-valor`}
                        type="number"
                        min="0"
                        step="0.01"
                        {...form.register(`itens.${index}.valorUnitario`, {
                          valueAsNumber: true,
                        })}
                      />
                    </div>
                  )}
                  <div className="flex items-end">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Não devolver ${linha?.descricao ?? 'este item'}`}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {erroItens?.message && (
              <p className="text-sm text-destructive" role="alert">
                {erroItens.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {erroServidor && (
        <p className="text-sm text-destructive" role="alert">
          {erroServidor}
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/vendas/devolucoes')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || aCarregar || (comFactura && fields.length === 0)}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Registar Devolução
        </Button>
      </div>
    </form>
  );
}
