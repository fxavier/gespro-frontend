'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Download,
  Mail,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Wallet,
  Receipt,
  History,
  User
} from 'lucide-react';
import { faturasMock } from '@/data/faturacao';
import type { Fatura } from '@/types/fatura';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' });

const formatPercentage = (value: number) => {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Number.isInteger(normalized) ? normalized : normalized.toFixed(2)}%`;
};

const statusConfig: Record<Fatura['statusFatura'], { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: typeof CheckCircle }> = {
  paga: { label: 'Paga', variant: 'default', icon: CheckCircle },
  emitida: { label: 'Emitida', variant: 'secondary', icon: Clock },
  vencida: { label: 'Vencida', variant: 'destructive', icon: XCircle },
  cancelada: { label: 'Cancelada', variant: 'secondary', icon: XCircle }
};

type Params = { id: string };

export default function FaturaDetalhePage({ params }: { params: Params }) {
  const router = useRouter();
  const fatura = useMemo(() => faturasMock.find((item) => item.id === params.id), [params.id]);

  if (!fatura) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold">Fatura não encontrada</h1>
              <p className="text-muted-foreground">Verifique se o identificador está correcto ou volte à listagem.</p>
            </div>
            <Button className="gap-2" onClick={() => router.push('/vendas/faturas')}>
              <ArrowLeft className="h-4 w-4" />
              Voltar para faturas
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = statusConfig[fatura.statusFatura];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button asChild variant="ghost" size="sm">
              <Link href="/vendas/faturas">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>Vendas &gt; Faturas</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-3xl font-bold">{fatura.numeroFatura}</h1>
            <Badge variant={statusInfo.variant} className="flex items-center gap-1">
              <statusInfo.icon className="h-4 w-4" />
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-muted-foreground">Série {fatura.serie}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2">
            <Mail className="h-4 w-4" />
            Enviar por email
          </Button>
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Nota de Crédito
          </Button>
          <Button className="gap-2">
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{formatCurrency(fatura.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Subtotal</p>
            <p className="text-2xl font-bold">{formatCurrency(fatura.subtotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">IVA</p>
            <p className="text-2xl font-bold">{formatCurrency(fatura.ivaTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vencimento</p>
            <p className="text-2xl font-bold">
              {new Date(fatura.dataVencimento).toLocaleDateString('pt-PT')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">Cliente #{fatura.clienteId}</p>
            <p className="text-muted-foreground">Dados completos do cliente podem ser carregados da API real.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Informações da Fatura
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Data de emissão</p>
              <p className="font-medium">{new Date(fatura.dataEmissao).toLocaleDateString('pt-PT')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data de vencimento</p>
              <p className="font-medium">{new Date(fatura.dataVencimento).toLocaleDateString('pt-PT')}</p>
            </div>
            {fatura.dataPagamento && (
              <div>
                <p className="text-muted-foreground">Data de pagamento</p>
                <p className="font-medium">{new Date(fatura.dataPagamento).toLocaleDateString('pt-PT')}</p>
              </div>
            )}
            {fatura.qrCode && (
              <div>
                <p className="text-muted-foreground">QR Code</p>
                <p className="font-medium">{fatura.qrCode}</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Itens faturados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Qtd.</TableHead>
                  <TableHead>Preço Unit.</TableHead>
                  <TableHead>IVA</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fatura.itens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      Nenhum item registado na fatura.
                    </TableCell>
                  </TableRow>
                )}
                {fatura.itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.descricao}</TableCell>
                    <TableCell>{item.quantidade}</TableCell>
                    <TableCell>{formatCurrency(item.precoUnitario)}</TableCell>
                    <TableCell>{formatPercentage(item.taxaIva)}</TableCell>
                    <TableCell>{formatCurrency(item.subtotal)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
              <Calendar className="h-4 w-4" />
              <div>
                <p className="font-medium">Emissão</p>
                <p className="text-muted-foreground">{new Date(fatura.dataEmissao).toLocaleString('pt-PT')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4" />
              <div>
                <p className="font-medium">Vencimento</p>
                <p className="text-muted-foreground">{new Date(fatura.dataVencimento).toLocaleString('pt-PT')}</p>
              </div>
            </div>
            {fatura.dataPagamento && (
              <div className="flex items-center gap-3">
                <Wallet className="h-4 w-4" />
                <div>
                  <p className="font-medium">Pagamento</p>
                  <p className="text-muted-foreground">{new Date(fatura.dataPagamento).toLocaleString('pt-PT')}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Resumo Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(fatura.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="font-medium text-red-600">- {formatCurrency(fatura.descontoTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="font-medium">{formatCurrency(fatura.ivaTotal)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-semibold">Total a pagar</span>
              <span className="font-bold text-xl">{formatCurrency(fatura.total)}</span>
            </div>
          </CardContent>
        </Card>
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
    </div>
  );
}
