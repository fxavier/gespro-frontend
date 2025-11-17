'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import { 
  Search, 
  Plus, 
  MoreHorizontal,
  Edit,
  Trash2,
  User,
  DollarSign,
  TrendingUp,
  Target,
  Settings,
  Eye,
  UserCheck,
  UserX
} from 'lucide-react';
import Link from 'next/link';

interface Vendedor {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  nif: string;
  comissaoPercentualPadrao: number;
  ativo: boolean;
  lojaId?: string;
  lojaNome?: string;
  meta?: {
    mensal: number;
    trimestral: number;
    anual: number;
  };
  estatisticas?: {
    vendasMes: number;
    comissoesMes: number;
    metaAtingida: number;
    ranking: number;
  };
  dataAdmissao: Date;
  categoria: 'junior' | 'pleno' | 'senior' | 'gerente';
}

export default function VendedoresPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [lojaFilter, setLojaFilter] = useState<string>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<Vendedor | null>(null);

  // Dados de exemplo
  const vendedores: Vendedor[] = [
    {
      id: '1',
      nome: 'Maria Santos',
      email: 'maria.santos@empresa.com',
      telefone: '849000001',
      nif: '123456789',
      comissaoPercentualPadrao: 5,
      ativo: true,
      lojaId: '1',
      lojaNome: 'Loja Centro',
      meta: {
        mensal: 100000,
        trimestral: 300000,
        anual: 1200000
      },
      estatisticas: {
        vendasMes: 125000,
        comissoesMes: 6250,
        metaAtingida: 125,
        ranking: 1
      },
      dataAdmissao: new Date('2022-03-15'),
      categoria: 'senior'
    },
    {
      id: '2',
      nome: 'Carlos Fernandes',
      email: 'carlos.fernandes@empresa.com',
      telefone: '849000002',
      nif: '987654321',
      comissaoPercentualPadrao: 3,
      ativo: true,
      lojaId: '2',
      lojaNome: 'Loja Norte',
      meta: {
        mensal: 80000,
        trimestral: 240000,
        anual: 960000
      },
      estatisticas: {
        vendasMes: 73600,
        comissoesMes: 2208,
        metaAtingida: 92,
        ranking: 2
      },
      dataAdmissao: new Date('2023-01-10'),
      categoria: 'pleno'
    },
    {
      id: '3',
      nome: 'Sofia Nunes',
      email: 'sofia.nunes@empresa.com',
      telefone: '849000003',
      nif: '456789123',
      comissaoPercentualPadrao: 4,
      ativo: true,
      lojaId: '1',
      lojaNome: 'Loja Centro',
      meta: {
        mensal: 70000,
        trimestral: 210000,
        anual: 840000
      },
      estatisticas: {
        vendasMes: 60900,
        comissoesMes: 2436,
        metaAtingida: 87,
        ranking: 3
      },
      dataAdmissao: new Date('2023-06-20'),
      categoria: 'junior'
    },
    {
      id: '4',
      nome: 'António Silva',
      email: 'antonio.silva@empresa.com',
      telefone: '849000004',
      nif: '789123456',
      comissaoPercentualPadrao: 2.5,
      ativo: false,
      lojaId: '3',
      lojaNome: 'Loja Sul',
      dataAdmissao: new Date('2021-11-05'),
      categoria: 'junior'
    },
    {
      id: '5',
      nome: 'Paula Rodrigues',
      email: 'paula.rodrigues@empresa.com',
      telefone: '849000005',
      nif: '321654987',
      comissaoPercentualPadrao: 6,
      ativo: true,
      lojaId: '2',
      lojaNome: 'Loja Norte',
      meta: {
        mensal: 150000,
        trimestral: 450000,
        anual: 1800000
      },
      estatisticas: {
        vendasMes: 142000,
        comissoesMes: 8520,
        metaAtingida: 95,
        ranking: 2
      },
      dataAdmissao: new Date('2020-08-12'),
      categoria: 'gerente'
    }
  ];

  const lojas = [
    { id: '1', nome: 'Loja Centro' },
    { id: '2', nome: 'Loja Norte' },
    { id: '3', nome: 'Loja Sul' }
  ];

  const filteredVendedores = vendedores.filter(vendedor => {
    const matchesSearch = 
      vendedor.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendedor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendedor.telefone.includes(searchTerm);
    
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'ativo' && vendedor.ativo) ||
      (statusFilter === 'inativo' && !vendedor.ativo);
    
    const matchesLoja = lojaFilter === 'todos' || vendedor.lojaId === lojaFilter;

    return matchesSearch && matchesStatus && matchesLoja;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredVendedores, initialItemsPerPage: 10 });

  const getCategoriaColor = (categoria: string) => {
    const colors = {
      junior: 'bg-blue-100 text-blue-800',
      pleno: 'bg-green-100 text-green-800',
      senior: 'bg-purple-100 text-purple-800',
      gerente: 'bg-red-100 text-red-800'
    };
    return colors[categoria as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const handleToggleStatus = (vendedor: Vendedor) => {
    toast({
      title: vendedor.ativo ? "Vendedor desativado" : "Vendedor ativado",
      description: `${vendedor.nome} foi ${vendedor.ativo ? 'desativado' : 'ativado'} com sucesso`,
    });
  };

  const handleDelete = (vendedor: Vendedor) => {
    toast({
      title: "Vendedor removido",
      description: `${vendedor.nome} foi removido do sistema`,
      variant: "destructive"
    });
  };

  const handleSave = () => {
    setIsDialogOpen(false);
    setEditingVendedor(null);
    toast({
      title: editingVendedor ? "Vendedor atualizado" : "Vendedor criado",
      description: "As informações foram salvas com sucesso",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Vendedores</h1>
          <p className="text-muted-foreground">Gerencie vendedores e suas configurações de comissão</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingVendedor(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Vendedor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {editingVendedor ? 'Editar Vendedor' : 'Novo Vendedor'}
              </DialogTitle>
              <DialogDescription>
                Configure as informações básicas e comissão do vendedor
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" placeholder="Nome completo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" placeholder="email@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input id="telefone" placeholder="849000000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nif">NIF</Label>
                <Input id="nif" placeholder="123456789" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loja">Loja</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {lojas.map(loja => (
                      <SelectItem key={loja.id} value={loja.id}>
                        {loja.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior">Júnior</SelectItem>
                    <SelectItem value="pleno">Pleno</SelectItem>
                    <SelectItem value="senior">Sénior</SelectItem>
                    <SelectItem value="gerente">Gerente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="comissao">Comissão Padrão (%)</Label>
                <Input id="comissao" type="number" step="0.1" placeholder="5.0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta">Meta Mensal (MT)</Label>
                <Input id="meta" type="number" placeholder="100000" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingVendedor ? 'Atualizar' : 'Criar'} Vendedor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, email ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                </SelectContent>
              </Select>

              <Select value={lojaFilter} onValueChange={setLojaFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Loja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Lojas</SelectItem>
                  {lojas.map(loja => (
                    <SelectItem key={loja.id} value={loja.id}>
                      {loja.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Meta Mensal</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((vendedor) => (
                  <TableRow key={vendedor.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{vendedor.nome}</div>
                        <div className="text-sm text-muted-foreground">{vendedor.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{vendedor.lojaNome || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoriaColor(vendedor.categoria)}`}>
                        {vendedor.categoria.charAt(0).toUpperCase() + vendedor.categoria.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell>{vendedor.comissaoPercentualPadrao}%</TableCell>
                    <TableCell>
                      {vendedor.meta ? `MT ${vendedor.meta.mensal.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell>
                      {vendedor.estatisticas ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-3 w-3" />
                            <span className="text-sm">{vendedor.estatisticas.metaAtingida}%</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Ranking #{vendedor.estatisticas.ranking}
                          </div>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {vendedor.ativo ? (
                        <Badge variant="default" className="gap-1">
                          <UserCheck className="h-3 w-3" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <UserX className="h-3 w-3" />
                          Inativo
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
                          <DropdownMenuItem asChild>
                            <Link href={`/vendas/vendedores/${vendedor.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => {
                              setEditingVendedor(vendedor);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/vendas/vendedores/${vendedor.id}/comissoes`}>
                              <Settings className="h-4 w-4 mr-2" />
                              Configurar Comissões
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggleStatus(vendedor)}>
                            {vendedor.ativo ? (
                              <>
                                <UserX className="h-4 w-4 mr-2" />
                                Desativar
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Ativar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(vendedor)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remover
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
                      <User className="h-12 w-12 opacity-50" />
                      <p>Nenhum vendedor encontrado</p>
                      <p className="text-sm">Tente ajustar os filtros ou adicionar um novo vendedor</p>
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