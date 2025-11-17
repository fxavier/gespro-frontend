'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit,
  MoreHorizontal,
  Package,
  Component,
  Box,
  Search,
  AlertTriangle,
  CheckCircle,
  Calculator,
  Save,
  TreePine,
  Factory,
  Layers,
  Copy,
  FileText,
  Upload,
  Download,
  Settings,
  X
} from 'lucide-react';
import Link from 'next/link';

interface ComponenteBOM {
  id: string;
  codigoComponente: string;
  nomeComponente: string;
  categoria: 'materia_prima' | 'componente' | 'subconjunto' | 'produto_acabado';
  quantidade: number;
  unidadeMedida: string;
  custo: number;
  nivel: number;
  perdaPrevista: number;
  estoque: number;
  stockMinimo: number;
  tempoLead: number;
  fornecedorPrincipal?: string;
  observacoes?: string;
  subcomponentes?: ComponenteBOM[];
  ativo: boolean;
}

interface NovaEstrutura {
  codigoProduto: string;
  nomeProduto: string;
  versao: string;
  categoria: string;
  unidadeProducao: string;
  responsavel: string;
  observacoes?: string;
  componentes: ComponenteBOM[];
}

interface ComponenteDisponivel {
  id: string;
  codigo: string;
  nome: string;
  categoria: 'materia_prima' | 'componente' | 'subconjunto' | 'produto_acabado';
  unidadeMedida: string;
  custo: number;
  estoque: number;
  stockMinimo: number;
  fornecedor?: string;
}

