
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
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
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  Wrench,
  AlertTriangle,
  ExternalLink,
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
import type { Viatura } from '@/types/transporte';

// ---------------------------------------------------------------
// Dados mock — 4 viaturas com documentos variados
// (válidos, próximos a expirar, expirados)
// ---------------------------------------------------------------
const viaturasMock: Viatura[] = [
  {
    id: '1',
    matricula: 'ABC-1234',
    marca: 'Toyota',
    modelo: 'Hilux',
    tipoViatura: 'ligeiro_mercadorias',
    capacidade: 1000,
    unidadeCapacidade: 'kg',
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2022-01-15'),
    motoristaResponsavelId: 'mot-1',
    motoristaResponsavelNome: 'João Machava',
    estado: 'disponivel',
    documentos: [
      {
        id: 'doc-1-1',
        viaturaId: '1',
        tipo: 'livrete',
        numero: 'LV-2022-001',
        dataEmissao: new Date('2022-01-15'),
        dataValidade: new Date('2027-01-15'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-1-2',
        viaturaId: '1',
        tipo: 'seguro',
        numero: 'SEG-2024-001',
        dataEmissao: new Date('2024-01-01'),
        dataValidade: new Date('2025-01-01'),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-1-3',
        viaturaId: '1',
        tipo: 'inspecao',
        numero: 'INSP-2024-001',
        dataEmissao: new Date('2024-03-01'),
        dataValidade: new Date('2025-03-01'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2022-01-15'),
    actualizadoEm: new Date('2024-01-15'),
  },
  {
    id: '2',
    matricula: 'XYZ-5678',
    marca: 'Nissan',
    modelo: 'NP300',
    tipoViatura: 'ligeiro_passageiros',
    capacidade: 5,
    unidadeCapacidade: 'passageiros',
    localActividade: 'Beira',
    dataInicioActividade: new Date('2021-03-20'),
    motoristaResponsavelId: 'mot-2',
    motoristaResponsavelNome: 'Carlos Sitoe',
    estado: 'em_actividade',
    documentos: [
      {
        id: 'doc-2-1',
        viaturaId: '2',
        tipo: 'livrete',
        numero: 'LV-2021-002',
        dataEmissao: new Date('2021-03-20'),
        dataValidade: new Date('2026-03-20'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-2-2',
        viaturaId: '2',
        tipo: 'seguro',
        numero: 'SEG-2024-002',
        dataEmissao: new Date('2024-01-15'),
        // Expira em ~20 dias a partir de hoje — próximo a expirar
        dataValidade: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'proximo_expirar',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-2-3',
        viaturaId: '2',
        tipo: 'inspecao',
        numero: 'INSP-2024-002',
        dataEmissao: new Date('2024-02-01'),
        // Expira em ~15 dias a partir de hoje — próximo a expirar
        dataValidade: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        entidadeEmissora: 'INATTER',
        estado: 'proximo_expirar',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2021-03-20'),
    actualizadoEm: new Date('2024-01-10'),
  },
  {
    id: '3',
    matricula: 'DEF-9012',
    marca: 'Isuzu',
    modelo: 'FTR',
    tipoViatura: 'pesado_mercadorias',
    capacidade: 10,
    unidadeCapacidade: 'ton',
    localActividade: 'Nampula',
    dataInicioActividade: new Date('2020-05-10'),
    estado: 'em_manutencao',
    observacoes: 'Em manutenção preventiva — troca de óleo e filtros',
    documentos: [
      {
        id: 'doc-3-1',
        viaturaId: '3',
        tipo: 'livrete',
        numero: 'LV-2020-003',
        dataEmissao: new Date('2020-05-10'),
        dataValidade: new Date('2025-05-10'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-3-2',
        viaturaId: '3',
        tipo: 'seguro',
        numero: 'SEG-2023-003',
        dataEmissao: new Date('2023-01-01'),
        // Expirado — data no passado
        dataValidade: new Date('2024-01-01'),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-3-3',
        viaturaId: '3',
        tipo: 'inspecao',
        numero: 'INSP-2023-003',
        dataEmissao: new Date('2023-03-01'),
        // Expirado — data no passado
        dataValidade: new Date('2024-03-01'),
        entidadeEmissora: 'INATTER',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2020-05-10'),
    actualizadoEm: new Date('2024-01-05'),
  },
  {
    id: '4',
    matricula: 'GHI-3456',
    marca: 'Mercedes-Benz',
    modelo: 'Sprinter',
    tipoViatura: 'pesado_passageiros',
    capacidade: 20,
    unidadeCapacidade: 'passageiros',
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2019-08-01'),
    estado: 'inactiva',
    observacoes: 'Aguarda renovação de documentação',
    documentos: [
      {
        id: 'doc-4-1',
        viaturaId: '4',
        tipo: 'livrete',
        numero: 'LV-2019-004',
        dataEmissao: new Date('2019-08-01'),
        dataValidade: new Date('2024-08-01'),
        entidadeEmissora: 'INATTER',
        // Expirado
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-4-2',
        viaturaId: '4',
        tipo: 'licenca',
        numero: 'LIC-2019-004',
        dataEmissao: new Date('2019-08-01'),
        dataValidade: new Date('2024-08-01'),
        entidadeEmissora: 'Ministério dos Transportes',
        // Expirado
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2019-08-01'),
    actualizadoEm: new Date('2024-01-01'),
  },
];

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Viatura[]>(viaturasMock);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<Viatura | null>(null);
  const [formData, setFormData] = useState<Partial<Viatura>>({
    matricula: '',
    marca: '',
    modelo: '',
    tipoViatura: 'ligeiro_mercadorias',
    capacidade: 0,
    unidadeCapacidade: 'kg',
    localActividade: '',
    estado: 'disponivel',
    documentos: [],
  });

  const dadosFiltrados = useMemo(() => {
    return veiculos.filter(veiculo => {
      const matchBusca = busca === '' || 
        veiculo.matricula.toLowerCase().includes(busca.toLowerCase()) ||
        veiculo.marca.toLowerCase().includes(busca.toLowerCase()) ||
        veiculo.modelo.toLowerCase().includes(busca.toLowerCase());
      
      const matchStatus = filtroStatus === 'todos' || veiculo.estado === filtroStatus;
      const matchTipo = filtroTipo === 'todos' || veiculo.tipoViatura === filtroTipo;
      
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
      disponiveis: veiculos.filter(v => v.estado === 'disponivel').length,
      emActividade: veiculos.filter(v => v.estado === 'em_actividade').length,
      manutencao: veiculos.filter(v => v.estado === 'em_manutencao').length,
      inactivas: veiculos.filter(v => v.estado === 'inactiva').length,
    };
  }, [veiculos]);

  const handleNovoVeiculo = () => {
    setVeiculoSelecionado(null);
    setFormData({
      matricula: '',
      marca: '',
      modelo: '',
      tipoViatura: 'ligeiro_mercadorias',
      capacidade: 0,
      unidadeCapacidade: 'kg',
      localActividade: '',
      estado: 'disponivel',
      documentos: [],
    });
    setDialogAberto(true);
  };

  const handleEditarVeiculo = (veiculo: Viatura) => {
    setVeiculoSelecionado(veiculo);
    setFormData(veiculo);
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.matricula || !formData.marca || !formData.modelo || !formData.localActividade) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (veiculoSelecionado) {
      setVeiculos(veiculos.map(v => 
        v.id === veiculoSelecionado.id 
          ? { ...v, ...formData, actualizadoEm: new Date() }
          : v
      ));
      toast.success('Viatura actualizada com sucesso!');
    } else {
      const novaViatura: Viatura = {
        ...(formData as Viatura),
        id: Date.now().toString(),
        documentos: [],
        criadoEm: new Date(),
        actualizadoEm: new Date(),
        dataInicioActividade: formData.dataInicioActividade ?? new Date(),
      };
      setVeiculos([novaViatura, ...veiculos]);
      toast.success('Viatura cadastrada com sucesso!');
    }

    setDialogAberto(false);
  };

  const handleExcluir = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta viatura?')) {
      setVeiculos(veiculos.filter(v => v.id !== id));
      toast.success('Viatura excluída com sucesso!');
    }
  };

  const getStatusBadge = (estado: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; icon: any }> = {
      disponivel: { variant: 'default', label: 'Disponível', icon: CheckCircle },
      em_actividade: { variant: 'secondary', label: 'Em Actividade', icon: Truck },
      em_manutencao: { variant: 'destructive', label: 'Manutenção', icon: Wrench },
      inactiva: { variant: 'outline', label: 'Inactiva', icon: AlertCircle },
      abatida: { variant: 'outline', label: 'Abatida', icon: AlertCircle },
    };
    return badges[estado] || badges.disponivel;
  };

  const getTipoLabel = (tipo: string) => {
    const tipos: Record<string, string> = {
      ligeiro_passageiros: 'Ligeiro Passageiros',
      ligeiro_mercadorias: 'Ligeiro Mercadorias',
      pesado_mercadorias: 'Pesado Mercadorias',
      pesado_passageiros: 'Pesado Passageiros',
      motociclo: 'Motociclo',
      outro: 'Outro',
    };
    return tipos[tipo] || tipo;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Viaturas</h1>
          <p className="text-muted-foreground">Cadastro e controlo da frota de viaturas</p>
        </div>
        <Button className="gap-2" onClick={handleNovoVeiculo}>
          <Plus className="h-4 w-4" />
          Nova Viatura
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
              <p className="text-sm text-muted-foreground">Em Actividade</p>
              <p className="text-3xl font-bold text-blue-600">{estatisticas.emActividade}</p>
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
              <p className="text-sm text-muted-foreground">Inactivas</p>
              <p className="text-3xl font-bold text-gray-600">{estatisticas.inactivas}</p>
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
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_actividade">Em Actividade</SelectItem>
                <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                <SelectItem value="inactiva">Inactiva</SelectItem>
                <SelectItem value="abatida">Abatida</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="ligeiro_passageiros">Ligeiro Passageiros</SelectItem>
                <SelectItem value="ligeiro_mercadorias">Ligeiro Mercadorias</SelectItem>
                <SelectItem value="pesado_mercadorias">Pesado Mercadorias</SelectItem>
                <SelectItem value="pesado_passageiros">Pesado Passageiros</SelectItem>
                <SelectItem value="motociclo">Motociclo</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Viaturas ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Matrícula</th>
                  <th className="text-left p-4 font-medium">Marca / Modelo</th>
                  <th className="text-left p-4 font-medium">Tipo</th>
                  <th className="text-left p-4 font-medium">Estado</th>
                  <th className="text-left p-4 font-medium">Motorista Responsável</th>
                  <th className="text-left p-4 font-medium">Alertas</th>
                  <th className="text-left p-4 font-medium">Acções</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((veiculo) => {
                  const statusInfo = getStatusBadge(veiculo.estado);
                  const StatusIcon = statusInfo.icon;
                  const temDocumentosExpirados = veiculo.documentos.some(
                    (doc) => doc.estado === 'expirado',
                  );
                  const temDocumentosProximosExpirar = veiculo.documentos.some(
                    (doc) => doc.estado === 'proximo_expirar',
                  );

                  return (
                    <tr key={veiculo.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <Link
                            href={`/transporte/veiculos/${veiculo.id}`}
                            className="font-medium hover:underline flex items-center gap-1"
                          >
                            {veiculo.matricula}
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{veiculo.marca} {veiculo.modelo}</div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{getTipoLabel(veiculo.tipoViatura)}</Badge>
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
                        {veiculo.motoristaResponsavelNome ? (
                          <span className="text-sm">{veiculo.motoristaResponsavelNome}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {temDocumentosExpirados ? (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-xs font-medium">Documentos expirados</span>
                          </div>
                        ) : temDocumentosProximosExpirar ? (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-xs font-medium">A expirar em breve</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-xs font-medium">OK</span>
                          </div>
                        )}
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
              <p className="text-muted-foreground">Nenhuma viatura encontrada</p>
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
              {veiculoSelecionado ? 'Editar Viatura' : 'Nova Viatura'}
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
                <Label htmlFor="tipoViatura">Tipo de Viatura *</Label>
                <Select 
                  value={formData.tipoViatura} 
                  onValueChange={(value: any) => setFormData({ ...formData, tipoViatura: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ligeiro_passageiros">Ligeiro Passageiros</SelectItem>
                    <SelectItem value="ligeiro_mercadorias">Ligeiro Mercadorias</SelectItem>
                    <SelectItem value="pesado_mercadorias">Pesado Mercadorias</SelectItem>
                    <SelectItem value="pesado_passageiros">Pesado Passageiros</SelectItem>
                    <SelectItem value="motociclo">Motociclo</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="capacidade">Capacidade *</Label>
                <Input
                  id="capacidade"
                  type="number"
                  value={formData.capacidade}
                  onChange={(e) => setFormData({ ...formData, capacidade: parseFloat(e.target.value) })}
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
                    <SelectItem value="passageiros">passageiros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado *</Label>
                <Select 
                  value={formData.estado} 
                  onValueChange={(value: any) => setFormData({ ...formData, estado: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="em_actividade">Em Actividade</SelectItem>
                    <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                    <SelectItem value="inactiva">Inactiva</SelectItem>
                    <SelectItem value="abatida">Abatida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="localActividade">Local de Actividade *</Label>
              <Input
                id="localActividade"
                value={formData.localActividade || ''}
                onChange={(e) => setFormData({ ...formData, localActividade: e.target.value })}
                placeholder="Maputo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataInicioActividade">Data de Início de Actividade *</Label>
              <Input
                id="dataInicioActividade"
                type="date"
                value={
                  formData.dataInicioActividade
                    ? new Date(formData.dataInicioActividade).toISOString().split('T')[0]
                    : ''
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dataInicioActividade: e.target.value ? new Date(e.target.value) : undefined,
                  })
                }
              />
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
              {veiculoSelecionado ? 'Actualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
