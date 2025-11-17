'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Package,
  QrCode,
  Calculator,
  MapPin,
  DollarSign,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AtivoForm {
  codigoInterno: string;
  nome: string;
  descricao: string;
  categoriaId: string;
  numeroSerie: string;
  modelo: string;
  marca: string;
  fornecedorId: string;
  dataAquisicao: string;
  valorCompra: number;
  valorResidual: number;
  vidaUtil: number;
  estado: string;
  localizacaoId: string;
  responsavelId: string;
  departamentoId: string;
  metodoAmortizacao: string;
  garantiaInicio: string;
  garantiaFim: string;
  garantiaFornecedor: string;
  observacoes: string;
}

export default function NovoAtivoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [gerarQrCode, setGerarQrCode] = useState(true);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const [formData, setFormData] = useState<AtivoForm>({
    codigoInterno: '',
    nome: '',
    descricao: '',
    categoriaId: '',
    numeroSerie: '',
    modelo: '',
    marca: '',
    fornecedorId: '',
    dataAquisicao: new Date().toISOString().split('T')[0],
    valorCompra: 0,
    valorResidual: 0,
    vidaUtil: 5,
    estado: 'novo',
    localizacaoId: '',
    responsavelId: '',
    departamentoId: '',
    metodoAmortizacao: 'linear',
    garantiaInicio: '',
    garantiaFim: '',
    garantiaFornecedor: '',
    observacoes: '',
  });

  const updateFormData = (field: keyof AtivoForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Dados de exemplo para os selects
  const categorias = [
    { id: 'informatica', nome: 'Informática', icone: '💻' },
    { id: 'transporte', nome: 'Transporte', icone: '🚗' },
    { id: 'mobiliario', nome: 'Mobiliário', icone: '🪑' },
    { id: 'ferramentas', nome: 'Ferramentas', icone: '🔧' },
    { id: 'equipamento_medico', nome: 'Equipamento Médico', icone: '🏥' },
    { id: 'outros', nome: 'Outros', icone: '📦' }
  ];

  const fornecedores = [
    { id: '1', nome: 'Dell Moçambique' },
    { id: '2', nome: 'Lenovo Store' },
    { id: '3', nome: 'Toyota Moçambique' },
    { id: '4', nome: 'HP Store' },
    { id: '5', nome: 'Móveis & Cia' }
  ];

  const localizacoes = [
    { id: '1', nome: 'Armazém Principal' },
    { id: '2', nome: 'Escritório Central' },
    { id: '3', nome: 'Departamento de TI' },
    { id: '4', nome: 'Sala Diretoria' },
    { id: '5', nome: 'Área Técnica' },
    { id: '6', nome: 'Sala de Conferências' }
  ];

  const responsaveis = [
    { id: '1', nome: 'Carlos Fernandes' },
    { id: '2', nome: 'Maria Santos' },
    { id: '3', nome: 'João Silva' },
    { id: '4', nome: 'Ana Costa' },
    { id: '5', nome: 'Sofia Nunes' }
  ];

  const departamentos = [
    { id: 'ti', nome: 'Tecnologia da Informação' },
    { id: 'admin', nome: 'Administração' },
    { id: 'logistica', nome: 'Logística' },
    { id: 'financeiro', nome: 'Financeiro' },
    { id: 'rh', nome: 'Recursos Humanos' }
  ];

  const estados = [
    { value: 'novo', label: 'Novo' },
    { value: 'em_uso', label: 'Em Uso' },
    { value: 'em_manutencao', label: 'Em Manutenção' },
    { value: 'obsoleto', label: 'Obsoleto' },
    { value: 'em_transferencia', label: 'Em Transferência' }
  ];

  const metodosAmortizacao = [
    { value: 'linear', label: 'Linear' },
    { value: 'decrescente', label: 'Decrescente' },
    { value: 'soma_digitos', label: 'Soma dos Dígitos' },
    { value: 'unidades_producao', label: 'Unidades de Produção' }
  ];

  const gerarCodigoAutomatico = () => {
    const categoria = categorias.find(c => c.id === formData.categoriaId);
    if (categoria) {
      const prefixo = categoria.nome.substring(0, 3).toUpperCase();
      const numero = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
      const codigo = `${prefixo}-${numero}`;
      updateFormData('codigoInterno', codigo);
      
      toast({
        title: "Código gerado",
        description: `Código automático: ${codigo}`,
      });
    }
  };

  const calcularDataSubstituicao = () => {
    const dataAquisicao = formData.dataAquisicao;
    const vidaUtil = formData.vidaUtil;
    
    if (dataAquisicao && vidaUtil) {
      const data = new Date(dataAquisicao);
      data.setFullYear(data.getFullYear() + vidaUtil);
      return data.toISOString().split('T')[0];
    }
    return '';
  };

  const calcularValorResidualSugerido = () => {
    const valorCompra = formData.valorCompra;
    const categoria = formData.categoriaId;
    
    if (valorCompra > 0) {
      const percentuais = {
        informatica: 0.1,
        transporte: 0.3,
        mobiliario: 0.1,
        ferramentas: 0.05,
        equipamento_medico: 0.15,
        outros: 0.1
      };
      
      const percentual = percentuais[categoria as keyof typeof percentuais] || 0.1;
      const valorSugerido = valorCompra * percentual;
      updateFormData('valorResidual', Math.round(valorSugerido));
      
      toast({
        title: "Valor residual calculado",
        description: `Sugestão: MT ${valorSugerido.toLocaleString()} (${(percentual * 100)}% do valor de compra)`,
      });
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!formData.codigoInterno.trim()) {
      newErrors.codigoInterno = 'Código interno é obrigatório';
    }
    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório';
    }
    if (!formData.categoriaId) {
      newErrors.categoriaId = 'Categoria é obrigatória';
    }
    if (!formData.dataAquisicao) {
      newErrors.dataAquisicao = 'Data de aquisição é obrigatória';
    }
    if (formData.valorCompra <= 0) {
      newErrors.valorCompra = 'Valor de compra deve ser maior que zero';
    }
    if (formData.valorResidual < 0) {
      newErrors.valorResidual = 'Valor residual deve ser positivo';
    }
    if (formData.vidaUtil <= 0) {
      newErrors.vidaUtil = 'Vida útil deve ser maior que zero';
    }
    if (!formData.localizacaoId) {
      newErrors.localizacaoId = 'Localização é obrigatória';
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
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const dataSubstituicao = calcularDataSubstituicao();
      const qrCode = gerarQrCode ? `QR-${formData.codigoInterno}` : undefined;
      
      console.log('Dados do ativo:', {
        ...formData,
        dataSubstituicao,
        qrCode,
        amortizacao: {
          metodo: formData.metodoAmortizacao,
          valorAmortizadoAcumulado: 0,
          valorLiquidoContabilistico: formData.valorCompra,
          percentualAmortizado: 0
        }
      });

      toast({
        title: "Ativo criado com sucesso!",
        description: `${formData.nome} foi adicionado ao inventário`,
      });

      router.push('/inventario/ativos');
    } catch (error) {
      toast({
        title: "Erro ao criar ativo",
        description: "Ocorreu um erro. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/inventario/ativos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Novo Ativo</h1>
          <p className="text-muted-foreground">Adicione um novo ativo ao inventário</p>
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
                <Label htmlFor="codigoInterno">Código Interno *</Label>
                <div className="flex gap-2">
                  <Input 
                    id="codigoInterno"
                    placeholder="PC-001" 
                    value={formData.codigoInterno}
                    onChange={(e) => updateFormData('codigoInterno', e.target.value)}
                    className={errors.codigoInterno ? 'border-red-500' : ''}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={gerarCodigoAutomatico}
                    disabled={!formData.categoriaId}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {errors.codigoInterno && (
                  <p className="text-sm text-red-500">{errors.codigoInterno}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Ativo *</Label>
                <Input 
                  id="nome"
                  placeholder="Computador Dell OptiPlex" 
                  value={formData.nome}
                  onChange={(e) => updateFormData('nome', e.target.value)}
                  className={errors.nome ? 'border-red-500' : ''}
                />
                {errors.nome && (
                  <p className="text-sm text-red-500">{errors.nome}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoriaId">Categoria *</Label>
                <Select 
                  value={formData.categoriaId} 
                  onValueChange={(value) => updateFormData('categoriaId', value)}
                >
                  <SelectTrigger className={errors.categoriaId ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((categoria) => (
                      <SelectItem key={categoria.id} value={categoria.id}>
                        <div className="flex items-center gap-2">
                          <span>{categoria.icone}</span>
                          <span>{categoria.nome}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.categoriaId && (
                  <p className="text-sm text-red-500">{errors.categoriaId}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea 
                id="descricao"
                placeholder="Descrição detalhada do ativo..."
                className="resize-none"
                value={formData.descricao}
                onChange={(e) => updateFormData('descricao', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numeroSerie">Número de Série</Label>
                <Input 
                  id="numeroSerie"
                  placeholder="DL3090-12345" 
                  value={formData.numeroSerie}
                  onChange={(e) => updateFormData('numeroSerie', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="marca">Marca</Label>
                <Input 
                  id="marca"
                  placeholder="Dell" 
                  value={formData.marca}
                  onChange={(e) => updateFormData('marca', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelo">Modelo</Label>
                <Input 
                  id="modelo"
                  placeholder="OptiPlex 3090" 
                  value={formData.modelo}
                  onChange={(e) => updateFormData('modelo', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Informações Financeiras */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Informações Financeiras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fornecedorId">Fornecedor</Label>
                <Select 
                  value={formData.fornecedorId} 
                  onValueChange={(value) => updateFormData('fornecedorId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores.map((fornecedor) => (
                      <SelectItem key={fornecedor.id} value={fornecedor.id}>
                        {fornecedor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataAquisicao">Data de Aquisição *</Label>
                <Input 
                  id="dataAquisicao"
                  type="date" 
                  value={formData.dataAquisicao}
                  onChange={(e) => updateFormData('dataAquisicao', e.target.value)}
                  className={errors.dataAquisicao ? 'border-red-500' : ''}
                />
                {errors.dataAquisicao && (
                  <p className="text-sm text-red-500">{errors.dataAquisicao}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valorCompra">Valor de Compra (MT) *</Label>
                <Input 
                  id="valorCompra"
                  type="number" 
                  placeholder="45000.00"
                  value={formData.valorCompra || ''}
                  onChange={(e) => updateFormData('valorCompra', parseFloat(e.target.value) || 0)}
                  className={errors.valorCompra ? 'border-red-500' : ''}
                />
                {errors.valorCompra && (
                  <p className="text-sm text-red-500">{errors.valorCompra}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="valorResidual">Valor Residual (MT) *</Label>
                <div className="flex gap-2">
                  <Input 
                    id="valorResidual"
                    type="number" 
                    placeholder="4500.00"
                    value={formData.valorResidual || ''}
                    onChange={(e) => updateFormData('valorResidual', parseFloat(e.target.value) || 0)}
                    className={errors.valorResidual ? 'border-red-500' : ''}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={calcularValorResidualSugerido}
                    disabled={!formData.valorCompra || !formData.categoriaId}
                  >
                    <Calculator className="h-4 w-4" />
                  </Button>
                </div>
                {errors.valorResidual && (
                  <p className="text-sm text-red-500">{errors.valorResidual}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vidaUtil">Vida Útil (anos) *</Label>
                <Input 
                  id="vidaUtil"
                  type="number" 
                  placeholder="5"
                  value={formData.vidaUtil || ''}
                  onChange={(e) => updateFormData('vidaUtil', parseInt(e.target.value) || 1)}
                  className={errors.vidaUtil ? 'border-red-500' : ''}
                />
                <p className="text-sm text-muted-foreground">
                  Data de substituição: {calcularDataSubstituicao() && new Date(calcularDataSubstituicao()).toLocaleDateString('pt-PT')}
                </p>
                {errors.vidaUtil && (
                  <p className="text-sm text-red-500">{errors.vidaUtil}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Localização e Responsabilidade */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Localização e Responsabilidade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="localizacaoId">Localização *</Label>
                <Select 
                  value={formData.localizacaoId} 
                  onValueChange={(value) => updateFormData('localizacaoId', value)}
                >
                  <SelectTrigger className={errors.localizacaoId ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Selecione a localização" />
                  </SelectTrigger>
                  <SelectContent>
                    {localizacoes.map((localizacao) => (
                      <SelectItem key={localizacao.id} value={localizacao.id}>
                        {localizacao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.localizacaoId && (
                  <p className="text-sm text-red-500">{errors.localizacaoId}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="estado">Estado *</Label>
                <Select 
                  value={formData.estado} 
                  onValueChange={(value) => updateFormData('estado', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {estados.map((estado) => (
                      <SelectItem key={estado.value} value={estado.value}>
                        {estado.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="responsavelId">Responsável</Label>
                <Select 
                  value={formData.responsavelId} 
                  onValueChange={(value) => updateFormData('responsavelId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {responsaveis.map((responsavel) => (
                      <SelectItem key={responsavel.id} value={responsavel.id}>
                        {responsavel.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="departamentoId">Departamento</Label>
                <Select 
                  value={formData.departamentoId} 
                  onValueChange={(value) => updateFormData('departamentoId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.map((departamento) => (
                      <SelectItem key={departamento.id} value={departamento.id}>
                        {departamento.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Amortização */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Configuração de Amortização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="metodoAmortizacao">Método de Amortização *</Label>
              <Select 
                value={formData.metodoAmortizacao} 
                onValueChange={(value) => updateFormData('metodoAmortizacao', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o método" />
                </SelectTrigger>
                <SelectContent>
                  {metodosAmortizacao.map((metodo) => (
                    <SelectItem key={metodo.value} value={metodo.value}>
                      {metodo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                O método linear é o mais comum e distribui a amortização uniformemente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Garantia */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informações de Garantia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="garantiaInicio">Início da Garantia</Label>
                <Input 
                  id="garantiaInicio"
                  type="date" 
                  value={formData.garantiaInicio}
                  onChange={(e) => updateFormData('garantiaInicio', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="garantiaFim">Fim da Garantia</Label>
                <Input 
                  id="garantiaFim"
                  type="date" 
                  value={formData.garantiaFim}
                  onChange={(e) => updateFormData('garantiaFim', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="garantiaFornecedor">Fornecedor da Garantia</Label>
                <Input 
                  id="garantiaFornecedor"
                  placeholder="Nome do fornecedor" 
                  value={formData.garantiaFornecedor}
                  onChange={(e) => updateFormData('garantiaFornecedor', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observações e Opções Adicionais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informações Adicionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea 
                id="observacoes"
                placeholder="Observações adicionais sobre o ativo..."
                className="resize-none"
                rows={3}
                value={formData.observacoes}
                onChange={(e) => updateFormData('observacoes', e.target.value)}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="gerarQrCode"
                checked={gerarQrCode}
                onChange={(e) => setGerarQrCode(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="gerarQrCode" className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                Gerar QR Code automaticamente
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/inventario/ativos">
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
                Criar Ativo
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}