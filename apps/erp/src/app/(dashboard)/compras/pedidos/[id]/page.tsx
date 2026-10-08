/**
 * Detalhe de Pedido de Compra — Server Component (NUNCA 'use client').
 *
 * #110: a lista liga aqui. Mostra o fornecedor (pelo nome), os itens e as ligações à requisição
 * e à cotação, e as acções do ciclo de vida: enviar, confirmar e marcar em trânsito no
 * componente-folha `PedidoAcoes`; cancelar é rota própria (recolhe o motivo).
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { PedidoAcoes } from '../_components/pedido-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

const ESTADOS_CANCELAVEIS = ['RASCUNHO', 'ENVIADO', 'CONFIRMADO'];

export default async function PedidoCompraDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;

  let pedido;
  try {
    pedido = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterPedido(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }
  if (!pedido) notFound();

  const podeAvancar = permissions.includes('compras:pedido:enviar');
  const podeCancelar =
    ESTADOS_CANCELAVEIS.includes(pedido.status) && permissions.includes('compras:pedido:cancelar');

  const tabItens = (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Qtd.</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Recebido</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Unidade</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Preço unit.</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">IVA</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pedido.itens.map((item) => (
            <TableRow key={item.id} className="h-10">
              <TableCell className="font-medium">{item.descricao}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantidade}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantidadeRecebida}</TableCell>
              <TableCell className="text-muted-foreground">{item.unidadeMedida}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMZN(item.precoUnitario)}</TableCell>
              <TableCell className="text-right tabular-nums">{Math.round(item.taxaIva * 100)}%</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatMZN(item.subtotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t bg-muted/30 px-4 py-3 flex justify-end gap-8 text-right">
        <div>
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="tabular-nums">{formatMZN(pedido.valorSubtotal)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">IVA</p>
          <p className="tabular-nums">{formatMZN(pedido.valorIva)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Valor total</p>
          <p className="text-lg font-bold tabular-nums">{formatMZN(pedido.valorTotal)}</p>
        </div>
      </div>
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-medium tabular-nums">{pedido.numero}</span> },
    { label: 'Data', value: formatarData(pedido.data) },
    { label: 'Fornecedor', value: pedido.fornecedorNome },
    { label: 'Entrega prevista', value: formatarData(pedido.dataEntregaPrevista) },
    { label: 'Prazo de entrega', value: `${pedido.prazoEntregaDias} dias` },
    { label: 'Condições de pagamento', value: pedido.condicoesPagamento },
    { label: 'Endereço de entrega', value: pedido.enderecoEntrega },
    ...(pedido.requisicaoCompraId
      ? [
          {
            label: 'Requisição',
            value: (
              <Link className="text-primary hover:underline" href={`/compras/requisicoes/${pedido.requisicaoCompraId}`}>
                Ver requisição
              </Link>
            ),
          },
        ]
      : []),
    ...(pedido.cotacaoId
      ? [
          {
            label: 'Cotação',
            value: (
              <Link className="text-primary hover:underline" href={`/compras/cotacoes/${pedido.cotacaoId}`}>
                Ver cotação
              </Link>
            ),
          },
        ]
      : []),
    ...(pedido.observacoes
      ? [{ label: 'Observações', value: <span className="whitespace-pre-line">{pedido.observacoes}</span> }]
      : []),
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Pedido ${pedido.numero}`}
            description={`Pedido de compra a ${pedido.fornecedorNome}`}
            breadcrumbs={[
              { label: 'Compras', href: '/compras' },
              { label: 'Pedidos', href: '/compras/pedidos' },
              { label: pedido.numero },
            ]}
            badge={<StatusBadge status={pedido.status} />}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/compras/pedidos">
                    <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Voltar
                  </Link>
                </Button>
                {podeAvancar && <PedidoAcoes id={pedido.id} status={pedido.status} />}
                {podeCancelar && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    asChild
                  >
                    <Link href={`/compras/pedidos/${pedido.id}/cancelar`}>
                      <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      Cancelar pedido
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        }
        tabs={[{ key: 'itens', label: 'Itens', count: pedido.itens.length, content: tabItens }]}
        metadata={metadata}
      />
    </div>
  );
}
