
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle,
  Wrench,
  Calendar,
  Fuel
} from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import type { Veiculo } from '@/types/transporte';

const veiculosMock: Veiculo[] = [
  {
    id: '1',
    tenantId: '1',
    matricula: 'ABC-1234',
    marca: 'Toyota',
    modelo: 'Hilux',
    ano: 2022,
    cor: 'Branco',
    tipo: 'caminhao',
    capacidadeCarga: 1000,
    unidadeCapacidade: 'kg',
    consumoMedio: 12.5,
    status: 'disponivel',
    kmAtual: 45000,
    ultimaManutencao: '2024-01-10',
    proximaManutencao: '2024-04-10',
    seguro: {
      seguradora: 'Seguradora XYZ',
      numeroApolice: 'SEG-12345',
      dataValidade: '2024-12-31',
      valorCobertura: 500000
    },
    inspecao: {
      dataUltimaInspecao: '2023-12-15',
      dataProximaInspecao: '2024-12-15',
      status: 'valida'
    },
    licenca: {
      numeroLicenca: 'LIC-98765',
      dataValidade: '2024-11-30',
      status: 'valida'
    },
    dataCriacao: '2022-01-15',
    dataAtualizacao: '2024-01-15'
  },
  {
    id: '2',
    tenantId: '1',
    matricula: 'XYZ-5678',
    marca: 'Nissan',
    modelo: 'NP300',
    ano: 2021,
    cor: 'Prata',
    tipo: 'caminhao',
    capacidadeCarga: 800,
    unidadeCapacidade: 'kg',
    consumoMedio: 11.8,
    status: 'em_rota',
    kmAtual: 62000,
    ultimaManutencao: '2023-12-20',
    proximaManutencao: '2024-03-20',
    seguro: {
      seguradora: 'Seguradora ABC',
      numeroApolice: 'SEG-54321',
      dataValidade: '2024-10-15',
      valorCobertura: 450000
    },
    inspecao: {
      dataUltimaInspecao: '2023-11-10',
      dataProximaInspecao: '2024-11-10',
      status: 'valida'
    },
    licenca: {
      numeroLicenca: 'LIC-45678',
      dataValidade: '2024-09-30',
      status: 'valida'
    },
    dataCriacao: '2021-03-20',
    dataAtualizacao: '2024-01-10'
  },
  {
    id: '3',
    tenantId: '1',
    matricula: 'DEF-9012',
    marca: 'Isuzu',
    modelo: 'D-Max',
    ano: 2020,
    cor: 'Azul',
    tipo: 'caminhao',
    capacidadeCarga: 1200,
    unidadeCapacidade: 'kg',
    consumoMedio: 13.2,
    status: 'manutencao',
    kmAtual: 85000,
    ultimaManutencao: '2024-01-05',
    proximaManutencao: '2024-04-05',
    seguro: {
      seguradora: 'Seguradora XYZ',
      numeroApolice: 'SEG-67890',
      dataValidade: '2024-08-20',
      valorCobertura: 400000
    },
    inspecao: {
      dataUltimaInspecao: '2023-10-05',
      dataProximaInspecao: '2024-02-20',
      status: 'proxima_vencer'
    },
    licenca: {
      numeroLicenca: 'LIC-23456',
      dataValidade: '2024-07-15',
      status: 'valida'
    },
    observacoes: 'Em manutenção preventiva - troca de óleo e filtros',
    dataCriacao: '2020-05-10',
    dataAtualizacao: '2024-01-05'
  }
];

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>(veiculosMock);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<Veiculo | null>(null);
  const [formData, setFormData] = useState<Partial<Veiculo>>({
    matricula: '',
    marca: '',
    modelo: '',
    ano: new Date().getFullYear(),
    tipo: 'caminhao',
    capacidadeCarga: 0,
    unidadeCapacidade: 'kg',
    consumoMedio: 0,
    status: 'disponivel',
    kmAtual: 0
  });

  const dadosFiltrados = useMemo(() => {
    return veiculos.filter(veiculo => {
      const matchBusca = busca === '' || 
        veiculo.matricula.toLowerCase().includes(busca.toLowerCase()) ||
        veiculo.marca.toLowerCase().includes(busca.toLowerCase()) ||
        veiculo.modelo.toLowerCase().includes(busca.toLowerCase());
      
      const matchStatus = filtroStatus === 'todos' || veiculo.status === filtroStatus;
      const matchTipo = filtroTipo === 'todos' || veiculo.tipo === filtroTipo;
      
      return matchBusca && matchStatus && matchTipo;
    });
  }, [veiculos, busca, filtroStatus, filtroTipo]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const estatisticas = useMemo(() => {
    return {
      total: veiculos.length,
      disponiveis: veiculos.filter(v => v.status === 'disponivel').length,
      emRota: veiculos.filter(v => v.status === 'em_rota').length,
      manutencao: veiculos.filter(v => v.status === 'manutencao').length,
      inativos: veiculos.filter(v => v.status === 'inativo').length
    };
  }, [veiculos]);

  const handleNovoVeiculo = () => {
    setVeiculoSelecionado(null);
    setFormData({
      matricula: '',
      marca: '',
      modelo: '',
      ano: new Date().getFullYear(),
      tipo: 'caminhao',
      capacidadeCarga: 0,
      unidadeCapacidade: 'kg',
      consumoMedio: 0,
      status: 'disponivel',
      kmAtual: 0
    });
    setDialogAberto(true);
  };

  const handleEditarVeiculo = (veiculo: Veiculo) => {
    setVeiculoSelecionado(veiculo);
    setFormData(veiculo);
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.matricula || !formData.marca || !formData.modelo) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (veiculoSelecionado) {
      setVeiculos(veiculos.map(v => 
        v.id === veiculoSelecionado.id 
          ? { ...v, ...formData, dataAtualizacao: new Date().toISOString() }
          : v
      ));
      toast.success('Veículo atualizado com sucesso!');
    } else {
      const novoVeiculo: Veiculo = {
        ...formData as Veiculo,
        id: Date.now().toString(),
        tenantId: '1',
        seguro: {
          seguradora: '',
          numeroApolice: '',
          dataValidade: '',
          valorCobertura: 0
        },
        inspecao: {
          dataProximaInspecao: '',
          status: 'valida'
        },
        licenca: {
          numeroLicenca: '',
          dataValidade: '',
          status: 'valida'
        },
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
      };
      setVeiculos([novoVeiculo, ...veiculos]);
      toast.success('Veículo cadastrado com sucesso!');
    }

    setDialogAberto(false);
  };

  const handleExcluir = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este veículo?')) {
      setVeiculos(veiculos.filter(v => v.id !== id));
      toast.success('Veículo excluído com sucesso!');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; icon: any }> = {
      disponivel: { variant: 'default', label: 'Disponível', icon: CheckCircle },
      em_rota: { variant: 'secondary', label: 'Em Rota', icon: Truck },
      manutencao: { variant: 'destructive', label: 'Manutenção', icon: Wrench },
      inativo: { variant: 'outline', label: 'Inativo', icon: AlertCircle }
    };
    return badges[status] || badges.disponivel;
  };

  const getTipoLabel = (tipo: string) => {
    const tipos: Record<string, string> = {
      carro: 'Carro',
      caminhao: 'Caminhão',
      moto: 'Moto',
      van: 'Van'
    };
    return tipos[tipo] || tipo;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Veículos</h1>
          <p className="text-muted-foreground">Cadastro e controlo da frota de veículos</p>
        </div>
        <Button className="gap-2" onClick={handleNovoVeiculo}>
          <Plus className="h-4 w-4" />
          Novo Veículo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-3xl font-bold">{estatisticas.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Disponíveis</p>
              <p className="text-3xl font-bold text-green-600">{estatisticas.disponiveis}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Em Rota</p>
              <p className="text-3xl font-bold text-blue-600">{estatisticas.emRota}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Manutenção</p>
              <p className="text-3xl font-bold text-orange-600">{estatisticas.manutencao}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Inativos</p>
              <p className="text-3xl font-bold text-gray-600">{estatisticas.inativos}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Pesquisa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por matrícula, marca ou modelo..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_rota">Em Rota</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="carro">Carro</SelectItem>
                <SelectItem value="caminhao">Caminhão</SelectItem>
                <SelectItem value="moto">Moto</SelectItem>
                <SelectItem value="van">Van</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Veículos ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Matrícula</th>
                  <th className="text-left p-4 font-medium">Veículo</th>
                  <th className="text-left p-4 font-medium">Tipo</th>
                  <th className="text-left p-4 font-medium">Capacidade</th>
                  <th className="text-left p-4 font-medium">KM Atual</th>
                  <th className="text-left p-4 font-medium">Consumo</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((veiculo) => {
                  const statusInfo = getStatusBadge(veiculo.status);
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <tr key={veiculo.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{veiculo.matricula}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{veiculo.marca} {veiculo.modelo}</div>
                          <div className="text-sm text-muted-foreground">
                            {veiculo.ano} • {veiculo.cor}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{getTipoLabel(veiculo.tipo)}</Badge>
                      </td>
                      <td className="p-4">
                        {veiculo.capacidadeCarga} {veiculo.unidadeCapacidade}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {veiculo.kmAtual.toLocaleString()} km
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Fuel className="h-4 w-4 text-muted-foreground" />
                          {veiculo.consumoMedio} km/l
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <StatusIcon className="h-4 w-4" />
                          <Badge variant={statusInfo.variant as any}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditarVeiculo(veiculo)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExcluir(veiculo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum veículo encontrado</p>
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

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {veiculoSelecionado ? 'Editar Veículo' : 'Novo Veículo'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="matricula">Matrícula *</Label>
                <Input
                  id="matricula"
                  value={formData.matricula}
                  onChange={(e) => setFormData({ ...formData, matricula: e.target.value })}
                  placeholder="ABC-1234"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select 
                  value={formData.tipo} 
                  onValueChange={(value: any) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carro">Carro</SelectItem>
                    <SelectItem value="caminhao">Caminhão</SelectItem>
                    <SelectItem value="moto">Moto</SelectItem>
                    <SelectItem value="van">Van</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca">Marca *</Label>
                <Input
                  id="marca"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  placeholder="Toyota"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelo">Modelo *</Label>
                <Input
                  id="modelo"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="Hilux"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ano">Ano *</Label>
                <Input
                  id="ano"
                  type="number"
                  value={formData.ano}
                  onChange={(e) => setFormData({ ...formData, ano: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cor">Cor</Label>
                <Input
                  id="cor"
                  value={formData.cor || ''}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                  placeholder="Branco"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacidade">Capacidade de Carga *</Label>
                <Input
                  id="capacidade"
                  type="number"
                  value={formData.capacidadeCarga}
                  onChange={(e) => setFormData({ ...formData, capacidadeCarga: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unidade">Unidade</Label>
                <Select 
                  value={formData.unidadeCapacidade} 
                  onValueChange={(value: any) => setFormData({ ...formData, unidadeCapacidade: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="ton">ton</SelectItem>
                    <SelectItem value="m3">m³</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="consumo">Consumo Médio (km/l)</Label>
                <Input
                  id="consumo"
                  type="number"
                  step="0.1"
                  value={formData.consumoMedio}
                  onChange={(e) => setFormData({ ...formData, consumoMedio: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="km">KM Atual</Label>
                <Input
                  id="km"
                  type="number"
                  value={formData.kmAtual}
                  onChange={(e) => setFormData({ ...formData, kmAtual: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="em_rota">Em Rota</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes || ''}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar}>
              {veiculoSelecionado ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
