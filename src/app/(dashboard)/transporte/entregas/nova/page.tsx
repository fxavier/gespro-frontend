'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Save,
  Package,
  User,
  MapPin,
  Clock,
  DollarSign,
  Truck,
  AlertTriangle,
  Plus,
  Minus,
  Calendar,
  Phone,
  Mail,
  Building,
  Home,
  Thermometer,
  Weight,
  Volume,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ProdutoForm {
  nome: string;
  codigo: string;
  quantidade: number;
  peso: number;
  volume: number;
  valor: number;
  fragil: boolean;
  perecivel: boolean;
  temperatura?: string;
}

interface EntregaForm {
  codigo: string;
  pedidoId: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string;
  enderecoRua: string;
  enderecoNumero: string;
  enderecoComplemento: string;
  enderecoBairro: string;
  enderecoCidade: string;
  enderecoProvincia: string;
  enderecoCodigoPostal: string;
  pontosReferencia: string;
  prioridade: string;
  dataAgendada: string;
  horaAgendada: string;
  valorTotal: number;
  custoEntrega: number;
  peso: number;
  volume: number;
  observacoes: string;
  instrucoesEspeciais: string;
  produtos: ProdutoForm[];
}

export default function NovaEntregaPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const [formData, setFormData] = useState<EntregaForm>({
    codigo: '',
    pedidoId: '',
    clienteNome: '',
    clienteTelefone: '',
    clienteEmail: '',
    enderecoRua: '',
    enderecoNumero: '',
    enderecoComplemento: '',
    enderecoBairro: '',
    enderecoCidade: 'maputo',
    enderecoProvincia: 'maputo',
    enderecoCodigoPostal: '',
    pontosReferencia: '',
    prioridade: 'media',
    dataAgendada: new Date().toISOString().split('T')[0],
    horaAgendada: '',
    valorTotal: 0,
    custoEntrega: 0,
    peso: 0,
    volume: 0,
    observacoes: '',
    instrucoesEspeciais: '',
    produtos: [{
      nome: '',
      codigo: '',
      quantidade: 1,
      peso: 0,
      volume: 0,
      valor: 0,
      fragil: false,
      perecivel: false,
      temperatura: ''
    }]
  });

  const updateFormData = (field: keyof EntregaForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const updateProduto = (index: number, field: keyof ProdutoForm, value: any) => {
    const newProdutos = [...formData.produtos];
    newProdutos[index] = { ...newProdutos[index], [field]: value };
    setFormData(prev => ({ ...prev, produtos: newProdutos }));
    
    // Recalcular totais
    recalcularTotais(newProdutos);
  };

  const adicionarProduto = () => {
    const novoProduto: ProdutoForm = {
      nome: '',
      codigo: '',
      quantidade: 1,
      peso: 0,
      volume: 0,
      valor: 0,
      fragil: false,
      perecivel: false,
      temperatura: ''
    };
    setFormData(prev => ({ ...prev, produtos: [...prev.produtos, novoProduto] }));
  };

  const removerProduto = (index: number) => {
    if (formData.produtos.length > 1) {
      const newProdutos = formData.produtos.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, produtos: newProdutos }));
      recalcularTotais(newProdutos);
    }
  };

  const recalcularTotais = (produtos: ProdutoForm[]) => {
    const valorTotal = produtos.reduce((acc, produto) => acc + (produto.valor * produto.quantidade), 0);
    const pesoTotal = produtos.reduce((acc, produto) => acc + (produto.peso * produto.quantidade), 0);
    const volumeTotal = produtos.reduce((acc, produto) => acc + (produto.volume * produto.quantidade), 0);
    
    setFormData(prev => ({
      ...prev,
      valorTotal,
      peso: pesoTotal,
      volume: volumeTotal,
      custoEntrega: calcularCustoEntrega(pesoTotal, volumeTotal, valorTotal)
    }));
  };

  const calcularCustoEntrega = (peso: number, volume: number, valor: number) => {
    // Cálculo baseado em peso, volume e valor
    const custoPeso = peso * 15; // MT 15 por kg
    const custoVolume = volume * 100; // MT 100 por m³
    const custoValor = valor * 0.02; // 2% do valor
    const custoBase = 100; // Custo base MT 100
    
    return Math.max(custoBase, custoPeso + custoVolume + custoValor);
  };

  const gerarCodigoAutomatico = () => {
    const hoje = new Date();
    const ano = hoje.getFullYear().toString().substr(-2);
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const numero = String(Math.floor(Math.random() * 900) + 100);
    
    const codigo = `ENT-${ano}${mes}${dia}-${numero}`;
    updateFormData('codigo', codigo);
    
    toast({
      title: "Código gerado",
      description: `Código automático: ${codigo}`,
    });
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!formData.codigo.trim()) {
      newErrors.codigo = 'Código é obrigatório';
    }
    if (!formData.clienteNome.trim()) {
      newErrors.clienteNome = 'Nome do cliente é obrigatório';
    }
    if (!formData.clienteTelefone.trim()) {
      newErrors.clienteTelefone = 'Telefone do cliente é obrigatório';
    }
    if (!formData.enderecoRua.trim()) {
      newErrors.enderecoRua = 'Rua é obrigatória';
    }
    if (!formData.enderecoNumero.trim()) {
      newErrors.enderecoNumero = 'Número é obrigatório';
    }
    if (!formData.enderecoBairro.trim()) {
      newErrors.enderecoBairro = 'Bairro é obrigatório';
    }
    if (!formData.dataAgendada) {
      newErrors.dataAgendada = 'Data agendada é obrigatória';
    }
    if (formData.valorTotal <= 0) {
      newErrors.valorTotal = 'Valor total deve ser maior que zero';
    }
    
    // Validar produtos
    if (formData.produtos.length === 0) {
      newErrors.produtos = 'Pelo menos um produto é obrigatório';
    } else {
      formData.produtos.forEach((produto, index) => {
        if (!produto.nome.trim()) {
          newErrors[`produto_${index}_nome`] = 'Nome do produto é obrigatório';
        }
        if (produto.quantidade <= 0) {
          newErrors[`produto_${index}_quantidade`] = 'Quantidade deve ser maior que zero';
        }
        if (produto.valor <= 0) {
          newErrors[`produto_${index}_valor`] = 'Valor deve ser maior que zero';
        }
      });
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, corrija os campos em vermelho",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Simular chamada API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('Dados da entrega:', {
        ...formData,
        status: 'pendente',
        tentativas: 0,
        maxTentativas: 3,
        criadoEm: new Date(),
        criadoPor: 'admin'
      });

      toast({
        title: "Entrega criada com sucesso!",
        description: `Entrega ${formData.codigo} foi registrada e está pendente de atribuição`,
      });

      router.push('/transporte/entregas');
    } catch (error) {
      toast({
        title: "Erro ao criar entrega",
        description: "Ocorreu um erro. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const cidades = [
    { value: 'maputo', label: 'Maputo' },
    { value: 'matola', label: 'Matola' },
    { value: 'beira', label: 'Beira' },
    { value: 'nampula', label: 'Nampula' },
    { value: 'tete', label: 'Tete' },
    { value: 'quelimane', label: 'Quelimane' }
  ];

  const provincias = [
    { value: 'maputo', label: 'Maputo' },
    { value: 'maputo_provincia', label: 'Maputo Província' },
    { value: 'sofala', label: 'Sofala' },
    { value: 'nampula', label: 'Nampula' },
    { value: 'tete', label: 'Tete' },
    { value: 'zambézia', label: 'Zambézia' }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/transporte/entregas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nova Entrega</h1>
          <p className="text-muted-foreground">Criar uma nova entrega para agendamento</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Informações Básicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo">Código da Entrega *</Label>
                <div className="flex gap-2">
                  <Input 
                    id="codigo"
                    placeholder="ENT-XXX" 
                    value={formData.codigo}
                    onChange={(e) => updateFormData('codigo', e.target.value)}
                    className={errors.codigo ? 'border-red-500' : ''}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={gerarCodigoAutomatico}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {errors.codigo && (
                  <p className="text-sm text-red-500">{errors.codigo}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="pedidoId">Número do Pedido</Label>
                <Input 
                  id="pedidoId"
                  placeholder="PED-XXX" 
                  value={formData.pedidoId}
                  onChange={(e) => updateFormData('pedidoId', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridade">Prioridade *</Label>
                <Select 
                  value={formData.prioridade} 
                  onValueChange={(value) => updateFormData('prioridade', value)}
                >
                  <SelectTrigger>
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
            </div>
          </CardContent>
        </Card>

        {/* Informações do Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clienteNome">Nome do Cliente *</Label>
                <Input 
                  id="clienteNome"
                  placeholder="Nome completo do cliente" 
                  value={formData.clienteNome}
                  onChange={(e) => updateFormData('clienteNome', e.target.value)}
                  className={errors.clienteNome ? 'border-red-500' : ''}
                />
                {errors.clienteNome && (
                  <p className="text-sm text-red-500">{errors.clienteNome}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="clienteTelefone">Telefone *</Label>
                <Input 
                  id="clienteTelefone"
                  placeholder="+258 XX XXX XXXX" 
                  value={formData.clienteTelefone}
                  onChange={(e) => updateFormData('clienteTelefone', e.target.value)}
                  className={errors.clienteTelefone ? 'border-red-500' : ''}
                />
                {errors.clienteTelefone && (
                  <p className="text-sm text-red-500">{errors.clienteTelefone}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clienteEmail">Email</Label>
              <Input 
                id="clienteEmail"
                type="email"
                placeholder="cliente@email.com" 
                value={formData.clienteEmail}
                onChange={(e) => updateFormData('clienteEmail', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Endereço de Entrega */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Endereço de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="enderecoRua">Rua *</Label>
                <Input 
                  id="enderecoRua"
                  placeholder="Nome da rua ou avenida" 
                  value={formData.enderecoRua}
                  onChange={(e) => updateFormData('enderecoRua', e.target.value)}
                  className={errors.enderecoRua ? 'border-red-500' : ''}
                />
                {errors.enderecoRua && (
                  <p className="text-sm text-red-500">{errors.enderecoRua}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="enderecoNumero">Número *</Label>
                <Input 
                  id="enderecoNumero"
                  placeholder="123" 
                  value={formData.enderecoNumero}
                  onChange={(e) => updateFormData('enderecoNumero', e.target.value)}
                  className={errors.enderecoNumero ? 'border-red-500' : ''}
                />
                {errors.enderecoNumero && (
                  <p className="text-sm text-red-500">{errors.enderecoNumero}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="enderecoComplemento">Complemento</Label>
                <Input 
                  id="enderecoComplemento"
                  placeholder="Apartamento, andar, etc." 
                  value={formData.enderecoComplemento}
                  onChange={(e) => updateFormData('enderecoComplemento', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="enderecoBairro">Bairro *</Label>
                <Input 
                  id="enderecoBairro"
                  placeholder="Nome do bairro" 
                  value={formData.enderecoBairro}
                  onChange={(e) => updateFormData('enderecoBairro', e.target.value)}
                  className={errors.enderecoBairro ? 'border-red-500' : ''}
                />
                {errors.enderecoBairro && (
                  <p className="text-sm text-red-500">{errors.enderecoBairro}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="enderecoCidade">Cidade *</Label>
                <Select 
                  value={formData.enderecoCidade} 
                  onValueChange={(value) => updateFormData('enderecoCidade', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cidades.map(cidade => (
                      <SelectItem key={cidade.value} value={cidade.value}>
                        {cidade.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="enderecoProvincia">Província *</Label>
                <Select 
                  value={formData.enderecoProvincia} 
                  onValueChange={(value) => updateFormData('enderecoProvincia', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {provincias.map(provincia => (
                      <SelectItem key={provincia.value} value={provincia.value}>
                        {provincia.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="enderecoCodigoPostal">Código Postal</Label>
                <Input 
                  id="enderecoCodigoPostal"
                  placeholder="1100" 
                  value={formData.enderecoCodigoPostal}
                  onChange={(e) => updateFormData('enderecoCodigoPostal', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pontosReferencia">Pontos de Referência</Label>
              <Textarea 
                id="pontosReferencia"
                placeholder="Descrição de pontos de referência para facilitar a localização..."
                rows={2}
                value={formData.pontosReferencia}
                onChange={(e) => updateFormData('pontosReferencia', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Produtos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Produtos a Entregar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.produtos.map((produto, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Produto {index + 1}</h4>
                  {formData.produtos.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removerProduto(index)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Produto *</Label>
                    <Input 
                      placeholder="Nome do produto" 
                      value={produto.nome}
                      onChange={(e) => updateProduto(index, 'nome', e.target.value)}
                      className={errors[`produto_${index}_nome`] ? 'border-red-500' : ''}
                    />
                    {errors[`produto_${index}_nome`] && (
                      <p className="text-sm text-red-500">{errors[`produto_${index}_nome`]}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input 
                      placeholder="Código do produto" 
                      value={produto.codigo}
                      onChange={(e) => updateProduto(index, 'codigo', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input 
                      type="number" 
                      min="1"
                      value={produto.quantidade || ''}
                      onChange={(e) => updateProduto(index, 'quantidade', parseInt(e.target.value) || 1)}
                      className={errors[`produto_${index}_quantidade`] ? 'border-red-500' : ''}
                    />
                    {errors[`produto_${index}_quantidade`] && (
                      <p className="text-sm text-red-500">{errors[`produto_${index}_quantidade`]}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Peso (kg)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      min="0"
                      value={produto.peso || ''}
                      onChange={(e) => updateProduto(index, 'peso', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Volume (m³)</Label>
                    <Input 
                      type="number" 
                      step="0.001"
                      min="0"
                      value={produto.volume || ''}
                      onChange={(e) => updateProduto(index, 'volume', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Valor Unitário (MT) *</Label>
                    <Input 
                      type="number" 
                      step="0.01"
                      min="0"
                      value={produto.valor || ''}
                      onChange={(e) => updateProduto(index, 'valor', parseFloat(e.target.value) || 0)}
                      className={errors[`produto_${index}_valor`] ? 'border-red-500' : ''}
                    />
                    {errors[`produto_${index}_valor`] && (
                      <p className="text-sm text-red-500">{errors[`produto_${index}_valor`]}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Valor Total (MT)</Label>
                    <Input 
                      value={`MT ${(produto.valor * produto.quantidade).toLocaleString()}`}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id={`fragil-${index}`}
                      checked={produto.fragil}
                      onCheckedChange={(checked) => updateProduto(index, 'fragil', checked)}
                    />
                    <Label htmlFor={`fragil-${index}`} className="flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Frágil
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id={`perecivel-${index}`}
                      checked={produto.perecivel}
                      onCheckedChange={(checked) => updateProduto(index, 'perecivel', checked)}
                    />
                    <Label htmlFor={`perecivel-${index}`} className="flex items-center gap-1">
                      <Thermometer className="h-4 w-4 text-blue-500" />
                      Perecível
                    </Label>
                  </div>

                  {produto.perecivel && (
                    <div className="space-y-2">
                      <Label>Temperatura</Label>
                      <Input 
                        placeholder="2-8°C" 
                        value={produto.temperatura || ''}
                        onChange={(e) => updateProduto(index, 'temperatura', e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={adicionarProduto}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Produto
            </Button>
          </CardContent>
        </Card>

        {/* Agendamento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Agendamento da Entrega
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dataAgendada">Data Agendada *</Label>
                <Input 
                  id="dataAgendada"
                  type="date" 
                  value={formData.dataAgendada}
                  onChange={(e) => updateFormData('dataAgendada', e.target.value)}
                  className={errors.dataAgendada ? 'border-red-500' : ''}
                />
                {errors.dataAgendada && (
                  <p className="text-sm text-red-500">{errors.dataAgendada}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="horaAgendada">Hora Agendada</Label>
                <Input 
                  id="horaAgendada"
                  type="time" 
                  value={formData.horaAgendada}
                  onChange={(e) => updateFormData('horaAgendada', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custos e Resumo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Resumo Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Valor Total dos Produtos</Label>
                <Input 
                  value={`MT ${formData.valorTotal.toLocaleString()}`}
                  disabled
                  className="bg-gray-50 font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label>Custo de Entrega</Label>
                <Input 
                  value={`MT ${formData.custoEntrega.toFixed(2)}`}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label>Peso Total</Label>
                <Input 
                  value={`${formData.peso.toFixed(1)} kg`}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label>Volume Total</Label>
                <Input 
                  value={`${formData.volume.toFixed(3)} m³`}
                  disabled
                  className="bg-gray-50"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle>Observações e Instruções</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações Gerais</Label>
              <Textarea 
                id="observacoes"
                placeholder="Observações gerais sobre a entrega..."
                rows={3}
                value={formData.observacoes}
                onChange={(e) => updateFormData('observacoes', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instrucoesEspeciais">Instruções Especiais</Label>
              <Textarea 
                id="instrucoesEspeciais"
                placeholder="Instruções especiais para o motorista..."
                rows={2}
                value={formData.instrucoesEspeciais}
                onChange={(e) => updateFormData('instrucoesEspeciais', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/transporte/entregas">
              Cancelar
            </Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Criar Entrega
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}