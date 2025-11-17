
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ColaboradorStorage } from '@/lib/storage/rh-storage';
import { Colaborador } from '@/types/rh';
import { 
  Plus, 
  Search, 
  Download, 
  Mail, 
  Phone,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Clock
} from 'lucide-react';
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
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/ui/data-table-pagination';

export default function ColaboradoresPage() {
  const router = useRouter();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [filteredColaboradores, setFilteredColaboradores] = useState<Colaborador[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [departamentoFilter, setDepartamentoFilter] = useState<string>('todos');

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredColaboradores, initialItemsPerPage: 10 });

  useEffect(() => {
    loadColaboradores();
  }, []);

  useEffect(() => {
    filterColaboradores();
  }, [colaboradores, searchTerm, statusFilter, departamentoFilter]);

  const loadColaboradores = () => {
    const data = ColaboradorStorage.getColaboradores();
    setColaboradores(data);
  };

  const filterColaboradores = () => {
    let filtered = [...colaboradores];

    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.bi.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'todos') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    if (departamentoFilter !== 'todos') {
      filtered = filtered.filter(c => c.departamento === departamentoFilter);
    }

    setFilteredColaboradores(filtered);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem a certeza que deseja eliminar este colaborador?')) {
      ColaboradorStorage.deleteColaborador(id);
      toast.success('Colaborador eliminado com sucesso!');
      loadColaboradores();
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      activo: { variant: 'default', icon: UserCheck },
      inactivo: { variant: 'secondary', icon: UserX },
      ferias: { variant: 'outline', icon: Clock },
      afastado: { variant: 'destructive', icon: UserX },
      periodo_experimental: { variant: 'outline', icon: Clock }
    };

    const config = variants[status] || variants.activo;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const departamentos = Array.from(new Set(colaboradores.map(c => c.departamento)));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Colaboradores</h1>
          <p className="text-muted-foreground mt-1">
            Gerir os colaboradores da empresa
          </p>
        </div>
        <Button onClick={() => router.push('/rh/colaboradores/novo')} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Colaborador
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, email, código ou BI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
                <SelectItem value="ferias">Férias</SelectItem>
                <SelectItem value="afastado">Afastado</SelectItem>
                <SelectItem value="periodo_experimental">Período Experimental</SelectItem>
              </SelectContent>
            </Select>
            <Select value={departamentoFilter} onValueChange={setDepartamentoFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Departamentos</SelectItem>
                {departamentos.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="text-right">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum colaborador encontrado
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((colaborador) => (
                  <TableRow key={colaborador.id}>
                    <TableCell className="font-medium">{colaborador.codigo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={colaborador.foto} />
                          <AvatarFallback>{colaborador.nome.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{colaborador.nome}</p>
                          <p className="text-sm text-muted-foreground">BI: {colaborador.bi}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{colaborador.cargo}</TableCell>
                    <TableCell>{colaborador.departamento}</TableCell>
                    <TableCell>{getStatusBadge(colaborador.status)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3" />
                          {colaborador.email}
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" />
                          {colaborador.telefone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/rh/colaboradores/${colaborador.id}/editar`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(colaborador.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
