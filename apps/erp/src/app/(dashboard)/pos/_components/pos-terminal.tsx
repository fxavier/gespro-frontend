'use client';

/**
 * POSTerminal — ecrã de produtividade completo.
 *
 * Atalhos de teclado:
 *   /  ou  F2   — focar pesquisa de produto
 *   Enter       — adicionar produto focado ao carrinho
 *   F10         — finalizar venda (abre painel de pagamento)
 *   Escape      — limpar carrinho / fechar painel de pagamento
 *   +/-         — incrementar/decrementar quantidade do último item
 *
 * «Crédito» emite Factura (não Factura-Recibo) e exige um cliente identificado (ADR-0041 §4).
 *
 * #128: a pesquisa de produtos corre no servidor (`procurarProdutosPOS`), sem o tecto dos 60
 * carregados à partida; o pagamento é uma lista (meio + valor recebido) resolvida por
 * `resolverPagamentosPOS` — troco só em dinheiro, e «Pagar» só com Σ = total.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  CheckCircle,
  Loader2,
  LogOut,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ComboboxRemoto } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { criarVenda, fecharSessaoPOS, procurarProdutosPOS } from '@/server/actions/vendas.actions';
import { procurarClientes } from '@/server/actions/clientes.actions';
import { CLIENTE_CONSUMIDOR_FINAL } from '@/lib/consumidor-final';
import type { SessaoPOSRow } from '@/server/services/comercial/venda.interface';
import type { ProdutoDto } from '@/server/services/inventario/catalogo.interface';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';
import { resolverPagamentosPOS } from '@/lib/pos-pagamentos';

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type MetodoPagamento = 'DINHEIRO' | 'CARTAO' | 'MPESA' | 'EMOLA' | 'TRANSFERENCIA' | 'CREDITO';

type ProdutoPOS = Pick<ProdutoDto, 'id' | 'nome' | 'sku' | 'codigoBarras' | 'precoVenda' | 'taxaIva'>;

/** Uma linha do painel de pagamento: o meio e o valor recebido, tal como escrito. */
interface LinhaPagamento {
  tipo: MetodoPagamento;
  valor: string;
}

const formatarMT = (v: number) => v.toLocaleString('pt-MZ', { minimumFractionDigits: 2 });
/** Valor inicial de um campo de pagamento (vírgula decimal, como o operador escreve). */
const valorCampo = (v: number) => v.toFixed(2).replace('.', ',');
/** O painel de pagamento abre com uma linha só, nascida com o total (um meio = um clique). */
const linhasIniciais = (itens: ItemCarrinho[], tipo: MetodoPagamento): LinhaPagamento[] => [
  { tipo, valor: valorCampo(calcularTotais(itens).total) },
];

interface ItemCarrinho {
  produtoId: string;
  varianteId?: string;
  nomeProduto: string;
  sku: string | null;
  precoUnitario: number;
  taxaIva: number;
  quantidade: number;
}

interface POSTerminalProps {
  sessaoPOS: SessaoPOSRow;
  /** Grelha inicial (primeiros por nome); a pesquisa vai ao servidor. */
  produtos: ProdutoPOS[];
  vendedorId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * O mesmo cálculo do servidor (ADR-0041 §3): o pagamento enviado tem de igualar o
 * total da venda ao cêntimo, senão o servidor recusa com PAGAMENTOS_NAO_BATEM_TOTAL.
 * Os valores saem em 2 casas exactas, por isso o `number` não perde nada.
 */
function calcularTotais(itens: ItemCarrinho[]) {
  const t = calcularTotaisVendaPOS(itens);
  return { subtotal: t.subtotal.toNumber(), ivaTotal: t.ivaTotal.toNumber(), total: t.total.toNumber() };
}

const METODO_ICONS: Record<MetodoPagamento, React.ReactNode> = {
  DINHEIRO: <Banknote className="h-4 w-4" />,
  CARTAO: <CreditCard className="h-4 w-4" />,
  MPESA: <Smartphone className="h-4 w-4" />,
  EMOLA: <Wallet className="h-4 w-4" />,
  TRANSFERENCIA: <CreditCard className="h-4 w-4" />,
  CREDITO: <UserRound className="h-4 w-4" />,
};

const METODO_LABELS: Record<MetodoPagamento, string> = {
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
  TRANSFERENCIA: 'Transferência',
  CREDITO: 'Crédito',
};

/** O Consumidor Final não tem conta corrente: nunca é opção para uma venda a crédito. */
async function procurarClientesCredito(q: string): Promise<ComboboxOption[] | null> {
  const res = await procurarClientes({ q });
  return res.ok
    ? res.data
        .filter((c) => c.codigo !== CLIENTE_CONSUMIDOR_FINAL.codigo)
        .map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))
    : null;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Chave de idempotência de uma tentativa de venda (ADR-0041 §5). Só tem de ser única por
 * tentativa; não é um segredo. `crypto.randomUUID` falta em contexto não seguro (POS por http na
 * rede local), daí o recurso.
 */
