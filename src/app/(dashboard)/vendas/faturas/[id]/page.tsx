/**
 * Detalhe de Fatura — Server Component.
 * Usa o serviço real de facturação (sem dados mock).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterFatura } from '@/server/services/financas/faturacao.service';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import {
  ArrowLeft,
  Download,
  FileText,
  Calendar,
  Wallet,
  Receipt,
  History,
  User,
  Clock,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const fmt = (v: { toString(): string }) =>
  parseFloat(v.toString()).toLocaleString('pt-MZ', {
    style: 'currency',
    currency: 'MZN',
    minimumFractionDigits: 2,
  });

export default async function FaturaDetalhePage({ params }: PageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const fatura = await runWithTenantContext(ctx, () => obterFatura(id, ctx));

  if (!fatura) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={fatura.numero}
        description={`Fatura emitida em ${fatura.dataEmissao.toLocaleDateString('pt-MZ')}`}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Faturas', href: '/vendas/faturas' },
          { label: fatura.numero },
        ]}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={fatura.status} />
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Baixar PDF
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{fmt(fatura.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Subtotal</p>
            <p className="text-2xl font-bold">{fmt(fatura.subtotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">IVA</p>
            <p className="text-2xl font-bold">{fmt(fatura.ivaTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vencimento</p>
            <p className="text-2xl font-bold">
              {fatura.dataVencimento.toLocaleDateString('pt-MZ')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Informações + Cliente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <Link href={`/clientes/${fatura.clienteId}`} className="font-semibold text-primary hover:underline">
              Ver cliente
            </Link>
            <p className="text-muted-foreground text-xs">ID: {fatura.clienteId}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Data de emissão</p>
              <p className="font-medium">{fatura.dataEmissao.toLocaleDateString('pt-MZ')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Moeda</p>
              <p className="font-medium">{fatura.moeda}</p>
            </div>
            {fatura.dataPagamento && (
              <div>
                <p className="text-muted-foreground">Data de pagamento</p>
                <p className="font-medium">{fatura.dataPagamento.toLocaleDateString('pt-MZ')}</p>
              </div>
            )}
            {fatura.hashValidacao && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Hash de validação</p>
                <p className="font-mono text-xs break-all">{fatura.hashValidacao}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linhas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Itens faturados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fatura.linhas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhuma linha registada.
                    </TableCell>
                  </TableRow>
                )}
                {fatura.linhas.map((linha) => (
                  <TableRow key={linha.id}>
                    <TableCell className="font-medium">{linha.descricao}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.quantidade.toString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(linha.precoUnitario)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(parseFloat(linha.taxaIva.toString()) * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmt(linha.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resumo + Linha do tempo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Resumo Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{fmt(fatura.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="font-medium tabular-nums text-destructive">- {fmt(fatura.descontoTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="font-medium tabular-nums">{fmt(fatura.ivaTotal)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-xl tabular-nums">{fmt(fatura.total)}</span>
            </div>
            {fatura.totalPago && parseFloat(fatura.totalPago.toString()) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Valor pago</span>
                <span className="font-medium tabular-nums">{fmt(fatura.totalPago)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Linha do tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Emissão</p>
                  <p className="text-muted-foreground">{fatura.dataEmissao.toLocaleString('pt-MZ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Vencimento</p>
                  <p className="text-muted-foreground">{fatura.dataVencimento.toLocaleString('pt-MZ')}</p>
                </div>
              </div>
              {fatura.dataPagamento && (
                <div className="flex items-center gap-3">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Pagamento</p>
                    <p className="text-muted-foreground">{fatura.dataPagamento.toLocaleString('pt-MZ')}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {fatura.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{fatura.observacoes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
