
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeneficioStorage } from '@/lib/storage/rh-storage';
import { Beneficio } from '@/types/rh';
import { Heart, Plus, DollarSign, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format-currency';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/ui/data-table-pagination';

export default function BeneficiosPage() {
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: beneficios, initialItemsPerPage: 10 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setBeneficios(BeneficioStorage.getBeneficios());
  };

  const getTipoLabel = (tipo: Beneficio['tipo']) => {
    const labels: Record<Beneficio['tipo'], string> = {
      subsidio_alimentacao: 'Subsídio de Alimentação',
      subsidio_transporte: 'Subsídio de Transporte',
      subsidio_habitacao: 'Subsídio de Habitação',
      seguro_saude: 'Seguro de Saúde',
      seguro_vida: 'Seguro de Vida',
      outro: 'Outro'
    };
    return labels[tipo];
  };

  const getPeriodicidadeLabel = (periodicidade: Beneficio['periodicidade']) => {
    const labels: Record<Beneficio['periodicidade'], string> = {
      mensal: 'Mensal',
      anual: 'Anual',
      unico: 'Único'
    };
    return labels[periodicidade];
  };

  const totalValorMensal = beneficios
    .filter(b => b.ativo && b.periodicidade === 'mensal')
    .reduce((acc, b) => acc + b.valor, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Benefícios</h1>
          <p className="text-muted-foreground mt-1">
            Administrar benefícios e subsídios dos colaboradores
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Benefício
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Benefícios</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{beneficios.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Benefícios Activos</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {beneficios.filter(b => b.ativo).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo Mensal Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalValorMensal)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Obrigatórios</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {beneficios.filter(b => b.obrigatorio).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benefícios Registados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Periodicidade</TableHead>
                <TableHead>Obrigatório</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum benefício encontrado
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((beneficio) => (
                  <TableRow key={beneficio.id}>
                    <TableCell className="font-medium">{beneficio.nome}</TableCell>
                    <TableCell>{getTipoLabel(beneficio.tipo)}</TableCell>
                    <TableCell>
                      {formatCurrency(beneficio.valor)}
                    </TableCell>
                    <TableCell>{getPeriodicidadeLabel(beneficio.periodicidade)}</TableCell>
                    <TableCell>
                      {beneficio.obrigatorio ? (
                        <Badge variant="default">Sim</Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {beneficio.ativo ? (
                        <Badge variant="default">Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{beneficio.descricao}</TableCell>
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
