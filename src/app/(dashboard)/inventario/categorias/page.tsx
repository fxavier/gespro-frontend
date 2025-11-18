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
  Trash2,
  CheckCircle,
  XCircle,
  Package,
  Monitor,
  Car,
  Wrench,
  Building,
  Heart,
  Layers,
  Tag,
  Users,
  BarChart3,
  TrendingUp,
  DollarSign,
  Activity,
  Folder,
  FolderOpen,
  ShoppingCart,
  Boxes
} from 'lucide-react';

interface Categoria {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  icone: string;
  cor: string;
  categoriaPai?: string;
  categoriaPaiNome?: string;
  ativa: boolean;
  amortizacao: {
    vidaUtilPadrao: number;
    metodoAmortizacao: string;
    taxaAmortizacao: number;
  };
  totalAtivos: number;
  valorTotal: number;
  criadoEm: Date;
  criadoPor: string;
}

interface Grupo {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  categorias: string[];
  categoriasNomes: string[];
  responsavelId?: string;
  responsavelNome?: string;
  ativo: boolean;
  totalAtivos: number;
  valorTotal: number;
  criadoEm: Date;
  criadoPor: string;
}

interface CategoriaProduto {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  tipo: 'acabado' | 'materia_prima' | 'consumo' | 'servico';
  segmento: 'industrial' | 'comercial' | 'servicos';
  classeFiscal: string;
  politicaReposicao: 'minmax' | 'sob_demanda' | 'just_in_time';
  estoqueMinimo: number;
  estoqueMaximo: number;
  produtosAtivos: number;
  skuAtivos: number;
  valorEstoque: number;
  ativo: boolean;
  atualizadoEm: Date;
}

