'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Copy,
  Factory,
  Package,
  Component,
  Layers,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Calculator,
  TreePine,
  Box,
  ArrowRight,
  ArrowDown,
  Settings,
  Filter,
  Download,
  RefreshCw,
  Workflow,
  BarChart3,
  TrendingUp,
  Target,
  FileText
} from 'lucide-react';
import Link from 'next/link';

interface ComponenteBOM {
  id: string;
  codigoComponente: string;
  nomeComponente: string;
  categoria: 'materia_prima' | 'componente' | 'subconjunto' | 'produto_acabado';
  quantidade: number;
  unidadeMedida: string;
  custo: number;
  nivel: number;
  perdaPrevista: number;
  estoque: number;
  stockMinimo: number;
  tempoLead: number;
  fornecedorPrincipal?: string;
  observacoes?: string;
  subcomponentes?: ComponenteBOM[];
  ativo: boolean;
}

interface EstruturaProduto {
  id: string;
  codigoProduto: string;
  nomeProduto: string;
  versao: string;
  status: 'rascunho' | 'ativo' | 'inativo' | 'substituido';
  categoria: string;
  unidadeProducao: string;
  custoTotal: number;
  tempoProducao: number;
  responsavel: string;
  dataCriacao: string;
  dataAtualizacao: string;
  observacoes?: string;
  componentes: ComponenteBOM[];
  nivelComplexidade: 'baixo' | 'medio' | 'alto';
}

