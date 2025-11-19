'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  DollarSign,
  TrendingUp,
  Target,
  Calendar,
  Package,
  Percent,
  AlertCircle,
  CheckCircle,
  Save
} from 'lucide-react';

interface RegraComissao {
  id: string;
  nome: string;
  tipo: 'fixa' | 'escalonada' | 'por_categoria' | 'por_meta' | 'por_periodo';
  percentualBase: number;
  percentualBonus?: number;
  ativa: boolean;
  condicoes?: {
    valorMinimo?: number;
    valorMaximo?: number;
    quantidadeMinima?: number;
    metaAtingida?: number;
    categoriaId?: string;
    categoriaNome?: string;
    dataInicio?: string;
    dataFim?: string;
  };
  prioridade: number;
  descricao: string;
}

interface VendedorInfo {
  id: string;
  nome: string;
  email: string;
  comissaoPercentualPadrao: number;
  categoria: string;
  lojaNome: string;
  meta: {
    mensal: number;
    trimestral: number;
    anual: number;
  };
}

export default function ConfiguracaoComissoesPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<RegraComissao | null>(null);
  const [novaRegra, setNovaRegra] = useState<Partial<RegraComissao>>({
    tipo: 'fixa',
    ativa: true,
    prioridade: 1
  });

  // Dados de exemplo do vendedor
  const vendedor: VendedorInfo = {
    id: id,
    nome: 'Maria Santos',
    email: 'maria.santos@empresa.com',
    comissaoPercentualPadrao: 5,
    categoria: 'Senior',
    lojaNome: 'Loja Centro',
    meta: {
      mensal: 100000,
      trimestral: 300000,
      anual: 1200000
    }
  };

  // Regras de comissão do vendedor
  const [regras, setRegras] = useState<RegraComissao[]>([
    {
      id: '1',
      nome: 'Comissão Base',
      tipo: 'fixa',
      percentualBase: 5,
      ativa: true,
      condicoes: {},
      prioridade: 1,
      descricao: 'Comissão padrão aplicada a todas as vendas'
    },
    {
      id: '2',
      nome: 'Bônus Vendas Altas',
      tipo: 'escalonada',
      percentualBase: 7,
      ativa: true,
      condicoes: {
        valorMinimo: 50000
      },
      prioridade: 2,
      descricao: 'Comissão aumentada para vendas acima de MT 50.000'
    },
    {
      id: '3',
      nome: 'Bônus Meta Mensal',
      tipo: 'por_meta',
      percentualBase: 5,
      percentualBonus: 2,
      ativa: true,
      condicoes: {
        metaAtingida: 100
      },
      prioridade: 3,
      descricao: 'Bônus adicional quando atingir 100% da meta mensal'
    },
    {
      id: '4',
      nome: 'Comissão Especial - Eletrônicos',
      tipo: 'por_categoria',
      percentualBase: 8,
      ativa: false,
      condicoes: {
        categoriaId: 'eletronicos',
        categoriaNome: 'Eletrônicos'
      },
      prioridade: 4,
      descricao: 'Comissão especial para produtos eletrônicos'
    },
    {
      id: '5',
      nome: 'Campanha Verão 2024',
      tipo: 'por_periodo',
      percentualBase: 6,
      ativa: false,
      condicoes: {
        dataInicio: '2024-12-01',
        dataFim: '2024-03-31'
      },
      prioridade: 5,
      descricao: 'Campanha promocional de verão com comissão aumentada'
    }
  ]);

  const categorias = [
    { id: 'eletronicos', nome: 'Eletrônicos' },
    { id: 'roupas', nome: 'Roupas' },
    { id: 'casa', nome: 'Casa & Jardim' },
    { id: 'alimentacao', nome: 'Alimentação' },
    { id: 'livros', nome: 'Livros' }
  ];

  const getTipoLabel = (tipo: string) => {
    const tipos = {
      fixa: 'Fixa',
      escalonada: 'Escalonada',
      por_categoria: 'Por Categoria',
      por_meta: 'Por Meta',
      por_periodo: 'Por Período'
    };
    return tipos[tipo as keyof typeof tipos] || tipo;
  };

  const getTipoBadgeColor = (tipo: string) => {
    const colors = {
      fixa: 'bg-blue-100 text-blue-800',
      escalonada: 'bg-green-100 text-green-800',
      por_categoria: 'bg-purple-100 text-purple-800',
      por_meta: 'bg-orange-100 text-orange-800',
      por_periodo: 'bg-pink-100 text-pink-800'
    };
    return colors[tipo as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const handleSaveRegra = () => {
    if (editingRegra) {
      setRegras(regras.map(r => r.id === editingRegra.id ? { ...editingRegra } : r));
      toast({
        title: "Regra atualizada",
        description: "A regra de comissão foi atualizada com sucesso",
      });
    } else {
      const newRegra: RegraComissao = {
        ...(novaRegra as RegraComissao),
        id: `${Date.now()}`
      };
      setRegras([...regras, newRegra]);
      toast({
        title: "Regra criada",
        description: "Nova regra de comissão foi criada com sucesso",
      });
    }
    
    setIsDialogOpen(false);
    setEditingRegra(null);
    setNovaRegra({ tipo: 'fixa', ativa: true, prioridade: 1 });
  };

  const handleDeleteRegra = (regraId: string) => {
    setRegras(regras.filter(r => r.id !== regraId));
    toast({
      title: "Regra removida",
      description: "A regra de comissão foi removida com sucesso",
      variant: "destructive"
    });
  };

  const handleToggleRegra = (regraId: string) => {
    setRegras(regras.map(r => 
      r.id === regraId ? { ...r, ativa: !r.ativa } : r
    ));
    toast({
      title: "Status alterado",
      description: "O status da regra foi alterado com sucesso",
    });
  };

  const calcularComissaoExemplo = () => {
    const valorVenda = 75000; // Exemplo
    let comissaoFinal = vendedor.comissaoPercentualPadrao;
    let detalhes = [`Base: ${vendedor.comissaoPercentualPadrao}%`];

    const regrasAtivas = regras.filter(r => r.ativa).sort((a, b) => a.prioridade - b.prioridade);

    for (const regra of regrasAtivas) {
      if (regra.tipo === 'escalonada' && regra.condicoes?.valorMinimo && valorVenda >= regra.condicoes.valorMinimo) {
        comissaoFinal = regra.percentualBase;
        detalhes.push(`${regra.nome}: ${regra.percentualBase}%`);
      } else if (regra.tipo === 'por_meta' && regra.percentualBonus) {
        comissaoFinal += regra.percentualBonus;
        detalhes.push(`${regra.nome}: +${regra.percentualBonus}%`);
      }
    }

    return {
      percentual: comissaoFinal,
      valor: (valorVenda * comissaoFinal) / 100,
      detalhes
    };
  };

  const exemploCalculo = calcularComissaoExemplo();

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/vendas/vendedores')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Configuração de Comissões</h1>
          <p className="text-muted-foreground">{vendedor.nome} - {vendedor.lojaNome}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingRegra(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Regra
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {editingRegra ? 'Editar Regra' : 'Nova Regra de Comissão'}
              </DialogTitle>
              <DialogDescription>
                Configure uma nova regra de comissão para o vendedor
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Regra *</Label>
                  <Input 
                    id="nome" 
                    placeholder="Ex: Bônus Vendas Altas"
                    value={editingRegra?.nome || novaRegra.nome || ''}
                    onChange={(e) => {
                      if (editingRegra) {
                        setEditingRegra({ ...editingRegra, nome: e.target.value });
                      } else {
                        setNovaRegra({ ...novaRegra, nome: e.target.value });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Regra *</Label>
                  <Select 
                    value={editingRegra?.tipo || novaRegra.tipo}
                    onValueChange={(value) => {
                      if (editingRegra) {
                        setEditingRegra({ ...editingRegra, tipo: value as any });
                      } else {
                        setNovaRegra({ ...novaRegra, tipo: value as any });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixa">Fixa</SelectItem>
                      <SelectItem value="escalonada">Escalonada</SelectItem>
                      <SelectItem value="por_categoria">Por Categoria</SelectItem>
                      <SelectItem value="por_meta">Por Meta</SelectItem>
                      <SelectItem value="por_periodo">Por Período</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="percentual">Percentual Base (%)</Label>
                  <Input 
                    id="percentual" 
                    type="number" 
                    step="0.1"
                    placeholder="5.0"
                    value={editingRegra?.percentualBase || novaRegra.percentualBase || ''}
                    onChange={(e) => {
                      const valor = parseFloat(e.target.value);
                      if (editingRegra) {
                        setEditingRegra({ ...editingRegra, percentualBase: valor });
                      } else {
                        setNovaRegra({ ...novaRegra, percentualBase: valor });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prioridade">Prioridade</Label>
                  <Input 
                    id="prioridade" 
                    type="number"
                    placeholder="1"
                    value={editingRegra?.prioridade || novaRegra.prioridade || ''}
                    onChange={(e) => {
                      const valor = parseInt(e.target.value);
                      if (editingRegra) {
                        setEditingRegra({ ...editingRegra, prioridade: valor });
                      } else {
                        setNovaRegra({ ...novaRegra, prioridade: valor });
                      }
                    }}
                  />
                </div>
              </div>

              {/* Condições específicas baseadas no tipo */}
              {(editingRegra?.tipo || novaRegra.tipo) === 'escalonada' && (
                <div className="space-y-2">
                  <Label htmlFor="valorMinimo">Valor Mínimo da Venda (MT)</Label>
                  <Input 
                    id="valorMinimo" 
                    type="number"
                    placeholder="50000"
                    value={editingRegra?.condicoes?.valorMinimo || novaRegra.condicoes?.valorMinimo || ''}
                    onChange={(e) => {
                      const valor = parseFloat(e.target.value);
                      if (editingRegra) {
                        setEditingRegra({ 
                          ...editingRegra, 
                          condicoes: { ...editingRegra.condicoes, valorMinimo: valor }
                        });
                      } else {
                        setNovaRegra({ 
                          ...novaRegra, 
                          condicoes: { ...novaRegra.condicoes, valorMinimo: valor }
                        });
                      }
                    }}
                  />
                </div>
              )}

              {(editingRegra?.tipo || novaRegra.tipo) === 'por_meta' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="metaAtingida">Meta Mínima (%)</Label>
                    <Input 
                      id="metaAtingida" 
                      type="number"
                      placeholder="100"
                      value={editingRegra?.condicoes?.metaAtingida || novaRegra.condicoes?.metaAtingida || ''}
                      onChange={(e) => {
                        const valor = parseFloat(e.target.value);
                        if (editingRegra) {
                          setEditingRegra({ 
                            ...editingRegra, 
                            condicoes: { ...editingRegra.condicoes, metaAtingida: valor }
                          });
                        } else {
                          setNovaRegra({ 
                            ...novaRegra, 
                            condicoes: { ...novaRegra.condicoes, metaAtingida: valor }
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="percentualBonus">Bônus Adicional (%)</Label>
                    <Input 
                      id="percentualBonus" 
                      type="number" 
                      step="0.1"
                      placeholder="2.0"
                      value={editingRegra?.percentualBonus || novaRegra.percentualBonus || ''}
                      onChange={(e) => {
                        const valor = parseFloat(e.target.value);
                        if (editingRegra) {
                          setEditingRegra({ ...editingRegra, percentualBonus: valor });
                        } else {
                          setNovaRegra({ ...novaRegra, percentualBonus: valor });
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {(editingRegra?.tipo || novaRegra.tipo) === 'por_categoria' && (
                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria de Produto</Label>
                  <Select 
                    value={editingRegra?.condicoes?.categoriaId || novaRegra.condicoes?.categoriaId}
                    onValueChange={(value) => {
                      const categoria = categorias.find(c => c.id === value);
                      if (editingRegra) {
                        setEditingRegra({ 
                          ...editingRegra, 
                          condicoes: { 
                            ...editingRegra.condicoes, 
                            categoriaId: value,
                            categoriaNome: categoria?.nome 
                          }
                        });
                      } else {
                        setNovaRegra({ 
                          ...novaRegra, 
                          condicoes: { 
                            ...novaRegra.condicoes, 
                            categoriaId: value,
                            categoriaNome: categoria?.nome 
                          }
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map(categoria => (
                        <SelectItem key={categoria.id} value={categoria.id}>
                          {categoria.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Input 
                  id="descricao" 
                  placeholder="Descrição da regra..."
                  value={editingRegra?.descricao || novaRegra.descricao || ''}
                  onChange={(e) => {
                    if (editingRegra) {
                      setEditingRegra({ ...editingRegra, descricao: e.target.value });
                    } else {
                      setNovaRegra({ ...novaRegra, descricao: e.target.value });
                    }
                  }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveRegra}>
                <Save className="h-4 w-4 mr-2" />
                {editingRegra ? 'Atualizar' : 'Criar'} Regra
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Regras de Comissão</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regra</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Percentual</TableHead>
                    <TableHead>Condições</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regras.map((regra) => (
                    <TableRow key={regra.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{regra.nome}</div>
                          <div className="text-sm text-muted-foreground">
                            Prioridade: {regra.prioridade}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTipoBadgeColor(regra.tipo)}`}>
                          {getTipoLabel(regra.tipo)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {regra.percentualBase}%
                        {regra.percentualBonus && (
                          <span className="text-green-600 ml-1">
                            (+{regra.percentualBonus}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {regra.tipo === 'escalonada' && regra.condicoes?.valorMinimo && (
                            <span>Min: MT {regra.condicoes.valorMinimo.toLocaleString()}</span>
                          )}
                          {regra.tipo === 'por_meta' && regra.condicoes?.metaAtingida && (
                            <span>Meta: {regra.condicoes.metaAtingida}%</span>
                          )}
                          {regra.tipo === 'por_categoria' && regra.condicoes?.categoriaNome && (
                            <span>{regra.condicoes.categoriaNome}</span>
                          )}
                          {regra.tipo === 'fixa' && <span>Sempre</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={regra.ativa}
                            onCheckedChange={() => handleToggleRegra(regra.id)}
                          />
                          {regra.ativa ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Ativa
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Inativa
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Abrir menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem 
                              onClick={() => {
                                setEditingRegra(regra);
                                setIsDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteRegra(regra.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{vendedor.nome}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{vendedor.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categoria</p>
                <p className="font-medium">{vendedor.categoria}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Loja</p>
                <p className="font-medium">{vendedor.lojaNome}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Comissão Padrão</p>
                <p className="text-2xl font-bold text-primary">
                  {vendedor.comissaoPercentualPadrao}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Meta Mensal</p>
                <p className="font-medium">MT {vendedor.meta.mensal.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simulação de Comissão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Exemplo: Venda de MT 75.000</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Percentual Final:</span>
                    <span className="font-bold text-lg text-primary">
                      {exemploCalculo.percentual}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Valor da Comissão:</span>
                    <span className="font-bold text-lg text-green-600">
                      MT {exemploCalculo.valor.toFixed(2)}
                    </span>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Cálculo:</p>
                  {exemploCalculo.detalhes.map((detalhe, index) => (
                    <p key={index} className="text-xs text-muted-foreground">
                      • {detalhe}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo das Regras</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total de Regras</span>
                  <Badge variant="outline">{regras.length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Regras Ativas</span>
                  <Badge variant="default">{regras.filter(r => r.ativa).length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Regras Inativas</span>
                  <Badge variant="secondary">{regras.filter(r => !r.ativa).length}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
