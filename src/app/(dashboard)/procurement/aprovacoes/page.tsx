
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  UserCheck, 
  Search, 
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';

export default function AprovacoesPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [statusFiltro, setStatusFiltro] = useState('pendente');
  const [observacoes, setObservacoes] = useState('');
  const [itemSelecionado, setItemSelecionado] = useState<any>(null);

  const aprovacoes = [
    {
      id: 'APR-001',
      tipo: 'requisicao_compra',
      documentoId: 'REQ-2024-001',
      documentoNumero: 'REQ-2024-001',
      solicitante: 'João Silva',
      departamento: 'TI',
      data: '2024-01-15',
      valor: 45000.00,
      nivelAtual: 2,
      totalNiveis: 3,
      status: 'pendente',
      prioridade: 'alta',
      justificativa: 'Aquisição de equipamentos de TI para novo projeto'
    },
    {
      id: 'APR-002',
      tipo: 'pedido_compra',
      documentoId: 'PC-2024-005',
      documentoNumero: 'PC-2024-005',
      solicitante: 'Maria Santos',
      departamento: 'Compras',
      data: '2024-01-14',
      valor: 28000.00,
      nivelAtual: 1,
      totalNiveis: 2,
      status: 'pendente',
      prioridade: 'media',
      justificativa: 'Reposição de estoque de eletrodomésticos'
    },
    {
      id: 'APR-003',
      tipo: 'requisicao_compra',
      documentoId: 'REQ-2024-003',
      documentoNumero: 'REQ-2024-003',
      solicitante: 'Pedro Costa',
      departamento: 'Manutenção',
      data: '2024-01-13',
      valor: 8900.00,
      nivelAtual: 1,
      totalNiveis: 2,
      status: 'pendente',
      prioridade: 'urgente',
      justificativa: 'Materiais urgentes para manutenção preventiva'
    }
  ];

  const aprovacoesHistorico = [
    {
      id: 'APR-004',
      tipo: 'requisicao_compra',
      documentoId: 'REQ-2024-002',
      documentoNumero: 'REQ-2024-002',
      solicitante: 'Ana Oliveira',
      departamento: 'Administrativo',
      data: '2024-01-12',
      valor: 12500.00,
      nivelAtual: 3,
      totalNiveis: 3,
      status: 'aprovado',
      prioridade: 'media',
      dataAprovacao: '2024-01-13',
      observacoes: 'Aprovado conforme orçamento disponível'
    },
    {
      id: 'APR-005',
      tipo: 'pedido_compra',
      documentoId: 'PC-2024-001',
      documentoNumero: 'PC-2024-001',
      solicitante: 'Carlos Mendes',
      departamento: 'Produção',
      data: '2024-01-11',
      valor: 3200.00,
      nivelAtual: 1,
      totalNiveis: 2,
      status: 'rejeitado',
      prioridade: 'baixa',
      dataAprovacao: '2024-01-12',
      observacoes: 'Valor acima do orçamento aprovado para o departamento'
    }
  ];

  const todasAprovacoes = [...aprovacoes, ...aprovacoesHistorico];

  const aprovacoesFiltradas = todasAprovacoes.filter(apr => {
    const correspondeNome = apr.documentoNumero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           apr.solicitante.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           apr.departamento.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeTipo = tipoFiltro === 'todos' || apr.tipo === tipoFiltro;
    const correspondeStatus = statusFiltro === 'todos' || apr.status === statusFiltro;
    
    return correspondeNome && correspondeTipo && correspondeStatus;
  });

  const handleAprovar = (item: any) => {
    toast.success(`${item.documentoNumero} aprovado com sucesso!`);
    setItemSelecionado(null);
    setObservacoes('');
  };

  const handleRejeitar = (item: any) => {
    if (!observacoes.trim()) {
      toast.error('Por favor, informe o motivo da rejeição');
      return;
    }
    toast.error(`${item.documentoNumero} rejeitado`);
    setItemSelecionado(null);
    setObservacoes('');
  };

  const obterCorStatus = (status: string) => {
    const cores = {
      'pendente': 'default',
      'aprovado': 'default',
      'rejeitado': 'destructive'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'pendente': Clock,
      'aprovado': CheckCircle,
      'rejeitado': XCircle
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const obterCorPrioridade = (prioridade: string) => {
    const cores = {
      'baixa': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'media': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'alta': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'urgente': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return cores[prioridade as keyof typeof cores] || 'bg-gray-100 text-gray-800';
  };

  const obterIconeTipo = (tipo: string) => {
    return tipo === 'requisicao_compra' ? ClipboardList : FileText;
  };

  const estatisticas = {
    pendentes: aprovacoes.filter(a => a.status === 'pendente').length,
    aprovadas: aprovacoesHistorico.filter(a => a.status === 'aprovado').length,
    rejeitadas: aprovacoesHistorico.filter(a => a.status === 'rejeitado').length,
    valorPendente: aprovacoes.reduce((total, a) => total + a.valor, 0)
  };

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Aprovações de Compras
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gerencie as aprovações de requisições e pedidos de compra
          </p>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendentes</p>
                <p className="text-2xl font-bold">{estatisticas.pendentes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprovadas</p>
                <p className="text-2xl font-bold">{estatisticas.aprovadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Rejeitadas</p>
                <p className="text-2xl font-bold">{estatisticas.rejeitadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Valor Pendente</p>
                <p className="text-2xl font-bold">MT {estatisticas.valorPendente.toLocaleString('pt-MZ')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Pesquisa</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por número, solicitante ou departamento..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="requisicao_compra">Requisição de Compra</SelectItem>
                <SelectItem value="pedido_compra">Pedido de Compra</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Aprovações ({aprovacoesFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aprovacoesFiltradas.map((apr) => {
                  const IconeTipo = obterIconeTipo(apr.tipo);
                  return (
                    <TableRow key={apr.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <IconeTipo className="h-4 w-4" />
                          <span className="text-sm">
                            {apr.tipo === 'requisicao_compra' ? 'Requisição' : 'Pedido'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{apr.documentoNumero}</TableCell>
                      <TableCell>{new Date(apr.data).toLocaleDateString('pt-MZ')}</TableCell>
                      <TableCell>{apr.solicitante}</TableCell>
                      <TableCell>{apr.departamento}</TableCell>
                      <TableCell className="font-medium">
                        MT {apr.valor.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={obterCorPrioridade(apr.prioridade)}>
                          {apr.prioridade.charAt(0).toUpperCase() + apr.prioridade.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {apr.nivelAtual}/{apr.totalNiveis}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={obterCorStatus(apr.status) as any} className="flex items-center w-fit">
                          {obterIconeStatus(apr.status)}
                          {apr.status.charAt(0).toUpperCase() + apr.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/procurement/${apr.tipo === 'requisicao_compra' ? 'requisicoes' : 'pedidos'}/${apr.documentoId}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {apr.status === 'pendente' && (
                            <>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-green-600" onClick={() => setItemSelecionado(apr)}>
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Aprovar {apr.documentoNumero}</DialogTitle>
                                    <DialogDescription>
                                      Confirme a aprovação deste documento. Você pode adicionar observações opcionais.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">Observações (opcional)</label>
                                      <Textarea
                                        placeholder="Adicione observações sobre esta aprovação..."
                                        value={observacoes}
                                        onChange={(e) => setObservacoes(e.target.value)}
                                        rows={3}
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => {
                                      setItemSelecionado(null);
                                      setObservacoes('');
                                    }}>
                                      Cancelar
                                    </Button>
                                    <Button onClick={() => handleAprovar(apr)} className="bg-green-600 hover:bg-green-700">
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Aprovar
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setItemSelecionado(apr)}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Rejeitar {apr.documentoNumero}</DialogTitle>
                                    <DialogDescription>
                                      Informe o motivo da rejeição deste documento.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">Motivo da Rejeição *</label>
                                      <Textarea
                                        placeholder="Descreva o motivo da rejeição..."
                                        value={observacoes}
                                        onChange={(e) => setObservacoes(e.target.value)}
                                        rows={3}
                                        required
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => {
                                      setItemSelecionado(null);
                                      setObservacoes('');
                                    }}>
                                      Cancelar
                                    </Button>
                                    <Button onClick={() => handleRejeitar(apr)} variant="destructive">
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Rejeitar
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {aprovacoesFiltradas.length === 0 && (
            <div className="text-center py-8">
              <UserCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma aprovação encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros de pesquisa
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
