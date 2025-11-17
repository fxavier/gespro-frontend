
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProjetoStorage } from '@/lib/storage/projeto-storage';
import { Projeto } from '@/types/projeto';
import { Plus, Search, Filter, Eye, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { usePagination } from '@/hooks/usePagination';

export default function ListaProjetosPage() {
  const router = useRouter();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [filteredProjetos, setFilteredProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('');
  const [gerenteFilter, setGerenteFilter] = useState<string>('');

  const { currentPage, itemsPerPage, totalPages, paginatedData, handlePageChange } = usePagination({
    data: filteredProjetos,
    initialItemsPerPage: 10,
  });

  useEffect(() => {
    const data = ProjetoStorage.getProjetos();
    setProjetos(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let filtered = projetos;

    if (searchTerm) {
      filtered = filtered.filter(
        p =>
          p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    if (prioridadeFilter) {
      filtered = filtered.filter(p => p.prioridade === prioridadeFilter);
    }

    if (gerenteFilter) {
      filtered = filtered.filter(p => p.gerenteId === gerenteFilter);
    }

    setFilteredProjetos(filtered);
    handlePageChange(1);
  }, [searchTerm, statusFilter, prioridadeFilter, gerenteFilter, projetos, handlePageChange]);

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este projeto?')) {
      ProjetoStorage.deleteProjeto(id);
      setProjetos(ProjetoStorage.getProjetos());
      toast.success('Projeto deletado com sucesso');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      planejamento: { variant: 'secondary', label: 'Planejamento' },
      em_andamento: { variant: 'default', label: 'Em Andamento' },
      pausado: { variant: 'secondary', label: 'Pausado' },
      concluido: { variant: 'default', label: 'Concluído' },
      cancelado: { variant: 'destructive', label: 'Cancelado' },
      arquivado: { variant: 'secondary', label: 'Arquivado' }
    };
    return badges[status] || badges.planejamento;
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      baixa: { variant: 'secondary', label: 'Baixa' },
      media: { variant: 'default', label: 'Média' },
      alta: { variant: 'destructive', label: 'Alta' },
      critica: { variant: 'destructive', label: 'Crítica' }
    };
    return badges[prioridade] || badges.media;
  };

  const gerentes = Array.from(new Set(projetos.map(p => p.gerenteId))).map(id => {
    const projeto = projetos.find(p => p.gerenteId === id);
    return { id, nome: projeto?.gerenteNome || 'Desconhecido' };
  });

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Projetos</h1>
        <Button asChild>
          <Link href="/projetos/lista/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Projeto
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os status</SelectItem>
                <SelectItem value="planejamento">Planejamento</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="pausado">Pausado</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="arquivado">Arquivado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as prioridades</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>

            <Select value={gerenteFilter} onValueChange={setGerenteFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por gerente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os gerentes</SelectItem>
                {gerentes.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Projetos ({filteredProjetos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paginatedData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhum projeto encontrado</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Gerente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((projeto) => (
                      <TableRow key={projeto.id}>
                        <TableCell className="font-medium">{projeto.codigo}</TableCell>
                        <TableCell>{projeto.nome}</TableCell>
                        <TableCell>{projeto.clienteNome || 'N/A'}</TableCell>
                        <TableCell>{projeto.gerenteNome}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(projeto.status).variant as any}>
                            {getStatusBadge(projeto.status).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getPrioridadeBadge(projeto.prioridade).variant as any}>
                            {getPrioridadeBadge(projeto.prioridade).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${projeto.progresso}%` }}
                              />
                            </div>
                            <span className="text-sm">{projeto.progresso}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <Link href={`/projetos/lista/${projeto.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <Link href={`/projetos/lista/${projeto.id}/editar`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(projeto.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
