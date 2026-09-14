'use client';

/**
 * Formulário de criação de encomenda — Client Component.
 *
 * Cliente, vendedor e produto escolhem-se por caixa de pesquisa, não por cuid
 * escrito à mão. O nome e o SKU do produto deixaram de ser campos livres: eram
 * dois sítios a dizer a mesma coisa e nada garantia que dissessem o mesmo.
 */

import { useCallback, useRef, useState, useTransition } from 'react';
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
import { ComboboxRemoto, type ComboboxOption } from '@/components/patterns';
import {
  criarEncomenda,
  procurarProdutos,
  procurarVendedores,
} from '@/server/actions/vendas.actions';
import { procurarClientes } from '@/server/actions/clientes.actions';
import { CreateEncomendaSchema } from '@/lib/validations/vendas';
import type { CreateEncomendaInput } from '@/lib/validations/vendas';
import { formatMZN } from '@/lib/format-currency';

export interface ClienteOpcao {
  id: string;
  codigo: string;
  nome: string;
}

export interface VendedorOpcao {
  id: string;
  nome: string;
}

export interface ProdutoOpcao {
  id: string;
  nome: string;
  sku: string;
  precoVenda: string;
  taxaIva: string;
}

const LINHA_VAZIA = {
  produtoId: '',
  nomeProduto: '',
  quantidade: 1,
  precoUnitario: 0,
  desconto: 0,
  taxaIva: 0.16,
};

const rotuloCliente = (c: ClienteOpcao) => `${c.codigo} — ${c.nome}`;
const rotuloProduto = (p: ProdutoOpcao) => `${p.sku} — ${p.nome}`;

