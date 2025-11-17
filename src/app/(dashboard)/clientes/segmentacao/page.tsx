
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Edit,
  Plus,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { ClienteStorage, SegmentacaoClienteStorage } from '@/lib/storage/cliente-storage';
import { SegmentacaoCliente } from '@/types/cliente';
import { usePagination } from '@/hooks/usePagination';

interface FormData {
  clienteId: string;
  segmento: 'varejo' | 'grossista' | 'distribuidor' | 'corporativo' | 'governo';
  industria: string;
  tamanhoEmpresa: 'micro' | 'pequena' | 'media' | 'grande';
  potencialVendas: 'alto' | 'medio' | 'baixo';
  frequenciaCompra: 'diaria' | 'semanal' | 'mensal' | 'trimestral' | 'anual';
  ticketMedio: number;
}

export default function SegmentacaoClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [segmentacoes, setSegmentacoes] = useState<SegmentacaoCliente[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    clienteId: '',
    segmento: 'varejo',
    industria: '',
    tamanhoEmpresa: 'pequena',
    potencialVendas: 'medio',
    frequenciaCompra: 'mensal',
    ticketMedio: 0
  });

  useEffect(() => {
    const clientesData = ClienteStorage.getClientes();
    const segmentacoesData = SegmentacaoClienteStorage.getSegmentacoes();
    setClientes(clientesData);
    setSegmentacoes(segmentacoesData);
  }, []);

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } =
    usePagination({ data: segmentacoes, initialItemsPerPage: 10 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clienteId) {
      toast.error('Selecione um cliente');
      return;
    }

    if (editingId) {
      SegmentacaoClienteStorage.updateSegmentacao(editingId, formData);
      toast.success('Segmentação actualizada com sucesso!');
    } else {
      const novaSegmentacao: SegmentacaoCliente = {
        id: Date.now().toString(),
        ...formData,
        dataAtualizacao: new Date().toISOString()
      };
      const segmentacoesData = SegmentacaoClienteStorage.getSegmentacoes();
      segmentacoesData.push(novaSegmentacao);
      SegmentacaoClienteStorage.saveSegmentacoes(segmentacoesData);
      toast.success('Segmentação criada com sucesso!');
    }

    const segmentacoesData = SegmentacaoClienteStorage.getSegmentacoes();
    setSegmentacoes(segmentacoesData);
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData({
      clienteId: '',
      segmento: 'varejo',
      industria: '',
      tamanhoEmpresa: 'pequena',
      potencialVendas: 'medio',
      frequenciaCompra: 'mensal',
      ticketMedio: 0
    });
  };

  const handleEdit = (segmentacao: SegmentacaoCliente) => {
    setFormData({
      clienteId: segmentacao.clienteId,
      segmento: segmentacao.segmento,
      industria: segmentacao.industria || '',
      tamanhoEmpresa: segmentacao.tamanhoEmpresa || 'pequena',
      potencialVendas: segmentacao.potencialVendas,
      frequenciaCompra: segmentacao.frequenciaCompra,
      ticketMedio: segmentacao.ticketMedio
    });
    setEditingId(segmentacao.id);
    setIsDialogOpen(true);
  };

  const getClienteNome = (clienteId: string) => {
    return clientes.find(c => c.id === clienteId)?.nome || 'N/A';
  };

  const distribuicaoPorSegmento = segmentacoes.reduce((acc: any, s) => {
    const existing = acc.find((item: any) => item.segmento === s.segmento);
    if (existing) {
      existing.total++;
    } else {
      acc.push({ segmento: s.segmento, total: 1 });
    }
    return acc;
  }, []);

  const distribuicaoPorPotencial = segmentacoes.reduce((acc: any, s) => {
    const existing = acc.find((item: any) => item.potencial === s.potencialVendas);
    if (existing) {
      existing.total++;
    } else {
      acc.push({ potencial: s.potencialVendas, total: 1 });
    }
    return acc;
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Segmentação de Clientes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Análise e categorização de clientes por segmento
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingId(null);
              setFormData({
                clienteId: '',
                segmento: 'varejo',
                industria: '',
                tamanhoEmpresa: 'pequena',
                potencialVendas: 'medio',
                frequenciaCompra: 'mensal',
                ticketMedio: 0
              });
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Segmentação
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Segmentação' : 'Nova Segmentação'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clienteId">Cliente *</Label>
                <Select value={formData.clienteId} onValueChange={(value) => setFormData({ ...formData, clienteId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(cliente => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="segmento">Segmento *</Label>
                <Select value={formData.segmento} onValueChange={(value) => setFormData({ ...formData, segmento: value as FormData['segmento'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="varejo">Varejo</SelectItem>
                    <SelectItem value="grossista">Grossista</SelectItem>
                    <SelectItem value="distribuidor">Distribuidor</SelectItem>
                    <SelectItem value="corporativo">Corporativo</SelectItem>
                    <SelectItem value="governo">Governo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industria">Indústria</Label>
                <Select value={formData.industria} onValueChange={(value) => setFormData({ ...formData, industria: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar indústria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tecnologia">Tecnologia</SelectItem>
                    <SelectItem value="comercio">Comércio</SelectItem>
                    <SelectItem value="saude">Saúde</SelectItem>
                    <SelectItem value="educacao">Educação</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="manufactura">Manufactura</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tamanhoEmpresa">Tamanho da Empresa</Label>
                <Select value={formData.tamanhoEmpresa} onValueChange={(value) => setFormData({ ...formData, tamanhoEmpresa: value as FormData['tamanhoEmpresa'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="micro">Micro</SelectItem>
                    <SelectItem value="pequena">Pequena</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="grande">Grande</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="potencialVendas">Potencial de Vendas</Label>
                <Select value={formData.potencialVendas} onValueChange={(value) => setFormData({ ...formData, potencialVendas: value as FormData['potencialVendas'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alto">Alto</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="baixo">Baixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="frequenciaCompra">Frequência de Compra</Label>
                <Select value={formData.frequenciaCompra} onValueChange={(value) => setFormData({ ...formData, frequenciaCompra: value as FormData['frequenciaCompra'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingId ? 'Actualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Segmentado</p>
                <p className="text-3xl font-bold mt-2">{segmentacoes.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Alto Potencial</p>
                <p className="text-3xl font-bold mt-2">
                  {segmentacoes.filter(s => s.potencialVendas === 'alto').length}
                </p>
              </div>
              <Zap className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ticket Médio</p>
                <p className="text-2xl font-bold mt-2">
                  {segmentacoes.length > 0
                    ? `MT ${(segmentacoes.reduce((acc, s) => acc + s.ticketMedio, 0) / segmentacoes.length).toFixed(0)}`
                    : 'N/A'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Segmento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribuicaoPorSegmento.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm capitalize">{item.segmento}</span>
                <Badge variant="outline">{item.total}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Potencial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribuicaoPorPotencial.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm capitalize">{item.potencial}</span>
                <Badge variant={item.potencial === 'alto' ? 'default' : item.potencial === 'medio' ? 'secondary' : 'outline'}>
                  {item.total}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Segmentações ({segmentacoes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Indústria</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Potencial</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Ticket Médio</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((segmentacao) => (
                  <TableRow key={segmentacao.id}>
                    <TableCell className="font-medium">{getClienteNome(segmentacao.clienteId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {segmentacao.segmento}
                      </Badge>
                    </TableCell>
                    <TableCell>{segmentacao.industria || '-'}</TableCell>
                    <TableCell className="capitalize">{segmentacao.tamanhoEmpresa}</TableCell>
                    <TableCell>
                      <Badge variant={segmentacao.potencialVendas === 'alto' ? 'default' : segmentacao.potencialVendas === 'medio' ? 'secondary' : 'outline'}>
                        {segmentacao.potencialVendas.charAt(0).toUpperCase() + segmentacao.potencialVendas.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{segmentacao.frequenciaCompra}</TableCell>
                    <TableCell>MT {segmentacao.ticketMedio.toFixed(0)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(segmentacao)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {paginatedData.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma segmentação encontrada</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Itens por página:</span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
