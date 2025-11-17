'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  ArrowLeft,
  User,
  DollarSign,
  TrendingUp,
  Target,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Trophy,
  Settings,
  Edit,
  CheckCircle,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import { ComissaoVendedor } from '@/types/pedido';

interface VendedorDetalhado {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  nif: string;
  comissaoPercentualPadrao: number;
  ativo: boolean;
  lojaId: string;
  lojaNome: string;
  categoria: 'junior' | 'pleno' | 'senior' | 'gerente';
  dataAdmissao: Date;
  endereco?: string;
  meta: {
    mensal: number;
    trimestral: number;
    anual: number;
  };
  estatisticas: {
    vendasMes: number;
    vendasTrimestre: number;
    vendasAno: number;
    comissoesMes: number;
    comissoesTrimestre: number;
    comissoesAno: number;
    metaAtingidaMes: number;
    metaAtingidaTrimestre: number;
    metaAtingidaAno: number;
    ranking: number;
    clientesAtendidos: number;
    ticketMedio: number;
  };
}

export default function DetalhesVendedorPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  // Dados detalhados do vendedor
  const vendedor: VendedorDetalhado = {
    id: id,
    nome: 'Maria Santos',
    email: 'maria.santos@empresa.com',
    telefone: '849000001',
    nif: '123456789',
    comissaoPercentualPadrao: 5,
    ativo: true,
    lojaId: '1',
    lojaNome: 'Loja Centro',
    categoria: 'senior',
    dataAdmissao: new Date('2022-03-15'),
    endereco: 'Av. Julius Nyerere, 123, Maputo',
    meta: {
      mensal: 100000,
      trimestral: 300000,
      anual: 1200000
    },
    estatisticas: {
      vendasMes: 125000,
      vendasTrimestre: 340000,
      vendasAno: 1350000,
      comissoesMes: 6250,
      comissoesTrimestre: 17000,
      comissoesAno: 67500,
      metaAtingidaMes: 125,
      metaAtingidaTrimestre: 113,
      metaAtingidaAno: 112,
      ranking: 1,
      clientesAtendidos: 45,
      ticketMedio: 2777.78
    }
  };

  // Dados de performance mensal
  const performanceMensal = [
    { mes: 'Jan', vendas: 98000, meta: 100000, comissao: 4900 },
    { mes: 'Fev', vendas: 110000, meta: 100000, comissao: 5500 },
    { mes: 'Mar', vendas: 132000, meta: 100000, comissao: 6600 },
    { mes: 'Abr', vendas: 95000, meta: 100000, comissao: 4750 },
    { mes: 'Mai', vendas: 145000, meta: 100000, comissao: 7250 },
    { mes: 'Jun', vendas: 125000, meta: 100000, comissao: 6250 }
  ];

  // Histórico de comissões
  const comissoes: ComissaoVendedor[] = [
    {
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      percentualBase: 5,
      percentualAplicado: 7,
      valorBase: 55000,
      valorComissao: 3850,
      pedidoId: '1',
      pedidoNumero: 'PED-2024-001',
      data: new Date('2024-01-20'),
      pago: false
    },
    {
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      percentualBase: 5,
      percentualAplicado: 5,
      valorBase: 12500,
      valorComissao: 625,
      pedidoId: '2',
      pedidoNumero: 'PED-2024-002',
      data: new Date('2024-01-19'),
      pago: true
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      vendedorId: '1',
      vendedorNome: 'Maria Santos',
      percentualBase: 5,
      percentualAplicado: Math.random() > 0.7 ? 7 : 5,
      valorBase: Math.floor(Math.random() * 50000) + 10000,
      valorComissao: 0,
      pedidoId: `${i + 3}`,
      pedidoNumero: `PED-2024-${String(i + 3).padStart(3, '0')}`,
      data: new Date(2024, 0, Math.floor(Math.random() * 30) + 1),
      pago: Math.random() > 0.4
    })).map(comissao => ({
      ...comissao,
      valorComissao: Math.floor((comissao.valorBase * comissao.percentualAplicado) / 100)
    }))
  ];

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: comissoes, initialItemsPerPage: 10 });

  const getCategoriaColor = (categoria: string) => {
    const colors = {
      junior: 'bg-blue-100 text-blue-800',
      pleno: 'bg-green-100 text-green-800',
      senior: 'bg-purple-100 text-purple-800',
      gerente: 'bg-red-100 text-red-800'
    };
    return colors[categoria as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getMetaBadge = (percentual: number) => {
    if (percentual >= 100) {
      return <Badge variant="default" className="gap-1"><Trophy className="h-3 w-3" />Meta Atingida</Badge>;
    } else if (percentual >= 80) {
      return <Badge variant="secondary" className="gap-1"><Target className="h-3 w-3" />Próximo da Meta</Badge>;
    } else {
      return <Badge variant="outline" className="gap-1"><Target className="h-3 w-3" />Abaixo da Meta</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/vendas/vendedores')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{vendedor.nome}</h1>
          <p className="text-muted-foreground">{vendedor.lojaNome} • {vendedor.categoria}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/vendas/vendedores/${vendedor.id}/comissoes`}>
              <Settings className="h-4 w-4 mr-2" />
              Configurar Comissões
            </Link>
          </Button>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            Editar Vendedor
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Informações Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{vendedor.nome}</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoriaColor(vendedor.categoria)}`}>
                    {vendedor.categoria.charAt(0).toUpperCase() + vendedor.categoria.slice(1)}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{vendedor.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{vendedor.telefone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{vendedor.endereco}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Desde {vendedor.dataAdmissao.toLocaleDateString('pt-PT')}
                  </span>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-2">Status</p>
                {vendedor.ativo ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Inativo
                  </Badge>
                )}
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Comissão Padrão</p>
                <p className="text-2xl font-bold text-primary">
                  {vendedor.comissaoPercentualPadrao}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Vendas Este Mês</p>
                    <p className="text-2xl font-bold">
                      MT {(vendedor.estatisticas.vendasMes / 1000).toFixed(0)}k
                    </p>
                    <div className="mt-1">
                      {getMetaBadge(vendedor.estatisticas.metaAtingidaMes)}
                    </div>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Comissões Este Mês</p>
                    <p className="text-2xl font-bold">
                      MT {vendedor.estatisticas.comissoesMes.toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {vendedor.estatisticas.comissoesMes > 0 ? 
                        `${((vendedor.estatisticas.comissoesMes / vendedor.estatisticas.vendasMes) * 100).toFixed(1)}% das vendas` : 
                        'Sem comissões'
                      }
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ranking</p>
                    <p className="text-2xl font-bold">#{vendedor.estatisticas.ranking}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {vendedor.estatisticas.clientesAtendidos} clientes
                    </p>
                  </div>
                  <Trophy className="h-8 w-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Performance dos Últimos 6 Meses</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  vendas: {
                    label: 'Vendas',
                    color: 'hsl(var(--chart-1))',
                  },
                  meta: {
                    label: 'Meta',
                    color: 'hsl(var(--chart-2))',
                  },
                  comissao: {
                    label: 'Comissão',
                    color: 'hsl(var(--chart-3))',
                  },
                }}
                className="h-[400px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceMensal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="vendas"
                      fill="#8884d8"
                      name="Vendas (MT)"
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="meta"
                      fill="#82ca9d"
                      name="Meta (MT)"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="comissao"
                      fill="#ffc658"
                      name="Comissão (MT)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metas e Objetivos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Meta Mensal</span>
                    <span className="text-sm text-muted-foreground">
                      {vendedor.estatisticas.metaAtingidaMes}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full" 
                      style={{ width: `${Math.min(vendedor.estatisticas.metaAtingidaMes, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>MT {vendedor.estatisticas.vendasMes.toLocaleString()}</span>
                    <span>MT {vendedor.meta.mensal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Meta Trimestral</span>
                    <span className="text-sm text-muted-foreground">
                      {vendedor.estatisticas.metaAtingidaTrimestre}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full" 
                      style={{ width: `${Math.min(vendedor.estatisticas.metaAtingidaTrimestre, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>MT {vendedor.estatisticas.vendasTrimestre.toLocaleString()}</span>
                    <span>MT {vendedor.meta.trimestral.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Meta Anual</span>
                    <span className="text-sm text-muted-foreground">
                      {vendedor.estatisticas.metaAtingidaAno}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-orange-600 h-2 rounded-full" 
                      style={{ width: `${Math.min(vendedor.estatisticas.metaAtingidaAno, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>MT {vendedor.estatisticas.vendasAno.toLocaleString()}</span>
                    <span>MT {vendedor.meta.anual.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de Comissões</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Valor Base</TableHead>
                    <TableHead>%</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((comissao, index) => (
                      <TableRow key={`${comissao.pedidoId}-${index}`}>
                        <TableCell>{comissao.data.toLocaleDateString('pt-PT')}</TableCell>
                        <TableCell className="font-medium">{comissao.pedidoNumero}</TableCell>
                        <TableCell>MT {comissao.valorBase.toFixed(2)}</TableCell>
                        <TableCell>
                          {comissao.percentualAplicado !== comissao.percentualBase ? (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground line-through text-sm">
                                {comissao.percentualBase}%
                              </span>
                              <span className="font-medium text-green-600">
                                {comissao.percentualAplicado}%
                              </span>
                            </div>
                          ) : (
                            <span>{comissao.percentualBase}%</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          MT {comissao.valorComissao.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {comissao.pago ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Pago
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <DollarSign className="h-12 w-12 opacity-50" />
                          <p>Nenhuma comissão encontrada</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <PaginationControls
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
      </div>
    </div>
  );
}