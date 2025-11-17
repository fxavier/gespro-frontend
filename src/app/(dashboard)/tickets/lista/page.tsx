
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { TicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { Plus, Search, Filter, Eye, Edit, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ListaTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    filterTickets();
  }, [tickets, searchTerm, statusFilter, prioridadeFilter]);

  const loadTickets = () => {
    setLoading(true);
    const data = TicketStorage.getTickets();
    setTickets(data);
    setLoading(false);
  };

  const filterTickets = () => {
    let filtered = [...tickets];

    if (searchTerm) {
      filtered = filtered.filter(
        t =>
          t.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.solicitanteNome.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'todos') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (prioridadeFilter !== 'todos') {
      filtered = filtered.filter(t => t.prioridade === prioridadeFilter);
    }

    setFilteredTickets(filtered);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este ticket?')) {
      const success = TicketStorage.deleteTicket(id);
      if (success) {
        toast.success('Ticket excluído com sucesso!');
        loadTickets();
      } else {
        toast.error('Erro ao excluir ticket');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      aberto: 'default',
      em_progresso: 'secondary',
      aguardando_cliente: 'outline',
      aguardando_terceiro: 'outline',
      resolvido: 'secondary',
      fechado: 'outline',
      cancelado: 'destructive'
    };

    return (
      <Badge variant={variants[status] || 'default'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      baixa: 'secondary',
      normal: 'default',
      alta: 'default',
      urgente: 'destructive'
    };

    return (
      <Badge variant={variants[prioridade] || 'default'}>
        {prioridade}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tickets</h1>
          <p className="text-muted-foreground">Gerencie todos os tickets de suporte</p>
        </div>
        <Link href="/tickets/novo">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Ticket
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="em_progresso">Em Progresso</SelectItem>
                <SelectItem value="aguardando_cliente">Aguardando Cliente</SelectItem>
                <SelectItem value="resolvido">Resolvido</SelectItem>
                <SelectItem value="fechado">Fechado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Prioridades</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchTerm('');
              setStatusFilter('todos');
              setPrioridadeFilter('todos');
            }}>
              <Filter className="mr-2 h-4 w-4" />
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data Abertura</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhum ticket encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-medium">{ticket.numero}</TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate">{ticket.titulo}</div>
                    </TableCell>
                    <TableCell>{ticket.solicitanteNome}</TableCell>
                    <TableCell>{ticket.categoria}</TableCell>
                    <TableCell>{getPrioridadeBadge(ticket.prioridade)}</TableCell>
                    <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                    <TableCell>
                      {format(new Date(ticket.tempos.dataAbertura), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {ticket.sla.emAtraso ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Atrasado
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No Prazo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/tickets/${ticket.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/tickets/${ticket.id}/editar`}>
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(ticket.id)}
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
        </CardContent>
      </Card>
    </div>
  );
}
