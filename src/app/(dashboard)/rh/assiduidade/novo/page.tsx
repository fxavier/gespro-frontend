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
import { format, addDays, differenceInMinutes, parse, isValid } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Plus,
  Save,
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
  Info,
  Search,
  Timer,
  User,
  Building,
  MapPin,
  Smartphone,
  QrCode,
  Camera,
  Upload,
  Download,
  FileText,
  Settings,
  X,
  Eye,
  Edit,
  Trash2,
  PlayCircle,
  PauseCircle,
  StopCircle,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

interface Colaborador {
  id: string;
  codigo: string;
  nome: string;
  departamento: string;
  cargo: string;
  foto?: string;
  status: 'activo' | 'inactivo' | 'ferias' | 'afastado';
}

interface RegistroAssiduidade {
  id: string;
  colaboradorId: string;
  data: string;
  entrada: string;
  saidaAlmoco?: string;
  retornoAlmoco?: string;
  saida: string;
  horasTrabalhadas: number;
  horasExtras: number;
  atrasos: number;
  tipo: 'normal' | 'feriado' | 'fim_semana' | 'ferias' | 'ausencia';
  observacoes?: string;
  localizacao?: {
    latitude: number;
    longitude: number;
    endereco: string;
  };
  metodoRegistro: 'manual' | 'biometrico' | 'qr_code' | 'mobile' | 'cartao';
  aprovadoPor?: string;
  dataAprovacao?: string;
}

interface RegistroTempo {
  tipo: 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';
  hora: string;
  localizacao?: {
    latitude: number;
    longitude: number;
    endereco: string;
  };
  metodo: 'manual' | 'biometrico' | 'qr_code' | 'mobile' | 'cartao';
}

