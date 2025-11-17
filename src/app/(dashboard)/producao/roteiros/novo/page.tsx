'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Settings,
  Clock,
  DollarSign,
  AlertCircle,
  Calculator,
  Copy,
  Wrench,
  User,
  Factory,
  CheckCircle,
  X,
  GripVertical,
  Eye,
  EyeOff,
} from 'lucide-react';
import Link from 'next/link';

interface Operacao {
  id: string;
  sequencia: number;
  nome: string;
  descricao: string;
  centroTrabalho: string;
  maquina?: string;
  operador?: string;
  tempoPreparacao: number;
  tempoOperacao: number;
  tempoLimpeza: number;
  custoHora: number;
  eficienciaEsperada: number;
  dependencias: string[];
  paralela: boolean;
  obrigatoria: boolean;
  instrucoes?: string;
  ferramentasNecessarias: string[];
  qualificacoesRequeridas: string[];
}

export default function NovoRoteiroPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Form state
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    produto: '',
    versao: 'v1.0',
    categoria: '',
    responsavel: '',
    observacoes: '',
  });
  
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [editingOperacao, setEditingOperacao] = useState<Operacao | null>(null);
  const [isOperacaoDialogOpen, setIsOperacaoDialogOpen] = useState(false);
  
  // Form validation
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return formData.codigo && formData.nome && formData.produto && formData.categoria;
      case 2:
        return operacoes.length > 0;
      default:
        return true;
    }
  };
  
  // Operation management
  const addOperacao = () => {
    setEditingOperacao({
      id: `op-${Date.now()}`,
      sequencia: operacoes.length + 1,
      nome: '',
      descricao: '',
      centroTrabalho: '',
      maquina: '',
      operador: '',
      tempoPreparacao: 0,
      tempoOperacao: 0,
      tempoLimpeza: 0,
      custoHora: 0,
      eficienciaEsperada: 85,
      dependencias: [],
      paralela: false,
      obrigatoria: true,
      instrucoes: '',
      ferramentasNecessarias: [],
      qualificacoesRequeridas: [],
    });
    setIsOperacaoDialogOpen(true);
  };
  
  const saveOperacao = () => {
    if (!editingOperacao || !editingOperacao.nome || !editingOperacao.centroTrabalho) {
      toast({
        title: "Erro",
        description: "Preencha os campos obrigatórios da operação",
        variant: "destructive",
      });
      return;
    }
    
    if (editingOperacao.id.startsWith('op-new-')) {
      // Editing existing operation
      setOperacoes(operacoes.map(op => 
        op.id === editingOperacao.id ? editingOperacao : op
      ));
    } else {
      // Adding new operation
      setOperacoes([...operacoes, editingOperacao]);
    }
    
    setIsOperacaoDialogOpen(false);
    setEditingOperacao(null);
    
    toast({
      title: "Operação salva",
      description: "A operação foi adicionada ao roteiro",
    });
  };
  
  const editOperacao = (operacao: Operacao) => {
    setEditingOperacao({ ...operacao, id: `op-new-${operacao.id}` });
    setIsOperacaoDialogOpen(true);
  };
  
  const removeOperacao = (id: string) => {
    setOperacoes(operacoes.filter(op => op.id !== id));
    // Update sequence numbers
    setOperacoes(prev => prev.map((op, index) => ({ ...op, sequencia: index + 1 })));
  };
  
  const moveOperacao = (index: number, direction: 'up' | 'down') => {
    const newOperacoes = [...operacoes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < operacoes.length) {
      [newOperacoes[index], newOperacoes[targetIndex]] = [newOperacoes[targetIndex], newOperacoes[index]];
      // Update sequence numbers
      newOperacoes.forEach((op, idx) => {
        op.sequencia = idx + 1;
      });
      setOperacoes(newOperacoes);
    }
  };
  
  // Calculations
  const calcularTempoTotal = () => {
    return operacoes.reduce((total, op) => 
      total + op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza, 0
    );
  };
  
  const calcularCustoTotal = () => {
    return operacoes.reduce((total, op) => {
      const tempoTotal = op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza;
      return total + (tempoTotal / 60) * op.custoHora;
    }, 0);
  };
  
  const calcularEficienciaGlobal = () => {
    if (operacoes.length === 0) return 0;
    const totalEficiencia = operacoes.reduce((sum, op) => sum + op.eficienciaEsperada, 0);
    return Math.round(totalEficiencia / operacoes.length);
  };
  
  // Form submission
  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const roteiro = {
        ...formData,
        operacoes,
        tempoTotalEstimado: calcularTempoTotal(),
        custoTotalEstimado: calcularCustoTotal(),
        eficienciaGlobal: calcularEficienciaGlobal(),
        status: 'rascunho',
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString(),
      };
      
      console.log('Novo roteiro:', roteiro);
      
      toast({
        title: "Sucesso",
        description: "Roteiro de produção criado com sucesso",
      });
      
      router.push('/producao/roteiros');
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar roteiro de produção",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Tool and qualification management
  const [newTool, setNewTool] = useState('');
  const [newQualification, setNewQualification] = useState('');
  
  const addTool = () => {
    if (newTool && editingOperacao) {
      setEditingOperacao({
        ...editingOperacao,
        ferramentasNecessarias: [...editingOperacao.ferramentasNecessarias, newTool]
      });
      setNewTool('');
    }
  };
  
  const removeTool = (index: number) => {
    if (editingOperacao) {
      setEditingOperacao({
        ...editingOperacao,
        ferramentasNecessarias: editingOperacao.ferramentasNecessarias.filter((_, i) => i !== index)
      });
    }
  };
  
  const addQualification = () => {
    if (newQualification && editingOperacao) {
      setEditingOperacao({
        ...editingOperacao,
        qualificacoesRequeridas: [...editingOperacao.qualificacoesRequeridas, newQualification]
      });
      setNewQualification('');
    }
  };
  
  const removeQualification = (index: number) => {
    if (editingOperacao) {
      setEditingOperacao({
        ...editingOperacao,
        qualificacoesRequeridas: editingOperacao.qualificacoesRequeridas.filter((_, i) => i !== index)
      });
    }
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/producao/roteiros">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Novo Roteiro de Produção</h1>
            <p className="text-muted-foreground">Criação de novo processo produtivo</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showPreview ? 'Ocultar' : 'Visualizar'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !validateStep(1) || !validateStep(2)}
          >
            {isLoading ? (
              <>Salvando...</>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Roteiro
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Steps indicator */}
      <div className="flex items-center justify-center space-x-4">
        <div className={`flex items-center ${currentStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            1
          </div>
          <span className="ml-2 font-medium">Informações Básicas</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            2
          </div>
          <span className="ml-2 font-medium">Operações</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            3
          </div>
          <span className="ml-2 font-medium">Revisão</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${showPreview ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Informações Básicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="codigo">Código do Roteiro *</Label>
                    <Input
                      id="codigo"
                      value={formData.codigo}
                      onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                      placeholder="ROT-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="versao">Versão</Label>
                    <Input
                      id="versao"
                      value={formData.versao}
                      onChange={(e) => setFormData({ ...formData, versao: e.target.value })}
                      placeholder="v1.0"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="nome">Nome do Roteiro *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Produção de Bolo de Chocolate"
                  />
                </div>
                
                <div>
                  <Label htmlFor="produto">Produto *</Label>
                  <Input
                    id="produto"
                    value={formData.produto}
                    onChange={(e) => setFormData({ ...formData, produto: e.target.value })}
                    placeholder="Ex: Bolo de Chocolate Premium"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="categoria">Categoria *</Label>
                    <Select
                      value={formData.categoria}
                      onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                    >
                      <SelectTrigger id="categoria">
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padaria">Padaria</SelectItem>
                        <SelectItem value="confeitaria">Confeitaria</SelectItem>
                        <SelectItem value="moveis">Móveis</SelectItem>
                        <SelectItem value="metalurgica">Metalúrgica</SelectItem>
                        <SelectItem value="textil">Têxtil</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="responsavel">Responsável</Label>
                    <Input
                      id="responsavel"
                      value={formData.responsavel}
                      onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    placeholder="Observações gerais sobre o roteiro..."
                    rows={3}
                  />
                </div>
                
                <div className="flex justify-end">
                  <Button
                    onClick={() => setCurrentStep(2)}
                    disabled={!validateStep(1)}
                  >
                    Próximo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Step 2: Operations */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  Operações do Roteiro
                </CardTitle>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-muted-foreground">
                    Defina as operações e sua sequência de execução
                  </p>
                  <Button onClick={addOperacao}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Operação
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {operacoes.length === 0 ? (
                  <div className="text-center py-8">
                    <Factory className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">Nenhuma operação adicionada</p>
                    <Button onClick={addOperacao}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Primeira Operação
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {operacoes.map((operacao, index) => (
                      <div key={operacao.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="flex flex-col items-center gap-1">
                              <GripVertical className="h-5 w-5 text-gray-400 cursor-move" />
                              <div className="flex flex-col gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => moveOperacao(index, 'up')}
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => moveOperacao(index, 'down')}
                                  disabled={index === operacoes.length - 1}
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full font-semibold">
                              {operacao.sequencia}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{operacao.nome}</h4>
                                {!operacao.obrigatoria && (
                                  <Badge variant="outline" className="text-xs">Opcional</Badge>
                                )}
                                {operacao.paralela && (
                                  <Badge variant="secondary" className="text-xs">Paralela</Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">{operacao.centroTrabalho}</p>
                              {operacao.descricao && (
                                <p className="text-sm text-gray-500 mt-1">{operacao.descricao}</p>
                              )}
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                                <div>
                                  <span className="text-gray-500">Preparação:</span>
                                  <span className="font-medium ml-1">{operacao.tempoPreparacao} min</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Operação:</span>
                                  <span className="font-medium ml-1">{operacao.tempoOperacao} min</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Limpeza:</span>
                                  <span className="font-medium ml-1">{operacao.tempoLimpeza} min</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Custo/h:</span>
                                  <span className="font-medium ml-1">MT {operacao.custoHora.toFixed(2)}</span>
                                </div>
                              </div>
                              
                              {(operacao.ferramentasNecessarias.length > 0 || operacao.qualificacoesRequeridas.length > 0) && (
                                <div className="mt-3 space-y-2">
                                  {operacao.ferramentasNecessarias.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      <Wrench className="h-3 w-3 text-gray-500 mt-0.5" />
                                      {operacao.ferramentasNecessarias.map((ferramenta, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                          {ferramenta}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {operacao.qualificacoesRequeridas.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      <User className="h-3 w-3 text-gray-500 mt-0.5" />
                                      {operacao.qualificacoesRequeridas.map((qualificacao, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                          {qualificacao}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => editOperacao(operacao)}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeOperacao(operacao.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    onClick={() => setCurrentStep(3)}
                    disabled={!validateStep(2)}
                  >
                    Próximo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Step 3: Review */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Revisão Final
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">Informações do Roteiro</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Código:</span>
                      <span className="font-medium ml-2">{formData.codigo}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Versão:</span>
                      <span className="font-medium ml-2">{formData.versao}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Nome:</span>
                      <span className="font-medium ml-2">{formData.nome}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Produto:</span>
                      <span className="font-medium ml-2">{formData.produto}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Categoria:</span>
                      <span className="font-medium ml-2">{formData.categoria}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Responsável:</span>
                      <span className="font-medium ml-2">{formData.responsavel || '-'}</span>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-semibold mb-3">Resumo das Operações</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Card className="p-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">Tempo Total</p>
                          <p className="text-2xl font-bold">{calcularTempoTotal()} min</p>
                        </div>
                      </div>
                    </Card>
                    
                    <Card className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium">Custo Total</p>
                          <p className="text-2xl font-bold">MT {calcularCustoTotal().toFixed(2)}</p>
                        </div>
                      </div>
                    </Card>
                    
                    <Card className="p-4">
                      <div className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-purple-500" />
                        <div>
                          <p className="text-sm font-medium">Eficiência Média</p>
                          <p className="text-2xl font-bold">{calcularEficienciaGlobal()}%</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                  
                  <div className="space-y-2">
                    {operacoes.map((op) => (
                      <div key={op.id} className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">
                          {op.sequencia}
                        </div>
                        <span className="font-medium">{op.nome}</span>
                        <span className="text-gray-500">- {op.centroTrabalho}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {formData.observacoes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-2">Observações</h3>
                      <p className="text-sm text-gray-600">{formData.observacoes}</p>
                    </div>
                  </>
                )}
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800">Atenção</p>
                    <p className="text-yellow-700 mt-1">
                      Este roteiro será criado como rascunho. Você poderá editá-lo e ativá-lo posteriormente.
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep(2)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>Criando...</>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Criar Roteiro
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Preview Panel */}
        {showPreview && (
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">Prévia do Roteiro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Informações</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Código:</span> {formData.codigo || '-'}</p>
                    <p><span className="text-gray-500">Nome:</span> {formData.nome || '-'}</p>
                    <p><span className="text-gray-500">Produto:</span> {formData.produto || '-'}</p>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold text-sm mb-2">Métricas</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Tempo Total:</span>
                      <span className="font-medium">{calcularTempoTotal()} min</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Custo Total:</span>
                      <span className="font-medium">MT {calcularCustoTotal().toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Eficiência:</span>
                      <span className="font-medium">{calcularEficienciaGlobal()}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Operações:</span>
                      <span className="font-medium">{operacoes.length}</span>
                    </div>
                  </div>
                </div>
                
                {operacoes.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Sequência de Operações</h4>
                      <div className="space-y-2">
                        {operacoes.map((op, index) => (
                          <div key={op.id} className="flex items-start gap-2 text-sm">
                            <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {op.sequencia}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{op.nome}</p>
                              <p className="text-xs text-gray-500">{op.centroTrabalho}</p>
                            </div>
                            {index < operacoes.length - 1 && (
                              <ArrowDown className="h-3 w-3 text-gray-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      
      {/* Operation Dialog */}
      <Dialog open={isOperacaoDialogOpen} onOpenChange={setIsOperacaoDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingOperacao?.id.startsWith('op-new-') ? 'Editar' : 'Nova'} Operação
            </DialogTitle>
            <DialogDescription>
              Defina os detalhes da operação do roteiro de produção
            </DialogDescription>
          </DialogHeader>
          
          {editingOperacao && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="op-nome">Nome da Operação *</Label>
                  <Input
                    id="op-nome"
                    value={editingOperacao.nome}
                    onChange={(e) => setEditingOperacao({ ...editingOperacao, nome: e.target.value })}
                    placeholder="Ex: Preparação de Ingredientes"
                  />
                </div>
                
                <div>
                  <Label htmlFor="op-centro">Centro de Trabalho *</Label>
                  <Input
                    id="op-centro"
                    value={editingOperacao.centroTrabalho}
                    onChange={(e) => setEditingOperacao({ ...editingOperacao, centroTrabalho: e.target.value })}
                    placeholder="Ex: Bancada Prep"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="op-descricao">Descrição</Label>
                <Textarea
                  id="op-descricao"
                  value={editingOperacao.descricao}
                  onChange={(e) => setEditingOperacao({ ...editingOperacao, descricao: e.target.value })}
                  placeholder="Descreva a operação..."
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="op-maquina">Máquina</Label>
                  <Input
                    id="op-maquina"
                    value={editingOperacao.maquina || ''}
                    onChange={(e) => setEditingOperacao({ ...editingOperacao, maquina: e.target.value })}
                    placeholder="Ex: MIX-001"
                  />
                </div>
                
                <div>
                  <Label htmlFor="op-operador">Operador</Label>
                  <Input
                    id="op-operador"
                    value={editingOperacao.operador || ''}
                    onChange={(e) => setEditingOperacao({ ...editingOperacao, operador: e.target.value })}
                    placeholder="Ex: Operador A"
                  />
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-semibold mb-3">Tempos (em minutos)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="op-tempo-prep">Tempo de Preparação</Label>
                    <Input
                      id="op-tempo-prep"
                      type="number"
                      min="0"
                      value={editingOperacao.tempoPreparacao}
                      onChange={(e) => setEditingOperacao({ 
                        ...editingOperacao, 
                        tempoPreparacao: parseInt(e.target.value) || 0 
                      })}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="op-tempo-op">Tempo de Operação</Label>
                    <Input
                      id="op-tempo-op"
                      type="number"
                      min="0"
                      value={editingOperacao.tempoOperacao}
                      onChange={(e) => setEditingOperacao({ 
                        ...editingOperacao, 
                        tempoOperacao: parseInt(e.target.value) || 0 
                      })}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="op-tempo-limpeza">Tempo de Limpeza</Label>
                    <Input
                      id="op-tempo-limpeza"
                      type="number"
                      min="0"
                      value={editingOperacao.tempoLimpeza}
                      onChange={(e) => setEditingOperacao({ 
                        ...editingOperacao, 
                        tempoLimpeza: parseInt(e.target.value) || 0 
                      })}
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="op-custo">Custo por Hora (MT)</Label>
                  <Input
                    id="op-custo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingOperacao.custoHora}
                    onChange={(e) => setEditingOperacao({ 
                      ...editingOperacao, 
                      custoHora: parseFloat(e.target.value) || 0 
                    })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="op-eficiencia">Eficiência Esperada (%)</Label>
                  <Input
                    id="op-eficiencia"
                    type="number"
                    min="0"
                    max="100"
                    value={editingOperacao.eficienciaEsperada}
                    onChange={(e) => setEditingOperacao({ 
                      ...editingOperacao, 
                      eficienciaEsperada: parseInt(e.target.value) || 0 
                    })}
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="op-obrigatoria"
                      checked={editingOperacao.obrigatoria}
                      onCheckedChange={(checked) => setEditingOperacao({ 
                        ...editingOperacao, 
                        obrigatoria: checked as boolean 
                      })}
                    />
                    <Label htmlFor="op-obrigatoria">Operação Obrigatória</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="op-paralela"
                      checked={editingOperacao.paralela}
                      onCheckedChange={(checked) => setEditingOperacao({ 
                        ...editingOperacao, 
                        paralela: checked as boolean 
                      })}
                    />
                    <Label htmlFor="op-paralela">Pode ser Executada em Paralelo</Label>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-semibold mb-3">Ferramentas Necessárias</h4>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newTool}
                      onChange={(e) => setNewTool(e.target.value)}
                      placeholder="Nome da ferramenta"
                      onKeyPress={(e) => e.key === 'Enter' && addTool()}
                    />
                    <Button onClick={addTool} type="button">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingOperacao.ferramentasNecessarias.map((tool, index) => (
                      <Badge key={index} variant="outline" className="flex items-center gap-1">
                        {tool}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => removeTool(index)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Qualificações Requeridas</h4>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newQualification}
                      onChange={(e) => setNewQualification(e.target.value)}
                      placeholder="Nome da qualificação"
                      onKeyPress={(e) => e.key === 'Enter' && addQualification()}
                    />
                    <Button onClick={addQualification} type="button">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingOperacao.qualificacoesRequeridas.map((qual, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {qual}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => removeQualification(index)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              
              <div>
                <Label htmlFor="op-instrucoes">Instruções de Trabalho</Label>
                <Textarea
                  id="op-instrucoes"
                  value={editingOperacao.instrucoes || ''}
                  onChange={(e) => setEditingOperacao({ ...editingOperacao, instrucoes: e.target.value })}
                  placeholder="Instruções detalhadas para execução da operação..."
                  rows={3}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOperacaoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveOperacao}>
              Salvar Operação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}