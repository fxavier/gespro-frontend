/**
 * Detalhe de Venda — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, Edit, Printer } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendaService } from '@/server/services/comercial/index';
import { obterFatura } from '@/server/services/financas';
import { formatarData, formatarDataExtensa, formatarDataHora } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { VendaAcoes } from '../_components/venda-acoes';

const ORIGEM_LABELS: Record<string, string> = {
  POS: 'POS',
  ENCOMENDA: 'Encomenda',
  ECOMMERCE: 'E-Commerce',
  MANUAL: 'Manual',
};

const METODO_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência',
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
  CREDITO: 'Crédito',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VendaDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let venda;
  try {
    venda = await runWithTenantContext({ tenantId, userId }, () =>
      vendaService.buscarPorId(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }
  if (!venda) notFound();

  // Documento fiscal emitido com a venda (ADR-0041): Factura-Recibo ou, a crédito, Factura.
  const faturaId = venda.faturaId;
  const documento = faturaId
    ? await runWithTenantContext({ tenantId, userId }, () => obterFatura(faturaId, { tenantId, userId }))
    : null;

  const itens = venda.itens ?? [];
  const pagamentos = venda.pagamentos ?? [];
  const historico = venda.historicoEstado ?? [];

  const tabs = [
    {
      key: 'itens',
      label: 'Itens',
      count: itens.length,
      content: (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Preço Unit.</TableHead>
                <TableHead className="text-right">Desc.</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Sem itens
                  </TableCell>
                </TableRow>
              ) : (
                itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.nomeProduto}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{parseFloat(item.quantidade)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMZN(item.precoUnitario)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(item.desconto) > 0 ? `${parseFloat(item.desconto).toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(parseFloat(item.taxaIva) * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMZN(item.total)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {itens.length > 0 && (
            <div className="p-4 bg-muted/30 flex justify-end gap-8 text-sm">
              <span className="text-muted-foreground">Subtotal: {formatMZN(venda.subtotal)}</span>
              <span className="text-muted-foreground">IVA: {formatMZN(venda.ivaTotal)}</span>
              <span className="font-bold">Total: {formatMZN(venda.total)}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'pagamentos',
      label: 'Pagamentos',
      count: pagamentos.length,
      content: (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead className="text-right">Troco</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagamentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Sem pagamentos registados
                  </TableCell>
                </TableRow>
              ) : (
                pagamentos.map((pag) => (
                  <TableRow key={pag.id}>
                    <TableCell>
                      <Badge variant="outline">{METODO_LABELS[pag.tipo] ?? pag.tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMZN(pag.valor)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pag.referencia ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pag.troco ? formatMZN(pag.troco) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatarDataHora(pag.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ),
    },
    {
      key: 'historico',
      label: 'Histórico',
      count: historico.length,
      content: (
        <div className="space-y-3">
          {historico.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Sem histórico de estado</p>
          ) : (
            historico.map((h) => (
              <div key={h.id} className="flex items-start gap-4 rounded-lg border p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={h.estadoAntes} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={h.estadoDepois} />
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {formatarDataHora(h.createdAt)}
                    </span>
                  </div>
                  {h.motivo && (
                    <p className="mt-2 text-sm text-muted-foreground">{h.motivo}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ),
    },
  ];

  const metadata = [
    { label: 'Número', value: <span className="font-mono">{venda.numero}</span> },
    { label: 'Origem', value: ORIGEM_LABELS[venda.origem] ?? venda.origem },
    {
      label: 'Data da Venda',
      value: formatarDataExtensa(venda.dataVenda),
    },
    ...(documento
      ? [
          {
            label: 'Documento fiscal',
            value: (
              <Link href={`/faturacao/${documento.id}`} className="font-mono text-primary underline">
                {documento.numero}
              </Link>
            ),
          },
        ]
      : []),
    {
      label: 'Total',
      value: (
        <span className="font-bold tabular-nums">
          {formatMZN(venda.total)}
        </span>
      ),
    },
    { label: 'Estado', value: <StatusBadge status={venda.status} /> },
    ...(venda.currency !== 'MZN' ? [{ label: 'Moeda', value: venda.currency }] : []),
    ...(venda.observacoes ? [{ label: 'Observações', value: venda.observacoes }] : []),
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Venda ${venda.numero}`}
            description={`${ORIGEM_LABELS[venda.origem] ?? venda.origem} · ${formatarData(venda.dataVenda)}`}
            breadcrumbs={[
              { label: 'Vendas', href: '/vendas' },
              { label: venda.numero },
            ]}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/vendas">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Link>
                </Button>
                {venda.origem === 'POS' && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/pos/talao/${venda.id}`} target="_blank" rel="noopener noreferrer">
                      <Printer className="h-4 w-4 mr-2" />
                      Talão
                    </Link>
                  </Button>
                )}
                {venda.origem === 'POS' && venda.faturaId && venda.status === 'CONCLUIDA' && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/vendas/${venda.id}/anular`}>
                      <Ban className="h-4 w-4 mr-2" />
                      Anular venda
                    </Link>
                  </Button>
                )}
                <VendaAcoes id={venda.id} status={venda.status} faturaId={venda.faturaId} />
              </div>
            }
          />
        }
        tabs={tabs}
        metadata={metadata}
        defaultTab="itens"
      />
    </div>
  );
}
