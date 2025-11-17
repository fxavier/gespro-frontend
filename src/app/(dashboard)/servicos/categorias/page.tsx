
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2,
  Tag,
  CheckCircle,
  XCircle,
  Palette
} from 'lucide-react';

interface CategoriaServico {
  id: string;
  nome: string;
  descricao?: string;
  cor: string;
  ativo: boolean;
  totalServicos: number;
}

export default function CategoriasServicosPage() {
  const router = useRouter();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaServico | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [dadosCategoria, setDadosCategoria] = useState({
    nome: '',
    descricao: '',
    cor: '#3B82F6',
    ativo: true
  });

  // Dados mock das categorias
  const [categorias, setCategorias] = useState<CategoriaServico[]>([
    {
      id: 'CAT001',
      nome: 'Instalação',
      descricao: 'Serviços de instalação de equipamentos e sistemas',
      cor: '#3B82F6',
      ativo: true,
      totalServicos: 12
    },
    {
      id: 'CAT002',
      nome: 'Manutenção',
      descricao: 'Serviços de manutenção preventiva e corretiva',
      cor: '#10B981',
      ativo: true,
      totalServicos: 8
    },
    {
      id: 'CAT003',
      nome: 'Consultoria',
      descricao: 'Serviços de consultoria especializada',
      cor: '#8B5CF6',
      ativo: true,
      totalServicos: 5
    },
    {
      id: 'CAT004',
      nome: 'Limpeza',
      descricao: 'Serviços de limpeza profissional',
      cor: '#F59E0B',
      ativo: true,
      totalServicos: 6
    },
    {
      id: 'CAT005',
      nome: 'Reparação',
      descricao: 'Serviços de reparação e conserto',
      cor: '#EF4444',
      ativo: true,
      totalServicos: 9
    },
    {
      id: 'CAT006',
      nome: 'Outros',
      descricao: 'Outros serviços diversos',
      cor: '#6B7280',
      ativo: false,
      totalServicos: 2
    }
  ]);

  const coresDisponiveis = [
    { nome: 'Azul', valor: '#3B82F6' },
    { nome: 'Verde', valor: '#10B981' },
    { nome: 'Roxo', valor: '#8B5CF6' },
    { nome: 'Laranja', valor: '#F59E0B' },
    { nome: 'Vermelho', valor: '#EF4444' },
    { nome: 'Rosa', valor: '#EC4899' },
    { nome: 'Amarelo', valor: '#EAB308' },
    { nome: 'Ciano', valor: '#06B6D4' },
    { nome: 'Cinza', valor: '#6B7280' },
    { nome: 'Índigo', valor: '#6366F1' }
  ];

  const handleInputChange = (campo: string, valor: any) => {
    setDadosCategoria(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const abrirDialogNovo = () => {
    setCategoriaEditando(null);
    setDadosCategoria({
      nome: '',
      descricao: '',
      cor: '#3B82F6',
      ativo: true
    });
    setDialogAberto(true);
  };

  const abrirDialogEditar = (categoria: CategoriaServico) => {
    setCategoriaEditando(categoria);
    setDadosCategoria({
      nome: categoria.nome,
      descricao: categoria.descricao || '',
      cor: categoria.cor,
      ativo: categoria.ativo
    });
    setDialogAberto(true);
  };

  const validarFormulario = () => {
    if (!dadosCategoria.nome.trim()) {
      toast.error('Nome da categoria é obrigatório');
      return false;
    }
    return true;
  };

  const handleSalvar = async () => {
    if (!validarFormulario()) return;

    setSalvando(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      if (categoriaEditando) {
        // Atualizar categoria existente
        setCategorias(prev => prev.map(cat => 
          cat.id === categoriaEditando.id 
            ? { ...cat, ...dadosCategoria }
            : cat
        ));
        toast.success('Categoria atualizada com sucesso!');
      } else {
        // Criar nova categoria
        const novaCategoria: CategoriaServico = {
          id: `CAT${String(categorias.length + 1).padStart(3, '0')}`,
          ...dadosCategoria,
          totalServicos: 0
        };
        setCategorias(prev => [...prev, novaCategoria]);
        toast.success('Categoria criada com sucesso!');
      }

      setDialogAberto(false);
    } catch (error) {
      toast.error('Erro ao salvar categoria');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: string) => {
    const categoria = categorias.find(cat => cat.id === id);
    
    if (categoria?.totalServicos && categoria.totalServicos > 0) {
      toast.error('Não é possível excluir categoria com serviços associados');
      return;
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setCategorias(prev => prev.filter(cat => cat.id !== id));
      toast.success('Categoria excluída com sucesso!');
    } catch (error) {
      toast.error('Erro ao excluir categoria');
    }
  };

  const obterIconeStatus = (ativo: boolean) => {
    return ativo 
      ? <CheckCircle className="h-4 w-4 text-green-600" />
      : <XCircle className="h-4 w-4 text-gray-400" />;
  };

  const estatisticas = {
    totalCategorias: categorias.length,
    categoriasAtivas: categorias.filter(c => c.ativo).length,
    totalServicos: categorias.reduce((total, c) => total + c.totalServicos, 0)
  };

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Categorias de Serviços
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Gerencie as categorias para organizar seus serviços
            </p>
          </div>
        </div>
        <Button onClick={abrirDialogNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Categoria
        </Button>
      </div>

      {/* Cartões de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Tag className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Categorias</p>
                <p className="text-2xl font-bold">{estatisticas.totalCategorias}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Categorias Ativas</p>
                <p className="text-2xl font-bold">{estatisticas.categoriasAtivas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Tag className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Serviços</p>
                <p className="text-2xl font-bold">{estatisticas.totalServicos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Categorias */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Categorias ({categorias.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead>Serviços</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorias.map((categoria) => (
                  <TableRow key={categoria.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: categoria.cor }}
                        />
                        <span className="font-medium">{categoria.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                        {categoria.descricao || '-'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        style={{ 
                          borderColor: categoria.cor,
                          color: categoria.cor
                        }}
                      >
                        {categoria.cor}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{categoria.totalServicos}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {obterIconeStatus(categoria.ativo)}
                        <Badge variant={categoria.ativo ? 'default' : 'secondary'}>
                          {categoria.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => abrirDialogEditar(categoria)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleExcluir(categoria.id)}
                          disabled={categoria.totalServicos > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {categorias.length === 0 && (
            <div className="text-center py-8">
              <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma categoria encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Crie sua primeira categoria de serviços
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Criar/Editar Categoria */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {categoriaEditando ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Categoria *</Label>
              <Input
                id="nome"
                value={dadosCategoria.nome}
                onChange={(e) => handleInputChange('nome', e.target.value)}
                placeholder="Ex: Instalação"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                value={dadosCategoria.descricao}
                onChange={(e) => handleInputChange('descricao', e.target.value)}
                placeholder="Descrição da categoria..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Cor da Categoria</Label>
              <div className="grid grid-cols-5 gap-2">
                {coresDisponiveis.map((cor) => (
                  <button
                    key={cor.valor}
                    type="button"
                    onClick={() => handleInputChange('cor', cor.valor)}
                    className={`w-full h-10 rounded-md border-2 transition-all ${
                      dadosCategoria.cor === cor.valor 
                        ? 'border-gray-900 dark:border-white scale-110' 
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                    style={{ backgroundColor: cor.valor }}
                    title={cor.nome}
                  />
                ))}
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <Palette className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Cor selecionada: {dadosCategoria.cor}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label>Categoria Ativa</Label>
                <p className="text-sm text-gray-500">Categoria disponível para uso</p>
              </div>
              <Switch
                checked={dadosCategoria.ativo}
                onCheckedChange={(checked) => handleInputChange('ativo', checked)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
