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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  Plus, 
  Filter,
  MoreHorizontal,
  Eye,
  Check,
  X,
  Package,
  Truck,
  FileText,
  ShoppingBag,
  Monitor,
  Globe
} from 'lucide-react';
import Link from 'next/link';
import { EstadoPedido, OrigemPedido, Pedido } from '@/types/pedido';

export default function PedidosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoPedido | 'todos'>('todos');
  const [origemFilter, setOrigemFilter] = useState<OrigemPedido | 'todos'>('todos');

  // Dados de exemplo - mais registros para demonstrar paginação
  const pedidos: Pedido[] = [
    {
      id: '1',
      numero: 'PED-2024-001',
      data: new Date('2024-01-20'),
      origem: 'loja',
      estado: 'pendente',
      clienteId: '1',
      clienteNome: 'João Silva',
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      comissaoPercentual: 5,
      comissaoValor: 625,
      itens: [],
      subtotal: 12500,
      desconto: 0,
      iva: 2125,
      total: 14625,
      lojaId: '1',
      lojaNome: 'Loja Centro',
      criadoPor: 'sistema',
      criadoEm: new Date('2024-01-20')
    },
    {
      id: '2',
      numero: 'PED-2024-002',
      data: new Date('2024-01-20'),
      origem: 'ecommerce',
      estado: 'confirmado',
      clienteId: '2',
      clienteNome: 'Ana Costa',
      itens: [],
      subtotal: 8500,
      desconto: 500,
      iva: 1360,
      total: 9360,
      criadoPor: 'ecommerce',
      criadoEm: new Date('2024-01-20')
    },
    {
      id: '3',
      numero: 'PED-2024-003',
      data: new Date('2024-01-19'),
      origem: 'pos',
      estado: 'faturado',
      clienteId: '3',
      clienteNome: 'Pedro Machado',
      vendedorId: '2',
      vendedorNome: 'Carlos Fernandes',
      comissaoPercentual: 3,
      comissaoValor: 540,
      itens: [],
      subtotal: 18000,
      desconto: 0,
      iva: 3060,
      total: 21060,
      faturaId: 'FAT-2024-001',
      lojaId: '2',
      lojaNome: 'Loja Norte',
      criadoPor: 'pos',
      criadoEm: new Date('2024-01-19')
    },
    ...Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 4}`,
      numero: `PED-2024-${String(i + 4).padStart(3, '0')}`,
      data: new Date(2024, 0, Math.floor(Math.random() * 30) + 1),
      origem: ['loja', 'pos', 'ecommerce', 'manual'][Math.floor(Math.random() * 4)] as OrigemPedido,
      estado: ['pendente', 'confirmado', 'faturado', 'entregue'][Math.floor(Math.random() * 4)] as EstadoPedido,
      clienteId: `${Math.floor(Math.random() * 10) + 1}`,
      clienteNome: [
        'Carlos Sousa', 'Maria Fernandes', 'António Pereira', 'Isabel Santos',
        'Manuel Costa', 'Rosa Silva', 'José Nunes', 'Clara Machado',
        'Paulo Oliveira', 'Luísa Rodrigues'
      ][Math.floor(Math.random() * 10)],
      vendedorId: Math.random() > 0.3 ? `${Math.floor(Math.random() * 3) + 1}` : undefined,
      vendedorNome: Math.random() > 0.3 ? ['Maria Santos', 'Carlos Fernandes', 'Sofia Nunes'][Math.floor(Math.random() * 3)] : undefined,
      comissaoPercentual: Math.random() > 0.3 ? [3, 4, 5][Math.floor(Math.random() * 3)] : undefined,
      comissaoValor: Math.random() > 0.3 ? Math.floor(Math.random() * 2000) + 200 : undefined,
      itens: [],
      subtotal: Math.floor(Math.random() * 50000) + 5000,
      desconto: Math.floor(Math.random() * 1000),
      iva: 0,
      total: 0,
      lojaId: `${Math.floor(Math.random() * 3) + 1}`,
      lojaNome: ['Loja Centro', 'Loja Norte', 'Loja Sul'][Math.floor(Math.random() * 3)],
      criadoPor: 'sistema',
      criadoEm: new Date(2024, 0, Math.floor(Math.random() * 30) + 1)
    })).map(pedido => ({
      ...pedido,
      iva: Math.floor(pedido.subtotal * 0.17),
      total: pedido.subtotal - pedido.desconto + Math.floor(pedido.subtotal * 0.17)
    }))
  ];

  const getEstadoBadge = (estado: EstadoPedido) => {
    const variants = {
      pendente: { variant: 'secondary' as const, icon: <Package className="h-3 w-3" /> },
      confirmado: { variant: 'default' as const, icon: <Check className="h-3 w-3" /> },
      faturado: { variant: 'outline' as const, icon: <FileText className="h-3 w-3" /> },
      entregue: { variant: 'default' as const, icon: <Truck className="h-3 w-3" /> },
      cancelado: { variant: 'destructive' as const, icon: <X className="h-3 w-3" /> }
    };

    const { variant, icon } = variants[estado];
    
    return (
      <Badge variant={variant} className="gap-1">
        {icon}
        {estado.charAt(0).toUpperCase() + estado.slice(1)}
      </Badge>
    );
  };

  const getOrigemIcon = (origem: OrigemPedido) => {
    const icons = {
      loja: <ShoppingBag className="h-4 w-4" />,
      pos: <Monitor className="h-4 w-4" />,
      ecommerce: <Globe className="h-4 w-4" />,
      manual: <FileText className="h-4 w-4" />
    };
    return icons[origem];
  };

  const filteredPedidos = pedidos.filter(pedido => {
    const matchesSearch = 
      pedido.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pedido.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (pedido.vendedorNome && pedido.vendedorNome.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesEstado = estadoFilter === 'todos' || pedido.estado === estadoFilter;
    const matchesOrigem = origemFilter === 'todos' || pedido.origem === origemFilter;

    return matchesSearch && matchesEstado && matchesOrigem;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredPedidos, initialItemsPerPage: 10 });

  const handleAlterarEstado = (pedidoId: string, novoEstado: EstadoPedido) => {
    // Implementar lógica de alteração de estado
    console.log('Alterar estado do pedido', pedidoId, 'para', novoEstado);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Pedidos</h1>
          <p className="text-muted-foreground">Gerencie todos os pedidos de vendas</p>
        </div>
        <Button asChild>
          <Link href="/vendas/pedidos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Pedido Manual
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por número, cliente ou vendedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={estadoFilter} onValueChange={(value: any) => setEstadoFilter(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Estados</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="faturado">Faturado</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={origemFilter} onValueChange={(value: any) => setOrigemFilter(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Origens</SelectItem>
                  <SelectItem value="loja">Loja</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="ecommerce">E-commerce</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((pedido) => (
                  <TableRow key={pedido.id}>
                    <TableCell className="font-medium">{pedido.numero}</TableCell>
                    <TableCell>{pedido.data.toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>{pedido.clienteNome}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getOrigemIcon(pedido.origem)}
                        <span className="capitalize">{pedido.origem}</span>
                      </div>
                    </TableCell>
                    <TableCell>{pedido.vendedorNome || '-'}</TableCell>
                    <TableCell>MT {pedido.total.toFixed(2)}</TableCell>
                    <TableCell>{getEstadoBadge(pedido.estado)}</TableCell>
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
                          <DropdownMenuItem asChild>
                            <Link href={`/vendas/pedidos/${pedido.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Alterar Estado</DropdownMenuLabel>
                          {pedido.estado === 'pendente' && (
                            <DropdownMenuItem onClick={() => handleAlterarEstado(pedido.id, 'confirmado')}>
                              <Check className="h-4 w-4 mr-2" />
                              Confirmar
                            </DropdownMenuItem>
                          )}
                          {pedido.estado === 'confirmado' && (
                            <DropdownMenuItem onClick={() => handleAlterarEstado(pedido.id, 'faturado')}>
                              <FileText className="h-4 w-4 mr-2" />
                              Faturar
                            </DropdownMenuItem>
                          )}
                          {pedido.estado === 'faturado' && (
                            <DropdownMenuItem onClick={() => handleAlterarEstado(pedido.id, 'entregue')}>
                              <Truck className="h-4 w-4 mr-2" />
                              Marcar como Entregue
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleAlterarEstado(pedido.id, 'cancelado')}
                            className="text-destructive"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancelar Pedido
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-12 w-12 opacity-50" />
                      <p>Nenhum pedido encontrado</p>
                      <p className="text-sm">Tente ajustar os filtros ou criar um novo pedido</p>
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