export default function EstruturaPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todos');
  const [selectedEstrutura, setSelectedEstrutura] = useState<EstruturaProduto | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Mock data
  const estruturas: EstruturaProduto[] = [
    {
      id: '1',
      codigoProduto: 'PROD-001',
      nomeProduto: 'Bolo de Chocolate Premium',
      versao: 'v2.1',
      status: 'ativo',
      categoria: 'Produtos de Padaria',
      unidadeProducao: 'unidade',
      custoTotal: 125.50,
      tempoProducao: 180,
      responsavel: 'Maria Santos',
      dataCriacao: '2024-01-15',
      dataAtualizacao: '2024-10-15',
      nivelComplexidade: 'medio',
      componentes: [
        {
          id: '1-1',
          codigoComponente: 'MAT-001',
          nomeComponente: 'Farinha de Trigo',
          categoria: 'materia_prima',
          quantidade: 2.5,
          unidadeMedida: 'kg',
          custo: 25.00,
          nivel: 1,
          perdaPrevista: 0.05,
          estoque: 150,
          stockMinimo: 50,
          tempoLead: 3,
          fornecedorPrincipal: 'Moageira Central',
          ativo: true
        },
        {
          id: '1-2',
          codigoComponente: 'MAT-002',
          nomeComponente: 'Ovos Frescos',
          categoria: 'materia_prima',
          quantidade: 12,
          unidadeMedida: 'unidades',
          custo: 30.00,
          nivel: 1,
          perdaPrevista: 0.02,
          estoque: 200,
          stockMinimo: 36,
          tempoLead: 1,
          fornecedorPrincipal: 'Aviário do Sul',
          ativo: true
        },
        {
          id: '1-3',
          codigoComponente: 'SUB-001',
          nomeComponente: 'Mistura Base Chocolate',
          categoria: 'subconjunto',
          quantidade: 1,
          unidadeMedida: 'kg',
          custo: 45.00,
          nivel: 1,
          perdaPrevista: 0.03,
          estoque: 25,
          stockMinimo: 10,
          tempoLead: 5,
          ativo: true,
          subcomponentes: [
            {
              id: '1-3-1',
              codigoComponente: 'MAT-003',
              nomeComponente: 'Cacau em Pó',
              categoria: 'materia_prima',
              quantidade: 0.5,
              unidadeMedida: 'kg',
              custo: 80.00,
              nivel: 2,
              perdaPrevista: 0.01,
              estoque: 30,
              stockMinimo: 5,
              tempoLead: 7,
              fornecedorPrincipal: 'Cacau Moçambique',
              ativo: true
            }
          ]
        }
      ]
    },
    {
      id: '2',
      codigoProduto: 'PROD-002',
      nomeProduto: 'Mesa de Escritório Executive',
      versao: 'v1.0',
      status: 'ativo',
      categoria: 'Móveis',
      unidadeProducao: 'unidade',
      custoTotal: 2850.00,
      tempoProducao: 720,
      responsavel: 'João Silva',
      dataCriacao: '2024-02-10',
      dataAtualizacao: '2024-10-10',
      nivelComplexidade: 'alto',
      componentes: [
        {
          id: '2-1',
          codigoComponente: 'MAT-101',
          nomeComponente: 'Prancha MDF 25mm',
          categoria: 'materia_prima',
          quantidade: 4,
          unidadeMedida: 'peças',
          custo: 450.00,
          nivel: 1,
          perdaPrevista: 0.10,
          estoque: 50,
          stockMinimo: 20,
          tempoLead: 5,
          fornecedorPrincipal: 'MadeiraMoz',
          ativo: true
        }
      ]
    }
  ];

  const filteredEstruturas = estruturas.filter(estrutura => {
    const matchesSearch = estrutura.nomeProduto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         estrutura.codigoProduto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || estrutura.status === statusFilter;
    const matchesCategoria = categoriaFilter === 'todos' || estrutura.categoria === categoriaFilter;
    
    return matchesSearch && matchesStatus && matchesCategoria;
  });

  const { currentPage, totalPages, itemsPerPage, totalItems, paginatedData, handlePageChange, handleItemsPerPageChange } = 
    usePagination({ data: filteredEstruturas, initialItemsPerPage: 10 });

  const getStatusBadge = (status: string) => {
    const variants = {
      ativo: 'default',
      rascunho: 'secondary',
      inativo: 'destructive',
      substituido: 'outline'
    } as const;
    
    return <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>{status}</Badge>;
  };

  const getComplexidadeBadge = (complexidade: string) => {
    const colors = {
      baixo: 'bg-green-100 text-green-800',
      medio: 'bg-yellow-100 text-yellow-800',
      alto: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={colors[complexidade as keyof typeof colors]}>
        {complexidade}
      </Badge>
    );
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const calcularDisponibilidade = (componente: ComponenteBOM): boolean => {
    const quantidadeNecessaria = componente.quantidade * (1 + componente.perdaPrevista);
    return componente.estoque >= quantidadeNecessaria;
  };

  const renderComponenteTree = (componentes: ComponenteBOM[], nivel: number = 0) => {
    return componentes.map((componente) => (
      <div key={componente.id} className={`ml-${nivel * 4}`}>
        <div className="flex items-center gap-2 p-2 border-l-2 border-gray-200">
          {componente.subcomponentes && componente.subcomponentes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleExpanded(componente.id)}
            >
              {expandedItems.has(componente.id) ? <ArrowDown className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
            </Button>
          )}
          
          <div className="flex items-center gap-2 flex-1">
            {componente.categoria === 'materia_prima' && <Package className="h-4 w-4 text-blue-500" />}
            {componente.categoria === 'componente' && <Component className="h-4 w-4 text-green-500" />}
            {componente.categoria === 'subconjunto' && <Box className="h-4 w-4 text-purple-500" />}
            
            <div className="flex-1">
              <div className="font-medium text-sm">{componente.nomeComponente}</div>
              <div className="text-xs text-gray-500">{componente.codigoComponente}</div>
            </div>
            
            <div className="text-right">
              <div className="text-sm font-medium">
                {componente.quantidade} {componente.unidadeMedida}
              </div>
              <div className="text-xs text-gray-500">
                MT {componente.custo.toFixed(2)}
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {calcularDisponibilidade(componente) ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
              <Badge variant={componente.ativo ? 'default' : 'destructive'} className="text-xs">
                {componente.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </div>
        </div>
        
        {expandedItems.has(componente.id) && componente.subcomponentes && (
          <div className="ml-4">
            {renderComponenteTree(componente.subcomponentes, nivel + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Estrutura de Produto (BOM)</h1>
          <p className="text-muted-foreground">Gestão de estruturas e lista de materiais</p>
        </div>
        <Button asChild>
          <Link href="/producao/estrutura/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Estrutura
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList>
          <TabsTrigger value="lista">Lista de Estruturas</TabsTrigger>
          <TabsTrigger value="arvore">Visualização em Árvore</TabsTrigger>
          <TabsTrigger value="validacao">Validação de Stock</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="h-5 w-5" />
                Estruturas de Produto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por produto ou código..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10"
                    />
                  </div>
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Status</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="substituido">Substituído</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas Categorias</SelectItem>
                    <SelectItem value="Produtos de Padaria">Produtos de Padaria</SelectItem>
                    <SelectItem value="Móveis">Móveis</SelectItem>
                    <SelectItem value="Eletrônicos">Eletrônicos</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
                
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Versão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Complexidade</TableHead>
                      <TableHead>Custo Total</TableHead>
                      <TableHead>Tempo Produção</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Última Atualização</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((estrutura) => (
                      <TableRow key={estrutura.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{estrutura.nomeProduto}</div>
                            <div className="text-sm text-gray-500">{estrutura.codigoProduto}</div>
                          </div>
                        </TableCell>
                        <TableCell>{estrutura.versao}</TableCell>
                        <TableCell>{getStatusBadge(estrutura.status)}</TableCell>
                        <TableCell>{estrutura.categoria}</TableCell>
                        <TableCell>{getComplexidadeBadge(estrutura.nivelComplexidade)}</TableCell>
                        <TableCell>MT {estrutura.custoTotal.toLocaleString()}</TableCell>
                        <TableCell>{estrutura.tempoProducao} min</TableCell>
                        <TableCell>{estrutura.responsavel}</TableCell>
                        <TableCell>{new Date(estrutura.dataAtualizacao).toLocaleDateString('pt-PT')}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => {
                                setSelectedEstrutura(estrutura);
                                setIsDialogOpen(true);
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Calculator className="mr-2 h-4 w-4" />
                                Recalcular Custos
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                Gerar Relatório
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

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
        </TabsContent>

        <TabsContent value="arvore" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" />
                Estrutura em Árvore
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEstrutura ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                    <Factory className="h-8 w-8 text-blue-600" />
                    <div>
                      <h3 className="font-semibold text-lg">{selectedEstrutura.nomeProduto}</h3>
                      <p className="text-sm text-gray-600">{selectedEstrutura.codigoProduto} - {selectedEstrutura.versao}</p>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg">
                    {renderComponenteTree(selectedEstrutura.componentes)}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <TreePine className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Selecione uma estrutura para visualizar a árvore de componentes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Validação de Disponibilidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">Disponíveis</p>
                        <p className="text-2xl font-bold text-green-600">127</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      <div>
                        <p className="text-sm font-medium">Stock Baixo</p>
                        <p className="text-2xl font-bold text-yellow-600">23</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="text-sm font-medium">Em Falta</p>
                        <p className="text-2xl font-bold text-red-600">8</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Total Estruturas</p>
                    <p className="text-2xl font-bold">158</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Estruturas Ativas</p>
                    <p className="text-2xl font-bold">142</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Custo Médio</p>
                    <p className="text-2xl font-bold">MT 1.2K</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium">Componentes Únicos</p>
                    <p className="text-2xl font-bold">486</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Detalhes da Estrutura
            </DialogTitle>
            <DialogDescription>
              Visualização completa da estrutura de produto e componentes
            </DialogDescription>
          </DialogHeader>
          
          {selectedEstrutura && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Produto</Label>
                  <p className="text-sm">{selectedEstrutura.nomeProduto}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Código</Label>
                  <p className="text-sm">{selectedEstrutura.codigoProduto}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Versão</Label>
                  <p className="text-sm">{selectedEstrutura.versao}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedEstrutura.status)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Custo Total</Label>
                  <p className="text-sm font-medium">MT {selectedEstrutura.custoTotal.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Tempo de Produção</Label>
                  <p className="text-sm">{selectedEstrutura.tempoProducao} minutos</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Componentes</Label>
                <div className="border rounded-lg">
                  {renderComponenteTree(selectedEstrutura.componentes)}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button>
              <Edit className="mr-2 h-4 w-4" />
              Editar Estrutura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}