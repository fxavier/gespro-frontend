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
  Edit,
  Eye,
  Trash2,
  Package,
  Monitor,
  Car,
  Wrench,
  Building,
  Heart,
  Layers,
  QrCode,
  MapPin,
  User,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  Upload,
  Filter
} from 'lucide-react';
import Link from 'next/link';
import { Ativo, EstadoAtivo } from '@/types/inventario';

export default function AtivosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todos');
  const [estadoFilter, setEstadoFilter] = useState<EstadoAtivo | 'todos'>('todos');
  const [localizacaoFilter, setLocalizacaoFilter] = useState<string>('todos');

  // Dados de exemplo
  const ativos: Ativo[] = [
    {
      id: '1',
      codigoInterno: 'PC-001',
      nome: 'Computador Dell OptiPlex 3090',
      descricao: 'Computador desktop para escritório',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      numeroSerie: 'DL3090-12345',
      modelo: 'OptiPlex 3090',
      marca: 'Dell',
      fornecedorId: '1',
      fornecedorNome: 'Dell Moçambique',
      dataAquisicao: new Date('2023-01-15'),
      valorCompra: 45000,
      valorResidual: 4500,
      vidaUtil: 5,
      dataSubstituicao: new Date('2028-01-15'),
      estado: 'em_uso',
      localizacaoId: '3',
      localizacaoNome: 'Departamento de TI',
      responsavelId: '1',
      responsavelNome: 'Carlos Fernandes',
      departamentoId: 'ti',
      departamentoNome: 'Tecnologia da Informação',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 18000,
        valorLiquidoContabilistico: 27000,
        percentualAmortizado: 40
      },
      qrCode: 'QR-PC-001',
      codigoBarras: 'BC-PC-001',
      garantia: {
        dataInicio: new Date('2023-01-15'),
        dataFim: new Date('2026-01-15'),
        fornecedor: 'Dell Moçambique'
      },
      criadoEm: new Date('2023-01-15'),
      criadoPor: 'admin'
    },
    {
      id: '2',
      codigoInterno: 'PORT-001',
      nome: 'Portátil Lenovo ThinkPad E15',
      descricao: 'Portátil para trabalho móvel',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      numeroSerie: 'TP-E15-67890',
      modelo: 'ThinkPad E15',
      marca: 'Lenovo',
      fornecedorId: '2',
      fornecedorNome: 'Lenovo Store',
      dataAquisicao: new Date('2023-03-20'),
      valorCompra: 55000,
      valorResidual: 5500,
      vidaUtil: 4,
      dataSubstituicao: new Date('2027-03-20'),
      estado: 'em_uso',
      localizacaoId: '2',
      localizacaoNome: 'Escritório Central',
      responsavelId: '2',
      responsavelNome: 'Maria Santos',
      departamentoId: 'admin',
      departamentoNome: 'Administração',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 11833,
        valorLiquidoContabilistico: 43167,
        percentualAmortizado: 21.5
      },
      qrCode: 'QR-PORT-001',
      criadoEm: new Date('2023-03-20'),
      criadoPor: 'admin'
    },
    {
      id: '3',
      codigoInterno: 'VEI-001',
      nome: 'Toyota Hilux 2022',
      descricao: 'Veículo para transporte e logística',
      categoriaId: 'transporte',
      categoriaNome: 'Transporte',
      numeroSerie: 'TH2022-ABC123',
      modelo: 'Hilux 2.4 4x4',
      marca: 'Toyota',
      fornecedorId: '3',
      fornecedorNome: 'Toyota Moçambique',
      dataAquisicao: new Date('2022-05-10'),
      valorCompra: 1250000,
      valorResidual: 375000,
      vidaUtil: 10,
      dataSubstituicao: new Date('2032-05-10'),
      estado: 'em_uso',
      localizacaoId: '1',
      localizacaoNome: 'Armazém Principal',
      responsavelId: '3',
      responsavelNome: 'João Silva',
      departamentoId: 'logistica',
      departamentoNome: 'Logística',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 175000,
        valorLiquidoContabilistico: 1075000,
        percentualAmortizado: 14
      },
      qrCode: 'QR-VEI-001',
      garantia: {
        dataInicio: new Date('2022-05-10'),
        dataFim: new Date('2025-05-10'),
        fornecedor: 'Toyota Moçambique'
      },
      criadoEm: new Date('2022-05-10'),
      criadoPor: 'admin'
    },
    {
      id: '4',
      codigoInterno: 'IMP-001',
      nome: 'Impressora HP LaserJet Pro',
      descricao: 'Impressora laser multifunções',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      numeroSerie: 'HP-LJ-54321',
      modelo: 'LaserJet Pro MFP M428fdw',
      marca: 'HP',
      fornecedorId: '4',
      fornecedorNome: 'HP Store',
      dataAquisicao: new Date('2023-06-01'),
      valorCompra: 25000,
      valorResidual: 2500,
      vidaUtil: 5,
      dataSubstituicao: new Date('2028-06-01'),
      estado: 'em_manutencao',
      localizacaoId: '2',
      localizacaoNome: 'Escritório Central',
      responsavelId: '4',
      responsavelNome: 'Ana Costa',
      departamentoId: 'admin',
      departamentoNome: 'Administração',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 3125,
        valorLiquidoContabilistico: 21875,
        percentualAmortizado: 12.5
      },
      qrCode: 'QR-IMP-001',
      criadoEm: new Date('2023-06-01'),
      criadoPor: 'admin'
    },
    {
      id: '5',
      codigoInterno: 'MOB-001',
      nome: 'Mesa de Escritório Executive',
      descricao: 'Mesa de madeira para executivos',
      categoriaId: 'mobiliario',
      categoriaNome: 'Mobiliário',
      modelo: 'Executive Plus 160cm',
      marca: 'Office Furniture',
      fornecedorId: '5',
      fornecedorNome: 'Móveis & Cia',
      dataAquisicao: new Date('2023-02-15'),
      valorCompra: 15000,
      valorResidual: 1500,
      vidaUtil: 10,
      dataSubstituicao: new Date('2033-02-15'),
      estado: 'em_uso',
      localizacaoId: '6',
      localizacaoNome: 'Sala de Conferências',
      responsavelId: '5',
      responsavelNome: 'Sofia Nunes',
      departamentoId: 'admin',
      departamentoNome: 'Administração',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 1215,
        valorLiquidoContabilistico: 13785,
        percentualAmortizado: 8.1
      },
      qrCode: 'QR-MOB-001',
      criadoEm: new Date('2023-02-15'),
      criadoPor: 'admin'
    }
  ];

  const categorias = [
    { id: 'informatica', nome: 'Informática', icon: Monitor },
    { id: 'transporte', nome: 'Transporte', icon: Car },
    { id: 'mobiliario', nome: 'Mobiliário', icon: Building },
    { id: 'ferramentas', nome: 'Ferramentas', icon: Wrench },
    { id: 'equipamento_medico', nome: 'Equipamento Médico', icon: Heart },
    { id: 'outros', nome: 'Outros', icon: Package }
  ];

  const localizacoes = [
    { id: '1', nome: 'Armazém Principal' },
    { id: '2', nome: 'Escritório Central' },
    { id: '3', nome: 'Departamento de TI' },
    { id: '6', nome: 'Sala de Conferências' }
  ];

  const filteredAtivos = ativos.filter(ativo => {
    const matchesSearch = 
      ativo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ativo.codigoInterno.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ativo.numeroSerie && ativo.numeroSerie.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (ativo.marca && ativo.marca.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategoria = categoriaFilter === 'todos' || ativo.categoriaId === categoriaFilter;
    const matchesEstado = estadoFilter === 'todos' || ativo.estado === estadoFilter;
    const matchesLocalizacao = localizacaoFilter === 'todos' || ativo.localizacaoId === localizacaoFilter;

    return matchesSearch && matchesCategoria && matchesEstado && matchesLocalizacao;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredAtivos, initialItemsPerPage: 10 });

  const getEstadoBadge = (estado: EstadoAtivo) => {
    const variants = {
      novo: { variant: 'default' as const, icon: <Package className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
      em_uso: { variant: 'default' as const, icon: <CheckCircle className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
      em_manutencao: { variant: 'secondary' as const, icon: <Wrench className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
      obsoleto: { variant: 'outline' as const, icon: <Clock className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
      baixado: { variant: 'destructive' as const, icon: <XCircle className="h-3 w-3" />, color: 'bg-red-100 text-red-800' },
      em_transferencia: { variant: 'secondary' as const, icon: <AlertTriangle className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800' }
    };

    const { icon, color } = variants[estado];
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        {icon}
        {estado.replace('_', ' ').charAt(0).toUpperCase() + estado.replace('_', ' ').slice(1)}
      </span>
    );
  };

  const getCategoriaIcon = (categoriaId: string) => {
    const categoria = categorias.find(c => c.id === categoriaId);
    return categoria ? categoria.icon : Package;
  };

  const handleDelete = (ativo: Ativo) => {
    toast({
      title: "Ativo removido",
      description: `${ativo.nome} foi removido do sistema`,
      variant: "destructive"
    });
  };

  const handleGerarQRCode = (ativo: Ativo) => {
    toast({
      title: "QR Code gerado",
      description: `QR Code para ${ativo.nome} foi gerado com sucesso`,
    });
  };

  const handleExportarDados = () => {
    toast({
      title: "Exportando dados",
      description: "Os dados dos ativos serão exportados em breve",
    });
  };

  const handleImportarDados = () => {
    toast({
      title: "Importar dados",
      description: "Funcionalidade de importação será implementada",
    });
  };

  // Estatísticas rápidas
  const estatisticas = {
    totalAtivos: ativos.length,
    valorTotal: ativos.reduce((acc, ativo) => acc + ativo.valorCompra, 0),
    valorLiquido: ativos.reduce((acc, ativo) => acc + ativo.amortizacao.valorLiquidoContabilistico, 0),
    ativosEmUso: ativos.filter(a => a.estado === 'em_uso').length,
    ativosManutencao: ativos.filter(a => a.estado === 'em_manutencao').length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Ativos</h1>
          <p className="text-muted-foreground">Gerencie todos os equipamentos e ativos da empresa</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImportarDados}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={handleExportarDados}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button asChild>
            <Link href="/inventario/ativos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Ativo
            </Link>
          </Button>
        </div>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.totalAtivos}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
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
                <p className="text-sm text-muted-foreground">Valor Líquido</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.valorLiquido / 1000000).toFixed(1)}M
                </p>
              </div>
              <Layers className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Uso</p>
                <p className="text-2xl font-bold">{estatisticas.ativosEmUso}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Manutenção</p>
                <p className="text-2xl font-bold">{estatisticas.ativosManutencao}</p>
              </div>
              <Wrench className="h-8 w-8 text-orange-600" />
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
                placeholder="Pesquisar por nome, código, série ou marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {categorias.map(categoria => (
                    <SelectItem key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={estadoFilter} onValueChange={(value: any) => setEstadoFilter(value)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="em_uso">Em Uso</SelectItem>
                  <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                  <SelectItem value="obsoleto">Obsoleto</SelectItem>
                  <SelectItem value="baixado">Baixado</SelectItem>
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
                <TableHead>Código</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((ativo) => {
                  const IconeCategoria = getCategoriaIcon(ativo.categoriaId);
                  return (
                    <TableRow key={ativo.id}>
                      <TableCell className="font-medium">{ativo.codigoInterno}</TableCell>
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-muted rounded-md">
                            <IconeCategoria className="h-4 w-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="font-medium">{ativo.nome}</div>
                            <div className="text-sm text-muted-foreground">
                              {ativo.marca} {ativo.modelo}
                            </div>
                            {ativo.numeroSerie && (
                              <div className="text-xs text-muted-foreground">
                                S/N: {ativo.numeroSerie}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{ativo.categoriaNome}</TableCell>
                      <TableCell>{getEstadoBadge(ativo.estado)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{ativo.localizacaoNome}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {ativo.responsavelNome ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{ativo.responsavelNome}</span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            MT {ativo.amortizacao.valorLiquidoContabilistico.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ativo.amortizacao.percentualAmortizado.toFixed(1)}% amortizado
                          </div>
                        </div>
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
                              <Link href={`/inventario/ativos/${ativo.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/ativos/${ativo.id}/editar`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleGerarQRCode(ativo)}>
                              <QrCode className="h-4 w-4 mr-2" />
                              Gerar QR Code
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/movimentacoes/nova?ativo=${ativo.id}`}>
                                <Package className="h-4 w-4 mr-2" />
                                Movimentar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/manutencao/nova?ativo=${ativo.id}`}>
                                <Wrench className="h-4 w-4 mr-2" />
                                Agendar Manutenção
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(ativo)}
                              className="text-destructive"
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
                      <Package className="h-12 w-12 opacity-50" />
                      <p>Nenhum ativo encontrado</p>
                      <p className="text-sm">Tente ajustar os filtros ou adicionar um novo ativo</p>
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