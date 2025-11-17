'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { 
  Search, 
  Filter,
  MoreHorizontal,
  DollarSign,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  Trophy,
  Download,
  Eye
} from 'lucide-react';
import { ComissaoVendedor } from '@/types/pedido';
import { toast } from '@/components/ui/use-toast';

interface DashboardComissoes {
  vendedorId: string;
  vendedorNome: string;
  totalMes: number;
  totalPendente: number;
  totalPago: number;
  percentualMeta: number;
  ranking: number;
}

export default function ComissoesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago'>('todos');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });

  // Dados de exemplo
  const vendedores = [
    { id: '1', nome: 'Maria Santos' },
    { id: '2', nome: 'Carlos Fernandes' },
    { id: '3', nome: 'Sofia Nunes' }
  ];

  const dashboardData: DashboardComissoes[] = [
    {
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      totalMes: 15750,
      totalPendente: 8500,
      totalPago: 7250,
      percentualMeta: 115,
      ranking: 1
    },
    {
      vendedorId: '2',
      vendedorNome: 'Carlos Fernandes',
      totalMes: 12300,
      totalPendente: 5200,
      totalPago: 7100,
      percentualMeta: 92,
      ranking: 2
    },
    {
      vendedorId: '3',
      vendedorNome: 'Sofia Nunes',
      totalMes: 10800,
      totalPendente: 4300,
      totalPago: 6500,
      percentualMeta: 87,
      ranking: 3
    }
  ];

  const comissoes: ComissaoVendedor[] = [
    {
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      percentualBase: 5,
      percentualAplicado: 7,
      valorBase: 55000,
      valorComissao: 3850,
      pedidoId: '1',
      pedidoNumero: 'PED-2024-001',
      data: new Date('2024-01-20'),
      pago: false
    },
    {
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      percentualBase: 5,
      percentualAplicado: 5,
      valorBase: 12500,
      valorComissao: 625,
      pedidoId: '2',
      pedidoNumero: 'PED-2024-002',
      data: new Date('2024-01-19'),
      pago: true
    },
    {
      vendedorId: '2',
      vendedorNome: 'Carlos Fernandes',
      percentualBase: 3,
      percentualAplicado: 3,
      valorBase: 18000,
      valorComissao: 540,
      pedidoId: '3',
      pedidoNumero: 'PED-2024-003',
      data: new Date('2024-01-19'),
      pago: false
    },
    {
      vendedorId: '3',
      vendedorNome: 'Sofia Nunes',
      percentualBase: 4,
      percentualAplicado: 4,
      valorBase: 22000,
      valorComissao: 880,
      pedidoId: '4',
      pedidoNumero: 'PED-2024-004',
      data: new Date('2024-01-18'),
      pago: true
    },
    ...Array.from({ length: 30 }, (_, i) => ({
      vendedorId: ['1', '2', '3'][Math.floor(Math.random() * 3)],
      vendedorNome: ['Maria Santos', 'Carlos Fernandes', 'Sofia Nunes'][Math.floor(Math.random() * 3)],
      percentualBase: [3, 4, 5][Math.floor(Math.random() * 3)],
      percentualAplicado: Math.random() > 0.7 ? [5, 6, 7][Math.floor(Math.random() * 3)] : [3, 4, 5][Math.floor(Math.random() * 3)],
      valorBase: Math.floor(Math.random() * 80000) + 5000,
      valorComissao: 0,
      pedidoId: `${i + 5}`,
      pedidoNumero: `PED-2024-${String(i + 5).padStart(3, '0')}`,
      data: new Date(2024, 0, Math.floor(Math.random() * 30) + 1),
      pago: Math.random() > 0.4
    })).map(comissao => ({
      ...comissao,
      valorComissao: Math.floor((comissao.valorBase * comissao.percentualAplicado) / 100)
    }))
  ];

  const filteredComissoes = comissoes.filter(comissao => {
    const matchesSearch = 
      comissao.vendedorNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comissao.pedidoNumero.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesVendedor = vendedorFilter === 'todos' || comissao.vendedorId === vendedorFilter;
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'pago' && comissao.pago) ||
      (statusFilter === 'pendente' && !comissao.pago);
    
    const matchesDate = 
      comissao.data >= dateRange.from && 
      comissao.data <= dateRange.to;

    return matchesSearch && matchesVendedor && matchesStatus && matchesDate;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredComissoes, initialItemsPerPage: 15 });

  const handleMarcarComoPago = (comissao: ComissaoVendedor) => {
    toast({
      title: "Comissão marcada como paga",
      description: `Comissão de ${comissao.vendedorNome} no valor de MT ${comissao.valorComissao.toFixed(2)}`,
    });
  };

  const handleExportarRelatorio = () => {
    toast({
      title: "Exportando relatório",
      description: "O relatório será baixado em breve",
    });
  };

  const getRankingIcon = (ranking: number) => {
    if (ranking === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (ranking === 2) return <Trophy className="h-4 w-4 text-gray-400" />;
    if (ranking === 3) return <Trophy className="h-4 w-4 text-orange-600" />;
    return null;
  };

  const totaisGerais = {
    totalComissoes: filteredComissoes.reduce((acc, c) => acc + c.valorComissao, 0),
    totalPendente: filteredComissoes.filter(c => !c.pago).reduce((acc, c) => acc + c.valorComissao, 0),
    totalPago: filteredComissoes.filter(c => c.pago).reduce((acc, c) => acc + c.valorComissao, 0),
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Comissões de Vendas</h1>
          <p className="text-muted-foreground">Gerencie as comissões dos vendedores</p>
        </div>
        <Button onClick={handleExportarRelatorio}>
          <Download className="h-4 w-4 mr-2" />
          Exportar Relatório
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dashboardData.map((vendedor) => (
          <Card key={vendedor.vendedorId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-medium">
                  {vendedor.vendedorNome}
                </CardTitle>
                {getRankingIcon(vendedor.ranking)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total do Mês</span>
                <span className="text-lg font-bold">MT {vendedor.totalMes.toFixed(2)}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pendente
                  </span>
                  <span className="text-orange-600">MT {vendedor.totalPendente.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Pago
                  </span>
                  <span className="text-green-600">MT {vendedor.totalPago.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Meta Mensal</span>
                  <Badge 
                    variant={vendedor.percentualMeta >= 100 ? "default" : "secondary"}
                    className="gap-1"
                  >
                    <TrendingUp className="h-3 w-3" />
                    {vendedor.percentualMeta}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Detalhes das Comissões</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                Total: MT {totaisGerais.totalComissoes.toFixed(2)}
              </Badge>
              <Badge variant="secondary">
                Pendente: MT {totaisGerais.totalPendente.toFixed(2)}
              </Badge>
              <Badge variant="default">
                Pago: MT {totaisGerais.totalPago.toFixed(2)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por vendedor ou pedido..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Vendedores</SelectItem>
                  {vendedores.map(vendedor => (
                    <SelectItem key={vendedor.id} value={vendedor.id}>
                      {vendedor.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>

              <DatePickerWithRange
                value={dateRange}
                onChange={setDateRange}
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Valor Base</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((comissao, index) => (
                  <TableRow key={`${comissao.pedidoId}-${index}`}>
                    <TableCell>{comissao.data.toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell className="font-medium">{comissao.pedidoNumero}</TableCell>
                    <TableCell>{comissao.vendedorNome}</TableCell>
                    <TableCell>MT {comissao.valorBase.toFixed(2)}</TableCell>
                    <TableCell>
                      {comissao.percentualAplicado !== comissao.percentualBase ? (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground line-through text-sm">
                            {comissao.percentualBase}%
                          </span>
                          <span className="font-medium text-green-600">
                            {comissao.percentualAplicado}%
                          </span>
                        </div>
                      ) : (
                        <span>{comissao.percentualBase}%</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      MT {comissao.valorComissao.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {comissao.pago ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Pago
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          {!comissao.pago && (
                            <DropdownMenuItem onClick={() => handleMarcarComoPago(comissao)}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Marcar como Pago
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <DollarSign className="h-12 w-12 opacity-50" />
                      <p>Nenhuma comissão encontrada</p>
                      <p className="text-sm">Tente ajustar os filtros ou período selecionado</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}