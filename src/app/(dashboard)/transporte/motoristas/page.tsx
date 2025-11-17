
'use client';

import { useState, useMemo } from 'react';
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
  Mail,
  Calendar,
  Award,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Package
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
import type { Motorista } from '@/types/transporte';

const motoristasMock: Motorista[] = [
  {
    id: '1',
    tenantId: '1',
    nome: 'Carlos Santos',
    email: 'carlos.santos@email.com',
    telefone: '+258 84 123 4567',
    nuit: '123456789',
    endereco: 'Av. Julius Nyerere, 1234, Maputo',
    dataNascimento: '1985-03-15',
    cartaConducao: {
      numero: 'CNH-12345',
      categoria: ['B', 'C', 'D'],
      dataEmissao: '2015-06-20',
      dataValidade: '2025-06-20',
      status: 'valida'
    },
    status: 'ativo',
    avaliacaoMedia: 4.8,
    totalEntregas: 450,
    entregasNoTempo: 425,
    entregasAtrasadas: 20,
    entregasFalhadas: 5,
    dataCriacao: '2020-01-15',
    dataAtualizacao: '2024-01-15'
  },
  {
    id: '2',
    tenantId: '1',
    nome: 'Ana Pereira',
    email: 'ana.pereira@email.com',
    telefone: '+258 82 987 6543',
    nuit: '987654321',
    endereco: 'Rua da Resistência, 567, Maputo',
    dataNascimento: '1990-07-22',
    cartaConducao: {
      numero: 'CNH-54321',
      categoria: ['B', 'C'],
      dataEmissao: '2018-03-10',
      dataValidade: '2028-03-10',
      status: 'valida'
    },
    status: 'ativo',
    avaliacaoMedia: 4.9,
    totalEntregas: 320,
    entregasNoTempo: 310,
    entregasAtrasadas: 8,
    entregasFalhadas: 2,
    dataCriacao: '2021-05-20',
    dataAtualizacao: '2024-01-10'
  },
  {
    id: '3',
    tenantId: '1',
    nome: 'João Machado',
    email: 'joao.machado@email.com',
    telefone: '+258 86 555 7890',
    nuit: '456789123',
    endereco: 'Av. 25 de Setembro, 890, Maputo',
    dataNascimento: '1988-11-05',
    cartaConducao: {
      numero: 'CNH-67890',
      categoria: ['B'],
      dataEmissao: '2016-09-15',
      dataValidade: '2024-03-15',
      status: 'proxima_vencer'
    },
    status: 'ativo',
    avaliacaoMedia: 4.5,
    totalEntregas: 280,
    entregasNoTempo: 260,
    entregasAtrasadas: 15,
    entregasFalhadas: 5,
    observacoes: 'Carta de condução próxima do vencimento',
    dataCriacao: '2021-08-10',
    dataAtualizacao: '2024-01-05'
  },
  {
    id: '4',
    tenantId: '1',
    nome: 'Maria Costa',
    email: 'maria.costa@email.com',
    telefone: '+258 84 222 3333',
    nuit: '789123456',
    endereco: 'Rua dos Continuadores, 123, Maputo',
    dataNascimento: '1992-04-18',
    cartaConducao: {
      numero: 'CNH-11111',
      categoria: ['B', 'C', 'D', 'E'],
      dataEmissao: '2019-01-20',
      dataValidade: '2029-01-20',
      status: 'valida'
    },
    status: 'ferias',
    avaliacaoMedia: 4.7,
    totalEntregas: 195,
    entregasNoTempo: 185,
    entregasAtrasadas: 8,
    entregasFalhadas: 2,
    observacoes: 'Em férias até 15/02/2024',
    dataCriacao: '2022-03-01',
    dataAtualizacao: '2024-01-20'
  }
];

