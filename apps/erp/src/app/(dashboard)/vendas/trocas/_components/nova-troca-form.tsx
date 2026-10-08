'use client';

/**
 * Nova troca (#130) — a partir de uma devolução APROVADA com factura: produto de substituição,
 * localização onde o stock devolvido entra e, se o substituto custar mais do que o crédito da
 * devolução, o meio por que o cliente paga a diferença. Submete `criarTroca` (NC da devolução +
 * Factura-Recibo da venda de substituição, numa só transacção).
 *
 * Os totais do substituto saem de `calcularTotaisVendaPOS` — o mesmo cálculo do servidor —,
 * senão a diferença mostrada e a exigida divergem ao cêntimo.
 */

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Prisma } from '@prisma/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxRemoto,
  UnsavedChangesGuard,
  type ComboboxOption,
} from '@/components/patterns';
import { criarTroca, procurarProdutos } from '@/server/actions/vendas.actions';
import { CriarTrocaFormSchema, type CriarTrocaFormInput } from '@/lib/validations/vendas';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';
import { formatMZN } from '@/lib/format-currency';

export interface ProdutoOpcao {
  id: string;
  nome: string;
  sku: string;
  precoVenda: string;
  taxaIva: string;
}

export interface LocalizacaoOpcao {
  id: string;
  codigo: string;
  nome: string;
}

export interface DevolucaoDaTroca {
  id: string;
  numero: string;
  valorTotal: string;
  itens: { id: string; nomeProduto: string; quantidade: string; total: string }[];
}

type MeioDiferenca = 'DINHEIRO' | 'CARTAO' | 'TRANSFERENCIA' | 'MPESA' | 'EMOLA';

const MEIOS: { value: MeioDiferenca; label: string }[] = [
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'EMOLA', label: 'e-Mola' },
];

const rotuloProduto = (p: ProdutoOpcao) => `${p.sku} — ${p.nome}`;

interface Props {
  devolucao: DevolucaoDaTroca;
  serieNotaCreditoId?: string;
  /** Sessão de caixa aberta do utilizador: só segue quando a troca movimenta dinheiro. */
  sessaoCaixaId?: string;
  localizacoes: LocalizacaoOpcao[];
  produtosIniciais: ProdutoOpcao[];
}

