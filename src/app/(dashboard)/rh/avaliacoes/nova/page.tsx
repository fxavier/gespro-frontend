'use client';

import { useState, useEffect } from 'react';
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
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { format, addDays, differenceInDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Plus,
  Save,
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  User,
  Target,
  Star,
  Award,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Info,
  Search,
  Settings,
  Eye,
  Edit,
  Trash2,
  FileText,
  BarChart3,
  Users,
  BookOpen,
  Lightbulb,
  MessageSquare,
  Clock,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { AvaliacaoStorage } from '@/lib/storage/rh-storage';
import { Avaliacao } from '@/types/rh';

interface Colaborador {
  id: string;
  codigo: string;
  nome: string;
  departamento: string;
  cargo: string;
  supervisor?: string;
  foto?: string;
  status: 'activo' | 'inactivo' | 'ferias' | 'afastado';
}

interface CriterioAvaliacao {
  id: string;
  nome: string;
  descricao: string;
  peso: number;
  nota: number;
  comentario?: string;
  categoria: 'desempenho' | 'competencias' | 'comportamento' | 'objetivos';
}

interface ObjetivoMeta {
  id: string;
  descricao: string;
  peso: number;
  metaDefinida: string;
  resultadoAlcancado?: string;
  percentualAlcancado: number;
  comentario?: string;
}

interface PlanoAcao {
  id: string;
  area: string;
  acao: string;
  prazo: string;
  responsavel: string;
  status: 'pendente' | 'em_andamento' | 'concluido';
}

export default function NovaAvaliacaoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showCriterioDialog, setShowCriterioDialog] = useState(false);
  const [showObjetivoDialog, setShowObjetivoDialog] = useState(false);
  const [showPlanoAcaoDialog, setShowPlanoAcaoDialog] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    colaboradorId: '',
    avaliadorId: '',
    tipo: 'desempenho',
    periodo: '',
    dataInicio: new Date(),
    dataLimite: addDays(new Date(), 30),
    observacoes: '',
  });
  
  const [criterios, setCriterios] = useState<CriterioAvaliacao[]>([]);
  const [objetivos, setObjetivos] = useState<ObjetivoMeta[]>([]);
  const [pontosFortres, setPontosFortres] = useState<string[]>([]);
  const [pontosDesenvolvimento, setPontosDesenvolvimento] = useState<string[]>([]);
  const [planoAcao, setPlanoAcao] = useState<PlanoAcao[]>([]);
  
  // Dialog states
  const [editingCriterio, setEditingCriterio] = useState<CriterioAvaliacao | null>(null);
  const [editingObjetivo, setEditingObjetivo] = useState<ObjetivoMeta | null>(null);
  const [editingPlano, setEditingPlano] = useState<PlanoAcao | null>(null);
  const [novoPontoForte, setNovoPontoForte] = useState('');
  const [novoPontoDesenvolvimento, setNovoPontoDesenvolvimento] = useState('');
  
  // Mock data
  const colaboradores: Colaborador[] = [
    {
      id: '1',
      codigo: 'COL-001',
      nome: 'João Silva',
      departamento: 'Tecnologia',
      cargo: 'Desenvolvedor Senior',
      supervisor: '2',
      status: 'activo'
    },
    {
      id: '2',
      codigo: 'COL-002',
      nome: 'Maria Santos',
      departamento: 'Recursos Humanos',
      cargo: 'Analista de RH',
      supervisor: '5',
      status: 'activo'
    },
    {
      id: '3',
      codigo: 'COL-003',
      nome: 'Carlos Pereira',
      departamento: 'Vendas',
      cargo: 'Consultor Comercial',
      supervisor: '4',
      status: 'activo'
    },
    {
      id: '4',
      codigo: 'COL-004',
      nome: 'Ana Costa',
      departamento: 'Financeiro',
      cargo: 'Contabilista',
      supervisor: '5',
      status: 'activo'
    },
    {
      id: '5',
      codigo: 'COL-005',
      nome: 'Pedro Machado',
      departamento: 'Operações',
      cargo: 'Supervisor',
      status: 'activo'
    }
  ];
  
  const criteriosPadrao: Omit<CriterioAvaliacao, 'id' | 'nota' | 'comentario'>[] = [
    {
      nome: 'Qualidade do Trabalho',
      descricao: 'Precisão, atenção aos detalhes e padrão de qualidade dos resultados',
      peso: 20,
      categoria: 'desempenho'
    },
    {
      nome: 'Produtividade',
      descricao: 'Capacidade de completar tarefas dentro dos prazos estabelecidos',
      peso: 20,
      categoria: 'desempenho'
    },
    {
      nome: 'Conhecimento Técnico',
      descricao: 'Domínio das competências técnicas necessárias para o cargo',
      peso: 15,
      categoria: 'competencias'
    },
    {
      nome: 'Trabalho em Equipa',
      descricao: 'Capacidade de colaborar eficazmente com colegas',
      peso: 15,
      categoria: 'comportamento'
    },
    {
      nome: 'Comunicação',
      descricao: 'Clareza na comunicação oral e escrita',
      peso: 10,
      categoria: 'comportamento'
    },
    {
      nome: 'Iniciativa',
      descricao: 'Proatividade e capacidade de tomar decisões',
      peso: 10,
      categoria: 'comportamento'
    },
    {
      nome: 'Cumprimento de Objectivos',
      descricao: 'Alcance das metas estabelecidas para o período',
      peso: 10,
      categoria: 'objetivos'
    }
  ];
  
  // Load default criteria when evaluation type changes
  useEffect(() => {
    if (formData.tipo && criterios.length === 0) {
      const criteriosIniciais = criteriosPadrao.map(criterio => ({
        ...criterio,
        id: `criterio-${Date.now()}-${Math.random()}`,
        nota: 0,
        comentario: ''
      }));
      setCriterios(criteriosIniciais);
    }
  }, [formData.tipo, criterios.length]);
  
  // Form validation
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.colaboradorId && formData.avaliadorId && formData.periodo);
      case 2:
        return criterios.length > 0 && criterios.every(c => c.nota > 0);
      case 3:
        return true; // Optional step
      default:
        return true;
    }
  };
  
  // Calculations
  const calcularNotaFinal = () => {
    if (criterios.length === 0) return 0;
    
    const somaNotasPonderadas = criterios.reduce((total, criterio) => {
      return total + (criterio.nota * criterio.peso / 100);
    }, 0);
    
    return Math.round(somaNotasPonderadas * 10) / 10;
  };
  
  const calcularPorcentagemObjetivos = () => {
    if (objetivos.length === 0) return 0;
    
    const somaPercentuais = objetivos.reduce((total, objetivo) => {
      return total + (objetivo.percentualAlcancado * objetivo.peso / 100);
    }, 0);
    
    return Math.round(somaPercentuais);
  };
  
  // Criteria management
  const adicionarCriterio = () => {
    if (!editingCriterio) return;
    
    if (!editingCriterio.nome || editingCriterio.peso <= 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    
    if (editingCriterio.id.startsWith('temp-')) {
      // Adding new
      const novoCriterio = {
        ...editingCriterio,
        id: `criterio-${Date.now()}`
      };
      setCriterios([...criterios, novoCriterio]);
    } else {
      // Editing existing
      setCriterios(criterios.map(c => 
        c.id === editingCriterio.id ? editingCriterio : c
      ));
    }
    
    setShowCriterioDialog(false);
    setEditingCriterio(null);
    
    toast({
      title: "Critério salvo",
      description: "Critério de avaliação adicionado com sucesso",
    });
  };
  
  const editarCriterio = (criterio: CriterioAvaliacao) => {
    setEditingCriterio(criterio);
    setShowCriterioDialog(true);
  };
  
  const removerCriterio = (id: string) => {
    setCriterios(criterios.filter(c => c.id !== id));
  };
  
  const abrirDialogCriterio = () => {
    setEditingCriterio({
      id: `temp-${Date.now()}`,
      nome: '',
      descricao: '',
      peso: 10,
      nota: 0,
      categoria: 'desempenho',
      comentario: ''
    });
    setShowCriterioDialog(true);
  };
  
  // Objectives management
  const adicionarObjetivo = () => {
    if (!editingObjetivo) return;
    
    if (!editingObjetivo.descricao || !editingObjetivo.metaDefinida) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    
    if (editingObjetivo.id.startsWith('temp-')) {
      const novoObjetivo = {
        ...editingObjetivo,
        id: `objetivo-${Date.now()}`
      };
      setObjetivos([...objetivos, novoObjetivo]);
    } else {
      setObjetivos(objetivos.map(o => 
        o.id === editingObjetivo.id ? editingObjetivo : o
      ));
    }
    
    setShowObjetivoDialog(false);
    setEditingObjetivo(null);
    
    toast({
      title: "Objetivo salvo",
      description: "Objetivo adicionado com sucesso",
    });
  };
  
  const abrirDialogObjetivo = () => {
    setEditingObjetivo({
      id: `temp-${Date.now()}`,
      descricao: '',
      peso: 10,
      metaDefinida: '',
      resultadoAlcancado: '',
      percentualAlcancado: 0,
      comentario: ''
    });
    setShowObjetivoDialog(true);
  };
  
  // Action plan management
  const adicionarPlanoAcao = () => {
    if (!editingPlano) return;
    
    if (!editingPlano.area || !editingPlano.acao) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    
    if (editingPlano.id.startsWith('temp-')) {
      const novoPlano = {
        ...editingPlano,
        id: `plano-${Date.now()}`
      };
      setPlanoAcao([...planoAcao, novoPlano]);
    } else {
      setPlanoAcao(planoAcao.map(p => 
        p.id === editingPlano.id ? editingPlano : p
      ));
    }
    
    setShowPlanoAcaoDialog(false);
    setEditingPlano(null);
    
    toast({
      title: "Plano de ação salvo",
      description: "Item do plano de ação adicionado com sucesso",
    });
  };
  
  const abrirDialogPlanoAcao = () => {
    setEditingPlano({
      id: `temp-${Date.now()}`,
      area: '',
      acao: '',
      prazo: '',
      responsavel: '',
      status: 'pendente'
    });
    setShowPlanoAcaoDialog(true);
  };
  
  // Points management
  const adicionarPontoForte = () => {
    if (novoPontoForte.trim()) {
      setPontosFortres([...pontosFortres, novoPontoForte.trim()]);
      setNovoPontoForte('');
    }
  };
  
  const adicionarPontoDesenvolvimento = () => {
    if (novoPontoDesenvolvimento.trim()) {
      setPontosDesenvolvimento([...pontosDesenvolvimento, novoPontoDesenvolvimento.trim()]);
      setNovoPontoDesenvolvimento('');
    }
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
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const novaAvaliacao: Avaliacao = {
        id: `avaliacao-${Date.now()}`,
        tenantId: 'default',
        colaboradorId: formData.colaboradorId,
        avaliadorId: formData.avaliadorId,
        periodo: formData.periodo,
        tipo: formData.tipo as Avaliacao['tipo'],
        status: 'pendente',
        criterios: criterios,
        notaFinal: calcularNotaFinal(),
        pontosFortres,
        pontosDesenvolvimento,
        planoAcao: planoAcao.map(p => p.acao), // Convert to string array as expected by Avaliacao type
        comentarios: formData.observacoes,
        dataInicio: format(formData.dataInicio, 'yyyy-MM-dd'),
        dataConclusao: undefined,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
      };
      
      // Save to storage
      AvaliacaoStorage.addAvaliacao(novaAvaliacao);
      
      toast({
        title: "Sucesso",
        description: "Avaliação de desempenho criada com sucesso",
      });
      
      router.push('/rh/avaliacoes');
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar avaliação de desempenho",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Get evaluation type badge
  const getTipoBadge = (tipo: string) => {
    const configs = {
      desempenho: { color: 'bg-blue-100 text-blue-800', label: 'Desempenho' },
      competencias: { color: 'bg-green-100 text-green-800', label: 'Competências' },
      '360': { color: 'bg-purple-100 text-purple-800', label: 'Avaliação 360°' },
      probatorio: { color: 'bg-orange-100 text-orange-800', label: 'Período Probatório' }
    };
    
    const config = configs[tipo as keyof typeof configs] || configs.desempenho;
    return <Badge className={config.color}>{config.label}</Badge>;
  };
  
  const getScoreColor = (nota: number) => {
    if (nota >= 8) return 'text-green-600';
    if (nota >= 6) return 'text-yellow-600';
    if (nota >= 4) return 'text-orange-600';
    return 'text-red-600';
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/rh/avaliacoes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Nova Avaliação de Desempenho</h1>
            <p className="text-muted-foreground">Criar nova avaliação de colaborador</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !validateStep(1) || !validateStep(2)}
          >
            {isLoading ? (
              <>Criando...</>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Avaliação
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
          <span className="ml-2 font-medium">Dados Básicos</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            2
          </div>
          <span className="ml-2 font-medium">Critérios</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            3
          </div>
          <span className="ml-2 font-medium">Objetivos</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 4 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 4 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            4
          </div>
          <span className="ml-2 font-medium">Desenvolvimento</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Step 1: Basic Data */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações da Avaliação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="colaborador">Colaborador a Avaliar *</Label>
                    <Select
                      value={formData.colaboradorId}
                      onValueChange={(value) => setFormData({ ...formData, colaboradorId: value })}
                    >
                      <SelectTrigger id="colaborador">
                        <SelectValue placeholder="Selecione o colaborador" />
                      </SelectTrigger>
                      <SelectContent>
                        {colaboradores
                          .filter(c => c.status === 'activo')
                          .map(colaborador => (
                            <SelectItem key={colaborador.id} value={colaborador.id}>
                              {colaborador.nome} - {colaborador.cargo}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="avaliador">Avaliador *</Label>
                    <Select
                      value={formData.avaliadorId}
                      onValueChange={(value) => setFormData({ ...formData, avaliadorId: value })}
                    >
                      <SelectTrigger id="avaliador">
                        <SelectValue placeholder="Selecione o avaliador" />
                      </SelectTrigger>
                      <SelectContent>
                        {colaboradores
                          .filter(c => c.status === 'activo' && c.id !== formData.colaboradorId)
                          .map(colaborador => (
                            <SelectItem key={colaborador.id} value={colaborador.id}>
                              {colaborador.nome} - {colaborador.cargo}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tipo">Tipo de Avaliação</Label>
                    <Select
                      value={formData.tipo}
                      onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                    >
                      <SelectTrigger id="tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desempenho">Avaliação de Desempenho</SelectItem>
                        <SelectItem value="competencias">Avaliação de Competências</SelectItem>
                        <SelectItem value="360">Avaliação 360°</SelectItem>
                        <SelectItem value="probatorio">Período Probatório</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="periodo">Período de Avaliação *</Label>
                    <Input
                      id="periodo"
                      value={formData.periodo}
                      onChange={(e) => setFormData({ ...formData, periodo: e.target.value })}
                      placeholder="Ex: 1º Semestre 2024"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data de Início</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.dataInicio && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.dataInicio ? 
                            format(formData.dataInicio, "dd/MM/yyyy", { locale: pt }) 
                            : <span>Selecione a data</span>
                          }
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.dataInicio}
                          onSelect={(date) => date && setFormData({ ...formData, dataInicio: date })}
                          initialFocus
                          locale={pt}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div>
                    <Label>Data Limite</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.dataLimite && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.dataLimite ? 
                            format(formData.dataLimite, "dd/MM/yyyy", { locale: pt }) 
                            : <span>Selecione a data</span>
                          }
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.dataLimite}
                          onSelect={(date) => date && setFormData({ ...formData, dataLimite: date })}
                          initialFocus
                          locale={pt}
                          disabled={(date) => date < formData.dataInicio}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="observacoes">Observações Gerais</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    placeholder="Contexto da avaliação, objetivos específicos..."
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
          
          {/* Step 2: Evaluation Criteria */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Critérios de Avaliação
                </CardTitle>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-muted-foreground">
                    Defina os critérios e suas respectivas pontuações
                  </p>
                  <Button onClick={abrirDialogCriterio} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Critério
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {criterios.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">Nenhum critério adicionado</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {criterios.map((criterio) => (
                      <div key={criterio.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{criterio.nome}</h4>
                              <Badge variant="outline">{criterio.peso}%</Badge>
                              <Badge className={
                                criterio.categoria === 'desempenho' ? 'bg-blue-100 text-blue-800' :
                                criterio.categoria === 'competencias' ? 'bg-green-100 text-green-800' :
                                criterio.categoria === 'comportamento' ? 'bg-purple-100 text-purple-800' :
                                'bg-orange-100 text-orange-800'
                              }>
                                {criterio.categoria}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">{criterio.descricao}</p>
                            
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm">Pontuação:</Label>
                                <div className="flex-1 px-3">
                                  <Slider
                                    value={[criterio.nota]}
                                    onValueChange={(value) => {
                                      setCriterios(criterios.map(c =>
                                        c.id === criterio.id ? { ...c, nota: value[0] } : c
                                      ));
                                    }}
                                    max={10}
                                    min={0}
                                    step={0.1}
                                    className="flex-1"
                                  />
                                </div>
                                <span className={`font-bold text-lg ${getScoreColor(criterio.nota)}`}>
                                  {criterio.nota.toFixed(1)}
                                </span>
                              </div>
                              
                              <div>
                                <Textarea
                                  placeholder="Comentários sobre este critério..."
                                  value={criterio.comentario || ''}
                                  onChange={(e) => {
                                    setCriterios(criterios.map(c =>
                                      c.id === criterio.id ? { ...c, comentario: e.target.value } : c
                                    ));
                                  }}
                                  rows={2}
                                  className="text-sm"
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => editarCriterio(criterio)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removerCriterio(criterio.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-medium text-blue-800">
                            Nota Final Calculada: {calcularNotaFinal().toFixed(1)}/10
                          </p>
                          <p className="text-sm text-blue-700">
                            Soma ponderada: {criterios.reduce((sum, c) => sum + c.peso, 0)}%
                          </p>
                        </div>
                      </div>
                    </div>
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
          
          {/* Step 3: Objectives */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Objetivos e Metas
                </CardTitle>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-muted-foreground">
                    Avalie o cumprimento dos objetivos estabelecidos
                  </p>
                  <Button onClick={abrirDialogObjetivo} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Objetivo
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {objetivos.length === 0 ? (
                  <div className="text-center py-8">
                    <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">Nenhum objetivo definido</p>
                    <p className="text-sm text-gray-400 mt-1">Esta seção é opcional</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {objetivos.map((objetivo) => (
                      <div key={objetivo.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{objetivo.descricao}</h4>
                              <Badge variant="outline">{objetivo.peso}%</Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-3">
                              <div>
                                <Label className="text-sm text-gray-500">Meta Definida</Label>
                                <p className="text-sm">{objetivo.metaDefinida}</p>
                              </div>
                              <div>
                                <Label className="text-sm text-gray-500">Resultado Alcançado</Label>
                                <p className="text-sm">{objetivo.resultadoAlcancado || 'Não informado'}</p>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm">% Alcançado:</Label>
                                <div className="flex-1 px-3">
                                  <Slider
                                    value={[objetivo.percentualAlcancado]}
                                    onValueChange={(value) => {
                                      setObjetivos(objetivos.map(o =>
                                        o.id === objetivo.id ? { ...o, percentualAlcancado: value[0] } : o
                                      ));
                                    }}
                                    max={100}
                                    min={0}
                                    step={5}
                                    className="flex-1"
                                  />
                                </div>
                                <span className="font-bold text-lg">
                                  {objetivo.percentualAlcancado}%
                                </span>
                              </div>
                              
                              {objetivo.comentario && (
                                <div>
                                  <Label className="text-sm text-gray-500">Comentário</Label>
                                  <p className="text-sm">{objetivo.comentario}</p>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingObjetivo(objetivo);
                                setShowObjetivoDialog(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setObjetivos(objetivos.filter(o => o.id !== objetivo.id))}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {objetivos.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <Target className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-medium text-green-800">
                              Cumprimento Global de Objetivos: {calcularPorcentagemObjetivos()}%
                            </p>
                            <p className="text-sm text-green-700">
                              Baseado na média ponderada dos objetivos
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setCurrentStep(2)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Anterior
                  </Button>
                  <Button onClick={() => setCurrentStep(4)}>
                    Próximo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Step 4: Development */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {/* Strengths and Development Points */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Pontos Fortes e Desenvolvimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="text-base font-medium">Pontos Fortes</Label>
                    <p className="text-sm text-gray-600 mb-3">Destaque os principais pontos positivos observados</p>
                    
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={novoPontoForte}
                          onChange={(e) => setNovoPontoForte(e.target.value)}
                          placeholder="Adicionar ponto forte..."
                          onKeyPress={(e) => e.key === 'Enter' && adicionarPontoForte()}
                        />
                        <Button onClick={adicionarPontoForte}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="space-y-1">
                        {pontosFortres.map((ponto, index) => (
                          <div key={index} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="flex-1 text-sm">{ponto}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPontosFortres(pontosFortres.filter((_, i) => i !== index))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <Label className="text-base font-medium">Pontos de Desenvolvimento</Label>
                    <p className="text-sm text-gray-600 mb-3">Identifique áreas que necessitam melhoria</p>
                    
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={novoPontoDesenvolvimento}
                          onChange={(e) => setNovoPontoDesenvolvimento(e.target.value)}
                          placeholder="Adicionar ponto de desenvolvimento..."
                          onKeyPress={(e) => e.key === 'Enter' && adicionarPontoDesenvolvimento()}
                        />
                        <Button onClick={adicionarPontoDesenvolvimento}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="space-y-1">
                        {pontosDesenvolvimento.map((ponto, index) => (
                          <div key={index} className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded p-2">
                            <Lightbulb className="h-4 w-4 text-orange-600" />
                            <span className="flex-1 text-sm">{ponto}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPontosDesenvolvimento(pontosDesenvolvimento.filter((_, i) => i !== index))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Action Plan */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Plano de Ação
                  </CardTitle>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-muted-foreground">
                      Defina ações concretas para desenvolvimento
                    </p>
                    <Button onClick={abrirDialogPlanoAcao} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Ação
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {planoAcao.length === 0 ? (
                    <div className="text-center py-8">
                      <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhuma ação definida</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Área</TableHead>
                          <TableHead>Ação</TableHead>
                          <TableHead>Prazo</TableHead>
                          <TableHead>Responsável</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {planoAcao.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.area}</TableCell>
                            <TableCell>{item.acao}</TableCell>
                            <TableCell>{item.prazo}</TableCell>
                            <TableCell>{item.responsavel}</TableCell>
                            <TableCell>
                              <Badge variant={
                                item.status === 'concluido' ? 'default' :
                                item.status === 'em_andamento' ? 'secondary' : 'outline'
                              }>
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingPlano(item);
                                    setShowPlanoAcaoDialog(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPlanoAcao(planoAcao.filter(p => p.id !== item.id))}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
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
                      Finalizar Avaliação
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {/* Summary Panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Resumo da Avaliação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-gray-500">Tipo</Label>
                {getTipoBadge(formData.tipo)}
              </div>
              
              {formData.colaboradorId && (
                <div>
                  <Label className="text-sm text-gray-500">Colaborador</Label>
                  <p className="font-medium">
                    {colaboradores.find(c => c.id === formData.colaboradorId)?.nome || '-'}
                  </p>
                </div>
              )}
              
              {formData.avaliadorId && (
                <div>
                  <Label className="text-sm text-gray-500">Avaliador</Label>
                  <p className="font-medium">
                    {colaboradores.find(c => c.id === formData.avaliadorId)?.nome || '-'}
                  </p>
                </div>
              )}
              
              {formData.periodo && (
                <div>
                  <Label className="text-sm text-gray-500">Período</Label>
                  <p className="font-medium">{formData.periodo}</p>
                </div>
              )}
              
              <Separator />
              
              <div>
                <Label className="text-sm text-gray-500">Progresso</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span>Critérios:</span>
                    <span className="font-medium">{criterios.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Objetivos:</span>
                    <span className="font-medium">{objetivos.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Pontos Fortes:</span>
                    <span className="font-medium">{pontosFortres.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Desenvolvimento:</span>
                    <span className="font-medium">{pontosDesenvolvimento.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Plano de Ação:</span>
                    <span className="font-medium">{planoAcao.length}</span>
                  </div>
                </div>
              </div>
              
              {criterios.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm text-gray-500">Nota Final</Label>
                    <p className={`text-2xl font-bold ${getScoreColor(calcularNotaFinal())}`}>
                      {calcularNotaFinal().toFixed(1)}/10
                    </p>
                  </div>
                </>
              )}
              
              {objetivos.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-500">Objetivos</Label>
                  <p className="text-lg font-medium text-green-600">
                    {calcularPorcentagemObjetivos()}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Criteria Dialog */}
      <Dialog open={showCriterioDialog} onOpenChange={setShowCriterioDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCriterio?.id.startsWith('temp-') ? 'Adicionar' : 'Editar'} Critério
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes do critério de avaliação
            </DialogDescription>
          </DialogHeader>
          
          {editingCriterio && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome do Critério *</Label>
                  <Input
                    value={editingCriterio.nome}
                    onChange={(e) => setEditingCriterio({ ...editingCriterio, nome: e.target.value })}
                    placeholder="Ex: Qualidade do Trabalho"
                  />
                </div>
                
                <div>
                  <Label>Categoria</Label>
                  <Select
                    value={editingCriterio.categoria}
                    onValueChange={(value) => setEditingCriterio({ ...editingCriterio, categoria: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desempenho">Desempenho</SelectItem>
                      <SelectItem value="competencias">Competências</SelectItem>
                      <SelectItem value="comportamento">Comportamento</SelectItem>
                      <SelectItem value="objetivos">Objetivos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={editingCriterio.descricao}
                  onChange={(e) => setEditingCriterio({ ...editingCriterio, descricao: e.target.value })}
                  placeholder="Descreva o que será avaliado neste critério..."
                  rows={3}
                />
              </div>
              
              <div>
                <Label>Peso (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={editingCriterio.peso}
                  onChange={(e) => setEditingCriterio({ ...editingCriterio, peso: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCriterioDialog(false);
                setEditingCriterio(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={adicionarCriterio}>
              {editingCriterio?.id.startsWith('temp-') ? 'Adicionar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Objective Dialog */}
      <Dialog open={showObjetivoDialog} onOpenChange={setShowObjetivoDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingObjetivo?.id.startsWith('temp-') ? 'Adicionar' : 'Editar'} Objetivo
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes do objetivo/meta
            </DialogDescription>
          </DialogHeader>
          
          {editingObjetivo && (
            <div className="space-y-4">
              <div>
                <Label>Descrição do Objetivo *</Label>
                <Input
                  value={editingObjetivo.descricao}
                  onChange={(e) => setEditingObjetivo({ ...editingObjetivo, descricao: e.target.value })}
                  placeholder="Ex: Aumentar vendas do trimestre"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Meta Definida *</Label>
                  <Input
                    value={editingObjetivo.metaDefinida}
                    onChange={(e) => setEditingObjetivo({ ...editingObjetivo, metaDefinida: e.target.value })}
                    placeholder="Ex: 15% de crescimento"
                  />
                </div>
                
                <div>
                  <Label>Resultado Alcançado</Label>
                  <Input
                    value={editingObjetivo.resultadoAlcancado || ''}
                    onChange={(e) => setEditingObjetivo({ ...editingObjetivo, resultadoAlcancado: e.target.value })}
                    placeholder="Ex: 12% de crescimento"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Peso (%)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={editingObjetivo.peso}
                    onChange={(e) => setEditingObjetivo({ ...editingObjetivo, peso: parseInt(e.target.value) || 0 })}
                  />
                </div>
                
                <div>
                  <Label>% Alcançado</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={editingObjetivo.percentualAlcancado}
                    onChange={(e) => setEditingObjetivo({ ...editingObjetivo, percentualAlcancado: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              
              <div>
                <Label>Comentário</Label>
                <Textarea
                  value={editingObjetivo.comentario || ''}
                  onChange={(e) => setEditingObjetivo({ ...editingObjetivo, comentario: e.target.value })}
                  placeholder="Comentários sobre o cumprimento deste objetivo..."
                  rows={3}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowObjetivoDialog(false);
                setEditingObjetivo(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={adicionarObjetivo}>
              {editingObjetivo?.id.startsWith('temp-') ? 'Adicionar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Action Plan Dialog */}
      <Dialog open={showPlanoAcaoDialog} onOpenChange={setShowPlanoAcaoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPlano?.id.startsWith('temp-') ? 'Adicionar' : 'Editar'} Ação
            </DialogTitle>
            <DialogDescription>
              Configure uma ação do plano de desenvolvimento
            </DialogDescription>
          </DialogHeader>
          
          {editingPlano && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Área de Desenvolvimento *</Label>
                  <Input
                    value={editingPlano.area}
                    onChange={(e) => setEditingPlano({ ...editingPlano, area: e.target.value })}
                    placeholder="Ex: Comunicação"
                  />
                </div>
                
                <div>
                  <Label>Responsável</Label>
                  <Input
                    value={editingPlano.responsavel}
                    onChange={(e) => setEditingPlano({ ...editingPlano, responsavel: e.target.value })}
                    placeholder="Ex: Supervisor direto"
                  />
                </div>
              </div>
              
              <div>
                <Label>Ação/Atividade *</Label>
                <Textarea
                  value={editingPlano.acao}
                  onChange={(e) => setEditingPlano({ ...editingPlano, acao: e.target.value })}
                  placeholder="Descreva a ação específica a ser realizada..."
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prazo</Label>
                  <Input
                    value={editingPlano.prazo}
                    onChange={(e) => setEditingPlano({ ...editingPlano, prazo: e.target.value })}
                    placeholder="Ex: 30 dias"
                  />
                </div>
                
                <div>
                  <Label>Status</Label>
                  <Select
                    value={editingPlano.status}
                    onValueChange={(value) => setEditingPlano({ ...editingPlano, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPlanoAcaoDialog(false);
                setEditingPlano(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={adicionarPlanoAcao}>
              {editingPlano?.id.startsWith('temp-') ? 'Adicionar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}