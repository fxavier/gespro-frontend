
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar,
  Clock,
  MapPin,
  Phone,
  Edit,
  Trash2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { AgendamentoServicoStorage } from '@/lib/storage/servico-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function AgendamentosPage() {
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [filtrados, setFiltrados] = useState<any[]>([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [dataFiltro, setDataFiltro] = useState('');

  useEffect(() => {
    const dados = AgendamentoServicoStorage.getAgendamentos();
    setAgendamentos(dados);
    setFiltrados(dados);
  }, []);

  useEffect(() => {
    let resultado = agendamentos;

    if (termoPesquisa) {
      resultado = resultado.filter(a =>
        a.servicoNome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        a.clienteNome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        a.codigo.includes(termoPesquisa)
      );
    }

    if (statusFiltro !== 'todos') {
      resultado = resultado.filter(a => a.status === statusFiltro);
    }

    if (dataFiltro) {
      resultado = resultado.filter(a => a.dataAgendamento === dataFiltro);
    }

    setFiltrados(resultado);
  }, [termoPesquisa, statusFiltro, dataFiltro, agendamentos]);

  const obterCorStatus = (status: string) => {
    const cores: Record<string, string> = {
      'pendente': 'secondary',
      'confirmado': 'default',
      'em_andamento': 'outline',
      'concluido': 'default',
      'cancelado': 'destructive',
      'nao_compareceu': 'destructive'
    };
    return cores[status] || 'default';
  };

  const obterIconeStatus = (status: string) => {
    if (status === 'concluido') return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (status === 'pendente') return <AlertCircle className="h-4 w-4 text-orange-600" />;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Agendamentos de Serviços
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de agendamentos e compromissos
          </p>
        </div>
        <Button asChild>
          <Link href="/servicos/agendamentos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Agendamento
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por serviço, cliente ou código..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dataFiltro}
              onChange={(e) => setDataFiltro(e.target.value)}
              className="w-full md:w-48"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Agendamentos */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Agendamentos ({filtrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((agendamento) => (
                  <TableRow key={agendamento.id}>
                    <TableCell className="font-medium">{agendamento.codigo}</TableCell>
                    <TableCell>{agendamento.servicoNome}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{agendamento.clienteNome}</p>
                        <p className="text-sm text-gray-500">{agendamento.clienteTelefone}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">
                          {new Date(agendamento.dataAgendamento).toLocaleDateString('pt-MZ')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 mt-1">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">{agendamento.horaInicio}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">{agendamento.cidade}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(agendamento.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {obterIconeStatus(agendamento.status)}
                        <Badge variant={obterCorStatus(agendamento.status) as any}>
                          {agendamento.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/servicos/agendamentos/${agendamento.id}`}>
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

          {filtrados.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum agendamento encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
