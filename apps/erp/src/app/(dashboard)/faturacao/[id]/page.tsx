/**
 * Detalhe de Factura — Server Component (NUNCA 'use client').
 * Documento append-only: sem edição. Pagamentos/notas de crédito são fluxos próprios.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';

interface Props {
  params: Promise<{ id: string }>;
}

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const n = (v: unknown) => Number((v as { toString(): string })?.toString() ?? '0');
const fmtData = (d: Date | string) =>
  new Date(d).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });

export default async function FaturaDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let fatura;
  try {
    fatura = await runWithTenantContext(ctx, () => faturacaoService.obterFatura(id, ctx));
  } catch {
    notFound();
  }
  if (!fatura) notFound();

  let clienteNome = fatura.clienteId;
  try {
    const cliente = await runWithTenantContext(ctx, () =>
      clienteService.buscarPorId(fatura.clienteId, ctx)
    );
    if (cliente?.nome) clienteNome = cliente.nome;
  } catch {
    // cliente removido / cross-tenant — mantém o id como fallback
  }

  const pendente = n(fatura.total) - n(fatura.totalPago);

  const tabLinhas = (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Qtd.</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Preço Unit.</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Desc.</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">IVA</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fatura.linhas.map((linha) => (
              <TableRow key={linha.id} className="h-10">
                <TableCell className="font-medium">{linha.descricao}</TableCell>
                <TableCell className="text-right tabular-nums">{n(linha.quantidade)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMZN.format(n(linha.precoUnitario))}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMZN.format(n(linha.desconto))}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{n(linha.taxaIva)}%</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtMZN.format(n(linha.total))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t bg-muted/30 px-4 py-3 space-y-1">
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums w-40 text-right">{fmtMZN.format(n(fatura.subtotal))}</span>
        </div>
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">Desconto</span>
          <span className="tabular-nums w-40 text-right">{fmtMZN.format(n(fatura.descontoTotal))}</span>
        </div>
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">Base IVA</span>
          <span className="tabular-nums w-40 text-right">{fmtMZN.format(n(fatura.baseIva))}</span>
        </div>
        <div className="flex justify-end gap-8 text-sm">
          <span className="text-muted-foreground">IVA</span>
          <span className="tabular-nums w-40 text-right">{fmtMZN.format(n(fatura.ivaTotal))}</span>
        </div>
        <div className="flex justify-end gap-8 pt-1 border-t mt-1">
          <span className="font-semibold">Total</span>
          <span className="tabular-nums w-40 text-right text-lg font-bold">{fmtMZN.format(n(fatura.total))}</span>
        </div>
      </div>
    </div>
  );

  const tabDetalhes = (
    <div className="space-y-4 text-sm">
      {fatura.observacoes ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Observações</p>
          <p className="whitespace-pre-wrap">{fatura.observacoes}</p>
        </div>
      ) : (
        <p className="text-muted-foreground">Sem observações.</p>
      )}
      {fatura.hashValidacao && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Hash de validação</p>
          <p className="font-mono text-xs break-all">{fatura.hashValidacao}</p>
        </div>
      )}
      {fatura.caminhoArquivoPdf && (
        <Button variant="outline" size="sm" asChild>
          <a href={fatura.caminhoArquivoPdf} target="_blank" rel="noopener noreferrer">
            Descarregar PDF
          </a>
        </Button>
      )}
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-mono font-medium">{fatura.numero}</span> },
    { label: 'Cliente', value: clienteNome },
    { label: 'Data de Emissão', value: fmtData(fatura.dataEmissao) },
    { label: 'Vencimento', value: fmtData(fatura.dataVencimento) },
    { label: 'Moeda', value: fatura.moeda },
    {
      label: 'Total',
      value: <span className="font-semibold tabular-nums">{fmtMZN.format(n(fatura.total))}</span>,
    },
    {
      label: 'Total Pago',
      value: <span className="tabular-nums">{fmtMZN.format(n(fatura.totalPago))}</span>,
    },
    {
      label: 'Pendente',
      value: (
        <span className={`tabular-nums font-medium ${pendente > 0 ? 'text-warning' : 'text-success'}`}>
          {fmtMZN.format(pendente)}
        </span>
      ),
    },
    fatura.dataPagamento
      ? { label: 'Data de Pagamento', value: fmtData(fatura.dataPagamento) }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: React.ReactNode }>;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Factura ${fatura.numero}`}
            description={`Emitida a ${clienteNome}`}
            breadcrumbs={[
              { label: 'Faturação', href: '/faturacao' },
              { label: fatura.numero },
            ]}
            badge={<StatusBadge status={fatura.status} />}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/faturacao">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Voltar
                </Link>
              </Button>
            }
          />
        }
        tabs={[
          { key: 'linhas', label: 'Linhas', count: fatura.linhas.length, content: tabLinhas },
          { key: 'detalhes', label: 'Detalhes', content: tabDetalhes },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
