
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Wrench, 
  Plus, 
  Search, 
  Filter, 
  Eye,
  Edit,
  Trash2,
  Clock,
  DollarSign,
  TrendingUp,
  Tag,
  CheckCircle,
  XCircle,
  Star
} from 'lucide-react';
import { ServicoStorage, CategoriaServicoStorage } from '@/lib/storage/servico-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function ListaServicosPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [servicos, setServicos] = useState<any[]>([]);
  const [servicosFiltrados, setServicosFiltrados] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);

  useEffect(() => {
    const dados = ServicoStorage.getServicos();
    const cats = CategoriaServicoStorage.getCategorias();
    setServicos(dados);
    setServicosFiltrados(dados);
    setCategorias(cats);
  }, []);

  useEffect(() => {
    let resultado = servicos;

    if (termoPesquisa) {
      resultado = resultado.filter(s =>
        s.nome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        s.codigo.includes(termoPesquisa) ||
        s.descricao?.toLowerCase().includes(termoPesquisa.toLowerCase())
      );
    }

    if (categoriaFiltro !== 'todas') {
      resultado = resultado.filter(s => s.categoria === categoriaFiltro);
    }

    if (statusFiltro !== 'todos') {
      resultado = resultado.filter(s => s.ativo === (statusFiltro === 'ativo'));
    }

    setServicosFiltrados(resultado);
  }, [termoPesquisa, categoriaFiltro, statusFiltro, servicos]);

  const obterCorStatus = (status: boolean) => {
    return status ? 'default' : 'secondary';
  };

  const obterIconeStatus = (status: boolean) => {
    return status 
      ? <CheckCircle className="h-4 w-4 text-green-600" />
      : <XCircle className="h-4 w-4 text-gray-400" />;
  };

  const formatarDuracao = (minutos: number) => {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (horas > 0) {
      return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
    }
    return `${mins}min`;
  };

  const estatisticas = {
    totalServicos: servicos.length,
    servicosAtivos: servicos.filter(s => s.ativo).length,
    faturamentoTotal: servicos.reduce((total, s) => total + s.faturamentoTotal, 0),
    totalVendas: servicos.reduce((total, s) => total + s.totalVendas, 0),
    precoMedio: servicos.length > 0 ? servicos.reduce((total, s) => total + s.preco, 0) / servicos.length : 0,
    avaliacaoMedia: servicos.length > 0 
      ? servicos.reduce((total, s) => total + (s.avaliacaoMedia || 0), 0) / servicos.filter(s => s.avaliacaoMedia).length 
      : 0
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Gestão de Serviços
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Catálogo e controle de serviços oferecidos
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" asChild>
            <Link href="/servicos/categorias">
              <Tag className="h-4 w-4 mr-2" />
              Categorias
            </Link>
          </Button>
          <Button asChild>
            <Link href="/servicos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Serviço
            </Link>
          </Button>
        </div>
      </div>

      {/* Cartões de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Wrench className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold">{estatisticas.totalServicos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.servicosAtivos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Vendas</p>
                <p className="text-2xl font-bold">{estatisticas.totalVendas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento</p>
                <p className="text-lg font-bold">{formatCurrency(estatisticas.faturamentoTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Tag className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Preço Médio</p>
                <p className="text-lg font-bold">{formatCurrency(estatisticas.precoMedio)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Star className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Avaliação</p>
                <p className="text-2xl font-bold">{estatisticas.avaliacaoMedia.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Pesquisa</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por nome, código ou descrição..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Categorias</SelectItem>
                {categorias.map(categoria => (
                  <SelectItem key={categoria.id} value={categoria.nome}>
                    {categoria.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Serviços */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Serviços ({servicosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Vendas</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicosFiltrados.map((servico) => (
                  <TableRow key={servico.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{servico.nome}</p>
                        <p className="text-sm text-gray-500">Cód: {servico.codigo}</p>
                        <p className="text-xs text-gray-400 line-clamp-1">{servico.descricao}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{servico.categoria}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-green-600">{formatCurrency(servico.preco)}</p>
                        <p className="text-xs text-gray-500">por {servico.unidadeMedida}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">{formatarDuracao(servico.duracaoEstimada)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{servico.totalVendas}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatCurrency(servico.faturamentoTotal)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm">{servico.avaliacaoMedia?.toFixed(1) || 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {obterIconeStatus(servico.ativo)}
                        <Badge variant={obterCorStatus(servico.ativo) as any}>
                          {servico.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/servicos/lista/${servico.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/servicos/lista/${servico.id}/editar`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {servicosFiltrados.length === 0 && (
            <div className="text-center py-8">
              <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum serviço encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou cadastrar um novo serviço
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