export function NovaTrocaForm({
  devolucao,
  serieNotaCreditoId,
  sessaoCaixaId,
  localizacoes,
  produtosIniciais,
}: Props) {
  const router = useRouter();
  const [aCriar, startTransition] = useTransition();
  const catalogo = useRef(new Map(produtosIniciais.map((p) => [p.id, p])));
  const [meio, setMeio] = useState<MeioDiferenca>(sessaoCaixaId ? 'DINHEIRO' : 'TRANSFERENCIA');

  const form = useForm<CriarTrocaFormInput>({
    resolver: zodResolver(CriarTrocaFormSchema),
    defaultValues: {
      devolucaoId: devolucao.id,
      novoItem: {
        produtoId: '',
        nomeProduto: '',
        quantidade: 1,
        precoUnitario: 0,
        desconto: 0,
        taxaIva: 0.16,
      },
      pagamentos: [],
      localizacaoId: '',
      serieNotaCreditoId,
    },
  });

  const produtoId = form.watch('novoItem.produtoId');
  const localizacaoId = form.watch('localizacaoId');
  const [quantidade, precoUnitario, taxaIva] = form.watch([
    'novoItem.quantidade',
    'novoItem.precoUnitario',
    'novoItem.taxaIva',
  ]);
  const erros = form.formState.errors;
  const erroProduto = erros.novoItem?.produtoId?.message;
  const erroLocalizacao = erros.localizacaoId?.message;

  const credito = new Prisma.Decimal(devolucao.valorTotal || '0').toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  const numeroValido = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const totalSubstituto = produtoId
    ? calcularTotaisVendaPOS([
        {
          quantidade: numeroValido(quantidade),
          precoUnitario: numeroValido(precoUnitario),
          desconto: 0,
          taxaIva: numeroValido(taxaIva),
        },
      ]).total
    : new Prisma.Decimal(0);
  const diferenca = totalSubstituto.minus(credito);
  const aPagar = produtoId && diferenca.greaterThan(0);
  const aDevolver = produtoId && diferenca.lessThan(0);
  const movimentaDinheiro = (aPagar && meio === 'DINHEIRO') || aDevolver;

  const buscarProdutos = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarProdutos({ q });
    if (!res.ok) return null;
    for (const p of res.data) catalogo.current.set(p.id, p);
    return res.data.map((p) => ({ value: p.id, label: rotuloProduto(p) }));
  }, []);

  /** Escolher o produto preenche nome, SKU, preço de venda e IVA — o preço fica editável. */
  const escolherProduto = (id: string) => {
    form.setValue('novoItem.produtoId', id, { shouldDirty: true, shouldValidate: true });
    const produto = catalogo.current.get(id);
    if (!produto) return;
    form.setValue('novoItem.nomeProduto', produto.nome, { shouldDirty: true });
    form.setValue('novoItem.sku', produto.sku, { shouldDirty: true });
    form.setValue('novoItem.precoUnitario', parseFloat(produto.precoVenda) || 0, {
      shouldDirty: true,
    });
    const iva = parseFloat(produto.taxaIva);
    if (!Number.isNaN(iva)) form.setValue('novoItem.taxaIva', iva, { shouldDirty: true });
  };

  function onSubmit(data: CriarTrocaFormInput) {
    const input: CriarTrocaFormInput = {
      ...data,
      pagamentos: aPagar ? [{ tipo: meio, valor: Number(diferenca.toFixed(2)) }] : [],
      sessaoCaixaId: movimentaDinheiro ? sessaoCaixaId : undefined,
    };
    startTransition(async () => {
      const result = await criarTroca(input);
      if (result.ok) {
        toast.success(`Troca ${result.data.numero} criada.`);
        router.push('/vendas/trocas');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const opcoesProdutos = produtosIniciais.map((p) => ({ value: p.id, label: rotuloProduto(p) }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCriar} />
      <Card>
        <CardHeader>
          <CardTitle>Devolução {devolucao.numero}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="space-y-1">
            {devolucao.itens.map((i) => (
              <li key={i.id} className="flex justify-between gap-4">
                <span>
                  {i.quantidade} × {i.nomeProduto}
                </span>
                <span className="tabular-nums">{formatMZN(i.total)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between gap-4 border-t pt-2 font-medium">
            <span>Crédito da devolução</span>
            <span className="tabular-nums">{formatMZN(credito.toString())}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Substituição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="produtoId">Produto *</Label>
              <ComboboxRemoto
                id="produtoId"
                opcoesIniciais={opcoesProdutos}
                procurar={buscarProdutos}
                value={produtoId}
                onChange={escolherProduto}
                placeholder="Seleccione o produto"
                searchPlaceholder="Pesquisar por nome, SKU ou código de barras…"
                emptyText="Nenhum produto encontrado."
                aria-invalid={erroProduto ? true : undefined}
                aria-describedby={erroProduto ? 'produtoId-erro' : undefined}
              />
              {erroProduto && (
                <p id="produtoId-erro" role="alert" className="text-sm text-destructive">
                  {erroProduto}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                type="number"
                min="0.01"
                step="0.01"
                {...form.register('novoItem.quantidade', { valueAsNumber: true })}
              />
              {erros.novoItem?.quantidade && (
                <p className="text-sm text-destructive">{erros.novoItem.quantidade.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="precoUnitario">Preço Unit. (MT)</Label>
              <Input
                id="precoUnitario"
                type="number"
                min="0"
                step="0.01"
                {...form.register('novoItem.precoUnitario', { valueAsNumber: true })}
              />
              {erros.novoItem?.precoUnitario && (
                <p className="text-sm text-destructive">{erros.novoItem.precoUnitario.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2 max-w-md">
            <Label htmlFor="localizacaoId">Localização *</Label>
            <Combobox
              id="localizacaoId"
              options={localizacoes.map((l) => ({ value: l.id, label: `${l.nome} (${l.codigo})` }))}
              value={localizacaoId}
              onChange={(v) =>
                form.setValue('localizacaoId', v, { shouldDirty: true, shouldValidate: true })
              }
              placeholder="Seleccione a localização"
              searchPlaceholder="Pesquisar localização…"
              emptyText="Nenhuma localização activa."
              aria-invalid={erroLocalizacao ? true : undefined}
              aria-describedby={erroLocalizacao ? 'localizacaoId-erro' : undefined}
            />
            {erroLocalizacao && (
              <p id="localizacaoId-erro" role="alert" className="text-sm text-destructive">
                {erroLocalizacao}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Onde o artigo devolvido dá entrada no stock.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diferença</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <p className="flex justify-between gap-4 md:block">
              <span className="text-muted-foreground">Substituto </span>
              <span className="tabular-nums">{formatMZN(totalSubstituto.toString())}</span>
            </p>
            <p className="flex justify-between gap-4 md:block">
              <span className="text-muted-foreground">Crédito </span>
              <span className="tabular-nums">{formatMZN(credito.toString())}</span>
            </p>
            <p className="flex justify-between gap-4 md:block font-medium">
              <span className="text-muted-foreground">
                {aDevolver ? 'A devolver ao cliente ' : 'A pagar pelo cliente '}
              </span>
              <span className="tabular-nums">{formatMZN(diferenca.abs().toString())}</span>
            </p>
          </div>

          {aPagar && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="meio">Meio de pagamento da diferença</Label>
              <Select value={meio} onValueChange={(v) => setMeio(v as MeioDiferenca)}>
                <SelectTrigger id="meio">
                  <SelectValue>{MEIOS.find((m) => m.value === meio)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MEIOS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {movimentaDinheiro && !sessaoCaixaId && (
            <p role="alert" className="text-sm text-destructive">
              Esta troca movimenta dinheiro na gaveta: abra uma sessão de caixa
              {aPagar ? ' ou escolha outro meio de pagamento' : ''}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/vendas/devolucoes/${devolucao.id}`)}
          disabled={aCriar}
        >
          Voltar
        </Button>
        <Button type="submit" disabled={aCriar}>
          {aCriar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Troca
        </Button>
      </div>
    </form>
  );
}