export default function MotoristasPage() {
  const [motoristas, setMotoristas] = useState<Motorista[]>(motoristasMock);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [motoristaSelecionado, setMotoristaSelecionado] = useState<Motorista | null>(null);
  const [formData, setFormData] = useState<Partial<Motorista>>({
    nome: '',
    email: '',
    telefone: '',
    nuit: '',
    endereco: '',
    dataNascimento: '',
    status: 'ativo',
    cartaConducao: {
      numero: '',
      categoria: [],
      dataEmissao: '',
      dataValidade: '',
      status: 'valida'
    }
  });

  const dadosFiltrados = useMemo(() => {
    return motoristas.filter(motorista => {
      const matchBusca = busca === '' || 
        motorista.nome.toLowerCase().includes(busca.toLowerCase()) ||
        motorista.telefone.includes(busca) ||
        motorista.email?.toLowerCase().includes(busca.toLowerCase());
      
      const matchStatus = filtroStatus === 'todos' || motorista.status === filtroStatus;
      
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
    const ativos = motoristas.filter(m => m.status === 'ativo');
    const totalEntregas = motoristas.reduce((acc, m) => acc + m.totalEntregas, 0);
    const totalNoTempo = motoristas.reduce((acc, m) => acc + m.entregasNoTempo, 0);
    const taxaSucesso = totalEntregas > 0 ? (totalNoTempo / totalEntregas) * 100 : 0;
    const avaliacaoMedia = motoristas.length > 0 
      ? motoristas.reduce((acc, m) => acc + m.avaliacaoMedia, 0) / motoristas.length 
      : 0;

    return {
      total: motoristas.length,
      ativos: ativos.length,
      ferias: motoristas.filter(m => m.status === 'ferias').length,
      inativos: motoristas.filter(m => m.status === 'inativo').length,
      totalEntregas,
      taxaSucesso,
      avaliacaoMedia
    };
  }, [motoristas]);

  const handleNovoMotorista = () => {
    setMotoristaSelecionado(null);
    setFormData({
      nome: '',
      email: '',
      telefone: '',
      nuit: '',
      endereco: '',
      dataNascimento: '',
      status: 'ativo',
      cartaConducao: {
        numero: '',
        categoria: [],
        dataEmissao: '',
        dataValidade: '',
        status: 'valida'
      }
    });
    setDialogAberto(true);
  };

  const handleEditarMotorista = (motorista: Motorista) => {
    setMotoristaSelecionado(motorista);
    setFormData(motorista);
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.nome || !formData.telefone || !formData.dataNascimento) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!formData.cartaConducao?.numero || !formData.cartaConducao?.dataValidade) {
      toast.error('Preencha os dados da carta de condução');
      return;
    }

    if (motoristaSelecionado) {
      setMotoristas(motoristas.map(m => 
        m.id === motoristaSelecionado.id 
          ? { ...m, ...formData, dataAtualizacao: new Date().toISOString() }
          : m
      ));
      toast.success('Motorista atualizado com sucesso!');
    } else {
      const novoMotorista: Motorista = {
        ...formData as Motorista,
        id: Date.now().toString(),
        tenantId: '1',
        avaliacaoMedia: 0,
        totalEntregas: 0,
        entregasNoTempo: 0,
        entregasAtrasadas: 0,
        entregasFalhadas: 0,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
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

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; icon: any }> = {
      ativo: { variant: 'default', label: 'Ativo', icon: CheckCircle },
      inativo: { variant: 'outline', label: 'Inativo', icon: AlertCircle },
      ferias: { variant: 'secondary', label: 'Férias', icon: Clock },
      licenca: { variant: 'secondary', label: 'Licença', icon: Clock }
    };
    return badges[status] || badges.ativo;
  };

  const getCartaStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      valida: { variant: 'default', label: 'Válida' },
      vencida: { variant: 'destructive', label: 'Vencida' },
      proxima_vencer: { variant: 'secondary', label: 'Próxima a Vencer' }
    };
    return badges[status] || badges.valida;
  };

  const calcularTaxaSucesso = (motorista: Motorista) => {
    if (motorista.totalEntregas === 0) return 0;
    return ((motorista.entregasNoTempo / motorista.totalEntregas) * 100).toFixed(1);
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
              <p className="text-sm text-muted-foreground">Ativos</p>
              <p className="text-3xl font-bold text-green-600">{estatisticas.ativos}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
              <p className="text-3xl font-bold text-blue-600">{estatisticas.taxaSucesso.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Avaliação Média</p>
              <p className="text-3xl font-bold text-yellow-600">{estatisticas.avaliacaoMedia.toFixed(1)}</p>
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
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="ferias">Férias</SelectItem>
                <SelectItem value="licenca">Licença</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
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
              const statusInfo = getStatusBadge(motorista.status);
              const cartaStatusInfo = getCartaStatusBadge(motorista.cartaConducao.status);
              const StatusIcon = statusInfo.icon;
              const taxaSucesso = calcularTaxaSucesso(motorista);
              
              return (
                <div key={motorista.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>
                      
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">{motorista.nome}</h3>
                          <div className="flex items-center gap-1">
                            <StatusIcon className="h-4 w-4" />
                            <Badge variant={statusInfo.variant as any}>
                              {statusInfo.label}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{motorista.telefone}</span>
                          </div>
                          {motorista.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              <span>{motorista.email}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>CNH: {motorista.cartaConducao.numero}</span>
                            <Badge variant={cartaStatusInfo.variant as any} className="text-xs">
                              {cartaStatusInfo.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Categorias:</span>
                            <span>{motorista.cartaConducao.categoria.join(', ')}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                              <Package className="h-4 w-4" />
                              <span>Entregas</span>
                            </div>
                            <p className="text-lg font-semibold">{motorista.totalEntregas}</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                              <TrendingUp className="h-4 w-4" />
                              <span>Taxa Sucesso</span>
                            </div>
                            <p className="text-lg font-semibold text-green-600">{taxaSucesso}%</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                              <Award className="h-4 w-4" />
                              <span>Avaliação</span>
                            </div>
                            <p className="text-lg font-semibold text-yellow-600">
                              {motorista.avaliacaoMedia.toFixed(1)} ⭐
                            </p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                              <AlertCircle className="h-4 w-4" />
                              <span>Falhadas</span>
                            </div>
                            <p className="text-lg font-semibold text-red-600">{motorista.entregasFalhadas}</p>
                          </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Nome completo do motorista"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="+258 84 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nuit">NUIT</Label>
                <Input
                  id="nuit"
                  value={formData.nuit || ''}
                  onChange={(e) => setFormData({ ...formData, nuit: e.target.value })}
                  placeholder="123456789"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataNascimento">Data de Nascimento *</Label>
                <Input
                  id="dataNascimento"
                  type="date"
                  value={formData.dataNascimento}
                  onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                value={formData.endereco || ''}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Endereço completo"
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold">Carta de Condução</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cnh">Número da CNH *</Label>
                  <Input
                    id="cnh"
                    value={formData.cartaConducao?.numero || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      cartaConducao: { ...formData.cartaConducao!, numero: e.target.value }
                    })}
                    placeholder="CNH-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categorias">Categorias</Label>
                  <Input
                    id="categorias"
                    value={formData.cartaConducao?.categoria?.join(', ') || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      cartaConducao: { 
                        ...formData.cartaConducao!, 
                        categoria: e.target.value.split(',').map(c => c.trim()).filter(c => c)
                      }
                    })}
                    placeholder="B, C, D (separadas por vírgula)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataEmissao">Data de Emissão</Label>
                  <Input
                    id="dataEmissao"
                    type="date"
                    value={formData.cartaConducao?.dataEmissao || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      cartaConducao: { ...formData.cartaConducao!, dataEmissao: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dataValidade">Data de Validade *</Label>
                  <Input
                    id="dataValidade"
                    type="date"
                    value={formData.cartaConducao?.dataValidade || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      cartaConducao: { ...formData.cartaConducao!, dataValidade: e.target.value }
                    })}
                  />
                </div>
              </div>
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
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="licenca">Licença</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
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
              {motoristaSelecionado ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