export function NovaEncomendaForm({
  clientesIniciais,
  vendedoresIniciais,
  produtosIniciais,
}: {
  clientesIniciais: ClienteOpcao[];
  vendedoresIniciais: VendedorOpcao[];
  produtosIniciais: ProdutoOpcao[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Guarda os produtos já vistos (primeira página + resultados de pesquisa):
  // ao escolher um, é daqui que saem o nome, o SKU e o preço.
  const catalogo = useRef(new Map(produtosIniciais.map((p) => [p.id, p])));

  const form = useForm<CreateEncomendaInput>({
    resolver: zodResolver(CreateEncomendaSchema),
    defaultValues: {
      clienteId: '',
      vendedorId: undefined,
      dataPrevista: undefined,
      notas: '',
      itens: [{ ...LINHA_VAZIA }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'itens' });
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');

  const buscarClientes = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarClientes({ q });
    return res.ok ? res.data.map((c) => ({ value: c.id, label: rotuloCliente(c) })) : null;
  }, []);

  const buscarVendedores = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarVendedores({ q });
    return res.ok ? res.data.map((v) => ({ value: v.id, label: v.nome })) : null;
  }, []);

  const buscarProdutos = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarProdutos({ q });
    if (!res.ok) return null;
    for (const p of res.data) catalogo.current.set(p.id, p);
    return res.data.map((p) => ({ value: p.id, label: rotuloProduto(p) }));
  }, []);

  /** Escolher o produto preenche o resto da linha — o preço fica editável. */
  const escolherProduto = (indice: number, produtoId: string) => {
    const produto = catalogo.current.get(produtoId);
    form.setValue(`itens.${indice}.produtoId`, produtoId, { shouldDirty: true });
    if (!produto) return;
    form.setValue(`itens.${indice}.nomeProduto`, produto.nome, { shouldDirty: true });
    form.setValue(`itens.${indice}.sku`, produto.sku, { shouldDirty: true });
    form.setValue(`itens.${indice}.precoUnitario`, parseFloat(produto.precoVenda) || 0, {
      shouldDirty: true,
    });
    const iva = parseFloat(produto.taxaIva);
    if (!Number.isNaN(iva)) form.setValue(`itens.${indice}.taxaIva`, iva, { shouldDirty: true });
  };

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

  const opcoesClientes = clientesIniciais.map((c) => ({
    value: c.id,
    label: rotuloCliente(c),
  }));
  const opcoesVendedores = vendedoresIniciais.map((v) => ({ value: v.id, label: v.nome }));
  const opcoesProdutos = produtosIniciais.map((p) => ({ value: p.id, label: rotuloProduto(p) }));
  const semVendedores = vendedoresIniciais.length === 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações da Encomenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clienteId">Cliente *</Label>
              <ComboboxRemoto
                id="clienteId"
                opcoesIniciais={opcoesClientes}
                procurar={buscarClientes}
                value={clienteId}
                onChange={(v) => {
                  setClienteId(v);
                  form.setValue('clienteId', v, { shouldDirty: true, shouldValidate: true });
                }}
                placeholder="Seleccione o cliente"
                searchPlaceholder="Pesquisar por código, nome ou NUIT…"
                emptyText="Nenhum cliente encontrado."
              />
              {form.formState.errors.clienteId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.clienteId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendedorId">Vendedor</Label>
              <ComboboxRemoto
                id="vendedorId"
                opcoesIniciais={opcoesVendedores}
                procurar={buscarVendedores}
                value={vendedorId}
                onChange={(v) => {
                  setVendedorId(v);
                  form.setValue('vendedorId', v || undefined, { shouldDirty: true });
                }}
                disabled={semVendedores}
                placeholder={semVendedores ? 'Sem vendedores registados' : 'Opcional'}
                searchPlaceholder="Pesquisar por nome ou e-mail…"
                emptyText="Nenhum vendedor encontrado."
              />
              {semVendedores && (
                <p className="text-xs text-muted-foreground">
                  Ainda não há vendedores activos. Crie-os em{' '}
                  <a href="/vendas/vendedores" className="underline underline-offset-4">
                    Vendas &rsaquo; Vendedores
                  </a>
                  .
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataPrevista">Data Prevista de Entrega</Label>
              <Input
                id="dataPrevista"
                type="date"
                // Um campo de data por preencher devolve '' — e `z.coerce.date()`
                // transforma '' em Invalid Date e rejeita. `.optional()` aceita
                // `undefined`, não string vazia. Sem isto o formulário recusava
                // submeter-se enquanto ninguém escolhesse uma data que é opcional.
                {...form.register('dataPrevista', {
                  setValueAs: (v) => (v === '' ? undefined : v),
                })}
              />
              {form.formState.errors.dataPrevista && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.dataPrevista.message}
                </p>
              )}
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
              onClick={() => append({ ...LINHA_VAZIA })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fields.map((field, index) => {
              const produtoId = form.watch(`itens.${index}.produtoId`);
              const produto = produtoId ? catalogo.current.get(produtoId) : undefined;

              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border rounded-md p-3"
                >
                  <div className="col-span-2 md:col-span-3 space-y-1">
                    <Label className="text-xs" htmlFor={`produto-${index}`}>
                      Produto *
                    </Label>
                    <ComboboxRemoto
                      id={`produto-${index}`}
                      opcoesIniciais={opcoesProdutos}
                      procurar={buscarProdutos}
                      value={produtoId}
                      onChange={(v) => escolherProduto(index, v)}
                      placeholder="Seleccione o produto"
                      searchPlaceholder="Pesquisar por nome, SKU ou código de barras…"
                      emptyText="Nenhum produto encontrado."
                    />
                    {produto && (
                      <p className="text-xs text-muted-foreground">
                        Preço de catálogo: {formatMZN(produto.precoVenda)}
                      </p>
                    )}
                    {form.formState.errors.itens?.[index]?.produtoId && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.itens[index]?.produtoId?.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd.</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      aria-label={`Quantidade do item ${index + 1}`}
                      {...form.register(`itens.${index}.quantidade`, { valueAsNumber: true })}
                    />
                    {form.formState.errors.itens?.[index]?.quantidade && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.itens[index]?.quantidade?.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço Unit. (MT)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Preço unitário do item ${index + 1}`}
                      {...form.register(`itens.${index}.precoUnitario`, { valueAsNumber: true })}
                    />
                    {form.formState.errors.itens?.[index]?.precoUnitario && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.itens[index]?.precoUnitario?.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Desconto (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      aria-label={`Desconto do item ${index + 1}`}
                      {...form.register(`itens.${index}.desconto`, { valueAsNumber: true })}
                    />
                    {form.formState.errors.itens?.[index]?.desconto && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.itens[index]?.desconto?.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-end">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover item ${index + 1}`}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {form.formState.errors.itens?.root && (
            <p className="text-sm text-destructive mt-2">
              {form.formState.errors.itens.root.message}
            </p>
          )}
        </CardContent>
      </Card>

      {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Há campos por corrigir acima — a encomenda não foi criada.
        </p>
      )}

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
