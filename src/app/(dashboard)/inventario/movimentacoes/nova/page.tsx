'use client';

import { Suspense, useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Save,
  Search,
  Package,
  ArrowRightLeft,
  MapPin,
  User,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle,
  QrCode,
  Scan
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TipoMovimentacao } from '@/types/inventario';

interface MovimentacaoForm {
  ativoId: string;
  tipo: TipoMovimentacao;
  localizacaoOrigem?: string;
  localizacaoDestino?: string;
  responsavelOrigem?: string;
  responsavelDestino?: string;
  dataMovimentacao: string;
  dataPrevisaoDevolucao?: string;
  motivo: string;
  observacoes: string;
  guiaMovimentacao: string;
}

interface Ativo {
  id: string;
  codigoInterno: string;
  nome: string;
  categoriaId: string;
  categoriaNome: string;
  estado: string;
  localizacaoId: string;
  localizacaoNome: string;
  responsavelId?: string;
  responsavelNome?: string;
  numeroSerie?: string;
  marca?: string;
  modelo?: string;
}

function NovaMovimentacaoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [ativoSelecionado, setAtivoSelecionado] = useState<Ativo | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<MovimentacaoForm>({
    ativoId: '',
    tipo: 'transferencia',
    localizacaoOrigem: '',
    localizacaoDestino: '',
    responsavelOrigem: '',
    responsavelDestino: '',
    dataMovimentacao: new Date().toISOString().split('T')[0],
    dataPrevisaoDevolucao: '',
    motivo: '',
    observacoes: '',
    guiaMovimentacao: '',
  });

  const updateFormData = (field: keyof MovimentacaoForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Dados de exemplo para os selects
  const ativos: Ativo[] = [
    {
      id: '1',
      codigoInterno: 'PC-001',
      nome: 'Computador Dell OptiPlex 3090',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      estado: 'em_uso',
      localizacaoId: '3',
      localizacaoNome: 'Departamento de TI',
      responsavelId: '1',
      responsavelNome: 'Carlos Fernandes',
      numeroSerie: 'DL3090-12345',
      marca: 'Dell',
      modelo: 'OptiPlex 3090'
    },
    {
      id: '2',
      codigoInterno: 'PORT-001',
      nome: 'Portátil Lenovo ThinkPad E15',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      estado: 'em_uso',
      localizacaoId: '2',
      localizacaoNome: 'Escritório Central',
      responsavelId: '2',
      responsavelNome: 'Maria Santos',
      numeroSerie: 'TP-E15-67890',
      marca: 'Lenovo',
      modelo: 'ThinkPad E15'
    },
    {
      id: '3',
      codigoInterno: 'VEI-001',
      nome: 'Toyota Hilux 2022',
      categoriaId: 'transporte',
      categoriaNome: 'Transporte',
      estado: 'em_uso',
      localizacaoId: '1',
      localizacaoNome: 'Armazém Principal',
      responsavelId: '3',
      responsavelNome: 'João Silva',
      numeroSerie: 'TH2022-ABC123',
      marca: 'Toyota',
      modelo: 'Hilux 2.4 4x4'
    },
    {
      id: '4',
      codigoInterno: 'IMP-001',
      nome: 'Impressora HP LaserJet Pro',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      estado: 'em_manutencao',
      localizacaoId: '2',
      localizacaoNome: 'Escritório Central',
      responsavelId: '4',
      responsavelNome: 'Ana Costa',
      numeroSerie: 'HP-LJ-54321',
      marca: 'HP',
      modelo: 'LaserJet Pro MFP M428fdw'
    },
    {
      id: '5',
      codigoInterno: 'MOB-001',
      nome: 'Mesa de Escritório Executive',
      categoriaId: 'mobiliario',
      categoriaNome: 'Mobiliário',
      estado: 'em_uso',
      localizacaoId: '6',
      localizacaoNome: 'Sala de Conferências',
      responsavelId: '5',
      responsavelNome: 'Sofia Nunes',
      marca: 'Office Furniture',
      modelo: 'Executive Plus 160cm'
    }
  ];

  const localizacoes = [
    { id: '1', nome: 'Armazém Principal' },
    { id: '2', nome: 'Escritório Central' },
    { id: '3', nome: 'Departamento de TI' },
    { id: '4', nome: 'Sala Diretoria' },
    { id: '5', nome: 'Área Técnica' },
    { id: '6', nome: 'Sala de Conferências' },
    { id: '7', nome: 'Receção' },
    { id: '8', nome: 'Arquivo' }
  ];

  const responsaveis = [
    { id: '1', nome: 'Carlos Fernandes' },
    { id: '2', nome: 'Maria Santos' },
    { id: '3', nome: 'João Silva' },
    { id: '4', nome: 'Ana Costa' },
    { id: '5', nome: 'Sofia Nunes' },
    { id: '6', nome: 'Pedro Machado' },
    { id: '7', nome: 'Diretor Geral' }
  ];

  const tiposMovimentacao = [
    { value: 'entrada', label: 'Entrada', description: 'Recebimento de novo ativo' },
    { value: 'saida', label: 'Saída', description: 'Remoção definitiva do ativo' },
    { value: 'transferencia', label: 'Transferência', description: 'Mudança de localização' },
    { value: 'emprestimo', label: 'Empréstimo', description: 'Empréstimo temporário' },
    { value: 'devolucao', label: 'Devolução', description: 'Retorno de empréstimo' },
    { value: 'baixa', label: 'Baixa', description: 'Baixa definitiva do ativo' },
    { value: 'ajuste', label: 'Ajuste', description: 'Correção de inventário' }
  ];

  // Filtrar ativos baseado na pesquisa
  const ativosFiltrados = ativos.filter(ativo => 
    ativo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ativo.codigoInterno.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ativo.numeroSerie && ativo.numeroSerie.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Gerar número de guia automaticamente
  const gerarGuiaMovimentacao = () => {
    const ano = new Date().getFullYear();
    const mes = String(new Date().getMonth() + 1).padStart(2, '0');
    const numero = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
    return `GM-${ano}-${mes}-${numero}`;
  };

  // Inicializar dados baseado nos parâmetros da URL
  useEffect(() => {
    const ativoId = searchParams.get('ativo');
    if (ativoId) {
      const ativo = ativos.find(a => a.id === ativoId);
      if (ativo) {
        setAtivoSelecionado(ativo);
        updateFormData('ativoId', ativo.id);
        updateFormData('localizacaoOrigem', ativo.localizacaoId);
        updateFormData('responsavelOrigem', ativo.responsavelId || '');
      }
    }
    
    // Gerar guia automaticamente
    updateFormData('guiaMovimentacao', gerarGuiaMovimentacao());
  }, [searchParams]);

  // Atualizar localizações baseado no tipo de movimentação
  useEffect(() => {
    if (ativoSelecionado) {
      const tipo = formData.tipo;
      
      if (tipo === 'entrada') {
        updateFormData('localizacaoOrigem', '');
        updateFormData('responsavelOrigem', '');
      } else if (tipo === 'saida' || tipo === 'baixa') {
        updateFormData('localizacaoOrigem', ativoSelecionado.localizacaoId);
        updateFormData('responsavelOrigem', ativoSelecionado.responsavelId || '');
        updateFormData('localizacaoDestino', '');
        updateFormData('responsavelDestino', '');
      } else {
        updateFormData('localizacaoOrigem', ativoSelecionado.localizacaoId);
        updateFormData('responsavelOrigem', ativoSelecionado.responsavelId || '');
      }
    }
  }, [formData.tipo, ativoSelecionado]);

  const handleSelecionarAtivo = (ativo: Ativo) => {
    setAtivoSelecionado(ativo);
    updateFormData('ativoId', ativo.id);
    updateFormData('localizacaoOrigem', ativo.localizacaoId);
    updateFormData('responsavelOrigem', ativo.responsavelId || '');
    setSearchTerm('');
  };

  const getTipoInfo = (tipo: TipoMovimentacao) => {
    const tipoInfo = tiposMovimentacao.find(t => t.value === tipo);
    return tipoInfo || tiposMovimentacao[0];
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!formData.ativoId) {
      newErrors.ativoId = 'Ativo é obrigatório';
    }
    if (!formData.tipo) {
      newErrors.tipo = 'Tipo de movimentação é obrigatório';
    }
    if (!formData.dataMovimentacao) {
      newErrors.dataMovimentacao = 'Data da movimentação é obrigatória';
    }
    if (!formData.motivo.trim()) {
      newErrors.motivo = 'Motivo é obrigatório';
    }
    
    const tipo = formData.tipo;
    
    // Validações específicas por tipo
    if (tipo === 'entrada') {
      if (!formData.localizacaoDestino) {
        newErrors.localizacaoDestino = 'Localização de destino é obrigatória para entrada';
      }
    } else if (tipo === 'saida' || tipo === 'baixa') {
      if (!formData.localizacaoOrigem) {
        newErrors.localizacaoOrigem = 'Localização de origem é obrigatória';
      }
    } else if (tipo === 'transferencia' || tipo === 'emprestimo' || tipo === 'devolucao') {
      if (!formData.localizacaoOrigem) {
        newErrors.localizacaoOrigem = 'Localização de origem é obrigatória';
      }
      if (!formData.localizacaoDestino) {
        newErrors.localizacaoDestino = 'Localização de destino é obrigatória';
      }
      if (formData.localizacaoOrigem === formData.localizacaoDestino) {
        newErrors.localizacaoDestino = 'Localização de destino deve ser diferente da origem';
      }
    }
    
    if (tipo === 'emprestimo' && !formData.dataPrevisaoDevolucao) {
      newErrors.dataPrevisaoDevolucao = 'Data prevista de devolução é obrigatória para empréstimos';
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
      
      console.log('Dados da movimentação:', {
        ...formData,
        ativoNome: ativoSelecionado?.nome,
        confirmada: false,
        criadoEm: new Date(),
        criadoPor: 'admin'
      });

      toast({
        title: "Movimentação criada com sucesso!",
        description: `Movimentação ${formData.guiaMovimentacao} foi registrada`,
      });

      router.push('/inventario/movimentacoes');
    } catch (error) {
      toast({
        title: "Erro ao criar movimentação",
        description: "Ocorreu um erro. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getEstadoBadgeColor = (estado: string) => {
    const colors = {
      novo: 'bg-blue-100 text-blue-800',
      em_uso: 'bg-green-100 text-green-800',
      em_manutencao: 'bg-yellow-100 text-yellow-800',
      obsoleto: 'bg-gray-100 text-gray-800',
      baixado: 'bg-red-100 text-red-800',
      em_transferencia: 'bg-orange-100 text-orange-800'
    };
    return colors[estado as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/inventario/movimentacoes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nova Movimentação</h1>
          <p className="text-muted-foreground">Registre uma nova movimentação de ativo</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Seleção de Ativo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Seleção de Ativo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!ativoSelecionado ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="searchAtivo">Pesquisar Ativo *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="searchAtivo"
                      placeholder="Digite o nome, código ou número de série..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`pl-10 ${errors.ativoId ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.ativoId && (
                    <p className="text-sm text-red-500">{errors.ativoId}</p>
                  )}
                </div>

                {searchTerm && (
                  <div className="border rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-sm font-medium">Ativos encontrados:</p>
                    {ativosFiltrados.length > 0 ? (
                      <div className="space-y-2">
                        {ativosFiltrados.map((ativo) => (
                          <div
                            key={ativo.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted cursor-pointer"
                            onClick={() => handleSelecionarAtivo(ativo)}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{ativo.nome}</span>
                                <Badge variant="outline">{ativo.codigoInterno}</Badge>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoBadgeColor(ativo.estado)}`}>
                                  {ativo.estado.replace('_', ' ').charAt(0).toUpperCase() + ativo.estado.replace('_', ' ').slice(1)}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <span>{ativo.marca} {ativo.modelo}</span>
                                {ativo.numeroSerie && <span> • S/N: {ativo.numeroSerie}</span>}
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span>{ativo.localizacaoNome}</span>
                                </div>
                                {ativo.responsavelNome && (
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    <span>{ativo.responsavelNome}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button type="button" size="sm">
                              Selecionar
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum ativo encontrado</p>
                    )}
                  </div>
                )}

                <div className="text-center">
                  <Button type="button" variant="outline" className="gap-2">
                    <Scan className="h-4 w-4" />
                    Escanear QR Code
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ativoSelecionado.nome}</span>
                    <Badge variant="outline">{ativoSelecionado.codigoInterno}</Badge>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoBadgeColor(ativoSelecionado.estado)}`}>
                      {ativoSelecionado.estado.replace('_', ' ').charAt(0).toUpperCase() + ativoSelecionado.estado.replace('_', ' ').slice(1)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span>{ativoSelecionado.marca} {ativoSelecionado.modelo}</span>
                    {ativoSelecionado.numeroSerie && <span> • S/N: {ativoSelecionado.numeroSerie}</span>}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{ativoSelecionado.localizacaoNome}</span>
                    </div>
                    {ativoSelecionado.responsavelNome && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{ativoSelecionado.responsavelNome}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAtivoSelecionado(null);
                    updateFormData('ativoId', '');
                    setSearchTerm('');
                  }}
                >
                  Alterar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações da Movimentação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Informações da Movimentação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guiaMovimentacao">Guia de Movimentação</Label>
                <Input
                  id="guiaMovimentacao"
                  value={formData.guiaMovimentacao}
                  onChange={(e) => updateFormData('guiaMovimentacao', e.target.value)}
                  placeholder="GM-2024-01-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Movimentação *</Label>
                <Select 
                  value={formData.tipo} 
                  onValueChange={(value: TipoMovimentacao) => updateFormData('tipo', value)}
                >
                  <SelectTrigger className={errors.tipo ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposMovimentacao.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        <div>
                          <div className="font-medium">{tipo.label}</div>
                          <div className="text-sm text-muted-foreground">{tipo.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.tipo && (
                  <p className="text-sm text-red-500">{errors.tipo}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataMovimentacao">Data da Movimentação *</Label>
                <Input
                  id="dataMovimentacao"
                  type="date"
                  value={formData.dataMovimentacao}
                  onChange={(e) => updateFormData('dataMovimentacao', e.target.value)}
                  className={errors.dataMovimentacao ? 'border-red-500' : ''}
                />
                {errors.dataMovimentacao && (
                  <p className="text-sm text-red-500">{errors.dataMovimentacao}</p>
                )}
              </div>
            </div>

            {formData.tipo === 'emprestimo' && (
              <div className="space-y-2">
                <Label htmlFor="dataPrevisaoDevolucao">Data Prevista de Devolução *</Label>
                <Input
                  id="dataPrevisaoDevolucao"
                  type="date"
                  value={formData.dataPrevisaoDevolucao}
                  onChange={(e) => updateFormData('dataPrevisaoDevolucao', e.target.value)}
                  className={errors.dataPrevisaoDevolucao ? 'border-red-500' : ''}
                />
                {errors.dataPrevisaoDevolucao && (
                  <p className="text-sm text-red-500">{errors.dataPrevisaoDevolucao}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo *</Label>
              <Textarea
                id="motivo"
                placeholder="Descreva o motivo da movimentação..."
                value={formData.motivo}
                onChange={(e) => updateFormData('motivo', e.target.value)}
                className={`resize-none ${errors.motivo ? 'border-red-500' : ''}`}
                rows={3}
              />
              {errors.motivo && (
                <p className="text-sm text-red-500">{errors.motivo}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Localizações e Responsáveis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Localizações e Responsáveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Origem */}
              {(formData.tipo !== 'entrada') && (
                <div className="space-y-4">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    Origem
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="localizacaoOrigem">Localização de Origem *</Label>
                    <Select 
                      value={formData.localizacaoOrigem} 
                      onValueChange={(value) => updateFormData('localizacaoOrigem', value)}
                      disabled={Boolean(
                        ativoSelecionado && ['transferencia', 'emprestimo', 'devolucao', 'saida', 'baixa'].includes(formData.tipo)
                      )}
                    >
                      <SelectTrigger className={errors.localizacaoOrigem ? 'border-red-500' : ''}>
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
                    {errors.localizacaoOrigem && (
                      <p className="text-sm text-red-500">{errors.localizacaoOrigem}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="responsavelOrigem">Responsável de Origem</Label>
                    <Select 
                      value={formData.responsavelOrigem} 
                      onValueChange={(value) => updateFormData('responsavelOrigem', value)}
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
                </div>
              )}

              {/* Destino */}
              {(formData.tipo !== 'saida' && formData.tipo !== 'baixa') && (
                <div className="space-y-4">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Destino
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="localizacaoDestino">Localização de Destino *</Label>
                    <Select 
                      value={formData.localizacaoDestino} 
                      onValueChange={(value) => updateFormData('localizacaoDestino', value)}
                    >
                      <SelectTrigger className={errors.localizacaoDestino ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Selecione a localização" />
                      </SelectTrigger>
                      <SelectContent>
                        {localizacoes
                          .filter(loc => loc.id !== formData.localizacaoOrigem)
                          .map((localizacao) => (
                            <SelectItem key={localizacao.id} value={localizacao.id}>
                              {localizacao.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {errors.localizacaoDestino && (
                      <p className="text-sm text-red-500">{errors.localizacaoDestino}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="responsavelDestino">Responsável de Destino</Label>
                    <Select 
                      value={formData.responsavelDestino} 
                      onValueChange={(value) => updateFormData('responsavelDestino', value)}
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
                </div>
              )}
            </div>

            {/* Resumo visual da movimentação */}
            {ativoSelecionado && formData.tipo && (
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-3">Resumo da Movimentação</h4>
                <div className="flex items-center justify-center">
                  {formData.tipo !== 'entrada' && (
                    <div className="text-center">
                      <div className="text-sm font-medium">
                        {localizacoes.find(l => l.id === formData.localizacaoOrigem)?.nome || 'Origem'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {responsaveis.find(r => r.id === formData.responsavelOrigem)?.nome || 'Sem responsável'}
                      </div>
                    </div>
                  )}
                  
                  {formData.tipo !== 'entrada' && formData.tipo !== 'saida' && formData.tipo !== 'baixa' && (
                    <div className="mx-4">
                      <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  {formData.tipo !== 'saida' && formData.tipo !== 'baixa' && (
                    <div className="text-center">
                      <div className="text-sm font-medium">
                        {localizacoes.find(l => l.id === formData.localizacaoDestino)?.nome || 'Destino'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {responsaveis.find(r => r.id === formData.responsavelDestino)?.nome || 'Sem responsável'}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="mt-3 text-center">
                  <Badge variant="outline" className="gap-1">
                    {getTipoInfo(formData.tipo).label}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Observações Adicionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Observações adicionais sobre a movimentação..."
                value={formData.observacoes}
                onChange={(e) => updateFormData('observacoes', e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/inventario/movimentacoes">
              Cancelar
            </Link>
          </Button>
          <Button type="submit" disabled={isLoading || !ativoSelecionado}>
            {isLoading ? (
              <>
                <ArrowRightLeft className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Criar Movimentação
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NovaMovimentacaoPage() {
  return (
    <Suspense fallback={<div className="p-6">A carregar formulário...</div>}>
      <NovaMovimentacaoPageContent />
    </Suspense>
  );
}
