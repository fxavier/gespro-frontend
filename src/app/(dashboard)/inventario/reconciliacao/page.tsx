
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle,
  Package,
  TrendingUp,
  TrendingDown,
  FileText
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

interface ReconciliacaoItem {
  id: string;
  produtoId: string;
  nomeProduto: string;
  stockSistema: number;
  stockFisico: number;
  diferenca: number;
  status: 'pendente' | 'ajustado' | 'verificado';
  observacoes?: string;
  responsavel?: string;
  dataReconciliacao: string;
}

const produtosMock = [
  { id: '1', nome: 'Coca-Cola 500ml', stockSistema: 100, categoria: 'Bebidas' },
  { id: '2', nome: 'Arroz Tipo 1 - 1kg', stockSistema: 250, categoria: 'Grãos' },
  { id: '3', nome: 'Óleo de Cozinha 900ml', stockSistema: 40, categoria: 'Mercearia' },
  { id: '4', nome: 'Leite UHT 1L', stockSistema: 75, categoria: 'Laticínios' },
  { id: '5', nome: 'Sabão em Pó 1kg', stockSistema: 30, categoria: 'Limpeza' }
];

export default function ReconciliacaoInventarioPage() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null);
  const [stockFisico, setStockFisico] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [responsavel, setResponsavel] = useState('');

  const [reconciliacoes, setReconciliacoes] = useState<ReconciliacaoItem[]>([
    {
      id: '1',
      produtoId: '1',
      nomeProduto: 'Coca-Cola 500ml',
      stockSistema: 100,
      stockFisico: 98,
      diferenca: -2,
      status: 'ajustado',
      observacoes: '2 unidades danificadas',
      responsavel: 'João Silva',
      dataReconciliacao: '2024-01-20'
    }
  ]);

  const dadosFiltrados = useMemo(() => {
    return reconciliacoes.filter(item => {
      const matchBusca = busca === '' ||
        item.nomeProduto.toLowerCase().includes(busca.toLowerCase());
      
      const matchStatus = filtroStatus === 'todos' || item.status === filtroStatus;
      
      return matchBusca && matchStatus;
    });
  }, [reconciliacoes, busca, filtroStatus]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const handleIniciarReconciliacao = (produto: any) => {
    setProdutoSelecionado(produto);
    setStockFisico('');
    setObservacoes('');
    setResponsavel('');
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!stockFisico || !responsavel) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const stockFisicoNum = parseInt(stockFisico);
    const diferenca = stockFisicoNum - produtoSelecionado.stockSistema;

    const novaReconciliacao: ReconciliacaoItem = {
      id: Date.now().toString(),
      produtoId: produtoSelecionado.id,
      nomeProduto: produtoSelecionado.nome,
      stockSistema: produtoSelecionado.stockSistema,
      stockFisico: stockFisicoNum,
      diferenca: diferenca,
      status: 'pendente',
      observacoes: observacoes,
      responsavel: responsavel,
      dataReconciliacao: new Date().toISOString().split('T')[0]
    };

    setReconciliacoes([novaReconciliacao, ...reconciliacoes]);
    setDialogAberto(false);
    toast.success('Reconciliação registada com sucesso!');
  };

  const calcularEstatisticas = () => {
    const total = reconciliacoes.length;
    const comDiferenca = reconciliacoes.filter(r => r.diferenca !== 0).length;
    const ajustados = reconciliacoes.filter(r => r.status === 'ajustado').length;
    const pendentes = reconciliacoes.filter(r => r.status === 'pendente').length;

    return { total, comDiferenca, ajustados, pendentes };
  };

  const stats = calcularEstatisticas();

  const getDiferencaBadge = (diferenca: number) => {
    if (diferenca === 0) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Correto
        </Badge>
      );
    } else if (diferenca > 0) {
      return (
        <Badge variant="default" className="bg-blue-600">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{diferenca}
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive">
          <TrendingDown className="h-3 w-3 mr-1" />
          {diferenca}
        </Badge>
      );
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { variant: 'secondary' as const, label: 'Pendente', className: '' },
      ajustado: { variant: 'default' as const, label: 'Ajustado', className: 'bg-green-600' },
      verificado: { variant: 'default' as const, label: 'Verificado', className: 'bg-blue-600' }
    };

    const config = statusConfig[status as keyof typeof statusConfig];

    return (
      <Badge variant={config.variant} className={config.className || undefined}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Reconciliação de Inventário</h1>
            <p className="text-muted-foreground">Comparar stock físico com o sistema</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reconciliações</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Com Diferenças</p>
                <p className="text-2xl font-bold text-orange-600">{stats.comDiferenca}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ajustados</p>
                <p className="text-2xl font-bold text-green-600">{stats.ajustados}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-blue-600">{stats.pendentes}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Produtos para Reconciliar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {produtosMock.map(produto => (
                <div key={produto.id} className="flex items-center justify-between p-3 border rounded hover:bg-muted/50">
                  <div>
                    <div className="font-medium">{produto.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      Stock Sistema: {produto.stockSistema} UN
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleIniciarReconciliacao(produto)}>
                    Reconciliar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Reconciliações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar..."
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
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendentes</SelectItem>
                    <SelectItem value="ajustado">Ajustados</SelectItem>
                    <SelectItem value="verificado">Verificados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {paginatedData.map(item => (
                  <div key={item.id} className="p-3 border rounded">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium">{item.nomeProduto}</div>
                      {getStatusBadge(item.status)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Sistema:</span>
                        <div className="font-medium">{item.stockSistema}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Físico:</span>
                        <div className="font-medium">{item.stockFisico}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Diferença:</span>
                        <div>{getDiferencaBadge(item.diferenca)}</div>
                      </div>
                    </div>
                    {item.observacoes && (
                      <div className="text-sm text-muted-foreground mt-2">
                        {item.observacoes}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      {item.responsavel} • {new Date(item.dataReconciliacao).toLocaleDateString('pt-PT')}
                    </div>
                  </div>
                ))}
              </div>

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
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconciliar Stock</DialogTitle>
          </DialogHeader>
          {produtoSelecionado && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="font-medium mb-2">{produtoSelecionado.nome}</div>
                <div className="text-sm text-muted-foreground">
                  Stock no Sistema: <span className="font-medium">{produtoSelecionado.stockSistema} UN</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stockFisico">Stock Físico Contado *</Label>
                <Input
                  id="stockFisico"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={stockFisico}
                  onChange={(e) => setStockFisico(e.target.value)}
                />
              </div>

              {stockFisico && (
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Diferença:</span>
                    {getDiferencaBadge(parseInt(stockFisico) - produtoSelecionado.stockSistema)}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="responsavel">Responsável *</Label>
                <Input
                  id="responsavel"
                  placeholder="Nome do responsável pela contagem"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Motivo da diferença ou observações..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar}>Registar Reconciliação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
