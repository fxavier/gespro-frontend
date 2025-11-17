
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRightLeft,
  Search,
  Package,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  XCircle
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
import { toast } from 'sonner';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';

interface TransferenciaStock {
  id: string;
  produtoId: string;
  nomeProduto: string;
  quantidade: number;
  localOrigem: string;
  localDestino: string;
  status: 'pendente' | 'em_transito' | 'concluida' | 'cancelada';
  responsavel: string;
  dataTransferencia: string;
  observacoes?: string;
}

const locaisArmazenamento = [
  'Armazém Principal',
  'Armazém Secundário',
  'Loja Centro',
  'Loja Norte',
  'Loja Sul',
  'Depósito A',
  'Depósito B'
];

const produtosMock = [
  { id: '1', nome: 'Coca-Cola 500ml', stock: 100 },
  { id: '2', nome: 'Arroz Tipo 1 - 1kg', stock: 250 },
  { id: '3', nome: 'Óleo de Cozinha 900ml', stock: 40 }
];

export default function TransferenciasStockPage() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [formData, setFormData] = useState({
    produtoId: '',
    quantidade: '',
    localOrigem: '',
    localDestino: '',
    observacoes: '',
    responsavel: ''
  });

  const [transferencias, setTransferencias] = useState<TransferenciaStock[]>([
    {
      id: '1',
      produtoId: '1',
      nomeProduto: 'Coca-Cola 500ml',
      quantidade: 50,
      localOrigem: 'Armazém Principal',
      localDestino: 'Loja Centro',
      status: 'concluida',
      responsavel: 'João Silva',
      dataTransferencia: '2024-01-20',
      observacoes: 'Transferência para reposição de stock'
    },
    {
      id: '2',
      produtoId: '2',
      nomeProduto: 'Arroz Tipo 1 - 1kg',
      quantidade: 100,
      localOrigem: 'Armazém Principal',
      localDestino: 'Loja Norte',
      status: 'em_transito',
      responsavel: 'Maria Santos',
      dataTransferencia: '2024-01-22'
    }
  ]);

  const dadosFiltrados = useMemo(() => {
    return transferencias.filter(transferencia => {
      const matchBusca = busca === '' ||
        transferencia.nomeProduto.toLowerCase().includes(busca.toLowerCase()) ||
        transferencia.localOrigem.toLowerCase().includes(busca.toLowerCase()) ||
        transferencia.localDestino.toLowerCase().includes(busca.toLowerCase());
      
      const matchStatus = filtroStatus === 'todos' || transferencia.status === filtroStatus;
      
      return matchBusca && matchStatus;
    });
  }, [transferencias, busca, filtroStatus]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const handleNovaTransferencia = () => {
    setFormData({
      produtoId: '',
      quantidade: '',
      localOrigem: '',
      localDestino: '',
      observacoes: '',
      responsavel: ''
    });
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.produtoId || !formData.quantidade || !formData.localOrigem || !formData.localDestino || !formData.responsavel) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.localOrigem === formData.localDestino) {
      toast.error('Local de origem e destino não podem ser iguais');
      return;
    }

    const produto = produtosMock.find(p => p.id === formData.produtoId);
    if (!produto) return;

    const novaTransferencia: TransferenciaStock = {
      id: Date.now().toString(),
      produtoId: formData.produtoId,
      nomeProduto: produto.nome,
      quantidade: parseInt(formData.quantidade),
      localOrigem: formData.localOrigem,
      localDestino: formData.localDestino,
      status: 'pendente',
      responsavel: formData.responsavel,
      dataTransferencia: new Date().toISOString().split('T')[0],
      observacoes: formData.observacoes
    };

    setTransferencias([novaTransferencia, ...transferencias]);
    setDialogAberto(false);
    toast.success('Transferência registada com sucesso!');
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { variant: 'secondary' as const, label: 'Pendente', icon: Clock, className: '' },
      em_transito: { variant: 'default' as const, label: 'Em Trânsito', icon: ArrowRightLeft, className: '' },
      concluida: { variant: 'default' as const, label: 'Concluída', icon: CheckCircle, className: 'bg-green-600' },
      cancelada: { variant: 'destructive' as const, label: 'Cancelada', icon: XCircle, className: '' }
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Transferências de Stock</h1>
            <p className="text-muted-foreground">Gerir movimentações entre armazéns e lojas</p>
          </div>
        </div>
        <Button className="gap-2" onClick={handleNovaTransferencia}>
          <ArrowRightLeft className="h-4 w-4" />
          Nova Transferência
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{transferencias.length}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-orange-600">
                  {transferencias.filter(t => t.status === 'pendente').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Trânsito</p>
                <p className="text-2xl font-bold text-blue-600">
                  {transferencias.filter(t => t.status === 'em_transito').length}
                </p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Concluídas</p>
                <p className="text-2xl font-bold text-green-600">
                  {transferencias.filter(t => t.status === 'concluida').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por produto ou local..."
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
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="em_transito">Em Trânsito</SelectItem>
                <SelectItem value="concluida">Concluídas</SelectItem>
                <SelectItem value="cancelada">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Transferências ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Data</th>
                  <th className="text-left p-4 font-medium">Produto</th>
                  <th className="text-left p-4 font-medium">Quantidade</th>
                  <th className="text-left p-4 font-medium">Origem → Destino</th>
                  <th className="text-left p-4 font-medium">Responsável</th>
                  <th className="text-left p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((transferencia) => (
                  <tr key={transferencia.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {new Date(transferencia.dataTransferencia).toLocaleDateString('pt-PT')}
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{transferencia.nomeProduto}</div>
                        {transferencia.observacoes && (
                          <div className="text-sm text-muted-foreground">{transferencia.observacoes}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="secondary">{transferencia.quantidade} UN</Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{transferencia.localOrigem}</span>
                        </div>
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{transferencia.localDestino}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">{transferencia.responsavel}</td>
                    <td className="p-4">
                      {getStatusBadge(transferencia.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma transferência encontrada</p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Transferência de Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="produto">Produto *</Label>
              <Select value={formData.produtoId} onValueChange={(value) => setFormData({ ...formData, produtoId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar produto" />
                </SelectTrigger>
                <SelectContent>
                  {produtosMock.map(produto => (
                    <SelectItem key={produto.id} value={produto.id}>
                      {produto.nome} (Stock: {produto.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                type="number"
                min="1"
                placeholder="0"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="localOrigem">Local de Origem *</Label>
              <Select value={formData.localOrigem} onValueChange={(value) => setFormData({ ...formData, localOrigem: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar local de origem" />
                </SelectTrigger>
                <SelectContent>
                  {locaisArmazenamento.map(local => (
                    <SelectItem key={local} value={local}>
                      {local}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="localDestino">Local de Destino *</Label>
              <Select value={formData.localDestino} onValueChange={(value) => setFormData({ ...formData, localDestino: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar local de destino" />
                </SelectTrigger>
                <SelectContent>
                  {locaisArmazenamento.map(local => (
                    <SelectItem key={local} value={local}>
                      {local}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável *</Label>
              <Input
                id="responsavel"
                placeholder="Nome do responsável"
                value={formData.responsavel}
                onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Detalhes adicionais sobre a transferência..."
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar}>Registar Transferência</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
