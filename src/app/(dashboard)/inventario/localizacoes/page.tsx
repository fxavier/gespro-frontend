'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Textarea } from '@/components/ui/textarea';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  MapPin,
  Building,
  Warehouse,
  Users,
  Package,
  CheckCircle,
  XCircle,
  Map,
  Home,
  Building2,
  Archive,
  Layers
} from 'lucide-react';
import { Localizacao } from '@/types/inventario';

export default function LocalizacoesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativa' | 'inativa'>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocalizacao, setEditingLocalizacao] = useState<Localizacao | null>(null);

  // Dados de exemplo
  const localizacoes: Localizacao[] = [
    {
      id: '1',
      codigo: 'ARM-001',
      nome: 'Armazém Principal',
      tipo: 'armazem',
      endereco: 'Av. Julius Nyerere, 1234, Maputo',
      descricao: 'Armazém principal da empresa para stock geral',
      capacidade: 1000,
      responsavel: 'João Silva',
      ativa: true,
      coordenadas: {
        latitude: -25.9692,
        longitude: 32.5732
      },
      criadoEm: new Date('2023-01-15')
    },
    {
      id: '2',
      codigo: 'ESC-001',
      nome: 'Escritório Central',
      tipo: 'escritorio',
      endereco: 'Av. 24 de Julho, 567, Maputo',
      descricao: 'Sede administrativa da empresa',
      responsavel: 'Maria Santos',
      ativa: true,
      criadoEm: new Date('2023-01-15')
    },
    {
      id: '3',
      codigo: 'DEP-IT',
      nome: 'Departamento de TI',
      tipo: 'departamento',
      descricao: 'Setor de Tecnologia da Informação',
      responsavel: 'Carlos Fernandes',
      ativa: true,
      localizacaoPai: '2',
      mapeamento: {
        andar: '2º Andar',
        ala: 'Ala Norte',
        sala: 'Sala 201',
        prateleira: ''
      },
      criadoEm: new Date('2023-02-01')
    },
    {
      id: '4',
      codigo: 'FIL-NORTE',
      nome: 'Filial Norte',
      tipo: 'filial',
      endereco: 'Av. Eduardo Mondlane, 890, Nampula',
      descricao: 'Filial da região norte do país',
      responsavel: 'Ana Costa',
      ativa: true,
      coordenadas: {
        latitude: -15.1165,
        longitude: 39.2666
      },
      criadoEm: new Date('2023-03-10')
    },
    {
      id: '5',
      codigo: 'PRAT-A1',
      nome: 'Prateleira A1',
      tipo: 'prateleira',
      descricao: 'Prateleira para equipamentos informáticos',
      capacidade: 50,
      responsavel: 'Pedro Machado',
      ativa: true,
      localizacaoPai: '1',
      mapeamento: {
        andar: 'Térreo',
        ala: 'Seção A',
        sala: '',
        prateleira: 'A1'
      },
      criadoEm: new Date('2023-04-05')
    },
    {
      id: '6',
      codigo: 'SALA-CONF',
      nome: 'Sala de Conferências',
      tipo: 'sala',
      descricao: 'Sala de reuniões e conferências',
      capacidade: 20,
      responsavel: 'Sofia Nunes',
      ativa: true,
      localizacaoPai: '2',
      mapeamento: {
        andar: '1º Andar',
        ala: 'Ala Sul',
        sala: 'Sala 105',
        prateleira: ''
      },
      criadoEm: new Date('2023-04-20')
    },
    {
      id: '7',
      codigo: 'AREA-TEC',
      nome: 'Área Técnica',
      tipo: 'area_tecnica',
      descricao: 'Área para manutenção e reparos',
      responsavel: 'Manuel Costa',
      ativa: false,
      localizacaoPai: '1',
      criadoEm: new Date('2023-05-15')
    }
  ];

  const tiposLocalizacao = [
    { value: 'armazem', label: 'Armazém', icon: Warehouse },
    { value: 'escritorio', label: 'Escritório', icon: Building },
    { value: 'departamento', label: 'Departamento', icon: Users },
    { value: 'filial', label: 'Filial', icon: Building2 },
    { value: 'prateleira', label: 'Prateleira', icon: Archive },
    { value: 'sala', label: 'Sala', icon: Home },
    { value: 'andar', label: 'Andar', icon: Layers },
    { value: 'area_tecnica', label: 'Área Técnica', icon: Package }
  ];

  const filteredLocalizacoes = localizacoes.filter(localizacao => {
    const matchesSearch = 
      localizacao.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      localizacao.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (localizacao.endereco && localizacao.endereco.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTipo = tipoFilter === 'todos' || localizacao.tipo === tipoFilter;
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'ativa' && localizacao.ativa) ||
      (statusFilter === 'inativa' && !localizacao.ativa);

    return matchesSearch && matchesTipo && matchesStatus;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredLocalizacoes, initialItemsPerPage: 10 });

  const getTipoInfo = (tipo: string) => {
    const tipoInfo = tiposLocalizacao.find(t => t.value === tipo);
    return tipoInfo || { value: tipo, label: tipo, icon: MapPin };
  };

  const getTipoBadgeColor = (tipo: string) => {
    const colors = {
      armazem: 'bg-blue-100 text-blue-800',
      escritorio: 'bg-green-100 text-green-800',
      departamento: 'bg-purple-100 text-purple-800',
      filial: 'bg-orange-100 text-orange-800',
      prateleira: 'bg-cyan-100 text-cyan-800',
      sala: 'bg-pink-100 text-pink-800',
      andar: 'bg-indigo-100 text-indigo-800',
      area_tecnica: 'bg-gray-100 text-gray-800'
    };
    return colors[tipo as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const handleToggleStatus = (localizacao: Localizacao) => {
    toast({
      title: localizacao.ativa ? "Localização desativada" : "Localização ativada",
      description: `${localizacao.nome} foi ${localizacao.ativa ? 'desativada' : 'ativada'} com sucesso`,
    });
  };

  const handleDelete = (localizacao: Localizacao) => {
    toast({
      title: "Localização removida",
      description: `${localizacao.nome} foi removida do sistema`,
      variant: "destructive"
    });
  };

  const handleSave = () => {
    setIsDialogOpen(false);
    setEditingLocalizacao(null);
    toast({
      title: editingLocalizacao ? "Localização atualizada" : "Localização criada",
      description: "As informações foram salvas com sucesso",
    });
  };

  const getHierarquiaCompleta = (localizacao: Localizacao): string => {
    if (!localizacao.localizacaoPai) return localizacao.nome;
    
    const pai = localizacoes.find(l => l.id === localizacao.localizacaoPai);
    if (pai) {
      return `${getHierarquiaCompleta(pai)} > ${localizacao.nome}`;
    }
    return localizacao.nome;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Localizações</h1>
          <p className="text-muted-foreground">Gerencie armazéns, escritórios, departamentos e localizações</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingLocalizacao(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Localização
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingLocalizacao ? 'Editar Localização' : 'Nova Localização'}
              </DialogTitle>
              <DialogDescription>
                Configure as informações da localização
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código *</Label>
                  <Input id="codigo" placeholder="Ex: ARM-001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input id="nome" placeholder="Nome da localização" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposLocalizacao.map(tipo => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          <div className="flex items-center gap-2">
                            <tipo.icon className="h-4 w-4" />
                            {tipo.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="localizacaoPai">Localização Pai</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {localizacoes.filter(l => l.tipo !== 'prateleira').map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input id="endereco" placeholder="Endereço completo (para armazéns e filiais)" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea id="descricao" placeholder="Descrição da localização" rows={3} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsavel">Responsável</Label>
                  <Input id="responsavel" placeholder="Nome do responsável" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacidade">Capacidade</Label>
                  <Input id="capacidade" type="number" placeholder="Capacidade máxima" />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-base font-medium">Mapeamento Interno</Label>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="andar">Andar</Label>
                    <Input id="andar" placeholder="Ex: 2º Andar" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ala">Ala</Label>
                    <Input id="ala" placeholder="Ex: Ala Norte" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sala">Sala</Label>
                    <Input id="sala" placeholder="Ex: Sala 201" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prateleira">Prateleira</Label>
                    <Input id="prateleira" placeholder="Ex: A1" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-base font-medium">Coordenadas GPS (opcional)</Label>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input id="latitude" type="number" step="any" placeholder="-25.9692" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input id="longitude" type="number" step="any" placeholder="32.5732" />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingLocalizacao ? 'Atualizar' : 'Criar'} Localização
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
                placeholder="Pesquisar por nome, código ou endereço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Tipos</SelectItem>
                  {tiposLocalizacao.map(tipo => (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      {tipo.label}
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
                <TableHead>Nome/Hierarquia</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Capacidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((localizacao) => (
                  <TableRow key={localizacao.id}>
                    <TableCell className="font-medium">{localizacao.codigo}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{getHierarquiaCompleta(localizacao)}</div>
                        {localizacao.endereco && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {localizacao.endereco}
                          </div>
                        )}
                        {localizacao.mapeamento && (
                          <div className="text-xs text-muted-foreground">
                            {[
                              localizacao.mapeamento.andar,
                              localizacao.mapeamento.ala,
                              localizacao.mapeamento.sala,
                              localizacao.mapeamento.prateleira
                            ].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTipoBadgeColor(localizacao.tipo)}`}>
                          {getTipoInfo(localizacao.tipo).label}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{localizacao.responsavel || '-'}</TableCell>
                    <TableCell>
                      {localizacao.capacidade ? `${localizacao.capacidade} itens` : '-'}
                    </TableCell>
                    <TableCell>
                      {localizacao.ativa ? (
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
                              setEditingLocalizacao(localizacao);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          {localizacao.coordenadas && (
                            <DropdownMenuItem>
                              <Map className="h-4 w-4 mr-2" />
                              Ver no Mapa
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggleStatus(localizacao)}>
                            {localizacao.ativa ? (
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
                            onClick={() => handleDelete(localizacao)}
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
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <MapPin className="h-12 w-12 opacity-50" />
                      <p>Nenhuma localização encontrada</p>
                      <p className="text-sm">Tente ajustar os filtros ou criar uma nova localização</p>
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
