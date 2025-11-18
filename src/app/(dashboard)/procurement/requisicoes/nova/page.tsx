
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  ArrowLeft,
  Package,
  Calendar,
  User,
  Building2,
  AlertCircle
} from 'lucide-react';
import type { RequisicaoCompra, ItemRequisicao } from '@/types/procurement';
import { loadRequisicoes, saveRequisicoes } from '@/lib/storage/requisicao-storage';

export default function NovaRequisicaoPage() {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);

  const [formData, setFormData] = useState({
    solicitanteNome: 'João Silva',
    departamento: '',
    prioridade: 'media' as 'baixa' | 'media' | 'alta' | 'urgente',
    justificativa: '',
    observacoes: '',
    dataEntregaDesejada: '',
    centroCustoId: ''
  });

  const [itens, setItens] = useState<ItemRequisicao[]>([
    {
      id: '1',
      descricao: '',
      quantidade: 1,
      unidadeMedida: 'UN',
      precoEstimado: 0,
      subtotal: 0,
      observacoes: ''
    }
  ]);

  const departamentos = [
    'TI',
    'Compras',
    'Administrativo',
    'Financeiro',
    'Produção',
    'Manutenção',
    'Recursos Humanos',
    'Comercial'
  ];

  const unidadesMedida = ['UN', 'KG', 'L', 'M', 'CX', 'PC', 'PAR'];

  const centrosCusto = [
    { id: 'CC001', nome: 'Administrativo' },
    { id: 'CC002', nome: 'Operacional' },
    { id: 'CC003', nome: 'Comercial' },
    { id: 'CC004', nome: 'TI' }
  ];

  const adicionarItem = () => {
    const novoItem: ItemRequisicao = {
      id: Date.now().toString(),
      descricao: '',
      quantidade: 1,
      unidadeMedida: 'UN',
      precoEstimado: 0,
      subtotal: 0,
      observacoes: ''
    };
    setItens([...itens, novoItem]);
  };

  const removerItem = (id: string) => {
    if (itens.length === 1) {
      toast.error('Deve haver pelo menos um item na requisição');
      return;
    }
    setItens(itens.filter(item => item.id !== id));
  };

  const atualizarItem = (id: string, campo: keyof ItemRequisicao, valor: any) => {
    setItens(itens.map(item => {
      if (item.id === id) {
        const itemAtualizado = { ...item, [campo]: valor };
        
        if (campo === 'quantidade' || campo === 'precoEstimado') {
          itemAtualizado.subtotal = itemAtualizado.quantidade * itemAtualizado.precoEstimado;
        }
        
        return itemAtualizado;
      }
      return item;
    }));
  };

  const calcularValorTotal = () => {
    return itens.reduce((total, item) => total + item.subtotal, 0);
  };

  const validarFormulario = () => {
    if (!formData.departamento) {
      toast.error('Selecione o departamento');
      return false;
    }

    if (!formData.justificativa.trim()) {
      toast.error('Informe a justificativa da requisição');
      return false;
    }

    const itensValidos = itens.filter(item => 
      item.descricao.trim() && 
      item.quantidade > 0 && 
      item.precoEstimado >= 0
    );

    if (itensValidos.length === 0) {
      toast.error('Adicione pelo menos um item válido');
      return false;
    }

    return true;
  };

  const salvarRequisicao = (status: 'rascunho' | 'pendente') => {
    if (!validarFormulario()) return;

    setSalvando(true);

    try {
      const requisicoes = loadRequisicoes();
      
      const novaRequisicao: RequisicaoCompra = {
        id: `REQ-${Date.now()}`,
        tenantId: 'tenant-001',
        numero: `REQ-2024-${String(requisicoes.length + 1).padStart(3, '0')}`,
        data: new Date().toISOString(),
        solicitanteId: 'user-001',
        solicitanteNome: formData.solicitanteNome,
        departamento: formData.departamento,
        prioridade: formData.prioridade,
        status: status,
        itens: itens.filter(item => item.descricao.trim()),
        justificativa: formData.justificativa,
        observacoes: formData.observacoes,
        valorTotal: calcularValorTotal(),
        dataEntregaDesejada: formData.dataEntregaDesejada,
        centroCustoId: formData.centroCustoId,
        aprovacoes: [],
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
      };

      requisicoes.push(novaRequisicao);
      saveRequisicoes(requisicoes);

      toast.success(
        status === 'rascunho' 
          ? 'Requisição salva como rascunho' 
          : 'Requisição enviada para aprovação'
      );

      setTimeout(() => {
        router.push('/procurement/requisicoes');
      }, 1000);

    } catch (error) {
      toast.error('Erro ao salvar requisição');
      console.error(error);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold">Nova Requisição de Compra</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1 ml-10">
            Preencha os dados da requisição de compra
          </p>
        </div>
      </div>

      {/* Informações Gerais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Informações Gerais</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="solicitante">Solicitante</Label>
              <Input
                id="solicitante"
                value={formData.solicitanteNome}
                disabled
                className="bg-gray-50 dark:bg-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="departamento">Departamento *</Label>
              <Select 
                value={formData.departamento} 
                onValueChange={(value) => setFormData({...formData, departamento: value})}
              >
                <SelectTrigger id="departamento">
                  <SelectValue placeholder="Selecione o departamento" />
                </SelectTrigger>
                <SelectContent>
                  {departamentos.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select 
                value={formData.prioridade} 
                onValueChange={(value: any) => setFormData({...formData, prioridade: value})}
              >
                <SelectTrigger id="prioridade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataEntrega">Data de Entrega Desejada</Label>
              <Input
                id="dataEntrega"
                type="date"
                value={formData.dataEntregaDesejada}
                onChange={(e) => setFormData({...formData, dataEntregaDesejada: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="centroCusto">Centro de Custo</Label>
              <Select 
                value={formData.centroCustoId} 
                onValueChange={(value) => setFormData({...formData, centroCustoId: value})}
              >
                <SelectTrigger id="centroCusto">
                  <SelectValue placeholder="Selecione o centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  {centrosCusto.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justificativa">Justificativa *</Label>
            <Textarea
              id="justificativa"
              placeholder="Descreva a justificativa para esta requisição..."
              value={formData.justificativa}
              onChange={(e) => setFormData({...formData, justificativa: e.target.value})}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              placeholder="Observações adicionais (opcional)..."
              value={formData.observacoes}
              onChange={(e) => setFormData({...formData, observacoes: e.target.value})}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Itens da Requisição */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Package className="h-5 w-5" />
              <span>Itens da Requisição</span>
            </CardTitle>
            <Button onClick={adicionarItem} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Descrição *</TableHead>
                  <TableHead className="w-[100px]">Qtd *</TableHead>
                  <TableHead className="w-[100px]">Unidade</TableHead>
                  <TableHead className="w-[150px]">Preço Estimado</TableHead>
                  <TableHead className="w-[150px]">Subtotal</TableHead>
                  <TableHead className="w-[200px]">Observações</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        placeholder="Descrição do item"
                        value={item.descricao}
                        onChange={(e) => atualizarItem(item.id, 'descricao', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) => atualizarItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.unidadeMedida}
                        onValueChange={(value) => atualizarItem(item.id, 'unidadeMedida', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {unidadesMedida.map(un => (
                            <SelectItem key={un} value={un}>{un}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.precoEstimado}
                        onChange={(e) => atualizarItem(item.id, 'precoEstimado', parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        MT {item.subtotal.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Observações"
                        value={item.observacoes}
                        onChange={(e) => atualizarItem(item.id, 'observacoes', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removerItem(item.id)}
                        disabled={itens.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Valor Total Estimado</div>
              <div className="text-2xl font-bold">
                MT {calcularValorTotal().toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerta */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">Informações importantes:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Campos marcados com * são obrigatórios</li>
                <li>A requisição será enviada para aprovação conforme o workflow configurado</li>
                <li>Você pode salvar como rascunho e continuar editando depois</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ações */}
      <div className="flex items-center justify-end space-x-4">
        <Button variant="outline" onClick={() => router.back()} disabled={salvando}>
          Cancelar
        </Button>
        <Button 
          variant="outline" 
          onClick={() => salvarRequisicao('rascunho')}
          disabled={salvando}
        >
          <Save className="h-4 w-4 mr-2" />
          Salvar como Rascunho
        </Button>
        <Button onClick={() => salvarRequisicao('pendente')} disabled={salvando}>
          <Send className="h-4 w-4 mr-2" />
          {salvando ? 'Enviando...' : 'Enviar para Aprovação'}
        </Button>
      </div>
    </div>
  );
}