export default function CategoriasPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativa' | 'inativa'>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('categorias');
  const [tipoProdutoFiltro, setTipoProdutoFiltro] = useState<'todos' | 'acabado' | 'materia_prima' | 'consumo' | 'servico'>('todos');

  // Dados de exemplo para categorias
  const categorias: Categoria[] = [
    {
      id: '1',
      codigo: 'CAT-IT',
      nome: 'Informática',
      descricao: 'Equipamentos e dispositivos de tecnologia da informação',
      icone: 'Monitor',
      cor: '#3b82f6',
      ativa: true,
      amortizacao: {
        vidaUtilPadrao: 5,
        metodoAmortizacao: 'linear',
        taxaAmortizacao: 20
      },
      totalAtivos: 45,
      valorTotal: 2250000,
      criadoEm: new Date('2023-01-15'),
      criadoPor: 'admin'
    },
    {
      id: '2',
      codigo: 'CAT-VEI',
      nome: 'Transporte',
      descricao: 'Veículos e equipamentos de transporte',
      icone: 'Car',
      cor: '#10b981',
      ativa: true,
      amortizacao: {
        vidaUtilPadrao: 10,
        metodoAmortizacao: 'linear',
        taxaAmortizacao: 10
      },
      totalAtivos: 8,
      valorTotal: 3500000,
      criadoEm: new Date('2023-01-15'),
      criadoPor: 'admin'
    },
    {
      id: '3',
      codigo: 'CAT-MOB',
      nome: 'Mobiliário',
      descricao: 'Móveis e equipamentos de escritório',
      icone: 'Building',
      cor: '#f59e0b',
      ativa: true,
      amortizacao: {
        vidaUtilPadrao: 10,
        metodoAmortizacao: 'linear',
        taxaAmortizacao: 10
      },
      totalAtivos: 125,
      valorTotal: 850000,
      criadoEm: new Date('2023-01-15'),
      criadoPor: 'admin'
    },
    {
      id: '4',
      codigo: 'CAT-IT-HW',
      nome: 'Hardware',
      descricao: 'Componentes físicos de informática',
      icone: 'Package',
      cor: '#6366f1',
      categoriaPai: '1',
      categoriaPaiNome: 'Informática',
      ativa: true,
      amortizacao: {
        vidaUtilPadrao: 4,
        metodoAmortizacao: 'linear',
        taxaAmortizacao: 25
      },
      totalAtivos: 28,
      valorTotal: 1400000,
      criadoEm: new Date('2023-02-01'),
      criadoPor: 'admin'
    },
    {
      id: '5',
      codigo: 'CAT-IT-SW',
      nome: 'Software',
      descricao: 'Licenças e programas de computador',
      icone: 'Monitor',
      cor: '#8b5cf6',
      categoriaPai: '1',
      categoriaPaiNome: 'Informática',
      ativa: true,
      amortizacao: {
        vidaUtilPadrao: 3,
        metodoAmortizacao: 'linear',
        taxaAmortizacao: 33.33
      },
      totalAtivos: 17,
      valorTotal: 850000,
      criadoEm: new Date('2023-02-15'),
      criadoPor: 'admin'
    },
    {
      id: '6',
      codigo: 'CAT-FERR',
      nome: 'Ferramentas',
      descricao: 'Ferramentas e equipamentos de manutenção',
      icone: 'Wrench',
      cor: '#ef4444',
      ativa: false,
      amortizacao: {
        vidaUtilPadrao: 7,
        metodoAmortizacao: 'linear',
        taxaAmortizacao: 14.29
      },
      totalAtivos: 0,
      valorTotal: 0,
      criadoEm: new Date('2023-03-01'),
      criadoPor: 'admin'
    }
  ];

  // Dados de exemplo para grupos
  const grupos: Grupo[] = [
    {
      id: '1',
      codigo: 'GRP-ADMIN',
      nome: 'Equipamentos Administrativos',
      descricao: 'Grupo de ativos para atividades administrativas',
      categorias: ['1', '3'],
      categoriasNomes: ['Informática', 'Mobiliário'],
      responsavelId: '1',
      responsavelNome: 'Carlos Fernandes',
      ativo: true,
      totalAtivos: 170,
      valorTotal: 3100000,
      criadoEm: new Date('2023-01-20'),
      criadoPor: 'admin'
    },
    {
      id: '2',
      codigo: 'GRP-LOGIST',
      nome: 'Logística e Transporte',
      descricao: 'Ativos relacionados à logística e transporte',
      categorias: ['2'],
      categoriasNomes: ['Transporte'],
      responsavelId: '3',
      responsavelNome: 'João Silva',
      ativo: true,
      totalAtivos: 8,
      valorTotal: 3500000,
      criadoEm: new Date('2023-01-25'),
      criadoPor: 'admin'
    },
    {
      id: '3',
      codigo: 'GRP-TI',
      nome: 'Tecnologia da Informação',
      descricao: 'Todos os equipamentos de TI da empresa',
      categorias: ['4', '5'],
      categoriasNomes: ['Hardware', 'Software'],
      responsavelId: '1',
      responsavelNome: 'Carlos Fernandes',
      ativo: true,
      totalAtivos: 45,
      valorTotal: 2250000,
      criadoEm: new Date('2023-02-20'),
      criadoPor: 'admin'
    }
  ];

  const categoriasProdutos: CategoriaProduto[] = [
    {
      id: 'CP-001',
      codigo: 'TEC-ACAB',
      nome: 'Tecnologia - Produtos Acabados',
      descricao: 'Equipamentos e produtos tecnológicos prontos para venda',
      tipo: 'acabado',
      segmento: 'comercial',
      classeFiscal: '8471.50.10',
      politicaReposicao: 'minmax',
      estoqueMinimo: 25,
      estoqueMaximo: 120,
      produtosAtivos: 58,
      skuAtivos: 24,
      valorEstoque: 3250000,
      ativo: true,
      atualizadoEm: new Date('2024-01-12')
    },
    {
      id: 'CP-002',
      codigo: 'MAT-PRIMA',
      nome: 'Matérias-primas industriais',
      descricao: 'Matérias-primas críticas para produção',
      tipo: 'materia_prima',
      segmento: 'industrial',
      classeFiscal: '3901.10.20',
      politicaReposicao: 'just_in_time',
      estoqueMinimo: 80,
      estoqueMaximo: 200,
      produtosAtivos: 32,
      skuAtivos: 15,
      valorEstoque: 1875000,
      ativo: true,
      atualizadoEm: new Date('2024-02-05')
    },
    {
      id: 'CP-003',
      codigo: 'SERV-SUP',
      nome: 'Serviços de suporte',
      descricao: 'Categorias de serviços vinculados a contratos de suporte',
      tipo: 'servico',
      segmento: 'servicos',
      classeFiscal: '9983.00.00',
      politicaReposicao: 'sob_demanda',
      estoqueMinimo: 0,
      estoqueMaximo: 0,
      produtosAtivos: 12,
      skuAtivos: 6,
      valorEstoque: 0,
      ativo: true,
      atualizadoEm: new Date('2024-01-30')
    },
    {
      id: 'CP-004',
      codigo: 'CONSUMO',
      nome: 'Materiais de consumo',
      descricao: 'Materiais para escritório e operação diária',
      tipo: 'consumo',
      segmento: 'comercial',
      classeFiscal: '4820.10.00',
      politicaReposicao: 'minmax',
      estoqueMinimo: 150,
      estoqueMaximo: 500,
      produtosAtivos: 78,
      skuAtivos: 36,
      valorEstoque: 245000,
      ativo: false,
      atualizadoEm: new Date('2023-12-18')
    },
    {
      id: 'CP-005',
      codigo: 'TEC-SERV',
      nome: 'Serviços Tecnológicos',
      descricao: 'Serviços recorrentes e contratos de suporte técnico',
      tipo: 'servico',
      segmento: 'servicos',
      classeFiscal: '9985.00.00',
      politicaReposicao: 'sob_demanda',
      estoqueMinimo: 0,
      estoqueMaximo: 0,
      produtosAtivos: 9,
      skuAtivos: 4,
      valorEstoque: 0,
      ativo: true,
      atualizadoEm: new Date('2024-02-10')
    }
  ];

  const filteredCategorias = categorias.filter(categoria => {
    const matchesSearch = 
      categoria.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      categoria.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'ativa' && categoria.ativa) ||
      (statusFilter === 'inativa' && !categoria.ativa);

    return matchesSearch && matchesStatus;
  });

  const filteredGrupos = grupos.filter(grupo => {
    const matchesSearch = 
      grupo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grupo.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'ativa' && grupo.ativo) ||
      (statusFilter === 'inativa' && !grupo.ativo);

    return matchesSearch && matchesStatus;
  });

  const filteredCategoriasProdutos = categoriasProdutos.filter((categoria) => {
    const matchesSearch =
      categoria.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      categoria.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativa' && categoria.ativo) ||
      (statusFilter === 'inativa' && !categoria.ativo);
    const matchesTipo = tipoProdutoFiltro === 'todos' || categoria.tipo === tipoProdutoFiltro;

    return matchesSearch && matchesStatus && matchesTipo;
  });

  const {
    currentPage: currentPageCat,
    totalPages: totalPagesCat,
    itemsPerPage: itemsPerPageCat,
    paginatedData: paginatedCategorias,
    totalItems: totalItemsCat,
    handlePageChange: handlePageChangeCat,
    handleItemsPerPageChange: handleItemsPerPageChangeCat,
  } = usePagination({ data: filteredCategorias, initialItemsPerPage: 10 });

  const {
    currentPage: currentPageGrp,
    totalPages: totalPagesGrp,
    itemsPerPage: itemsPerPageGrp,
    paginatedData: paginatedGrupos,
    totalItems: totalItemsGrp,
    handlePageChange: handlePageChangeGrp,
    handleItemsPerPageChange: handleItemsPerPageChangeGrp,
  } = usePagination({ data: filteredGrupos, initialItemsPerPage: 10 });

  const {
    currentPage: currentPageProd,
    totalPages: totalPagesProd,
    itemsPerPage: itemsPerPageProd,
    paginatedData: paginatedCategoriasProdutos,
    totalItems: totalItemsProd,
    handlePageChange: handlePageChangeProd,
    handleItemsPerPageChange: handleItemsPerPageChangeProd,
  } = usePagination({ data: filteredCategoriasProdutos, initialItemsPerPage: 8 });

  const getIconComponent = (iconName: string) => {
    const icons: { [key: string]: any } = {
      Monitor, Car, Building, Package, Wrench, Heart, Layers, Tag
    };
    return icons[iconName] || Package;
  };

  const getLabelByTab = (tab: string) => {
    if (tab === 'produtos') return 'Categoria de Produto';
    if (tab === 'grupos') return 'Grupo';
    return 'Categoria';
  };

  const getLabelByType = (type: 'categoria' | 'grupo' | 'produto') => {
    if (type === 'produto') return 'Categoria de Produto';
    if (type === 'grupo') return 'Grupo';
    return 'Categoria';
  };

  const handleToggleStatus = (item: any, type: 'categoria' | 'grupo' | 'produto') => {
    const label = getLabelByType(type);
    const isActive = type === 'categoria' ? item.ativa : item.ativo;
    toast({
      title: `${label} ${isActive ? 'desativada' : 'ativada'}`,
      description: `${item.nome} foi ${isActive ? 'desativada' : 'ativada'} com sucesso`,
    });
  };

  const handleDelete = (item: any, type: 'categoria' | 'grupo' | 'produto') => {
    const label = getLabelByType(type);
    toast({
      title: `${label} removida`,
      description: `${item.nome} foi removida do sistema`,
      variant: "destructive"
    });
  };

  const handleSave = () => {
    const label = getLabelByTab(activeTab);
    setIsDialogOpen(false);
    setEditingItem(null);
    toast({
      title: editingItem ? `${label} atualizada` : `${label} criada`,
      description: `${label} salva com sucesso`,
    });
  };

  // Estatísticas
  const estatisticas = {
    totalCategorias: categorias.length,
    categoriasAtivas: categorias.filter(c => c.ativa).length,
    totalGrupos: grupos.length,
    gruposAtivos: grupos.filter(g => g.ativo).length,
    totalAtivos: categorias.reduce((acc, c) => acc + c.totalAtivos, 0),
    valorTotal: categorias.reduce((acc, c) => acc + c.valorTotal, 0),
    totalCategoriasProdutos: categoriasProdutos.length,
    categoriasProdutosAtivas: categoriasProdutos.filter(c => c.ativo).length,
    produtosAtivos: categoriasProdutos.reduce((acc, c) => acc + c.produtosAtivos, 0),
    valorEstoqueProdutos: categoriasProdutos.reduce((acc, c) => acc + c.valorEstoque, 0)
  };

  const currentLabel = getLabelByTab(activeTab);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Categorias de Ativos e Produtos</h1>
          <p className="text-muted-foreground">Organize ativos, grupos e categorias de produtos do inventário</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingItem(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova {currentLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Editar' : 'Nova'} {currentLabel}
              </DialogTitle>
              <DialogDescription>
                Configure as informações {currentLabel === 'Grupo' ? 'do grupo' : 'da categoria'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código *</Label>
                  <Input
                    id="codigo"
                    placeholder={
                      activeTab === 'categorias'
                        ? 'CAT-XXX'
                        : activeTab === 'grupos'
                          ? 'GRP-XXX'
                          : 'PROD-XXX'
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input
                    id="nome"
                    placeholder={
                      activeTab === 'grupos'
                        ? 'Nome do grupo'
                        : activeTab === 'produtos'
                          ? 'Nome da categoria de produto'
                          : 'Nome da categoria'
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea id="descricao" placeholder="Descrição detalhada" rows={3} />
              </div>

              {activeTab === 'categorias' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="icone">Ícone</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o ícone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Monitor">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4" />
                              Monitor
                            </div>
                          </SelectItem>
                          <SelectItem value="Car">
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4" />
                              Veículo
                            </div>
                          </SelectItem>
                          <SelectItem value="Building">
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4" />
                              Edifício
                            </div>
                          </SelectItem>
                          <SelectItem value="Package">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              Pacote
                            </div>
                          </SelectItem>
                          <SelectItem value="Wrench">
                            <div className="flex items-center gap-2">
                              <Wrench className="h-4 w-4" />
                              Ferramenta
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cor">Cor</Label>
                      <Input id="cor" type="color" className="h-10" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="categoriaPai">Categoria Pai (Opcional)</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhuma</SelectItem>
                        {categorias.filter(c => !c.categoriaPai).map(categoria => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t pt-4">
                    <Label className="text-base font-medium">Configurações de Amortização</Label>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div className="space-y-2">
                        <Label htmlFor="vidaUtil">Vida Útil (anos)</Label>
                        <Input id="vidaUtil" type="number" placeholder="5" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="metodo">Método</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Linear" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="linear">Linear</SelectItem>
                            <SelectItem value="decrescente">Decrescente</SelectItem>
                            <SelectItem value="soma_digitos">Soma dos Dígitos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxa">Taxa (%)</Label>
                        <Input id="taxa" type="number" step="0.01" placeholder="20.00" />
                      </div>
                    </div>
                  </div>
                </>
              ) : activeTab === 'grupos' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="categorias">Categorias *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione as categorias" />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias.filter(c => c.ativa).map(categoria => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="responsavel">Responsável</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Carlos Fernandes</SelectItem>
                        <SelectItem value="2">Maria Santos</SelectItem>
                        <SelectItem value="3">João Silva</SelectItem>
                        <SelectItem value="5">Sofia Nunes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tipoProduto">Tipo de produto *</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="acabado">Produto acabado</SelectItem>
                          <SelectItem value="materia_prima">Matéria-prima</SelectItem>
                          <SelectItem value="consumo">Material de consumo</SelectItem>
                          <SelectItem value="servico">Serviço</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="segmento">Segmento *</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o segmento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="industrial">Industrial</SelectItem>
                          <SelectItem value="comercial">Comercial</SelectItem>
                          <SelectItem value="servico">Serviços</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="classeFiscal">Classe Fiscal *</Label>
                      <Input id="classeFiscal" placeholder="Ex: 8471.50.10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="politicaReposicao">Política de Reposição *</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minmax">Min/Max</SelectItem>
                          <SelectItem value="just_in_time">Just in Time</SelectItem>
                          <SelectItem value="sob_demanda">Sob demanda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="estoqueMinimo">Estoque mínimo</Label>
                      <Input id="estoqueMinimo" type="number" min={0} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estoqueMaximo">Estoque máximo</Label>
                      <Input id="estoqueMaximo" type="number" min={0} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingItem ? 'Atualizar' : 'Criar'} {currentLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Categorias</p>
                <p className="text-2xl font-bold">{estatisticas.totalCategorias}</p>
              </div>
              <Tag className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cat. Ativas</p>
                <p className="text-2xl font-bold">{estatisticas.categoriasAtivas}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Grupos</p>
                <p className="text-2xl font-bold">{estatisticas.totalGrupos}</p>
              </div>
              <Layers className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Grupos Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.gruposAtivos}</p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.totalAtivos}</p>
              </div>
              <Package className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.valorTotal / 1000000).toFixed(1)}M
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cat. Produtos</p>
                <p className="text-2xl font-bold">{estatisticas.totalCategoriasProdutos}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cat. Prod. Ativas</p>
                <p className="text-2xl font-bold">{estatisticas.categoriasProdutosAtivas}</p>
              </div>
              <Boxes className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Produtos Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.produtosAtivos}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-teal-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor em Estoque</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.valorEstoqueProdutos / 1000000).toFixed(2)}M
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="produtos">Categorias de Produtos</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por nome ou código..."
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
                      <SelectItem value="ativa">Ativas</SelectItem>
                      <SelectItem value="inativa">Inativas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Hierarquia</TableHead>
                    <TableHead>Ativos</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Amortização</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCategorias.length > 0 ? (
                    paginatedCategorias.map((categoria) => {
                      const IconComponent = getIconComponent(categoria.icone);
                      return (
                        <TableRow key={categoria.id}>
                          <TableCell className="font-medium">{categoria.codigo}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div 
                                className="p-1 rounded" 
                                style={{ backgroundColor: `${categoria.cor}20`, color: categoria.cor }}
                              >
                                <IconComponent className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="font-medium">{categoria.nome}</div>
                                {categoria.descricao && (
                                  <div className="text-sm text-muted-foreground">{categoria.descricao}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {categoria.categoriaPaiNome ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Folder className="h-3 w-3 text-muted-foreground" />
                                <span>{categoria.categoriaPaiNome}</span>
                                <span>&gt;</span>
                                <span className="font-medium">{categoria.nome}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-sm">
                                <FolderOpen className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium">Categoria Principal</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {categoria.totalAtivos} itens
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              MT {(categoria.valorTotal / 1000).toFixed(0)}K
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{categoria.amortizacao.vidaUtilPadrao} anos</div>
                              <div className="text-muted-foreground">
                                {categoria.amortizacao.taxaAmortizacao.toFixed(1)}% a.a.
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {categoria.ativa ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Ativa
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Inativa
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
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setEditingItem(categoria);
                                    setIsDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleToggleStatus(categoria, 'categoria')}>
                                  {categoria.ativa ? (
                                    <>
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Desativar
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Ativar
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(categoria, 'categoria')}
                                  className="text-destructive"
                                  disabled={categoria.totalAtivos > 0}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remover
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
                          <Tag className="h-12 w-12 opacity-50" />
                          <p>Nenhuma categoria encontrada</p>
                          <p className="text-sm">Tente ajustar os filtros ou criar uma nova categoria</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <PaginationControls
                currentPage={currentPageCat}
                totalPages={totalPagesCat}
                itemsPerPage={itemsPerPageCat}
                totalItems={totalItemsCat}
                onPageChange={handlePageChangeCat}
                onItemsPerPageChange={handleItemsPerPageChangeCat}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="produtos">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por código ou nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value: 'todos' | 'ativa' | 'inativa') => setStatusFilter(value)}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Status</SelectItem>
                    <SelectItem value="ativa">Ativas</SelectItem>
                    <SelectItem value="inativa">Inativas</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={tipoProdutoFiltro}
                  onValueChange={(value: 'todos' | 'acabado' | 'materia_prima' | 'consumo' | 'servico') =>
                    setTipoProdutoFiltro(value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    <SelectItem value="acabado">Produto acabado</SelectItem>
                    <SelectItem value="materia_prima">Matéria-prima</SelectItem>
                    <SelectItem value="consumo">Material de consumo</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Classe Fiscal</TableHead>
                    <TableHead>Política</TableHead>
                    <TableHead>Estoque Min/Máx</TableHead>
                    <TableHead>Produtos</TableHead>
                    <TableHead>Valor em Estoque</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Atualização</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCategoriasProdutos.length > 0 ? (
                    paginatedCategoriasProdutos.map((categoria) => (
                      <TableRow key={categoria.id}>
                        <TableCell className="font-medium">{categoria.codigo}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold">{categoria.nome}</p>
                            {categoria.descricao && (
                              <p className="text-sm text-muted-foreground">{categoria.descricao}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {categoria.tipo.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{categoria.classeFiscal}</TableCell>
                        <TableCell className="capitalize">
                          {categoria.politicaReposicao.replaceAll('_', ' ')}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="font-medium">{categoria.estoqueMinimo}</span> / {categoria.estoqueMaximo}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{categoria.produtosAtivos} produtos</p>
                            <p className="text-muted-foreground text-xs">{categoria.skuAtivos} SKUs</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          MT {categoria.valorEstoque.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={categoria.ativo ? 'default' : 'secondary'}>
                            {categoria.ativo ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                        <TableCell>{categoria.atualizadoEm.toLocaleDateString('pt-MZ')}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingItem(categoria);
                                  setIsDialogOpen(true);
                                  setActiveTab('produtos');
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleToggleStatus(categoria, 'produto')}>
                                {categoria.ativo ? (
                                  <>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(categoria, 'produto')}
                                className="text-destructive"
                                disabled={categoria.produtosAtivos > 0}
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
                      <TableCell colSpan={11} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ShoppingCart className="h-12 w-12 opacity-50" />
                          <p>Nenhuma categoria de produto encontrada</p>
                          <p className="text-sm">Tente ajustar os filtros ou criar uma nova categoria</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <PaginationControls
                currentPage={currentPageProd}
                totalPages={totalPagesProd}
                itemsPerPage={itemsPerPageProd}
                totalItems={totalItemsProd}
                onPageChange={handlePageChangeProd}
                onItemsPerPageChange={handleItemsPerPageChangeProd}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por nome ou código..."
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
                      <SelectItem value="ativa">Ativos</SelectItem>
                      <SelectItem value="inativa">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categorias</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Ativos</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedGrupos.length > 0 ? (
                    paginatedGrupos.map((grupo) => (
                      <TableRow key={grupo.id}>
                        <TableCell className="font-medium">{grupo.codigo}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{grupo.nome}</div>
                            {grupo.descricao && (
                              <div className="text-sm text-muted-foreground">{grupo.descricao}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {grupo.categoriasNomes.map((categoria, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {categoria}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {grupo.responsavelNome ? (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{grupo.responsavelNome}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {grupo.totalAtivos} itens
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            MT {(grupo.valorTotal / 1000000).toFixed(1)}M
                          </div>
                        </TableCell>
                        <TableCell>
                          {grupo.ativo ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="h-3 w-3" />
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
                              <DropdownMenuItem 
                                onClick={() => {
                                  setEditingItem(grupo);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleToggleStatus(grupo, 'grupo')}>
                                {grupo.ativo ? (
                                  <>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(grupo, 'grupo')}
                                className="text-destructive"
                                disabled={grupo.totalAtivos > 0}
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
                          <Layers className="h-12 w-12 opacity-50" />
                          <p>Nenhum grupo encontrado</p>
                          <p className="text-sm">Tente ajustar os filtros ou criar um novo grupo</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <PaginationControls
                currentPage={currentPageGrp}
                totalPages={totalPagesGrp}
                itemsPerPage={itemsPerPageGrp}
                totalItems={totalItemsGrp}
                onPageChange={handlePageChangeGrp}
                onItemsPerPageChange={handleItemsPerPageChangeGrp}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
