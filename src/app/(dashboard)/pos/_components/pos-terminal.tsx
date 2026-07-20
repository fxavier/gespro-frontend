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
import { criarVenda, fecharSessaoPOS } from '@/server/actions/vendas.actions';
import type { SessaoPOSRow } from '@/server/services/comercial/venda.interface';
import type { ProdutoDto } from '@/server/services/inventario/catalogo.interface';

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type MetodoPagamento = 'DINHEIRO' | 'CARTAO' | 'MPESA' | 'EMOLA' | 'TRANSFERENCIA';

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
  produtos: ProdutoDto[];
  vendedorId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcularTotais(itens: ItemCarrinho[]) {
  let subtotal = 0;
  let ivaTotal = 0;
  for (const item of itens) {
    const base = item.precoUnitario * item.quantidade;
    const iva = base * item.taxaIva;
    subtotal += base;
    ivaTotal += iva;
  }
  return { subtotal, ivaTotal, total: subtotal + ivaTotal };
}

const METODO_ICONS: Record<MetodoPagamento, React.ReactNode> = {
  DINHEIRO: <Banknote className="h-4 w-4" />,
  CARTAO: <CreditCard className="h-4 w-4" />,
  MPESA: <Smartphone className="h-4 w-4" />,
  EMOLA: <Wallet className="h-4 w-4" />,
  TRANSFERENCIA: <CreditCard className="h-4 w-4" />,
};

const METODO_LABELS: Record<MetodoPagamento, string> = {
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
  TRANSFERENCIA: 'Transferência',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function POSTerminal({ sessaoPOS, produtos, vendedorId }: POSTerminalProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState('');
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('DINHEIRO');
  const [valorRecebido, setValorRecebido] = useState('');
  const [etapa, setEtapa] = useState<'carrinho' | 'pagamento'>('carrinho');
  const [pending, startTransition] = useTransition();
  const [fecharPending, startFechar] = useTransition();

  const { subtotal, ivaTotal, total } = calcularTotais(carrinho);

  // ─── Produtos filtrados ────────────────────────────────────────────────────

  const produtosFiltrados = busca.trim()
    ? produtos.filter(
        (p) =>
          p.nome.toLowerCase().includes(busca.toLowerCase()) ||
          p.sku?.toLowerCase().includes(busca.toLowerCase()) ||
          p.codigoBarras?.includes(busca)
      )
    : produtos;

  // ─── Carrinho ─────────────────────────────────────────────────────────────

  const adicionarAoCarrinho = useCallback((produtoId: string) => {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;

    setCarrinho((prev) => {
      const idx = prev.findIndex((i) => i.produtoId === produtoId);
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
  }, [produtos]);

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
        if (carrinho.length > 0) setEtapa('pagamento');
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
        adicionarAoCarrinho(carrinho[carrinho.length - 1].produtoId);
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
  }, [carrinho, etapa, adicionarAoCarrinho, decrementarItem]);

  // ─── Finalizar venda ──────────────────────────────────────────────────────

  const finalizarVenda = () => {
    if (carrinho.length === 0 || pending) return;

    const valorNum = parseFloat(valorRecebido.replace(',', '.'));
    const troco = metodoPagamento === 'DINHEIRO' && valorNum > total
      ? valorNum - total
      : 0;

    startTransition(async () => {
      const result = await criarVenda({
        origem: 'POS',
        vendedorId,
        sessaoPOSId: sessaoPOS.id,
        sessaoCaixaId: sessaoPOS.sessaoCaixaId,
        itens: carrinho.map((item) => ({
          produtoId: item.produtoId,
          nomeProduto: item.nomeProduto,
          sku: item.sku ?? undefined,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          taxaIva: item.taxaIva,
        })),
        pagamentos: [
          {
            tipo: metodoPagamento,
            valor: total,
            ...(troco > 0 ? { troco } : {}),
          },
        ],
      });

      if (result.ok) {
        toast.success(`Venda ${result.data.numero} registada com sucesso!`);
        setCarrinho([]);
        setValorRecebido('');
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

  // ─── Troco ───────────────────────────────────────────────────────────────

  const valorRecebidoNum = parseFloat(valorRecebido.replace(',', '.'));
  const troco = metodoPagamento === 'DINHEIRO' && !isNaN(valorRecebidoNum) && valorRecebidoNum > total
    ? valorRecebidoNum - total
    : null;

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
                onClick={() => adicionarAoCarrinho(produto.id)}
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
                        onClick={() => adicionarAoCarrinho(item.produtoId)}
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
                onClick={() => setEtapa('pagamento')}
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
                      variant={metodoPagamento === m ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setMetodoPagamento(m)}
                    >
                      {METODO_ICONS[m]}
                      {METODO_LABELS[m]}
                    </Button>
                  ))}
                </div>
              </div>

              {metodoPagamento === 'DINHEIRO' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Valor recebido (MT)
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    autoFocus
                    className="text-lg tabular-nums font-bold"
                  />
                  {troco !== null && (
                    <p className="text-sm font-medium text-primary">
                      Troco: MT {troco.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
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
                disabled={pending}
                onClick={finalizarVenda}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {pending ? 'A registar…' : `Pagar MT ${total.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
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
