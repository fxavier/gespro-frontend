
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
  User,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle,
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
import type { Motorista, DocumentoMotorista } from '@/types/transporte';

// ---------------------------------------------------------------
// Dados mock — 4 motoristas com documentos variados
// (válidos, próximos a expirar, expirados)
// ---------------------------------------------------------------
const motoristasMock: Motorista[] = [
  {
    // Motorista 1: Carlos Santos — carta válida até 2027, BI válido, disponível
    id: '1',
    nomeCompleto: 'Carlos Santos',
    contacto: '+258 84 123 4567',
    morada: 'Av. Julius Nyerere, 1234, Maputo',
    numeroBI: '123456789A',
    numeroCarta: 'CNH-12345',
    categoriaCarta: ['B', 'C', 'D'],
    dataEmissaoCarta: new Date('2017-06-20'),
    validadeCarta: new Date('2027-06-20'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    documentos: [
      {
        id: 'doc-1-1',
        motoristaId: '1',
        tipo: 'carta_conducao',
        numero: 'CNH-12345',
        dataEmissao: new Date('2017-06-20'),
        dataValidade: new Date('2027-06-20'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
      },
      {
        id: 'doc-1-2',
        motoristaId: '1',
        tipo: 'bi',
        numero: '123456789A',
        dataEmissao: new Date('2020-01-10'),
        dataValidade: new Date('2030-01-10'),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'valido',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: true,
      fonte: 'sistema',
    },
    criadoEm: new Date('2020-01-15'),
    actualizadoEm: new Date('2024-01-15'),
  },
  {
    // Motorista 2: Ana Pereira — carta válida até 2028, BI próximo a expirar (~20 dias), disponível
    id: '2',
    nomeCompleto: 'Ana Pereira',
    contacto: '+258 82 987 6543',
    morada: 'Rua da Resistência, 567, Maputo',
    numeroBI: '987654321B',
    numeroCarta: 'CNH-54321',
    categoriaCarta: ['B', 'C'],
    dataEmissaoCarta: new Date('2018-03-10'),
    validadeCarta: new Date('2028-03-10'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    documentos: [
      {
        id: 'doc-2-1',
        motoristaId: '2',
        tipo: 'carta_conducao',
        numero: 'CNH-54321',
        dataEmissao: new Date('2018-03-10'),
        dataValidade: new Date('2028-03-10'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
      },
      {
        id: 'doc-2-2',
        motoristaId: '2',
        tipo: 'bi',
        numero: '987654321B',
        dataEmissao: new Date('2019-05-15'),
        // Expira em ~20 dias a partir de hoje — próximo a expirar
        dataValidade: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'proximo_expirar',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: true,
      fonte: 'sistema',
    },
    criadoEm: new Date('2021-05-20'),
    actualizadoEm: new Date('2024-01-10'),
  },
  {
    // Motorista 3: João Machado — carta EXPIRADA (2024-03-15), BI válido, disponível
    id: '3',
    nomeCompleto: 'João Machado',
    contacto: '+258 86 555 7890',
    morada: 'Av. 25 de Setembro, 890, Maputo',
    numeroBI: '111222333C',
    numeroCarta: 'CNH-67890',
    categoriaCarta: ['B'],
    dataEmissaoCarta: new Date('2014-03-15'),
    validadeCarta: new Date('2024-03-15'),
    localActividade: 'Beira',
    estadoOperacional: 'activo',
    observacoes: 'Carta de condução expirada — renovação pendente',
    documentos: [
      {
        id: 'doc-3-1',
        motoristaId: '3',
        tipo: 'carta_conducao',
        numero: 'CNH-67890',
        dataEmissao: new Date('2014-03-15'),
        // Expirado — data no passado
        dataValidade: new Date('2024-03-15'),
        entidadeEmissora: 'INATTER',
        estado: 'expirado',
      },
      {
        id: 'doc-3-2',
        motoristaId: '3',
        tipo: 'bi',
        numero: '111222333C',
        dataEmissao: new Date('2021-07-20'),
        dataValidade: new Date('2031-07-20'),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'valido',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: true,
      fonte: 'sistema',
    },
    criadoEm: new Date('2021-08-10'),
    actualizadoEm: new Date('2024-01-05'),
  },
  {
    // Motorista 4: Maria Costa — carta válida até 2029, em férias (rh_api), indisponível
    id: '4',
    nomeCompleto: 'Maria Costa',
    contacto: '+258 84 222 3333',
    morada: 'Rua dos Continuadores, 123, Maputo',
    numeroBI: '444555666D',
    numeroCarta: 'CNH-11111',
    categoriaCarta: ['B', 'C', 'D', 'E'],
    dataEmissaoCarta: new Date('2019-01-20'),
    validadeCarta: new Date('2029-01-20'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    observacoes: 'Em férias — retorno previsto para 15/02/2025',
    documentos: [
      {
        id: 'doc-4-1',
        motoristaId: '4',
        tipo: 'carta_conducao',
        numero: 'CNH-11111',
        dataEmissao: new Date('2019-01-20'),
        dataValidade: new Date('2029-01-20'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
      },
      {
        id: 'doc-4-2',
        motoristaId: '4',
        tipo: 'bi',
        numero: '444555666D',
        dataEmissao: new Date('2022-03-05'),
        dataValidade: new Date('2032-03-05'),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'valido',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: false,
      motivo: 'ferias',
      dataInicio: new Date('2025-01-20'),
      dataFim: new Date('2025-02-15'),
      fonte: 'rh_api',
    },
    criadoEm: new Date('2022-03-01'),
    actualizadoEm: new Date('2025-01-20'),
  },
];

export default function MotoristasPage() {
  const [motoristas, setMotoristas] = useState<Motorista[]>(motoristasMock);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [motoristaSelecionado, setMotoristaSelecionado] = useState<Motorista | null>(null);
  const [formData, setFormData] = useState<Partial<Motorista>>({
    nomeCompleto: '',
    contacto: '',
    morada: '',
    estadoOperacional: 'activo',
    numeroCarta: '',
    categoriaCarta: [],
    disponibilidade: {
      disponivel: true,
      fonte: 'manual',
    },
  });

  const dadosFiltrados = useMemo(() => {
    return motoristas.filter(motorista => {
      const matchBusca = busca === '' || 
        motorista.nomeCompleto.toLowerCase().includes(busca.toLowerCase()) ||
        motorista.contacto.includes(busca);
      
      const matchStatus = filtroStatus === 'todos' || motorista.estadoOperacional === filtroStatus;
      
      return matchBusca && matchStatus;
    });
  }, [motoristas, busca, filtroStatus]);

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
    const hoje = new Date();
    return {
      total: motoristas.length,
      activos: motoristas.filter(m => m.estadoOperacional === 'activo').length,
      disponiveis: motoristas.filter(m => m.disponibilidade.disponivel).length,
      comAlertas: motoristas.filter(
        m =>
          m.validadeCarta < hoje ||
          m.documentos.some(doc => doc.estado !== 'valido'),
      ).length,
    };
  }, [motoristas]);

  const handleNovoMotorista = () => {
    setMotoristaSelecionado(null);
    setFormData({
      nomeCompleto: '',
      contacto: '',
      morada: '',
      estadoOperacional: 'activo',
      numeroCarta: '',
      categoriaCarta: [],
      disponibilidade: {
        disponivel: true,
        fonte: 'manual',
      },
    });
    setDialogAberto(true);
  };

  const handleEditarMotorista = (motorista: Motorista) => {
    setMotoristaSelecionado(motorista);
    setFormData(motorista);
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.nomeCompleto || !formData.contacto) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!formData.numeroCarta || !formData.categoriaCarta || formData.categoriaCarta.length === 0) {
      toast.error('Preencha os dados da carta de condução');
      return;
    }

    if (!formData.dataEmissaoCarta || !formData.validadeCarta) {
      toast.error('Preencha as datas de emissão e validade da carta');
      return;
    }

    if (motoristaSelecionado) {
      setMotoristas(motoristas.map(m => 
        m.id === motoristaSelecionado.id 
          ? { ...m, ...formData, actualizadoEm: new Date() }
          : m
      ));
      toast.success('Motorista actualizado com sucesso!');
    } else {
      const novoMotorista: Motorista = {
        ...(formData as Motorista),
        id: Date.now().toString(),
        documentos: [],
        disponibilidade: formData.disponibilidade ?? { disponivel: true, fonte: 'manual' },
        criadoEm: new Date(),
        actualizadoEm: new Date(),
      };
      setMotoristas([novoMotorista, ...motoristas]);
      toast.success('Motorista cadastrado com sucesso!');
    }

    setDialogAberto(false);
  };

  const handleExcluir = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este motorista?')) {
      setMotoristas(motoristas.filter(m => m.id !== id));
      toast.success('Motorista excluído com sucesso!');
    }
  };

  const getStatusBadge = (estadoOperacional: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; icon: any }> = {
      activo: { variant: 'default', label: 'Activo', icon: CheckCircle },
      inactivo: { variant: 'outline', label: 'Inactivo', icon: AlertCircle },
      suspenso: { variant: 'destructive', label: 'Suspenso', icon: AlertCircle },
    };
    return badges[estadoOperacional] || badges.activo;
  };

  const getCartaStatusBadge = (motorista: Motorista) => {
    const hoje = new Date();
    const validade = new Date(motorista.validadeCarta);
    const diasRestantes = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    if (diasRestantes < 0) return { variant: 'destructive' as const, label: 'Expirada' };
    if (diasRestantes <= 30) return { variant: 'secondary' as const, label: 'Próxima a Expirar' };
    return { variant: 'default' as const, label: 'Válida' };
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Motoristas</h1>
          <p className="text-muted-foreground">Cadastro e controlo de motoristas</p>
        </div>
        <Button className="gap-2" onClick={handleNovoMotorista}>
          <Plus className="h-4 w-4" />
          Novo Motorista
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <p className="text-sm text-muted-foreground">Activos</p>
              <p className="text-3xl font-bold text-green-600">{estatisticas.activos}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Disponíveis</p>
              <p className="text-3xl font-bold text-blue-600">{estatisticas.disponiveis}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Com Alertas</p>
              <p className="text-3xl font-bold text-red-600">{estatisticas.comAlertas}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Pesquisa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, telefone ou email..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Estado Operacional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Motoristas ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {paginatedData.map((motorista) => {
              const statusInfo = getStatusBadge(motorista.estadoOperacional);
              const cartaStatusInfo = getCartaStatusBadge(motorista);
              const StatusIcon = statusInfo.icon;
              const cartaExpirada = motorista.validadeCarta < new Date();
              
              return (
                <div key={motorista.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>
                      
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/transporte/motoristas/${motorista.id}`}
                            className="text-lg font-semibold hover:underline flex items-center gap-1"
                          >
                            {motorista.nomeCompleto}
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </Link>
                          <div className="flex items-center gap-1">
                            <StatusIcon className="h-4 w-4" />
                            <Badge variant={statusInfo.variant as any}>
                              {statusInfo.label}
                            </Badge>
                          </div>
                          {!motorista.disponibilidade.disponivel && (
                            <Badge variant="secondary">
                              {motorista.disponibilidade.motivo === 'ferias' ? 'Férias' :
                               motorista.disponibilidade.motivo === 'ausencia' ? 'Ausência' :
                               motorista.disponibilidade.motivo === 'suspensao' ? 'Suspenso' : 'Indisponível'}
                            </Badge>
                          )}
                          {cartaExpirada && (
                            <div className="flex items-center gap-1 text-red-600">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-xs font-medium">Carta expirada</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{motorista.contacto}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>Carta: {motorista.numeroCarta}</span>
                            <Badge variant={cartaStatusInfo.variant as any} className="text-xs">
                              {cartaStatusInfo.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Categorias:</span>
                            <span>{motorista.categoriaCarta.join(', ')}</span>
                          </div>
                          {motorista.disponibilidade.disponivel ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs font-medium">Disponível</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-orange-600">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-xs font-medium">Indisponível</span>
                            </div>
                          )}
                        </div>

                        {motorista.observacoes && (
                          <div className="pt-2 border-t">
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium">Obs:</span> {motorista.observacoes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditarMotorista(motorista)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExcluir(motorista.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum motorista encontrado</p>
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
              {motoristaSelecionado ? 'Editar Motorista' : 'Novo Motorista'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nomeCompleto">Nome Completo *</Label>
              <Input
                id="nomeCompleto"
                value={formData.nomeCompleto || ''}
                onChange={(e) => setFormData({ ...formData, nomeCompleto: e.target.value })}
                placeholder="Nome completo do motorista"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contacto">Contacto Telefónico *</Label>
                <Input
                  id="contacto"
                  value={formData.contacto || ''}
                  onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                  placeholder="+258 84 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numeroBI">Número do BI</Label>
                <Input
                  id="numeroBI"
                  value={formData.numeroBI || ''}
                  onChange={(e) => setFormData({ ...formData, numeroBI: e.target.value })}
                  placeholder="123456789A"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="morada">Morada</Label>
              <Input
                id="morada"
                value={formData.morada || ''}
                onChange={(e) => setFormData({ ...formData, morada: e.target.value })}
                placeholder="Endereço completo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="localActividade">Local de Actividade</Label>
                <Input
                  id="localActividade"
                  value={formData.localActividade || ''}
                  onChange={(e) => setFormData({ ...formData, localActividade: e.target.value })}
                  placeholder="Maputo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estadoOperacional">Estado Operacional</Label>
                <Select 
                  value={formData.estadoOperacional} 
                  onValueChange={(value: any) => setFormData({ ...formData, estadoOperacional: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                    <SelectItem value="suspenso">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold">Carta de Condução</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numeroCarta">Número da Carta *</Label>
                  <Input
                    id="numeroCarta"
                    value={formData.numeroCarta || ''}
                    onChange={(e) => setFormData({ ...formData, numeroCarta: e.target.value })}
                    placeholder="CNH-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categorias">Categorias da Carta *</Label>
                  <Input
                    id="categorias"
                    value={formData.categoriaCarta?.join(', ') || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      categoriaCarta: e.target.value.split(',').map(c => c.trim()).filter(c => c)
                    })}
                    placeholder="B, C, D (separadas por vírgula)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataEmissaoCarta">Data de Emissão da Carta *</Label>
                  <Input
                    id="dataEmissaoCarta"
                    type="date"
                    value={formData.dataEmissaoCarta ? new Date(formData.dataEmissaoCarta).toISOString().split('T')[0] : ''}
                    onChange={(e) => setFormData({ ...formData, dataEmissaoCarta: new Date(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validadeCarta">Validade da Carta *</Label>
                  <Input
                    id="validadeCarta"
                    type="date"
                    value={formData.validadeCarta ? new Date(formData.validadeCarta).toISOString().split('T')[0] : ''}
                    onChange={(e) => setFormData({ ...formData, validadeCarta: new Date(e.target.value) })}
                  />
                </div>
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
              {motoristaSelecionado ? 'Actualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
