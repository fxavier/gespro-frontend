
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  RotateCcw, 
  Search, 
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  Package,
  User,
  FileText,
  Calendar,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

interface ItemDevolucao {
  id: string;
  produtoId: string;
  nomeProduto: string;
  quantidadeOriginal: number;
  quantidadeDevolver: number;
  precoUnitario: number;
  subtotal: number;
  motivo: string;
}

export default function NovaDevolucaoPage() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<'buscar' | 'selecionar' | 'confirmar'>('buscar');
  const [numeroVenda, setNumeroVenda] = useState('');
  const [vendaSelecionada, setVendaSelecionada] = useState<any>(null);
  const [itensDevolucao, setItensDevolucao] = useState<ItemDevolucao[]>([]);
  const [motivoGeral, setMotivoGeral] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [processando, setProcessando] = useState(false);

  // Mock de vendas para busca
  const vendasDisponiveis = [
    {
      id: 'V001',
      numero: 'V2024/001',
      cliente: 'João Silva',
      clienteId: 'C001',
      dataVenda: '2024-01-15',
      total: 2866.50,
      status: 'finalizada',
      itens: [
        { 
          id: 'I001', 
          produtoId: 'P001', 
          nomeProduto: 'Smartphone Samsung A54', 
          quantidade: 1, 
          precoUnitario: 2450.00, 
          subtotal: 2450.00 
        },
        { 
          id: 'I002', 
          produtoId: 'P002', 
          nomeProduto: 'Fone de Ouvido Bluetooth', 
          quantidade: 2, 
          precoUnitario: 208.25, 
          subtotal: 416.50 
        }
      ]
    },
    {
      id: 'V002',
      numero: 'V2024/002',
      cliente: 'Maria Santos',
      clienteId: 'C003',
      dataVenda: '2024-01-14',
      total: 2101.36,
      status: 'finalizada',
      itens: [
        { 
          id: 'I003', 
          produtoId: 'P003', 
          nomeProduto: 'Arroz 25kg', 
          quantidade: 2, 
          precoUnitario: 945.68, 
          subtotal: 1891.36 
        },
        { 
          id: 'I004', 
          produtoId: 'P004', 
          nomeProduto: 'Óleo de Cozinha 1L', 
          quantidade: 1, 
          precoUnitario: 210.00, 
          subtotal: 210.00 
        }
      ]
    }
  ];

  const motivosOptions = [
    { value: 'defeito', label: 'Produto com Defeito' },
    { value: 'arrependimento', label: 'Arrependimento do Cliente' },
    { value: 'produto_errado', label: 'Produto Errado' },
    { value: 'vencimento', label: 'Produto Vencido' },
    { value: 'danificado', label: 'Produto Danificado' },
    { value: 'outros', label: 'Outros Motivos' }
  ];

  const buscarVenda = () => {
    if (!numeroVenda.trim()) {
      toast.error('Digite o número da venda');
      return;
    }

    const venda = vendasDisponiveis.find(
      v => v.numero.toLowerCase() === numeroVenda.toLowerCase()
    );

    if (!venda) {
      toast.error('Venda não encontrada');
      return;
    }

    if (venda.status !== 'finalizada') {
      toast.error('Apenas vendas finalizadas podem ter devoluções');
      return;
    }

    setVendaSelecionada(venda);
    setItensDevolucao(
      venda.itens.map(item => ({
        id: item.id,
        produtoId: item.produtoId,
        nomeProduto: item.nomeProduto,
        quantidadeOriginal: item.quantidade,
        quantidadeDevolver: 0,
        precoUnitario: item.precoUnitario,
        subtotal: 0,
        motivo: ''
      }))
    );
    setEtapa('selecionar');
    toast.success('Venda encontrada!');
  };

  const atualizarQuantidadeItem = (itemId: string, quantidade: number) => {
    setItensDevolucao(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const qtd = Math.max(0, Math.min(quantidade, item.quantidadeOriginal));
          return {
            ...item,
            quantidadeDevolver: qtd,
            subtotal: qtd * item.precoUnitario
          };
        }
        return item;
      })
    );
  };

  const atualizarMotivoItem = (itemId: string, motivo: string) => {
    setItensDevolucao(prev =>
      prev.map(item => item.id === itemId ? { ...item, motivo } : item)
    );
  };

  const removerItem = (itemId: string) => {
    setItensDevolucao(prev =>
      prev.map(item => 
        item.id === itemId 
          ? { ...item, quantidadeDevolver: 0, subtotal: 0 } 
          : item
      )
    );
  };

  const validarSelecao = () => {
    const itensParaDevolver = itensDevolucao.filter(item => item.quantidadeDevolver > 0);

    if (itensParaDevolver.length === 0) {
      toast.error('Selecione pelo menos um item para devolução');
      return false;
    }

    const itensSemMotivo = itensParaDevolver.filter(item => !item.motivo);
    if (itensSemMotivo.length > 0) {
      toast.error('Informe o motivo para todos os itens selecionados');
      return false;
    }

    return true;
  };

  const avancarParaConfirmacao = () => {
    if (validarSelecao()) {
      setEtapa('confirmar');
    }
  };

  const processarDevolucao = async () => {
    setProcessando(true);

    try {
      // Simular processamento
      await new Promise(resolve => setTimeout(resolve, 1500));

      const itensParaDevolver = itensDevolucao.filter(item => item.quantidadeDevolver > 0);
      const totalDevolucao = itensParaDevolver.reduce((total, item) => total + item.subtotal, 0);

      // Aqui você faria a chamada real para a API
      // await api.post('/devolucoes', { ... });

      toast.success(`Devolução registrada com sucesso! Valor: MT ${totalDevolucao.toFixed(2)}`);
      router.push('/vendas/devolucoes');
    } catch (error) {
      toast.error('Erro ao processar devolução');
    } finally {
      setProcessando(false);
    }
  };

  const calcularTotalDevolucao = () => {
    return itensDevolucao
      .filter(item => item.quantidadeDevolver > 0)
      .reduce((total, item) => total + item.subtotal, 0);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/vendas/devolucoes">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Nova Devolução
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Registrar devolução de produtos
              </p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Etapa {etapa === 'buscar' ? '1' : etapa === 'selecionar' ? '2' : '3'} de 3
        </Badge>
      </div>

      {/* Etapa 1: Buscar Venda */}
      {etapa === 'buscar' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>Buscar Venda Original</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="numeroVenda">Número da Venda</Label>
              <div className="flex gap-2">
                <Input
                  id="numeroVenda"
                  placeholder="Ex: V2024/001"
                  value={numeroVenda}
                  onChange={(e) => setNumeroVenda(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && buscarVenda()}
                  className="flex-1"
                />
                <Button onClick={buscarVenda}>
                  <Search className="h-4 w-4 mr-2" />
                  Buscar
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Informações importantes:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Apenas vendas finalizadas podem ter devoluções</li>
                    <li>Verifique o prazo de devolução conforme política da empresa</li>
                    <li>Produtos devem estar em condições adequadas para devolução</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Vendas Recentes:</h3>
              <div className="space-y-2">
                {vendasDisponiveis.slice(0, 3).map((venda) => (
                  <div
                    key={venda.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => {
                      setNumeroVenda(venda.numero);
                      buscarVenda();
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">{venda.numero}</p>
                        <p className="text-sm text-gray-500">{venda.cliente}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">MT {venda.total.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">{new Date(venda.dataVenda).toLocaleDateString('pt-PT')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 2: Selecionar Itens */}
      {etapa === 'selecionar' && vendaSelecionada && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Informações da Venda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Número</p>
                    <p className="font-medium">{vendaSelecionada.numero}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Cliente</p>
                    <p className="font-medium">{vendaSelecionada.cliente}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Data da Venda</p>
                    <p className="font-medium">{new Date(vendaSelecionada.dataVenda).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Total da Venda</p>
                    <p className="font-medium">MT {vendaSelecionada.total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="h-5 w-5" />
                <span>Selecionar Itens para Devolução</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Qtd. Original</TableHead>
                      <TableHead>Qtd. Devolver</TableHead>
                      <TableHead>Preço Unit.</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensDevolucao.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Package className="h-4 w-4" />
                            <span className="font-medium">{item.nomeProduto}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.quantidadeOriginal}</Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.quantidadeOriginal}
                            value={item.quantidadeDevolver}
                            onChange={(e) => atualizarQuantidadeItem(item.id, parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>MT {item.precoUnitario.toFixed(2)}</TableCell>
                        <TableCell>
                          <Select
                            value={item.motivo}
                            onValueChange={(value) => atualizarMotivoItem(item.id, value)}
                            disabled={item.quantidadeDevolver === 0}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Selecione o motivo" />
                            </SelectTrigger>
                            <SelectContent>
                              {motivosOptions.map((motivo) => (
                                <SelectItem key={motivo.value} value={motivo.value}>
                                  {motivo.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            MT {item.subtotal.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removerItem(item.id)}
                            disabled={item.quantidadeDevolver === 0}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div>
                  <p className="text-sm text-gray-500">Total da Devolução</p>
                  <p className="text-2xl font-bold text-red-600">
                    MT {calcularTotalDevolucao().toFixed(2)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEtapa('buscar')}>
                    Voltar
                  </Button>
                  <Button onClick={avancarParaConfirmacao}>
                    Continuar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Etapa 3: Confirmar */}
      {etapa === 'confirmar' && vendaSelecionada && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumo da Devolução</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Informações da Venda</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Número:</span>
                      <span className="font-medium">{vendaSelecionada.numero}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cliente:</span>
                      <span className="font-medium">{vendaSelecionada.cliente}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Data:</span>
                      <span className="font-medium">{new Date(vendaSelecionada.dataVenda).toLocaleDateString('pt-PT')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Itens a Devolver</h3>
                  <div className="space-y-2">
                    {itensDevolucao
                      .filter(item => item.quantidadeDevolver > 0)
                      .map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span>{item.nomeProduto} (x{item.quantidadeDevolver})</span>
                          <span className="font-medium">MT {item.subtotal.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="motivoGeral">Motivo Geral (Opcional)</Label>
                  <Select value={motivoGeral} onValueChange={setMotivoGeral}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um motivo geral" />
                    </SelectTrigger>
                    <SelectContent>
                      {motivosOptions.map((motivo) => (
                        <SelectItem key={motivo.value} value={motivo.value}>
                          {motivo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 mt-4">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    placeholder="Adicione observações sobre a devolução..."
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-medium">Total a Devolver:</span>
                  <span className="text-2xl font-bold text-red-600">
                    MT {calcularTotalDevolucao().toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  O valor será creditado ao cliente conforme política de devolução
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEtapa('selecionar')}>
                  Voltar
                </Button>
                <Button 
                  onClick={processarDevolucao}
                  disabled={processando}
                >
                  {processando ? (
                    <>Processando...</>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Confirmar Devolução
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