function novaChaveVenda(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function POSTerminal({ sessaoPOS, produtos, vendedorId }: POSTerminalProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  // Tentativa de venda em curso: a mesma chave enquanto o conteúdo da venda não mudar (um retry
  // depois de uma falha de rede devolve a venda já gravada); renovada após sucesso ou quando o
  // carrinho, o pagamento ou o cliente mudam.
  const tentativaRef = useRef<{ chave: string; conteudo: string } | null>(null);
  const [busca, setBusca] = useState('');
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  // Resultado da última pesquisa no servidor, com o termo a que responde (descarta corridas).
  const [resultadoBusca, setResultadoBusca] = useState<{ termo: string; produtos: ProdutoPOS[] } | null>(null);
  // Meio com que nasce a primeira linha de pagamento (o da venda anterior, salvo crédito).
  const [metodoInicial, setMetodoInicial] = useState<MetodoPagamento>('DINHEIRO');
  const [linhasPagamento, setLinhasPagamento] = useState<LinhaPagamento[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [etapa, setEtapa] = useState<'carrinho' | 'pagamento'>('carrinho');
  const [pending, startTransition] = useTransition();
  const [fecharPending, startFechar] = useTransition();

  const { subtotal, ivaTotal, total } = calcularTotais(carrinho);

  // ─── Produtos filtrados ────────────────────────────────────────────────────

  const termoBusca = busca.trim();

  // Pesquisa no servidor, com atraso; só o resultado do termo actual é mostrado.
  useEffect(() => {
    if (!termoBusca) return;
    let cancelada = false;
    const temporizador = setTimeout(async () => {
      const res = await procurarProdutosPOS({ q: termoBusca });
      if (cancelada) return;
      if (res.ok) setResultadoBusca({ termo: termoBusca, produtos: res.data });
      else toast.error(res.error.message ?? 'Erro ao pesquisar produtos.');
    }, 200);
    return () => {
      cancelada = true;
      clearTimeout(temporizador);
    };
  }, [termoBusca]);

  // Enquanto a resposta do servidor não chega, filtra o que já está carregado.
  const produtosFiltrados: ProdutoPOS[] = !termoBusca
    ? produtos
    : resultadoBusca?.termo === termoBusca
      ? resultadoBusca.produtos
      : produtos.filter(
          (p) =>
            p.nome.toLowerCase().includes(termoBusca.toLowerCase()) ||
            p.sku?.toLowerCase().includes(termoBusca.toLowerCase()) ||
            p.codigoBarras?.includes(termoBusca)
        );

  // ─── Carrinho ─────────────────────────────────────────────────────────────

  const adicionarAoCarrinho = useCallback((produto: ProdutoPOS) => {
    setCarrinho((prev) => {
      const idx = prev.findIndex((i) => i.produtoId === produto.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantidade: updated[idx].quantidade + 1 };
        return updated;
      }
      return [
        ...prev,
        {
          produtoId: produto.id,
          nomeProduto: produto.nome,
          sku: produto.sku,
          precoUnitario: parseFloat(produto.precoVenda),
          taxaIva: parseFloat(produto.taxaIva),
          quantidade: 1,
        },
      ];
    });
  }, []);

  const incrementarItem = useCallback((produtoId: string) => {
    setCarrinho((prev) =>
      prev.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i))
    );
  }, []);

  // ─── Pagamento ────────────────────────────────────────────────────────────

  /** Abre o painel de pagamento com uma linha só, nascida com o total. */
  const abrirPagamento = useCallback(() => {
    if (carrinho.length === 0) return;
    setLinhasPagamento(linhasIniciais(carrinho, metodoInicial));
    setEtapa('pagamento');
  }, [carrinho, metodoInicial]);

  const resolucao = resolverPagamentosPOS(total, linhasPagamento);
  const temCredito = linhasPagamento.some((l) => l.tipo === 'CREDITO');
  const metodoActivo = linhasPagamento[linhasPagamento.length - 1]?.tipo;

  /** Os botões de meio definem o meio da linha activa — a última. */
  const definirMetodo = (tipo: MetodoPagamento) =>
    setLinhasPagamento((prev) =>
      prev.length === 0 ? prev : [...prev.slice(0, -1), { ...prev[prev.length - 1], tipo }]
    );

  const definirValor = (indice: number, valor: string) =>
    setLinhasPagamento((prev) => prev.map((l, i) => (i === indice ? { ...l, valor } : l)));

  const removerLinha = (indice: number) =>
    setLinhasPagamento((prev) => prev.filter((_, i) => i !== indice));

  /** Nova linha, já activa, com o valor em falta (vazia se nada faltar). */
  const adicionarPagamento = () => {
    const emFalta = !resolucao.ok && resolucao.motivo === 'EM_FALTA' ? resolucao.emFalta : 0;
    setLinhasPagamento((prev) => [
      ...prev,
      { tipo: 'DINHEIRO', valor: emFalta > 0 ? valorCampo(emFalta) : '' },
    ]);
  };

  const decrementarItem = useCallback((produtoId: string) => {
    setCarrinho((prev) => {
      const idx = prev.findIndex((i) => i.produtoId === produtoId);
      if (idx < 0) return prev;
      if (prev[idx].quantidade <= 1) return prev.filter((_, i) => i !== idx);
      const updated = [...prev];
      updated[idx] = { ...updated[idx], quantidade: updated[idx].quantidade - 1 };
      return updated;
    });
  }, []);

  const removerItem = useCallback((produtoId: string) => {
    setCarrinho((prev) => prev.filter((i) => i.produtoId !== produtoId));
  }, []);

  // ─── Atalhos de teclado ───────────────────────────────────────────────────

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.key === '/' || e.key === 'F2') && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'F10') {
        e.preventDefault();
        if (etapa === 'carrinho') abrirPagamento();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (etapa === 'pagamento') setEtapa('carrinho');
        else setCarrinho([]);
        return;
      }
      if (e.key === '+' && carrinho.length > 0 && document.activeElement === document.body) {
        e.preventDefault();
        incrementarItem(carrinho[carrinho.length - 1].produtoId);
        return;
      }
      if (e.key === '-' && carrinho.length > 0 && document.activeElement === document.body) {
        e.preventDefault();
        decrementarItem(carrinho[carrinho.length - 1].produtoId);
        return;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [carrinho, etapa, abrirPagamento, incrementarItem, decrementarItem]);

  // ─── Finalizar venda ──────────────────────────────────────────────────────

  const faltaCliente = temCredito && !clienteId;

  const finalizarVenda = () => {
    if (carrinho.length === 0 || pending || faltaCliente || !resolucao.ok) return;

    const venda = {
      origem: 'POS' as const,
      vendedorId,
      sessaoPOSId: sessaoPOS.id,
      sessaoCaixaId: sessaoPOS.sessaoCaixaId,
      ...(temCredito ? { clienteId } : {}),
      itens: carrinho.map((item) => ({
        produtoId: item.produtoId,
        nomeProduto: item.nomeProduto,
        sku: item.sku ?? undefined,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        taxaIva: item.taxaIva,
      })),
      pagamentos: resolucao.pagamentos,
    };
    // O troco não é conteúdo fiscal (o servidor também o ignora na chave): mudar só o valor
    // recebido num retry não pode gerar uma chave nova e uma segunda venda.
    const conteudo = JSON.stringify({
      ...venda,
      pagamentos: venda.pagamentos.map(({ tipo, valor }) => ({ tipo, valor })),
    });
    if (tentativaRef.current?.conteudo !== conteudo) {
      tentativaRef.current = { chave: novaChaveVenda(), conteudo };
    }
    const chaveIdempotencia = tentativaRef.current.chave;

    startTransition(async () => {
      const result = await criarVenda({ ...venda, chaveIdempotencia });

      if (result.ok) {
        tentativaRef.current = null;
        const vendaId = result.data.id;
        toast.success(`Venda ${result.data.numero} registada com sucesso!`, {
          duration: 15_000,
          action: {
            label: 'Imprimir talão',
            onClick: () => window.open(`/pos/talao/${vendaId}`, '_blank'),
          },
        });
        // Crédito acima do limite não bloqueia a venda: avisa (#318).
        result.data.avisos?.forEach((aviso) => toast.warning(aviso, { duration: 15_000 }));
        setCarrinho([]);
        setLinhasPagamento([]);
        setClienteId('');
        // O crédito é excepção: a venda seguinte volta a dinheiro, não herda o cliente nem o meio.
        setMetodoInicial(temCredito ? 'DINHEIRO' : (linhasPagamento[0]?.tipo ?? 'DINHEIRO'));
        setEtapa('carrinho');
        setBusca('');
        searchRef.current?.focus();
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao registar a venda.');
      }
    });
  };

  // ─── Fechar sessão ────────────────────────────────────────────────────────

  const fecharSessao = () => {
    startFechar(async () => {
      const result = await fecharSessaoPOS({ sessaoPOSId: sessaoPOS.id });
      if (result.ok) {
        toast.success('Sessão POS encerrada.');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao fechar sessão.');
      }
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full gap-0 bg-background">
      {/* ── Painel esquerdo: Produtos ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r">
        {/* Barra de pesquisa */}
        <div className="p-3 border-b bg-muted/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Pesquisar produto (/ ou F2)…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 bg-background"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Grelha de produtos */}
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {produtosFiltrados.map((produto) => (
              <button
                key={produto.id}
                type="button"
                onClick={() => adicionarAoCarrinho(produto)}
                className="rounded-lg border p-3 text-left hover:bg-accent hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 group"
                title={`Adicionar ${produto.nome} (Enter)`}
              >
                <div className="aspect-square mb-2 rounded-md bg-muted flex items-center justify-center text-2xl select-none">
                  <ShoppingCart className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-xs font-medium line-clamp-2">{produto.nome}</p>
                {produto.sku && (
                  <p className="text-xs text-muted-foreground mt-0.5">{produto.sku}</p>
                )}
                <p className="text-sm font-bold mt-1 tabular-nums">
                  MT {parseFloat(produto.precoVenda).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                </p>
              </button>
            ))}
            {produtosFiltrados.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum produto encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Painel direito: Carrinho + Pagamento ── */}
      <div className="w-80 xl:w-96 flex flex-col bg-muted/10">
        {/* Cabeçalho com sessão info */}
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Sessão POS</span>
            <span className="ml-1 font-mono">{sessaoPOS.id.slice(-8)}</span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Fechar sessão POS">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fechar sessão POS?</AlertDialogTitle>
                <AlertDialogDescription>
                  A sessão será encerrada. Vendas pendentes nesta sessão não serão afectadas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={fecharSessao}
                  disabled={fecharPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {fecharPending ? 'A fechar…' : 'Fechar Sessão'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {etapa === 'carrinho' ? (
          <>
            {/* Lista do carrinho */}
            <div className="flex-1 overflow-auto p-3 space-y-1.5">
              {carrinho.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <ShoppingCart className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Carrinho vazio</p>
                  <p className="text-xs">Clique num produto ou use o teclado</p>
                </div>
              ) : (
                carrinho.map((item) => (
                  <div key={item.produtoId} className="flex items-center gap-2 rounded-md border bg-background p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.nomeProduto}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        MT {item.precoUnitario.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} × {item.quantidade}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => decrementarItem(item.produtoId)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-xs tabular-nums">{item.quantidade}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => incrementarItem(item.produtoId)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => removerItem(item.produtoId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-xs font-bold tabular-nums w-16 text-right">
                      MT {(item.precoUnitario * item.quantidade).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Totais e botão F10 */}
            <div className="border-t p-4 space-y-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">MT {subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA</span>
                  <span className="tabular-nums">MT {ivaTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="tabular-nums">MT {total.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={carrinho.length === 0}
                onClick={abrirPagamento}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Finalizar (F10)
              </Button>

              {carrinho.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setCarrinho([])}
                >
                  Limpar carrinho (Esc)
                </Button>
              )}
            </div>
          </>
        ) : (
          /* ── Painel de pagamento ── */
          <>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Método de pagamento
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(METODO_LABELS) as MetodoPagamento[]).map((m) => (
                    <Button
                      key={m}
                      variant={metodoActivo === m ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => definirMetodo(m)}
                    >
                      {METODO_ICONS[m]}
                      {METODO_LABELS[m]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pagamentos (valor recebido, MT)
                </p>
                {linhasPagamento.map((linha, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium">
                      {METODO_ICONS[linha.tipo]}
                      {METODO_LABELS[linha.tipo]}
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`Valor do pagamento ${i + 1} (${METODO_LABELS[linha.tipo]})`}
                      value={linha.valor}
                      onChange={(e) => definirValor(i, e.target.value)}
                      autoFocus={i === linhasPagamento.length - 1}
                      className="text-lg tabular-nums font-bold"
                    />
                    {linhasPagamento.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removerLinha(i)}
                        aria-label={`Remover pagamento ${i + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={adicionarPagamento}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar pagamento
                </Button>
                <p id="pos-pagamentos-estado" className="text-sm font-medium" aria-live="polite">
                  {resolucao.ok ? (
                    resolucao.troco > 0 && (
                      <span className="text-primary">Troco: MT {formatarMT(resolucao.troco)}</span>
                    )
                  ) : resolucao.motivo === 'EM_FALTA' ? (
                    <span className="text-destructive">Em falta: MT {formatarMT(resolucao.emFalta)}</span>
                  ) : resolucao.motivo === 'EXCESSO_SEM_DINHEIRO' ? (
                    <span className="text-destructive">O excesso só pode ser troco em dinheiro.</span>
                  ) : resolucao.motivo === 'VALOR_INVALIDO' ? (
                    <span className="text-destructive">Valor inválido: positivo, até 2 casas decimais.</span>
                  ) : (
                    <span className="text-destructive">Acrescente um pagamento.</span>
                  )}
                </p>
              </div>

              {temCredito && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="pos-cliente-credito"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    Cliente *
                  </label>
                  <ComboboxRemoto
                    id="pos-cliente-credito"
                    opcoesIniciais={[]}
                    procurar={procurarClientesCredito}
                    value={clienteId}
                    onChange={setClienteId}
                    disabled={pending}
                    placeholder="Seleccione o cliente"
                    searchPlaceholder="Pesquisar por código, nome ou NUIT…"
                    emptyText="Escreva para pesquisar clientes."
                  />
                  {faltaCliente && (
                    <p id="pos-cliente-credito-dica" className="text-xs text-muted-foreground">
                      A venda a crédito exige um cliente identificado: é emitida uma factura em nome dele.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-lg border p-3 space-y-1 bg-muted/20">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">MT {subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA</span>
                  <span className="tabular-nums">MT {ivaTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-xl">
                  <span>Total</span>
                  <span className="tabular-nums">MT {total.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="border-t p-4 space-y-2">
              <Button
                className="w-full"
                size="lg"
                disabled={pending || faltaCliente || !resolucao.ok}
                onClick={finalizarVenda}
                aria-describedby={faltaCliente ? 'pos-cliente-credito-dica' : 'pos-pagamentos-estado'}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {pending
                  ? 'A registar…'
                  : `${temCredito ? 'Facturar a crédito' : 'Pagar'} MT ${formatarMT(total)}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setEtapa('carrinho')}
              >
                Voltar ao carrinho (Esc)
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
