
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  FileText,
  Edit,
  Trash2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { ContratoServicoStorage } from '@/lib/storage/servico-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function ContratosPage() {
  const [contratos, setContratos] = useState<any[]>([]);

  useEffect(() => {
    const dados = ContratoServicoStorage.getContratos();
    setContratos(dados);
  }, []);

  const obterCorStatus = (status: string) => {
    const cores: Record<string, string> = {
      'ativo': 'default',
      'pausado': 'secondary',
      'encerrado': 'outline',
      'cancelado': 'destructive'
    };
    return cores[status] || 'default';
  };

  const calcularDiasRestantes = (dataFim: string) => {
    const hoje = new Date();
    const fim = new Date(dataFim);
    const diferenca = fim.getTime() - hoje.getTime();
    const dias = Math.ceil(diferenca / (1000 * 3600 * 24));
    return dias;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Contratos de Serviços
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de contratos recorrentes com clientes
          </p>
        </div>
        <Button asChild>
          <Link href="/servicos/contratos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Contrato
          </Link>
        </Button>
      </div>

      {/* Tabela de Contratos */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Contratos ({contratos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviços</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Valor Mensal</TableHead>
                  <TableHead>Dias Restantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.map((contrato) => {
                  const diasRestantes = calcularDiasRestantes(contrato.dataFim);
                  return (
                    <TableRow key={contrato.id}>
                      <TableCell className="font-medium">{contrato.codigo}</TableCell>
                      <TableCell>{contrato.clienteNome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{contrato.servicos.length} serviços</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {new Date(contrato.dataInicio).toLocaleDateString('pt-MZ')} a{' '}
                            {new Date(contrato.dataFim).toLocaleDateString('pt-MZ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">
                            {formatCurrency(contrato.valorMensal)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={diasRestantes > 30 ? 'default' : diasRestantes > 0 ? 'secondary' : 'destructive'}
                        >
                          {diasRestantes > 0 ? `${diasRestantes} dias` : 'Expirado'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={obterCorStatus(contrato.status) as any}>
                          {contrato.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/servicos/contratos/${contrato.id}`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {contratos.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum contrato cadastrado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