export default function NovaAssiduidadePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    data: new Date(),
    tipoRegistro: 'individual', // individual | bulk | import
    metodoRegistro: 'manual',
    observacoes: '',
  });
  
  // Individual registration
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<Colaborador | null>(null);
  const [registrosTempo, setRegistrosTempo] = useState<RegistroTempo[]>([]);
  const [registroAtual, setRegistroAtual] = useState<RegistroTempo>({
    tipo: 'entrada',
    hora: '',
    metodo: 'manual'
  });
  
  // Bulk registration
  const [colaboradoresSelecionados, setColaboradoresSelecionados] = useState<string[]>([]);
  const [horarioPadrao, setHorarioPadrao] = useState({
    entrada: '08:00',
    saidaAlmoco: '12:00',
    retornoAlmoco: '13:00',
    saida: '17:00'
  });
  
  // Location tracking
  const [localizacaoAtual, setLocalizacaoAtual] = useState<{
    latitude: number;
    longitude: number;
    endereco: string;
  } | null>(null);
  
  // Mock data
  const colaboradores: Colaborador[] = [
    {
      id: '1',
      codigo: 'COL-001',
      nome: 'João Silva',
      departamento: 'Tecnologia',
      cargo: 'Desenvolvedor Senior',
      status: 'activo'
    },
    {
      id: '2',
      codigo: 'COL-002',
      nome: 'Maria Santos',
      departamento: 'Recursos Humanos',
      cargo: 'Analista de RH',
      status: 'activo'
    },
    {
      id: '3',
      codigo: 'COL-003',
      nome: 'Carlos Pereira',
      departamento: 'Vendas',
      cargo: 'Consultor Comercial',
      status: 'activo'
    },
    {
      id: '4',
      codigo: 'COL-004',
      nome: 'Ana Costa',
      departamento: 'Financeiro',
      cargo: 'Contabilista',
      status: 'ferias'
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
  
  const departamentos = ['Todos', 'Tecnologia', 'Recursos Humanos', 'Vendas', 'Financeiro', 'Operações'];
  
  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocalizacaoAtual({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            endereco: 'Maputo, Moçambique' // Simulate reverse geocoding
          });
        },
        (error) => {
          console.log('Location error:', error);
        }
      );
    }
  }, []);
  
  // Time calculations
  const calcularHorasTrabalhadas = (registros: RegistroTempo[]) => {
    const entrada = registros.find(r => r.tipo === 'entrada');
    const saida = registros.find(r => r.tipo === 'saida');
    const saidaAlmoco = registros.find(r => r.tipo === 'saida_almoco');
    const retornoAlmoco = registros.find(r => r.tipo === 'retorno_almoco');
    
    if (!entrada || !saida) return 0;
    
    const horaEntrada = parse(entrada.hora, 'HH:mm', new Date());
    const horaSaida = parse(saida.hora, 'HH:mm', new Date());
    
    let totalMinutos = differenceInMinutes(horaSaida, horaEntrada);
    
    // Subtract lunch break if both times are provided
    if (saidaAlmoco && retornoAlmoco) {
      const horaSaidaAlmoco = parse(saidaAlmoco.hora, 'HH:mm', new Date());
      const horaRetornoAlmoco = parse(retornoAlmoco.hora, 'HH:mm', new Date());
      const minutosAlmoco = differenceInMinutes(horaRetornoAlmoco, horaSaidaAlmoco);
      totalMinutos -= minutosAlmoco;
    }
    
    return Math.max(0, totalMinutos / 60);
  };
  
  const calcularHorasExtras = (horasTrabalhadas: number) => {
    const horasNormais = 8; // 8 hours normal workday
    return Math.max(0, horasTrabalhadas - horasNormais);
  };
  
  const calcularAtrasos = (registros: RegistroTempo[]) => {
    const entrada = registros.find(r => r.tipo === 'entrada');
    if (!entrada) return 0;
    
    const horaEntrada = parse(entrada.hora, 'HH:mm', new Date());
    const horaLimite = parse('08:00', 'HH:mm', new Date()); // 8 AM limit
    
    if (horaEntrada > horaLimite) {
      return differenceInMinutes(horaEntrada, horaLimite);
    }
    
    return 0;
  };
  
  // Registration functions
  const adicionarRegistroTempo = () => {
    if (!registroAtual.hora) {
      toast({
        title: "Erro",
        description: "Informe a hora do registro",
        variant: "destructive",
      });
      return;
    }
    
    // Check if this type already exists
    const existeRegistro = registrosTempo.find(r => r.tipo === registroAtual.tipo);
    if (existeRegistro) {
      toast({
        title: "Registro já existe",
        description: "Já existe um registro para este tipo. Edite ou remova primeiro.",
        variant: "destructive",
      });
      return;
    }
    
    const novoRegistro = {
      ...registroAtual,
      localizacao: localizacaoAtual || undefined
    };
    
    setRegistrosTempo([...registrosTempo, novoRegistro]);
    setRegistroAtual({
      tipo: getProximoTipo(registroAtual.tipo),
      hora: '',
      metodo: registroAtual.metodo
    });
    
    toast({
      title: "Registro adicionado",
      description: `Registro de ${getTipoLabel(registroAtual.tipo)} adicionado com sucesso`,
    });
  };
  
  const getProximoTipo = (tipoAtual: RegistroTempo['tipo']): RegistroTempo['tipo'] => {
    const sequencia: RegistroTempo['tipo'][] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
    const indiceAtual = sequencia.indexOf(tipoAtual);
    return sequencia[indiceAtual + 1] || 'entrada';
  };
  
  const getTipoLabel = (tipo: RegistroTempo['tipo']) => {
    const labels = {
      entrada: 'Entrada',
      saida_almoco: 'Saída Almoço',
      retorno_almoco: 'Retorno Almoço',
      saida: 'Saída'
    };
    return labels[tipo];
  };
  
  const removerRegistroTempo = (tipo: RegistroTempo['tipo']) => {
    setRegistrosTempo(registrosTempo.filter(r => r.tipo !== tipo));
  };
  
  const registroRapido = (tipo: RegistroTempo['tipo']) => {
    const agora = new Date();
    const horaAtual = format(agora, 'HH:mm');
    
    const novoRegistro: RegistroTempo = {
      tipo,
      hora: horaAtual,
      metodo: formData.metodoRegistro as any,
      localizacao: localizacaoAtual || undefined
    };
    
    // Remove existing registration of same type
    const registrosAtualizados = registrosTempo.filter(r => r.tipo !== tipo);
    setRegistrosTempo([...registrosAtualizados, novoRegistro]);
    
    toast({
      title: "Registro rápido",
      description: `${getTipoLabel(tipo)} registrada às ${horaAtual}`,
    });
  };
  
  // Bulk registration
  const aplicarHorarioPadrao = () => {
    if (colaboradoresSelecionados.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos um colaborador",
        variant: "destructive",
      });
      return;
    }
    
    // Create registrations for all selected employees
    toast({
      title: "Sucesso",
      description: `Horário padrão aplicado para ${colaboradoresSelecionados.length} colaborador(es)`,
    });
  };
  
  // Form submission
  const handleSubmit = async () => {
    if (formData.tipoRegistro === 'individual') {
      if (!colaboradorSelecionado) {
        toast({
          title: "Erro",
          description: "Selecione um colaborador",
          variant: "destructive",
        });
        return;
      }
      
      if (registrosTempo.length === 0) {
        toast({
          title: "Erro",
          description: "Adicione pelo menos um registro de tempo",
          variant: "destructive",
        });
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (formData.tipoRegistro === 'individual') {
        const horasTrabalhadas = calcularHorasTrabalhadas(registrosTempo);
        const horasExtras = calcularHorasExtras(horasTrabalhadas);
        const atrasos = calcularAtrasos(registrosTempo);
        
        const registro: Partial<RegistroAssiduidade> = {
          colaboradorId: colaboradorSelecionado!.id,
          data: format(formData.data, 'yyyy-MM-dd'),
          entrada: registrosTempo.find(r => r.tipo === 'entrada')?.hora || '',
          saidaAlmoco: registrosTempo.find(r => r.tipo === 'saida_almoco')?.hora,
          retornoAlmoco: registrosTempo.find(r => r.tipo === 'retorno_almoco')?.hora,
          saida: registrosTempo.find(r => r.tipo === 'saida')?.hora || '',
          horasTrabalhadas,
          horasExtras,
          atrasos,
          tipo: 'normal',
          observacoes: formData.observacoes,
          metodoRegistro: formData.metodoRegistro as any,
          localizacao: localizacaoAtual || undefined
        };
        
        console.log('Novo registro:', registro);
      }
      
      toast({
        title: "Sucesso",
        description: "Registro de assiduidade criado com sucesso",
      });
      
      router.push('/rh/assiduidade');
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar registro de assiduidade",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // QR Code functionality
  const gerarQRCode = () => {
    setShowQRDialog(true);
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/rh/assiduidade">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Novo Registro de Assiduidade</h1>
            <p className="text-muted-foreground">Registrar presença e horários de trabalho</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={gerarQRCode}
          >
            <QrCode className="mr-2 h-4 w-4" />
            QR Code
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>Salvando...</>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Registro
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Configurações do Registro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data do Registro</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.data && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.data ? 
                          format(formData.data, "dd/MM/yyyy", { locale: pt }) 
                          : <span>Selecione a data</span>
                        }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.data}
                        onSelect={(date) => date && setFormData({ ...formData, data: date })}
                        initialFocus
                        locale={pt}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <Label>Método de Registro</Label>
                  <Select
                    value={formData.metodoRegistro}
                    onValueChange={(value) => setFormData({ ...formData, metodoRegistro: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="biometrico">Biométrico</SelectItem>
                      <SelectItem value="qr_code">QR Code</SelectItem>
                      <SelectItem value="mobile">App Mobile</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label>Tipo de Registro</Label>
                <Select
                  value={formData.tipoRegistro}
                  onValueChange={(value) => setFormData({ ...formData, tipoRegistro: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Registro Individual</SelectItem>
                    <SelectItem value="bulk">Registro em Lote</SelectItem>
                    <SelectItem value="import">Importar Arquivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {localizacaoAtual && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-800">Localização Detectada</p>
                      <p className="text-blue-700">{localizacaoAtual.endereco}</p>
                      <p className="text-xs text-blue-600 mt-1">
                        Lat: {localizacaoAtual.latitude.toFixed(6)}, 
                        Lng: {localizacaoAtual.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Individual Registration */}
          {formData.tipoRegistro === 'individual' && (
            <>
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Seleção de Colaborador
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>Colaborador</Label>
                      <Select
                        value={colaboradorSelecionado?.id || ''}
                        onValueChange={(value) => {
                          const colaborador = colaboradores.find(c => c.id === value);
                          setColaboradorSelecionado(colaborador || null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o colaborador" />
                        </SelectTrigger>
                        <SelectContent>
                          {colaboradores
                            .filter(c => c.status === 'activo')
                            .map(colaborador => (
                              <SelectItem key={colaborador.id} value={colaborador.id}>
                                {colaborador.nome} ({colaborador.codigo}) - {colaborador.departamento}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {colaboradorSelecionado && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                            <User className="h-6 w-6 text-gray-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{colaboradorSelecionado.nome}</h3>
                            <p className="text-sm text-gray-600">{colaboradorSelecionado.cargo}</p>
                            <p className="text-sm text-gray-500">{colaboradorSelecionado.departamento}</p>
                          </div>
                          <div className="ml-auto">
                            <Badge>{colaboradorSelecionado.status}</Badge>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="h-5 w-5" />
                    Registros de Tempo
                  </CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registroRapido('entrada')}
                    >
                      <PlayCircle className="mr-1 h-3 w-3" />
                      Entrada
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registroRapido('saida_almoco')}
                    >
                      <PauseCircle className="mr-1 h-3 w-3" />
                      Saída Almoço
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registroRapido('retorno_almoco')}
                    >
                      <PlayCircle className="mr-1 h-3 w-3" />
                      Retorno
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registroRapido('saida')}
                    >
                      <StopCircle className="mr-1 h-3 w-3" />
                      Saída
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Tipo de Registro</Label>
                      <Select
                        value={registroAtual.tipo}
                        onValueChange={(value) => setRegistroAtual({ ...registroAtual, tipo: value as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida_almoco">Saída Almoço</SelectItem>
                          <SelectItem value="retorno_almoco">Retorno Almoço</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Hora</Label>
                      <Input
                        type="time"
                        value={registroAtual.hora}
                        onChange={(e) => setRegistroAtual({ ...registroAtual, hora: e.target.value })}
                      />
                    </div>
                    
                    <div className="flex items-end">
                      <Button onClick={adicionarRegistroTempo} className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                  
                  {registrosTempo.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-medium mb-3">Registros Adicionados</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Hora</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Localização</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {registrosTempo.map((registro, index) => (
                            <TableRow key={index}>
                              <TableCell>{getTipoLabel(registro.tipo)}</TableCell>
                              <TableCell className="font-mono">{registro.hora}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{registro.metodo}</Badge>
                              </TableCell>
                              <TableCell>
                                {registro.localizacao ? (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-green-500" />
                                    <span className="text-xs">Detectada</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-500">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removerRegistroTempo(registro.tipo)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
          
          {/* Bulk Registration */}
          {formData.tipoRegistro === 'bulk' && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Registro em Lote
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkDialog(true)}
                  className="ml-auto"
                >
                  Selecionar Colaboradores
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Hora de Entrada</Label>
                    <Input
                      type="time"
                      value={horarioPadrao.entrada}
                      onChange={(e) => setHorarioPadrao({ ...horarioPadrao, entrada: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora de Saída</Label>
                    <Input
                      type="time"
                      value={horarioPadrao.saida}
                      onChange={(e) => setHorarioPadrao({ ...horarioPadrao, saida: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Saída Almoço</Label>
                    <Input
                      type="time"
                      value={horarioPadrao.saidaAlmoco}
                      onChange={(e) => setHorarioPadrao({ ...horarioPadrao, saidaAlmoco: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Retorno Almoço</Label>
                    <Input
                      type="time"
                      value={horarioPadrao.retornoAlmoco}
                      onChange={(e) => setHorarioPadrao({ ...horarioPadrao, retornoAlmoco: e.target.value })}
                    />
                  </div>
                </div>
                
                {colaboradoresSelecionados.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="font-medium text-blue-800">
                      {colaboradoresSelecionados.length} colaborador(es) selecionado(s)
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      O horário padrão será aplicado a todos os colaboradores selecionados
                    </p>
                  </div>
                )}
                
                <Button onClick={aplicarHorarioPadrao} className="w-full">
                  Aplicar Horário Padrão
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Import */}
          {formData.tipoRegistro === 'import' && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Importar Arquivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">Arraste arquivos aqui ou clique para selecionar</p>
                  <p className="text-sm text-gray-500">Suporta: CSV, Excel (.xlsx)</p>
                  <Button variant="outline" className="mt-4">
                    Selecionar Arquivo
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Modelo
                  </Button>
                  <Button variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Instruções
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Observações adicionais sobre o registro..."
                rows={3}
              />
            </CardContent>
          </Card>
        </div>
        
        {/* Summary Panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Resumo do Registro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-gray-500">Data</Label>
                <p className="font-medium">{format(formData.data, "dd/MM/yyyy", { locale: pt })}</p>
              </div>
              
              <div>
                <Label className="text-sm text-gray-500">Método</Label>
                <p className="font-medium">{formData.metodoRegistro}</p>
              </div>
              
              {colaboradorSelecionado && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm text-gray-500">Colaborador</Label>
                    <p className="font-medium">{colaboradorSelecionado.nome}</p>
                    <p className="text-sm text-gray-600">{colaboradorSelecionado.cargo}</p>
                  </div>
                </>
              )}
              
              {registrosTempo.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm text-gray-500">Cálculos</Label>
                    <div className="space-y-2 mt-2">
                      <div className="flex justify-between text-sm">
                        <span>Horas Trabalhadas:</span>
                        <span className="font-medium">{calcularHorasTrabalhadas(registrosTempo).toFixed(2)}h</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Horas Extras:</span>
                        <span className="font-medium text-orange-600">{calcularHorasExtras(calcularHorasTrabalhadas(registrosTempo)).toFixed(2)}h</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Atrasos:</span>
                        <span className="font-medium text-red-600">{calcularAtrasos(registrosTempo)} min</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              {colaboradoresSelecionados.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm text-gray-500">Registro em Lote</Label>
                    <p className="font-medium">{colaboradoresSelecionados.length} colaboradores</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Bulk Selection Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecionar Colaboradores</DialogTitle>
            <DialogDescription>
              Escolha os colaboradores para aplicar o registro em lote
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColaboradoresSelecionados(colaboradores.filter(c => c.status === 'activo').map(c => c.id))}
              >
                Selecionar Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColaboradoresSelecionados([])}
              >
                Limpar Seleção
              </Button>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {colaboradores.filter(c => c.status === 'activo').map(colaborador => (
                <div key={colaborador.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                  <Checkbox
                    checked={colaboradoresSelecionados.includes(colaborador.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setColaboradoresSelecionados([...colaboradoresSelecionados, colaborador.id]);
                      } else {
                        setColaboradoresSelecionados(colaboradoresSelecionados.filter(id => id !== colaborador.id));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{colaborador.nome}</p>
                    <p className="text-sm text-gray-600">{colaborador.departamento} - {colaborador.cargo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setShowBulkDialog(false)}>
              Confirmar Seleção ({colaboradoresSelecionados.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code para Registro</DialogTitle>
            <DialogDescription>
              Colaboradores podem escanear este código para registrar presença
            </DialogDescription>
          </DialogHeader>
          
          <div className="text-center space-y-4">
            <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg mx-auto flex items-center justify-center">
              <QrCode className="h-24 w-24 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600">
              QR Code válido para: {format(formData.data, "dd/MM/yyyy", { locale: pt })}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Baixar
              </Button>
              <Button variant="outline" size="sm">
                <Smartphone className="mr-2 h-4 w-4" />
                Compartilhar
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowQRDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}