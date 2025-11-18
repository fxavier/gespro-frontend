'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Eye,
  Download,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
  TrendingUp
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';
import type { Fatura } from '@/types/fatura';
import { faturasMock as faturasData } from '@/data/faturacao';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' });

const statusBadge = (status: Fatura['statusFatura']) => {
  switch (status) {
    case 'paga':
      return (
        <Badge className="bg-green-600 hover:bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Paga
        </Badge>
      );
    case 'emitida':
      return (
        <Badge className="bg-blue-600 hover:bg-blue-600">
          <Clock className="h-3 w-3 mr-1" />
          Emitida
        </Badge>
      );
    case 'vencida':
      return (
        <Badge className="bg-red-600 hover:bg-red-600">
          <XCircle className="h-3 w-3 mr-1" />
          Vencida
        </Badge>
      );
    case 'cancelada':
      return (
        <Badge variant="secondary">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelada
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export default function FaturacaoPage() {
  const [faturas] = useState<Fatura[]>(faturasData);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | Fatura['statusFatura']>('todos');

  const dadosFiltrados = useMemo(() => {
    return faturas.filter((fatura) => {
      const matchBusca =
        busca === '' || fatura.numeroFatura.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || fatura.statusFatura === filtroStatus;
      return matchBusca && matchStatus;
    });
  }, [faturas, busca, filtroStatus]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const totalFaturado = faturas.reduce((acc, f) => acc + f.total, 0);
  const totalPago = faturas.filter((f) => f.statusFatura === 'paga').reduce((acc, f) => acc + f.total, 0);
  const totalPendente = faturas.filter((f) => f.statusFatura === 'emitida').reduce((acc, f) => acc + f.total, 0);
  const totalVencido = faturas.filter((f) => f.statusFatura === 'vencida').reduce((acc, f) => acc + f.total, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Faturação</h1>
          <p className="text-muted-foreground">Gerir faturas, pagamentos e documentos fiscais</p>
        </div>
        <Button className="gap-2" asChild>
          <Link href="/vendas/faturas/nova">
            <Plus className="h-4 w-4" />
            Nova Fatura
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Faturado</p>
                <p className="text-2xl font-bold">{formatCurrency(totalFaturado)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pagas</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPago)}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalPendente)}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalVencido)}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Pesquisa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por número de fatura..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filtroStatus} onValueChange={(value: any) => setFiltroStatus(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="emitida">Emitida</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros Avançados
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Faturas ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Fatura</TableHead>
                  <TableHead>Data Emissão</TableHead>
                  <TableHead>Data Vencimento</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>IVA</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((fatura) => (
                  <TableRow key={fatura.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {fatura.numeroFatura}
                    </TableCell>
                    <TableCell>{new Date(fatura.dataEmissao).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>{new Date(fatura.dataVencimento).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>{formatCurrency(fatura.subtotal)}</TableCell>
                    <TableCell>{formatCurrency(fatura.ivaTotal)}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(fatura.total)}</TableCell>
                    <TableCell>{statusBadge(fatura.statusFatura)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma fatura encontrada</p>
            </div>
          )}

          {dadosFiltrados.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={totalItems}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