export default function NovaEstruturaPage() {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isComponentDialogOpen, setIsComponentDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [componenteParaRemover, setComponenteParaRemover] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponenteBOM | null>(null);

  const [estrutura, setEstrutura] = useState<NovaEstrutura>({
    codigoProduto: '',
    nomeProduto: '',
    versao: 'v1.0',
    categoria: '',
    unidadeProducao: 'unidade',
    responsavel: '',
    observacoes: '',
    componentes: []
  });

  const [novoComponente, setNovoComponente] = useState<Partial<ComponenteBOM>>({
    categoria: 'materia_prima',
    quantidade: 1,
    unidadeMedida: 'kg',
    custo: 0,
    nivel: 1,
    perdaPrevista: 0,
    estoque: 0,
    stockMinimo: 0,
    tempoLead: 0,
    ativo: true
  });

  // Mock data para componentes disponíveis
  const componentesDisponiveis: ComponenteDisponivel[] = [
    {
      id: '1',
      codigo: 'MAT-001',
      nome: 'Farinha de Trigo',
      categoria: 'materia_prima',
      unidadeMedida: 'kg',
      custo: 10.00,
      estoque: 150,
      stockMinimo: 50,
      fornecedor: 'Moageira Central'
    },
    {
      id: '2',
      codigo: 'MAT-002',
      nome: 'Ovos Frescos',
      categoria: 'materia_prima',
      unidadeMedida: 'unidades',
      custo: 2.50,
      estoque: 200,
      stockMinimo: 36,
      fornecedor: 'Aviário do Sul'
    },
    {
      id: '3',
      codigo: 'MAT-003',
      nome: 'Cacau em Pó',
      categoria: 'materia_prima',
      unidadeMedida: 'kg',
      custo: 160.00,
      estoque: 30,
      stockMinimo: 5,
      fornecedor: 'Cacau Moçambique'
    },
    {
      id: '4',
      codigo: 'SUB-001',
      nome: 'Mistura Base Chocolate',
      categoria: 'subconjunto',
      unidadeMedida: 'kg',
      custo: 45.00,
      estoque: 25,
      stockMinimo: 10
    },
    {
      id: '5',
      codigo: 'MAT-101',
      nome: 'Prancha MDF 25mm',
      categoria: 'materia_prima',
      unidadeMedida: 'peças',
      custo: 112.50,
      estoque: 50,
      stockMinimo: 20,
      fornecedor: 'MadeiraMoz'
    }
  ];

  const categoriasProduto = [
    'Produtos de Padaria',
    'Móveis',
    'Eletrônicos',
    'Têxtil',
    'Metalúrgica',
    'Química',
    'Alimentar',
    'Outros'
  ];

  const unidadesProducao = [
    'unidade',
    'kg',
    'litros',
    'metros',
    'm²',
    'm³',
    'caixa',
    'pacote'
  ];

  const filteredComponents = componentesDisponiveis.filter(comp =>
    comp.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const adicionarComponente = (componenteDisponivel?: ComponenteDisponivel) => {
    let componente: ComponenteBOM;
    
    if (componenteDisponivel) {
      componente = {
        id: `temp-${Date.now()}`,
        codigoComponente: componenteDisponivel.codigo,
        nomeComponente: componenteDisponivel.nome,
        categoria: componenteDisponivel.categoria,
        quantidade: 1,
        unidadeMedida: componenteDisponivel.unidadeMedida,
        custo: componenteDisponivel.custo,
        nivel: 1,
        perdaPrevista: 0,
        estoque: componenteDisponivel.estoque,
        stockMinimo: componenteDisponivel.stockMinimo,
        tempoLead: 3,
        fornecedorPrincipal: componenteDisponivel.fornecedor,
        ativo: true
      };
    } else {
      if (!novoComponente.codigoComponente || !novoComponente.nomeComponente) {
        toast({
          title: "Erro",
          description: "Código e nome do componente são obrigatórios",
          variant: "destructive"
        });
        return;
      }

      componente = {
        id: `temp-${Date.now()}`,
        codigoComponente: novoComponente.codigoComponente!,
        nomeComponente: novoComponente.nomeComponente!,
        categoria: novoComponente.categoria!,
        quantidade: novoComponente.quantidade!,
        unidadeMedida: novoComponente.unidadeMedida!,
        custo: novoComponente.custo!,
        nivel: novoComponente.nivel!,
        perdaPrevista: novoComponente.perdaPrevista!,
        estoque: novoComponente.estoque!,
        stockMinimo: novoComponente.stockMinimo!,
        tempoLead: novoComponente.tempoLead!,
        fornecedorPrincipal: novoComponente.fornecedorPrincipal,
        observacoes: novoComponente.observacoes,
        ativo: true
      };
    }

    setEstrutura(prev => ({
      ...prev,
      componentes: [...prev.componentes, componente]
    }));

    setNovoComponente({
      categoria: 'materia_prima',
      quantidade: 1,
      unidadeMedida: 'kg',
      custo: 0,
      nivel: 1,
      perdaPrevista: 0,
      estoque: 0,
      stockMinimo: 0,
      tempoLead: 0,
      ativo: true
    });
    
    setIsDialogOpen(false);
    setIsComponentDialogOpen(false);
    
    toast({
      title: "Componente adicionado",
      description: `${componente.nomeComponente} foi adicionado à estrutura`
    });
  };

  const removerComponente = (componenteId: string) => {
    setEstrutura(prev => ({
      ...prev,
      componentes: prev.componentes.filter(c => c.id !== componenteId)
    }));
    
    setIsDeleteDialogOpen(false);
    setComponenteParaRemover(null);
    
    toast({
      title: "Componente removido",
      description: "O componente foi removido da estrutura"
    });
  };

  const editarComponente = (componente: ComponenteBOM) => {
    setEditingComponent(componente);
    setNovoComponente(componente);
    setIsDialogOpen(true);
  };

  const atualizarComponente = () => {
    if (!editingComponent) return;

    setEstrutura(prev => ({
      ...prev,
      componentes: prev.componentes.map(c => 
        c.id === editingComponent.id 
          ? { ...c, ...novoComponente }
          : c
      )
    }));

    setEditingComponent(null);
    setNovoComponente({
      categoria: 'materia_prima',
      quantidade: 1,
      unidadeMedida: 'kg',
      custo: 0,
      nivel: 1,
      perdaPrevista: 0,
      estoque: 0,
      stockMinimo: 0,
      tempoLead: 0,
      ativo: true
    });
    setIsDialogOpen(false);

    toast({
      title: "Componente atualizado",
      description: "As informações do componente foram atualizadas"
    });
  };

  const calcularCustoTotal = () => {
    return estrutura.componentes.reduce((total, comp) => {
      const custoComPerda = comp.custo * comp.quantidade * (1 + comp.perdaPrevista / 100);
      return total + custoComPerda;
    }, 0);
  };

  const calcularTempoLeadTotal = () => {
    return Math.max(...estrutura.componentes.map(c => c.tempoLead), 0);
  };

  const validarFormulario = () => {
    if (!estrutura.codigoProduto || !estrutura.nomeProduto || !estrutura.categoria || !estrutura.responsavel) {
      toast({
        title: "Formulário incompleto",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive"
      });
      return false;
    }

    if (estrutura.componentes.length === 0) {
      toast({
        title: "Estrutura vazia",
        description: "Adicione pelo menos um componente à estrutura",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const salvarEstrutura = async () => {
    if (!validarFormulario()) return;

    setIsSaving(true);
    
    try {
      // Simular salvamento
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Estrutura criada",
        description: `Estrutura ${estrutura.codigoProduto} foi criada com sucesso`
      });
      
      router.push('/producao/estrutura');
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao criar a estrutura. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoriaIcon = (categoria: string) => {
    switch (categoria) {
      case 'materia_prima': return <Package className="h-4 w-4 text-blue-500" />;
      case 'componente': return <Component className="h-4 w-4 text-green-500" />;
      case 'subconjunto': return <Box className="h-4 w-4 text-purple-500" />;
      case 'produto_acabado': return <Factory className="h-4 w-4 text-orange-500" />;
      default: return <Package className="h-4 w-4 text-gray-500" />;
    }
  };

  const getCategoriaColor = (categoria: string) => {
    switch (categoria) {
      case 'materia_prima': return 'bg-blue-100 text-blue-800';
      case 'componente': return 'bg-green-100 text-green-800';
      case 'subconjunto': return 'bg-purple-100 text-purple-800';
      case 'produto_acabado': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/producao/estrutura">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nova Estrutura de Produto</h1>
          <p className="text-muted-foreground">Criar nova estrutura (BOM) e lista de materiais</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário Principal */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="h-5 w-5" />
                Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="codigoProduto">Código do Produto *</Label>
                  <Input
                    id="codigoProduto"
                    value={estrutura.codigoProduto}
                    onChange={(e) => setEstrutura(prev => ({ ...prev, codigoProduto: e.target.value }))}
                    placeholder="PROD-001"
                  />
                </div>
                <div>
                  <Label htmlFor="versao">Versão</Label>
                  <Input
                    id="versao"
                    value={estrutura.versao}
                    onChange={(e) => setEstrutura(prev => ({ ...prev, versao: e.target.value }))}
                    placeholder="v1.0"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="nomeProduto">Nome do Produto *</Label>
                <Input
                  id="nomeProduto"
                  value={estrutura.nomeProduto}
                  onChange={(e) => setEstrutura(prev => ({ ...prev, nomeProduto: e.target.value }))}
                  placeholder="Nome do produto"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="categoria">Categoria *</Label>
                  <Select value={estrutura.categoria} onValueChange={(value) => setEstrutura(prev => ({ ...prev, categoria: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasProduto.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="unidadeProducao">Unidade de Produção</Label>
                  <Select value={estrutura.unidadeProducao} onValueChange={(value) => setEstrutura(prev => ({ ...prev, unidadeProducao: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesProducao.map(unidade => (
                        <SelectItem key={unidade} value={unidade}>{unidade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="responsavel">Responsável *</Label>
                <Input
                  id="responsavel"
                  value={estrutura.responsavel}
                  onChange={(e) => setEstrutura(prev => ({ ...prev, responsavel: e.target.value }))}
                  placeholder="Nome do responsável"
                />
              </div>

              <div>
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={estrutura.observacoes}
                  onChange={(e) => setEstrutura(prev => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="Observações adicionais"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Lista de Componentes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Componentes ({estrutura.componentes.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Dialog open={isComponentDialogOpen} onOpenChange={setIsComponentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Search className="mr-2 h-4 w-4" />
                        Buscar Componentes
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>Buscar e Adicionar Componentes</DialogTitle>
                        <DialogDescription>
                          Selecione componentes existentes para adicionar à estrutura
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Buscar por nome ou código..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1"
                          />
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>Categoria</TableHead>
                                <TableHead>Custo</TableHead>
                                <TableHead>Estoque</TableHead>
                                <TableHead>Ação</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredComponents.map((comp) => (
                                <TableRow key={comp.id}>
                                  <TableCell className="font-medium">{comp.codigo}</TableCell>
                                  <TableCell>{comp.nome}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {getCategoriaIcon(comp.categoria)}
                                      <Badge className={getCategoriaColor(comp.categoria)}>
                                        {comp.categoria.replace('_', ' ')}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell>MT {comp.custo.toFixed(2)}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      {comp.estoque <= comp.stockMinimo ? (
                                        <AlertTriangle className="h-4 w-4 text-red-500" />
                                      ) : (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                      )}
                                      <span>{comp.estoque} {comp.unidadeMedida}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Button 
                                      size="sm" 
                                      onClick={() => adicionarComponente(comp)}
                                      disabled={estrutura.componentes.some(c => c.codigoComponente === comp.codigo)}
                                    >
                                      {estrutura.componentes.some(c => c.codigoComponente === comp.codigo) ? 'Adicionado' : 'Adicionar'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Componente
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          {editingComponent ? 'Editar Componente' : 'Adicionar Novo Componente'}
                        </DialogTitle>
                        <DialogDescription>
                          {editingComponent 
                            ? 'Edite as informações do componente' 
                            : 'Preencha os dados do novo componente'
                          }
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="codigoComponente">Código *</Label>
                          <Input
                            id="codigoComponente"
                            value={novoComponente.codigoComponente || ''}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, codigoComponente: e.target.value }))}
                            placeholder="MAT-001"
                          />
                        </div>
                        <div>
                          <Label htmlFor="categoria">Categoria</Label>
                          <Select 
                            value={novoComponente.categoria} 
                            onValueChange={(value: any) => setNovoComponente(prev => ({ ...prev, categoria: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="materia_prima">Matéria Prima</SelectItem>
                              <SelectItem value="componente">Componente</SelectItem>
                              <SelectItem value="subconjunto">Subconjunto</SelectItem>
                              <SelectItem value="produto_acabado">Produto Acabado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="nomeComponente">Nome *</Label>
                          <Input
                            id="nomeComponente"
                            value={novoComponente.nomeComponente || ''}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, nomeComponente: e.target.value }))}
                            placeholder="Nome do componente"
                          />
                        </div>
                        <div>
                          <Label htmlFor="quantidade">Quantidade</Label>
                          <Input
                            id="quantidade"
                            type="number"
                            step="0.01"
                            value={novoComponente.quantidade || 0}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, quantidade: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="unidadeMedida">Unidade</Label>
                          <Select 
                            value={novoComponente.unidadeMedida} 
                            onValueChange={(value) => setNovoComponente(prev => ({ ...prev, unidadeMedida: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="kg">kg</SelectItem>
                              <SelectItem value="litros">litros</SelectItem>
                              <SelectItem value="unidades">unidades</SelectItem>
                              <SelectItem value="metros">metros</SelectItem>
                              <SelectItem value="peças">peças</SelectItem>
                              <SelectItem value="caixas">caixas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="custo">Custo Unitário (MT)</Label>
                          <Input
                            id="custo"
                            type="number"
                            step="0.01"
                            value={novoComponente.custo || 0}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, custo: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="perdaPrevista">Perda Prevista (%)</Label>
                          <Input
                            id="perdaPrevista"
                            type="number"
                            step="0.1"
                            value={novoComponente.perdaPrevista || 0}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, perdaPrevista: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="estoque">Estoque Atual</Label>
                          <Input
                            id="estoque"
                            type="number"
                            value={novoComponente.estoque || 0}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, estoque: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="stockMinimo">Stock Mínimo</Label>
                          <Input
                            id="stockMinimo"
                            type="number"
                            value={novoComponente.stockMinimo || 0}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, stockMinimo: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="tempoLead">Tempo Lead (dias)</Label>
                          <Input
                            id="tempoLead"
                            type="number"
                            value={novoComponente.tempoLead || 0}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, tempoLead: parseInt(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="fornecedorPrincipal">Fornecedor Principal</Label>
                          <Input
                            id="fornecedorPrincipal"
                            value={novoComponente.fornecedorPrincipal || ''}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, fornecedorPrincipal: e.target.value }))}
                            placeholder="Nome do fornecedor"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="observacoesComponente">Observações</Label>
                          <Textarea
                            id="observacoesComponente"
                            value={novoComponente.observacoes || ''}
                            onChange={(e) => setNovoComponente(prev => ({ ...prev, observacoes: e.target.value }))}
                            placeholder="Observações sobre o componente"
                            rows={2}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setIsDialogOpen(false);
                          setEditingComponent(null);
                          setNovoComponente({
                            categoria: 'materia_prima',
                            quantidade: 1,
                            unidadeMedida: 'kg',
                            custo: 0,
                            nivel: 1,
                            perdaPrevista: 0,
                            estoque: 0,
                            stockMinimo: 0,
                            tempoLead: 0,
                            ativo: true
                          });
                        }}>
                          Cancelar
                        </Button>
                        <Button onClick={editingComponent ? atualizarComponente : () => adicionarComponente()}>
                          {editingComponent ? 'Atualizar' : 'Adicionar'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {estrutura.componentes.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Componente</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Quantidade</TableHead>
                        <TableHead>Custo Unit.</TableHead>
                        <TableHead>Custo Total</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead>Lead Time</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estrutura.componentes.map((componente) => (
                        <TableRow key={componente.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{componente.nomeComponente}</div>
                              <div className="text-sm text-gray-500">{componente.codigoComponente}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoriaIcon(componente.categoria)}
                              <Badge className={getCategoriaColor(componente.categoria)}>
                                {componente.categoria.replace('_', ' ')}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            {componente.quantidade} {componente.unidadeMedida}
                          </TableCell>
                          <TableCell>MT {componente.custo.toFixed(2)}</TableCell>
                          <TableCell>
                            MT {(componente.custo * componente.quantidade * (1 + componente.perdaPrevista / 100)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {componente.estoque <= componente.stockMinimo ? (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              <span>{componente.estoque}</span>
                            </div>
                          </TableCell>
                          <TableCell>{componente.tempoLead} dias</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => editarComponente(componente)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setComponenteParaRemover(componente.id);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remover
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum componente adicionado</p>
                  <p className="text-sm text-gray-400">Adicione componentes para criar a estrutura do produto</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Resumo e Ações */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Resumo da Estrutura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total de Componentes:</span>
                  <span className="font-medium">{estrutura.componentes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Custo Total Estimado:</span>
                  <span className="font-medium text-lg">MT {calcularCustoTotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Lead Time Máximo:</span>
                  <span className="font-medium">{calcularTempoLeadTotal()} dias</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Componentes em Falta:</span>
                  <span className="font-medium text-red-600">
                    {estrutura.componentes.filter(c => c.estoque <= c.stockMinimo).length}
                  </span>
                </div>
              </div>
              
              {estrutura.componentes.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="text-sm text-gray-600 mb-2">Disponibilidade de Materiais</div>
                  <Progress 
                    value={(estrutura.componentes.filter(c => c.estoque > c.stockMinimo).length / estrutura.componentes.length) * 100}
                    className="h-2"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {estrutura.componentes.filter(c => c.estoque > c.stockMinimo).length} de {estrutura.componentes.length} disponíveis
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full" 
                onClick={salvarEstrutura}
                disabled={isSaving || !validarFormulario()}
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Estrutura
                  </>
                )}
              </Button>
              
              <Button variant="outline" className="w-full" asChild>
                <Link href="/producao/estrutura">
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Link>
              </Button>
              
              <div className="pt-4 border-t space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" />
                  Pré-visualizar
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicar de Existente
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar de Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog de Confirmação de Remoção */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este componente da estrutura? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => componenteParaRemover && removerComponente(componenteParaRemover)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}