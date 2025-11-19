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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { format, addDays, isAfter, isBefore, differenceInDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  Package,
  Factory,
  User,
  Settings,
  Search,
  X,
  AlertTriangle,
  Info,
  BarChart3,
  Users,
  Wrench,
  FileText,
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Timer,
  Target,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface Material {
  id: string;
  codigo: string;
  nome: string;
  quantidadeNecessaria: number;
  quantidadeDisponivel: number;
  quantidadeReservada: number;
  unidadeMedida: string;
  custoUnitario: number;
  custoTotal: number;
  leadTime: number; // dias
  fornecedor?: string;
  disponibilidade: 'disponivel' | 'parcial' | 'indisponivel';
}

interface OperacaoPlaneada {
  id: string;
  sequencia: number;
  nome: string;
  descricao: string;
  centroTrabalho: string;
  maquina?: string;
  tempoPreparacao: number;
  tempoOperacao: number;
  tempoLimpeza: number;
  custoHora: number;
  eficienciaEsperada: number;
  obrigatoria: boolean;
  paralela: boolean;
  dependencias: string[];
  recursosNecessarios: {
    operadores: number;
    ferramentas: string[];
    qualificacoes: string[];
  };
  dataInicioPrevista?: Date;
  dataFimPrevista?: Date;
  capacidadeDisponivel?: number; // %
}

interface RoteiroInfo {
  id: string;
  codigo: string;
  nome: string;
  tempoTotalEstimado: number;
  custoTotalEstimado: number;
  eficienciaGlobal: number;
  operacoes: OperacaoPlaneada[];
}

interface PedidoVenda {
  id: string;
  numero: string;
  cliente: string;
  produto: string;
  quantidade: number;
  dataEntrega: string;
}

export default function NovaOrdemPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Form state
  const [formData, setFormData] = useState({
    produto: '',
    codigoProduto: '',
    quantidade: 1,
    unidadeMedida: 'unidades',
    prioridade: 'media',
    roteiro: '',
    lote: '',
    numeroSerie: '',
    responsavel: '',
    observacoes: '',
    pedidoVenda: '',
    dataPrevisaoInicio: new Date(),
    dataPrevisaoFim: addDays(new Date(), 1),
  });
  
  const [roteiroSelecionado, setRoteiroSelecionado] = useState<RoteiroInfo | null>(null);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [operacoesPlaneadas, setOperacoesPlaneadas] = useState<OperacaoPlaneada[]>([]);
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [showCapacidadeDialog, setShowCapacidadeDialog] = useState(false);
  const [validacaoCapacidade, setValidacaoCapacidade] = useState<any>(null);
  
  // Material dialog state
  const [novoMaterial, setNovoMaterial] = useState({
    materialId: '',
    quantidade: 0,
    unidade: 'kg'
  });
  
  // Mock data
  const produtos = [
    { id: '1', codigo: 'PROD-001', nome: 'Bolo de Chocolate Premium', unidade: 'unidades' },
    { id: '2', codigo: 'PROD-002', nome: 'Mesa de Escritório Executive', unidade: 'unidades' },
    { id: '3', codigo: 'PROD-003', nome: 'Cadeira Ergonômica Pro', unidade: 'unidades' },
  ];
  
  const materiaisDisponiveis = [
    { id: 'mat-001', codigo: 'MAT-001', nome: 'Farinha de Trigo', custoUnitario: 10.00, leadTime: 2, fornecedor: 'Moinho Central', estoque: 500 },
    { id: 'mat-002', codigo: 'MAT-002', nome: 'Ovos Frescos', custoUnitario: 2.50, leadTime: 1, fornecedor: 'Avicultura São José', estoque: 300 },
    { id: 'mat-003', codigo: 'MAT-003', nome: 'Chocolate em Pó', custoUnitario: 25.00, leadTime: 3, fornecedor: 'Chocolates Premium', estoque: 100 },
    { id: 'mat-004', codigo: 'MAT-004', nome: 'Açúcar Refinado', custoUnitario: 8.00, leadTime: 2, fornecedor: 'Usina Doce', estoque: 200 },
    { id: 'mat-005', codigo: 'MAT-005', nome: 'Manteiga', custoUnitario: 35.00, leadTime: 1, fornecedor: 'Laticínios Central', estoque: 50 },
    { id: 'mat-006', codigo: 'MAT-006', nome: 'MDF 18mm', custoUnitario: 120.00, leadTime: 5, fornecedor: 'Madeiras Silva', estoque: 25 },
    { id: 'mat-007', codigo: 'MAT-007', nome: 'Dobradiças Metálicas', custoUnitario: 15.00, leadTime: 7, fornecedor: 'Ferragens Top', estoque: 150 },
  ];
  
  const roteiros = [
    {
      id: '1',
      codigo: 'ROT-001',
      nome: 'Produção de Bolo de Chocolate',
      tempoTotalEstimado: 180,
      custoTotalEstimado: 125.50,
      eficienciaGlobal: 85,
      operacoes: []
    },
    {
      id: '2',
      codigo: 'ROT-002',
      nome: 'Montagem Mesa Executive',
      tempoTotalEstimado: 480,
      custoTotalEstimado: 180.00,
      eficienciaGlobal: 92,
      operacoes: []
    }
  ];
  
  const pedidosVenda: PedidoVenda[] = [
    {
      id: '1',
      numero: 'PV-2024-125',
      cliente: 'Padaria Central',
      produto: 'Bolo de Chocolate Premium',
      quantidade: 50,
      dataEntrega: '2024-10-25'
    },
    {
      id: '2',
      numero: 'PV-2024-126',
      cliente: 'Empresa ABC Lda',
      produto: 'Mesa de Escritório Executive',
      quantidade: 10,
      dataEntrega: '2024-10-30'
    }
  ];
  
  // Load materials when product is selected
  useEffect(() => {
    if (formData.produto) {
      // Simulate loading materials
      const mockMaterials: Material[] = [
        {
          id: '1',
          codigo: 'MAT-001',
          nome: 'Farinha de Trigo',
          quantidadeNecessaria: formData.quantidade * 2.5,
          quantidadeDisponivel: 500,
          quantidadeReservada: 100,
          unidadeMedida: 'kg',
          custoUnitario: 10.00,
          custoTotal: formData.quantidade * 2.5 * 10.00,
          leadTime: 2,
          fornecedor: 'Moinho Central',
          disponibilidade: 'disponivel'
        },
        {
          id: '2',
          codigo: 'MAT-002',
          nome: 'Ovos Frescos',
          quantidadeNecessaria: formData.quantidade * 12,
          quantidadeDisponivel: 300,
          quantidadeReservada: 50,
          unidadeMedida: 'unidades',
          custoUnitario: 2.50,
          custoTotal: formData.quantidade * 12 * 2.50,
          leadTime: 1,
          fornecedor: 'Avicultura São José',
          disponibilidade: formData.quantidade * 12 > 250 ? 'parcial' : 'disponivel'
        }
      ];
      setMateriais(mockMaterials);
    }
  }, [formData.produto, formData.quantidade]);
  
  // Load operations when routing is selected
  useEffect(() => {
    if (formData.roteiro) {
      const roteiro = roteiros.find(r => r.id === formData.roteiro);
      if (roteiro) {
        setRoteiroSelecionado(roteiro as RoteiroInfo);
        
        // Simulate loading operations
        const mockOperacoes: OperacaoPlaneada[] = [
          {
            id: 'op-1',
            sequencia: 1,
            nome: 'Preparação de Ingredientes',
            descricao: 'Separação e pesagem de todos os ingredientes',
            centroTrabalho: 'Bancada Prep',
            tempoPreparacao: 10,
            tempoOperacao: 15 * formData.quantidade,
            tempoLimpeza: 5,
            custoHora: 120.00,
            eficienciaEsperada: 90,
            obrigatoria: true,
            paralela: false,
            dependencias: [],
            recursosNecessarios: {
              operadores: 1,
              ferramentas: ['Balança Digital', 'Tigelas'],
              qualificacoes: ['Básico Padaria']
            },
            capacidadeDisponivel: 85
          },
          {
            id: 'op-2',
            sequencia: 2,
            nome: 'Mistura da Massa',
            descricao: 'Misturar ingredientes secos e líquidos',
            centroTrabalho: 'Misturador Industrial',
            maquina: 'MIX-001',
            tempoPreparacao: 5,
            tempoOperacao: 20 * Math.ceil(formData.quantidade / 10),
            tempoLimpeza: 10,
            custoHora: 150.00,
            eficienciaEsperada: 95,
            obrigatoria: true,
            paralela: false,
            dependencias: ['op-1'],
            recursosNecessarios: {
              operadores: 1,
              ferramentas: ['Misturador', 'Raspadores'],
              qualificacoes: ['Operação Equipamentos']
            },
            capacidadeDisponivel: 70
          }
        ];
        
        // Calculate dates for operations
        let currentDate = formData.dataPrevisaoInicio;
        mockOperacoes.forEach(op => {
          op.dataInicioPrevista = currentDate;
          const tempoTotal = op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza;
          op.dataFimPrevista = addDays(currentDate, Math.ceil(tempoTotal / 480)); // 480 min = 8h/day
          currentDate = op.dataFimPrevista;
        });
        
        setOperacoesPlaneadas(mockOperacoes);
      }
    }
  }, [formData.roteiro, formData.quantidade, formData.dataPrevisaoInicio]);
  
  // Form validation
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.produto && formData.quantidade > 0 && formData.roteiro);
      case 2:
        return materiais.every(m => m.disponibilidade !== 'indisponivel');
      case 3:
        return true;
      default:
        return true;
    }
  };
  
  // Material availability check
  const checkMaterialAvailability = (material: Material) => {
    const disponivel = material.quantidadeDisponivel - material.quantidadeReservada;
    if (disponivel >= material.quantidadeNecessaria) {
      return { status: 'disponivel', message: 'Disponível' };
    } else if (disponivel > 0) {
      return { 
        status: 'parcial', 
        message: `Apenas ${disponivel} ${material.unidadeMedida} disponíveis` 
      };
    } else {
      return { 
        status: 'indisponivel', 
        message: `Indisponível. Prazo de entrega: ${material.leadTime} dias` 
      };
    }
  };
  
  // Capacity validation
  const validateCapacity = () => {
    const capacidadeIssues = operacoesPlaneadas
      .filter(op => op.capacidadeDisponivel && op.capacidadeDisponivel < 100)
      .map(op => ({
        operacao: op.nome,
        centroTrabalho: op.centroTrabalho,
        capacidadeDisponivel: op.capacidadeDisponivel ?? 0,
        impacto: (op.capacidadeDisponivel ?? 0) < 50 ? 'alto' : 'medio'
      }));
    
    setValidacaoCapacidade({
      temCapacidade: capacidadeIssues.length === 0,
      issues: capacidadeIssues,
      sugestoes: capacidadeIssues.length > 0 ? [
        'Considere dividir a produção em lotes menores',
        'Agende para períodos com menor ocupação',
        'Utilize turnos extras se disponível'
      ] : []
    });
    
    setShowCapacidadeDialog(true);
  };
  
  // Calculate totals
  const calcularTempoTotal = () => {
    return operacoesPlaneadas.reduce((total, op) => 
      total + op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza, 0
    );
  };
  
  const calcularCustoTotal = () => {
    const custoOperacoes = operacoesPlaneadas.reduce((total, op) => {
      const tempoTotal = op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza;
      return total + (tempoTotal / 60) * op.custoHora;
    }, 0);
    
    const custoMateriais = materiais.reduce((total, mat) => total + mat.custoTotal, 0);
    
    return custoOperacoes + custoMateriais;
  };
  
  // Form submission
  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios e verifique a disponibilidade de materiais",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const ordem = {
        ...formData,
        numero: `OP-2024-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
        status: 'planejada',
        materiaisNecessarios: materiais,
        operacoes: operacoesPlaneadas,
        custoEstimado: calcularCustoTotal(),
        tempoEstimado: calcularTempoTotal(),
        criadoEm: new Date().toISOString(),
        criadoPor: 'user'
      };
      
      console.log('Nova ordem:', ordem);
      
      toast({
        title: "Sucesso",
        description: `Ordem de produção ${ordem.numero} criada com sucesso`,
      });
      
      router.push('/producao/ordens');
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar ordem de produção",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Material management functions
  const adicionarMaterial = () => {
    if (!novoMaterial.materialId || novoMaterial.quantidade <= 0) {
      toast({
        title: "Erro",
        description: "Selecione um material e informe uma quantidade válida",
        variant: "destructive",
      });
      return;
    }

    const materialBase = materiaisDisponiveis.find(m => m.id === novoMaterial.materialId);
    if (!materialBase) return;

    // Check if material already exists
    const materialExistente = materiais.find(m => m.codigo === materialBase.codigo);
    if (materialExistente) {
      toast({
        title: "Material já adicionado",
        description: "Este material já foi adicionado à lista",
        variant: "destructive",
      });
      return;
    }

    const novoMaterialCompleto: Material = {
      id: `material-${Date.now()}`,
      codigo: materialBase.codigo,
      nome: materialBase.nome,
      quantidadeNecessaria: novoMaterial.quantidade,
      quantidadeDisponivel: materialBase.estoque,
      quantidadeReservada: Math.min(novoMaterial.quantidade, materialBase.estoque * 0.1), // 10% reserved
      unidadeMedida: novoMaterial.unidade,
      custoUnitario: materialBase.custoUnitario,
      custoTotal: novoMaterial.quantidade * materialBase.custoUnitario,
      leadTime: materialBase.leadTime,
      fornecedor: materialBase.fornecedor,
      disponibilidade: materialBase.estoque >= novoMaterial.quantidade ? 'disponivel' : 
                      materialBase.estoque > 0 ? 'parcial' : 'indisponivel'
    };

    setMateriais([...materiais, novoMaterialCompleto]);
    setNovoMaterial({ materialId: '', quantidade: 0, unidade: 'kg' });
    setShowMaterialDialog(false);

    toast({
      title: "Material adicionado",
      description: `${materialBase.nome} foi adicionado à lista de materiais`,
    });
  };

  const removerMaterial = (materialId: string) => {
    setMateriais(materiais.filter(m => m.id !== materialId));
    toast({
      title: "Material removido",
      description: "Material removido da lista",
    });
  };

  // Get availability badge
  const getDisponibilidadeBadge = (status: string) => {
    switch (status) {
      case 'disponivel':
        return <Badge className="bg-green-100 text-green-800">Disponível</Badge>;
      case 'parcial':
        return <Badge className="bg-yellow-100 text-yellow-800">Parcial</Badge>;
      case 'indisponivel':
        return <Badge className="bg-red-100 text-red-800">Indisponível</Badge>;
      default:
        return null;
    }
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/producao/ordens">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Nova Ordem de Produção</h1>
            <p className="text-muted-foreground">Criação de nova ordem de fabrico</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => validateCapacity()}
            disabled={!operacoesPlaneadas.length}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Validar Capacidade
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !validateStep(1) || !validateStep(2)}
          >
            {isLoading ? (
              <>Criando...</>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Criar Ordem
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
          <span className="ml-2 font-medium">Dados da Ordem</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            2
          </div>
          <span className="ml-2 font-medium">Materiais</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            3
          </div>
          <span className="ml-2 font-medium">Planeamento</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center ${currentStep >= 4 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentStep >= 4 ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            4
          </div>
          <span className="ml-2 font-medium">Revisão</span>
        </div>
      </div>
      
      {/* Step 1: Order Data */}
      {currentStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  Informações da Ordem
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="produto">Produto *</Label>
                    <Select
                      value={formData.produto}
                      onValueChange={(value) => setFormData({ ...formData, produto: value })}
                    >
                      <SelectTrigger id="produto">
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map(prod => (
                          <SelectItem key={prod.id} value={prod.id}>
                            {prod.nome} ({prod.codigo})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="quantidade">Quantidade *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="quantidade"
                        type="number"
                        min="1"
                        value={formData.quantidade}
                        onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })}
                      />
                      <Select
                        value={formData.unidadeMedida}
                        onValueChange={(value) => setFormData({ ...formData, unidadeMedida: value })}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unidades">Unidades</SelectItem>
                          <SelectItem value="kg">Kg</SelectItem>
                          <SelectItem value="litros">Litros</SelectItem>
                          <SelectItem value="metros">Metros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="roteiro">Roteiro de Produção *</Label>
                  <Select
                    value={formData.roteiro}
                    onValueChange={(value) => setFormData({ ...formData, roteiro: value })}
                  >
                    <SelectTrigger id="roteiro">
                      <SelectValue placeholder="Selecione o roteiro" />
                    </SelectTrigger>
                    <SelectContent>
                      {roteiros.map(rot => (
                        <SelectItem key={rot.id} value={rot.id}>
                          {rot.nome} ({rot.codigo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="prioridade">Prioridade</Label>
                    <Select
                      value={formData.prioridade}
                      onValueChange={(value) => setFormData({ ...formData, prioridade: value })}
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
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data Previsão Início *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.dataPrevisaoInicio && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.dataPrevisaoInicio ? 
                            format(formData.dataPrevisaoInicio, "dd/MM/yyyy", { locale: pt }) 
                            : <span>Selecione a data</span>
                          }
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.dataPrevisaoInicio}
                          onSelect={(date) => date && setFormData({ ...formData, dataPrevisaoInicio: date })}
                          initialFocus
                          locale={pt}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div>
                    <Label>Data Previsão Fim *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.dataPrevisaoFim && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.dataPrevisaoFim ? 
                            format(formData.dataPrevisaoFim, "dd/MM/yyyy", { locale: pt }) 
                            : <span>Selecione a data</span>
                          }
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.dataPrevisaoFim}
                          onSelect={(date) => date && setFormData({ ...formData, dataPrevisaoFim: date })}
                          initialFocus
                          locale={pt}
                          disabled={(date) => isBefore(date, formData.dataPrevisaoInicio)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <Label htmlFor="pedidoVenda">Pedido de Venda (Opcional)</Label>
                  <Select
                    value={formData.pedidoVenda}
                    onValueChange={(value) => {
                      const pedido = pedidosVenda.find(p => p.id === value);
                      if (pedido) {
                        setFormData({ 
                          ...formData, 
                          pedidoVenda: value,
                          produto: produtos.find(p => p.nome === pedido.produto)?.id || '',
                          quantidade: pedido.quantidade
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="pedidoVenda">
                      <SelectValue placeholder="Vincular a pedido de venda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {pedidosVenda.map(pedido => (
                        <SelectItem key={pedido.id} value={pedido.id}>
                          {pedido.numero} - {pedido.cliente} ({pedido.quantidade} un)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lote">Lote</Label>
                    <Input
                      id="lote"
                      value={formData.lote}
                      onChange={(e) => setFormData({ ...formData, lote: e.target.value })}
                      placeholder="Número do lote"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="numeroSerie">Número de Série</Label>
                    <Input
                      id="numeroSerie"
                      value={formData.numeroSerie}
                      onChange={(e) => setFormData({ ...formData, numeroSerie: e.target.value })}
                      placeholder="Número de série"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    placeholder="Observações adicionais sobre a ordem..."
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
          </div>
          
          <div className="lg:col-span-1">
            {roteiroSelecionado && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Informações do Roteiro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-500">Roteiro</Label>
                    <p className="font-medium">{roteiroSelecionado.nome}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Tempo Estimado</Label>
                    <p className="font-medium">{roteiroSelecionado.tempoTotalEstimado} min</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Custo Base</Label>
                    <p className="font-medium">MT {roteiroSelecionado.custoTotalEstimado.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Eficiência</Label>
                    <p className="font-medium">{roteiroSelecionado.eficienciaGlobal}%</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
      
      {/* Step 2: Materials */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Materiais Necessários
            </CardTitle>
            <div className="flex items-center justify-between mt-2">
              <p className="text-sm text-muted-foreground">
                Verificação de disponibilidade e reserva de materiais
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowMaterialDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Material
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {materiais.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Nenhum material configurado</p>
              </div>
            ) : (
              <div className="space-y-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Qtd Necessária</TableHead>
                      <TableHead>Disponível</TableHead>
                      <TableHead>Reservada</TableHead>
                      <TableHead>Custo Unit.</TableHead>
                      <TableHead>Custo Total</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materiais.map((material) => {
                      const availability = checkMaterialAvailability(material);
                      return (
                        <TableRow key={material.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{material.nome}</div>
                              <div className="text-sm text-gray-500">{material.codigo}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {material.quantidadeNecessaria} {material.unidadeMedida}
                          </TableCell>
                          <TableCell>
                            {material.quantidadeDisponivel} {material.unidadeMedida}
                          </TableCell>
                          <TableCell>
                            {material.quantidadeReservada} {material.unidadeMedida}
                          </TableCell>
                          <TableCell>MT {material.custoUnitario.toFixed(2)}</TableCell>
                          <TableCell>MT {material.custoTotal.toFixed(2)}</TableCell>
                          <TableCell>{material.leadTime} dias</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {getDisponibilidadeBadge(availability.status)}
                              <p className="text-xs text-gray-500">{availability.message}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => removerMaterial(material.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Total Materiais</p>
                        <p className="text-2xl font-bold">{materiais.length}</p>
                      </div>
                    </div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">Custo Materiais</p>
                        <p className="text-2xl font-bold">
                          MT {materiais.reduce((sum, m) => sum + m.custoTotal, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      {materiais.every(m => m.disponibilidade === 'disponivel') ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">Disponibilidade</p>
                        <p className="text-lg font-bold">
                          {materiais.filter(m => m.disponibilidade === 'disponivel').length}/{materiais.length} OK
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
                
                {materiais.some(m => m.disponibilidade !== 'disponivel') && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-800">Atenção: Materiais com disponibilidade limitada</p>
                      <p className="text-yellow-700 mt-1">
                        Alguns materiais não estão totalmente disponíveis. Considere ajustar quantidades ou prazos.
                      </p>
                    </div>
                  </div>
                )}
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
      
      {/* Step 3: Planning */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Planeamento de Operações
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Sequência de operações e alocação de recursos
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {operacoesPlaneadas.length === 0 ? (
              <div className="text-center py-8">
                <Factory className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma operação planeada</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {operacoesPlaneadas.map((operacao, index) => (
                    <div key={operacao.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
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
                                <span className="text-gray-500">Tempo Total:</span>
                                <span className="font-medium ml-1">
                                  {operacao.tempoPreparacao + operacao.tempoOperacao + operacao.tempoLimpeza} min
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Custo/h:</span>
                                <span className="font-medium ml-1">MT {operacao.custoHora.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Início:</span>
                                <span className="font-medium ml-1">
                                  {operacao.dataInicioPrevista && 
                                    format(operacao.dataInicioPrevista, "dd/MM", { locale: pt })
                                  }
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">Fim:</span>
                                <span className="font-medium ml-1">
                                  {operacao.dataFimPrevista && 
                                    format(operacao.dataFimPrevista, "dd/MM", { locale: pt })
                                  }
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1 text-sm">
                                <Users className="h-4 w-4 text-gray-500" />
                                <span>{operacao.recursosNecessarios.operadores} operador(es)</span>
                              </div>
                              {operacao.maquina && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Settings className="h-4 w-4 text-gray-500" />
                                  <span>{operacao.maquina}</span>
                                </div>
                              )}
                              {operacao.capacidadeDisponivel && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Target className="h-4 w-4 text-gray-500" />
                                  <span className={
                                    operacao.capacidadeDisponivel < 50 ? 'text-red-600' : 
                                    operacao.capacidadeDisponivel < 80 ? 'text-yellow-600' : 
                                    'text-green-600'
                                  }>
                                    {operacao.capacidadeDisponivel}% capacidade
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <Timer className="h-5 w-5 text-blue-500" />
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
                        <p className="text-sm font-medium">Custo Operações</p>
                        <p className="text-2xl font-bold">
                          MT {operacoesPlaneadas.reduce((total, op) => {
                            const tempoTotal = op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza;
                            return total + (tempoTotal / 60) * op.custoHora;
                          }, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">Prazo</p>
                        <p className="text-lg font-bold">
                          {differenceInDays(formData.dataPrevisaoFim, formData.dataPrevisaoInicio)} dias
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              </>
            )}
            
            <div className="flex justify-between">
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
      
      {/* Step 4: Review */}
      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Revisão Final
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Informações da Ordem</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Produto:</span>
                  <span className="font-medium ml-2">
                    {produtos.find(p => p.id === formData.produto)?.nome || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Quantidade:</span>
                  <span className="font-medium ml-2">
                    {formData.quantidade} {formData.unidadeMedida}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Prioridade:</span>
                  <Badge className="ml-2">{formData.prioridade}</Badge>
                </div>
                <div>
                  <span className="text-gray-500">Início:</span>
                  <span className="font-medium ml-2">
                    {format(formData.dataPrevisaoInicio, "dd/MM/yyyy", { locale: pt })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Fim:</span>
                  <span className="font-medium ml-2">
                    {format(formData.dataPrevisaoFim, "dd/MM/yyyy", { locale: pt })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Responsável:</span>
                  <span className="font-medium ml-2">{formData.responsavel || '-'}</span>
                </div>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="font-semibold mb-3">Resumo de Custos</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Custo de Materiais:</span>
                  <span className="font-medium">
                    MT {materiais.reduce((sum, m) => sum + m.custoTotal, 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Custo de Operações:</span>
                  <span className="font-medium">
                    MT {operacoesPlaneadas.reduce((total, op) => {
                      const tempoTotal = op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza;
                      return total + (tempoTotal / 60) * op.custoHora;
                    }, 0).toFixed(2)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Custo Total Estimado:</span>
                  <span>MT {calcularCustoTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="font-semibold mb-3">Status de Validação</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {materiais.every(m => m.disponibilidade === 'disponivel') ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  <span>Disponibilidade de Materiais</span>
                </div>
                <div className="flex items-center gap-2">
                  {operacoesPlaneadas.every(op => !op.capacidadeDisponivel || op.capacidadeDisponivel >= 50) ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  <span>Capacidade de Produção</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Prazo de Entrega</span>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800">Ordem pronta para criação</p>
                <p className="text-blue-700 mt-1">
                  A ordem será criada com status "Planejada". Você poderá liberá-la para produção após revisão.
                </p>
              </div>
            </div>
            
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
                    Criar Ordem de Produção
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Material Dialog */}
      <Dialog open={showMaterialDialog} onOpenChange={setShowMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Material</DialogTitle>
            <DialogDescription>
              Adicione um material adicional à ordem de produção
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Material *</Label>
              <Select
                value={novoMaterial.materialId}
                onValueChange={(value) => setNovoMaterial({ ...novoMaterial, materialId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o material" />
                </SelectTrigger>
                <SelectContent>
                  {materiaisDisponiveis
                    .filter(mat => !materiais.some(m => m.codigo === mat.codigo))
                    .map(material => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.nome} ({material.codigo}) - Estoque: {material.estoque}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {novoMaterial.materialId && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                  {(() => {
                    const material = materiaisDisponiveis.find(m => m.id === novoMaterial.materialId);
                    return material && (
                      <div className="space-y-1">
                        <p><span className="font-medium">Fornecedor:</span> {material.fornecedor}</p>
                        <p><span className="font-medium">Custo:</span> MT {material.custoUnitario.toFixed(2)}</p>
                        <p><span className="font-medium">Lead Time:</span> {material.leadTime} dias</p>
                        <p><span className="font-medium">Estoque:</span> {material.estoque} unidades</p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantidade *</Label>
                <Input 
                  type="number" 
                  placeholder="0"
                  min="0.01"
                  step="0.01"
                  value={novoMaterial.quantidade || ''}
                  onChange={(e) => setNovoMaterial({ 
                    ...novoMaterial, 
                    quantidade: parseFloat(e.target.value) || 0 
                  })}
                />
                {novoMaterial.materialId && novoMaterial.quantidade > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Custo total: MT {(novoMaterial.quantidade * 
                      (materiaisDisponiveis.find(m => m.id === novoMaterial.materialId)?.custoUnitario || 0)
                    ).toFixed(2)}
                  </p>
                )}
              </div>
              <div>
                <Label>Unidade</Label>
                <Select
                  value={novoMaterial.unidade}
                  onValueChange={(value) => setNovoMaterial({ ...novoMaterial, unidade: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="g">Gramas</SelectItem>
                    <SelectItem value="l">Litros</SelectItem>
                    <SelectItem value="ml">Mililitros</SelectItem>
                    <SelectItem value="un">Unidades</SelectItem>
                    <SelectItem value="m">Metros</SelectItem>
                    <SelectItem value="cm">Centímetros</SelectItem>
                    <SelectItem value="m2">Metros²</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {novoMaterial.materialId && novoMaterial.quantidade > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800">Verificação de Disponibilidade</p>
                    {(() => {
                      const material = materiaisDisponiveis.find(m => m.id === novoMaterial.materialId);
                      if (!material) return null;
                      
                      if (material.estoque >= novoMaterial.quantidade) {
                        return (
                          <p className="text-green-700 mt-1">
                            ✓ Material disponível em estoque
                          </p>
                        );
                      } else if (material.estoque > 0) {
                        return (
                          <p className="text-yellow-700 mt-1">
                            ⚠ Apenas {material.estoque} unidades disponíveis. 
                            Faltam {novoMaterial.quantidade - material.estoque} unidades.
                          </p>
                        );
                      } else {
                        return (
                          <p className="text-red-700 mt-1">
                            ✗ Material não disponível em estoque. Lead time: {material.leadTime} dias.
                          </p>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowMaterialDialog(false);
                setNovoMaterial({ materialId: '', quantidade: 0, unidade: 'kg' });
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={adicionarMaterial}
              disabled={!novoMaterial.materialId || novoMaterial.quantidade <= 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Capacity Dialog */}
      <Dialog open={showCapacidadeDialog} onOpenChange={setShowCapacidadeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Validação de Capacidade</DialogTitle>
            <DialogDescription>
              Análise da disponibilidade de recursos para a ordem de produção
            </DialogDescription>
          </DialogHeader>
          
          {validacaoCapacidade && (
            <div className="space-y-4">
              {validacaoCapacidade.temCapacidade ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-green-800">Capacidade Disponível</p>
                    <p className="text-green-700 mt-1">
                      Todos os recursos necessários estão disponíveis para o período solicitado.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800">Restrições de Capacidade Identificadas</p>
                        <p className="text-yellow-700 mt-1">
                          Alguns recursos possuem disponibilidade limitada no período.
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-4 space-y-2">
                      {validacaoCapacidade.issues.map((issue: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-yellow-100 rounded">
                          <div>
                            <p className="font-medium text-sm">{issue.operacao}</p>
                            <p className="text-xs text-gray-600">{issue.centroTrabalho}</p>
                          </div>
                          <Badge className={
                            issue.impacto === 'alto' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                          }>
                            {issue.capacidadeDisponivel}% disponível
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {validacaoCapacidade.sugestoes.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Sugestões</h4>
                      <ul className="space-y-1">
                        {validacaoCapacidade.sugestoes.map((sugestao: string, index: number) => (
                          <li key={index} className="flex items-start gap-2 text-sm">
                            <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5" />
                            <span>{sugestao}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCapacidadeDialog(false)}>
              Fechar
            </Button>
            {!validacaoCapacidade?.temCapacidade && (
              <Button onClick={() => {
                setShowCapacidadeDialog(false);
                // Implement rescheduling logic
              }}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Replanear
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
