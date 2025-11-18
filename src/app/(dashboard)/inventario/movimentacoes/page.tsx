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
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  Package,
  RotateCcw,
  Minus,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  MapPin,
  Calendar
} from 'lucide-react';
import Link from 'next/link';
import { MovimentacaoAtivo, TipoMovimentacao } from '@/types/inventario';
import { movimentacoesMock } from '@/data/movimentacoes';

export default function MovimentacoesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<TipoMovimentacao | 'todos'>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'confirmada' | 'pendente'>('todos');
  const [localizacaoFilter, setLocalizacaoFilter] = useState<string>('todos');

  // Dados de exemplo
  const movimentacoes: MovimentacaoAtivo[] = movimentacoesMock;


  const localizacoes = [
    { id: '1', nome: 'Armazém Principal' },
    { id: '2', nome: 'Escritório Central' },
    { id: '3', nome: 'Departamento de TI' },
    { id: '4', nome: 'Sala Diretoria' },
    { id: '6', nome: 'Sala de Conferências' },
    { id: '7', nome: 'Área Técnica' }
  ];

  const filteredMovimentacoes = movimentacoes.filter(movimentacao => {
    const matchesSearch = 
      movimentacao.ativoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (movimentacao.guiaMovimentacao && movimentacao.guiaMovimentacao.toLowerCase().includes(searchTerm.toLowerCase())) ||
      movimentacao.motivo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTipo = tipoFilter === 'todos' || movimentacao.tipo === tipoFilter;
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'confirmada' && movimentacao.confirmada) ||
      (statusFilter === 'pendente' && !movimentacao.confirmada);
    
    const matchesLocalizacao = 
      localizacaoFilter === 'todos' || 
      movimentacao.localizacaoOrigem === localizacaoFilter ||
      movimentacao.localizacaoDestino === localizacaoFilter;

    return matchesSearch && matchesTipo && matchesStatus && matchesLocalizacao;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredMovimentacoes, initialItemsPerPage: 10 });

  const getTipoInfo = (tipo: TipoMovimentacao) => {
    const tipos = {
      entrada: { label: 'Entrada', icon: ArrowUp, color: 'bg-green-100 text-green-800' },
      saida: { label: 'Saída', icon: ArrowDown, color: 'bg-red-100 text-red-800' },
      transferencia: { label: 'Transferência', icon: ArrowRightLeft, color: 'bg-blue-100 text-blue-800' },
      emprestimo: { label: 'Empréstimo', icon: Package, color: 'bg-orange-100 text-orange-800' },
      devolucao: { label: 'Devolução', icon: RotateCcw, color: 'bg-purple-100 text-purple-800' },
      baixa: { label: 'Baixa', icon: Minus, color: 'bg-gray-100 text-gray-800' },
      ajuste: { label: 'Ajuste', icon: FileText, color: 'bg-yellow-100 text-yellow-800' }
    };
    return tipos[tipo];
  };

  const handleConfirmarMovimentacao = (movimentacao: MovimentacaoAtivo) => {
    toast({
      title: "Movimentação confirmada",
      description: `A movimentação ${movimentacao.guiaMovimentacao} foi confirmada`,
    });
  };

  const handleExportarRelatorio = () => {
    toast({
      title: "Exportando relatório",
      description: "O relatório de movimentações será baixado em breve",
    });
  };

  // Estatísticas rápidas
  const estatisticas = {
    totalMovimentacoes: movimentacoes.length,
    pendentesConfirmacao: movimentacoes.filter(m => !m.confirmada).length,
    transferenciasHoje: movimentacoes.filter(m => 
      m.tipo === 'transferencia' && 
      m.dataMovimentacao.toDateString() === new Date().toDateString()
    ).length,
    emprestimosAtivos: movimentacoes.filter(m => 
      m.tipo === 'emprestimo' && !m.confirmada
    ).length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Movimentações de Ativos</h1>
          <p className="text-muted-foreground">Controle de entradas, saídas e transferências</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportarRelatorio}>
            <Download className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Button asChild>
            <Link href="/inventario/movimentacoes/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Movimentação
            </Link>
          </Button>
        </div>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Movimentações</p>
                <p className="text-2xl font-bold">{estatisticas.totalMovimentacoes}</p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold">{estatisticas.pendentesConfirmacao}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Transferências Hoje</p>
                <p className="text-2xl font-bold">{estatisticas.transferenciasHoje}</p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Empréstimos Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.emprestimosAtivos}</p>
              </div>
              <Package className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por ativo, guia ou motivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={tipoFilter} onValueChange={(value: any) => setTipoFilter(value)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="emprestimo">Empréstimo</SelectItem>
                  <SelectItem value="devolucao">Devolução</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="confirmada">Confirmadas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                </SelectContent>
              </Select>

              <Select value={localizacaoFilter} onValueChange={setLocalizacaoFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Localização" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {localizacoes.map(localizacao => (
                    <SelectItem key={localizacao.id} value={localizacao.id}>
                      {localizacao.nome}
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
                <TableHead>Guia</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origem → Destino</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((movimentacao) => {
                  const tipoInfo = getTipoInfo(movimentacao.tipo);
                  return (
                    <TableRow key={movimentacao.id}>
                      <TableCell className="font-medium">
                        {movimentacao.guiaMovimentacao}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{movimentacao.ativoNome}</div>
                          <div className="text-sm text-muted-foreground">
                            {movimentacao.motivo}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${tipoInfo.color}`}>
                          <tipoInfo.icon className="h-3 w-3" />
                          {tipoInfo.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {movimentacao.localizacaoOrigemNome && (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span>{movimentacao.localizacaoOrigemNome}</span>
                            </div>
                          )}
                          {movimentacao.localizacaoDestinoNome && (
                            <div className="flex items-center gap-1 text-sm">
                              <ArrowDown className="h-3 w-3 text-muted-foreground" />
                              <span>{movimentacao.localizacaoDestinoNome}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {movimentacao.responsavelOrigemNome && (
                            <div className="flex items-center gap-1 text-sm">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span>{movimentacao.responsavelOrigemNome}</span>
                            </div>
                          )}
                          {movimentacao.responsavelDestinoNome && (
                            <div className="flex items-center gap-1 text-sm">
                              <ArrowDown className="h-3 w-3 text-muted-foreground" />
                              <span>{movimentacao.responsavelDestinoNome}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span>{movimentacao.dataMovimentacao.toLocaleDateString('pt-PT')}</span>
                          </div>
                          {movimentacao.dataPrevisaoDevolucao && (
                            <div className="text-xs text-orange-600">
                              Devolução: {movimentacao.dataPrevisaoDevolucao.toLocaleDateString('pt-PT')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {movimentacao.confirmada ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Confirmada
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
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/movimentacoes/${movimentacao.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            {!movimentacao.confirmada && (
                              <DropdownMenuItem onClick={() => handleConfirmarMovimentacao(movimentacao)}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Confirmar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <FileText className="h-4 w-4 mr-2" />
                              Gerar Guia
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="h-4 w-4 mr-2" />
                              Baixar PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ArrowRightLeft className="h-12 w-12 opacity-50" />
                      <p>Nenhuma movimentação encontrada</p>
                      <p className="text-sm">Tente ajustar os filtros ou criar uma nova movimentação</p>
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
