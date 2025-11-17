
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Truck,
  User,
  MapPin,
  Package,
  Wrench,
  Fuel,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Calendar,
  Activity
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function TransporteDashboardPage() {
  const estatisticas = {
    veiculos: {
      total: 15,
      disponiveis: 10,
      emRota: 3,
      manutencao: 2
    },
    motoristas: {
      total: 20,
      ativos: 18,
      emRota: 8,
      disponiveis: 10
    },
    entregas: {
      hoje: 45,
      pendentes: 12,
      emTransito: 8,
      concluidas: 25,
      falhadas: 0
    },
    rotas: {
      ativas: 5,
      planejadas: 3,
      concluidas: 120
    },
    custos: {
      combustivelMes: 45000,
      manutencaoMes: 12000,
      totalMes: 57000
    },
    alertas: {
      manutencoesPendentes: 3,
      documentosVencendo: 2,
      veiculosParados: 1
    }
  };

  const entregasRecentes = [
    {
      id: '1',
      numero: 'ENT-001',
      cliente: 'João Silva',
      endereco: 'Av. Julius Nyerere, 1234',
      status: 'entregue',
      motorista: 'Carlos Santos',
      veiculo: 'ABC-1234',
      hora: '14:30'
    },
    {
      id: '2',
      numero: 'ENT-002',
      cliente: 'Maria Costa',
      endereco: 'Rua da Resistência, 567',
      status: 'em_transito',
      motorista: 'Ana Pereira',
      veiculo: 'XYZ-5678',
      hora: '15:00'
    },
    {
      id: '3',
      numero: 'ENT-003',
      cliente: 'Empresa ABC Lda',
      endereco: 'Av. 25 de Setembro, 890',
      status: 'pendente',
      motorista: '-',
      veiculo: '-',
      hora: '16:00'
    }
  ];

  const veiculosAlerta = [
    {
      id: '1',
      matricula: 'ABC-1234',
      tipo: 'Manutenção Preventiva',
      descricao: 'Revisão dos 10.000 km vencida',
      prioridade: 'alta'
    },
    {
      id: '2',
      matricula: 'XYZ-5678',
      tipo: 'Documento',
      descricao: 'Seguro vence em 15 dias',
      prioridade: 'media'
    },
    {
      id: '3',
      matricula: 'DEF-9012',
      tipo: 'Inspeção',
      descricao: 'Inspeção técnica vence em 7 dias',
      prioridade: 'alta'
    }
  ];

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      entregue: { variant: 'default', label: 'Entregue' },
      em_transito: { variant: 'secondary', label: 'Em Trânsito' },
      pendente: { variant: 'secondary', label: 'Pendente' },
      falhada: { variant: 'destructive', label: 'Falhada' }
    };
    return badges[status] || badges.pendente;
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      alta: { variant: 'destructive', label: 'Alta' },
      media: { variant: 'secondary', label: 'Média' },
      baixa: { variant: 'default', label: 'Baixa' }
    };
    return badges[prioridade] || badges.baixa;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Transporte</h1>
          <p className="text-muted-foreground">Visão geral das operações de transporte e logística</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/transporte/entregas/nova">
              <Package className="h-4 w-4 mr-2" />
              Nova Entrega
            </Link>
          </Button>
          <Button asChild>
            <Link href="/transporte/rotas/nova">
              <MapPin className="h-4 w-4 mr-2" />
              Nova Rota
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Veículos Disponíveis</p>
                <p className="text-3xl font-bold">{estatisticas.veiculos.disponiveis}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  de {estatisticas.veiculos.total} veículos
                </p>
              </div>
              <Truck className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entregas Hoje</p>
                <p className="text-3xl font-bold">{estatisticas.entregas.hoje}</p>
                <p className="text-xs text-green-600 mt-1">
                  {estatisticas.entregas.concluidas} concluídas
                </p>
              </div>
              <Package className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rotas Ativas</p>
                <p className="text-3xl font-bold">{estatisticas.rotas.ativas}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {estatisticas.rotas.planejadas} planejadas
                </p>
              </div>
              <MapPin className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Custos do Mês</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.custos.totalMes / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-muted-foreground mt-1">MT</p>
              </div>
              <DollarSign className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                <span className="font-medium">Veículos</span>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transporte/veiculos">Ver todos</Link>
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Disponíveis</span>
                <Badge variant="default">{estatisticas.veiculos.disponiveis}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Em Rota</span>
                <Badge variant="secondary">{estatisticas.veiculos.emRota}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Manutenção</span>
                <Badge variant="destructive">{estatisticas.veiculos.manutencao}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                <span className="font-medium">Motoristas</span>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transporte/motoristas">Ver todos</Link>
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Disponíveis</span>
                <Badge variant="default">{estatisticas.motoristas.disponiveis}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Em Rota</span>
                <Badge variant="secondary">{estatisticas.motoristas.emRota}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Ativos</span>
                <Badge variant="secondary">{estatisticas.motoristas.ativos}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                <span className="font-medium">Custos Mensais</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Combustível</span>
                <span className="font-medium">MT {estatisticas.custos.combustivelMes.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Manutenção</span>
                <span className="font-medium">MT {estatisticas.custos.manutencaoMes.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Total</span>
                <span className="font-bold">MT {estatisticas.custos.totalMes.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Entregas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {entregasRecentes.map((entrega) => {
                const statusInfo = getStatusBadge(entrega.status);
                return (
                  <div key={entrega.id} className="flex items-start justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{entrega.numero}</span>
                        <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{entrega.cliente}</p>
                      <p className="text-xs text-muted-foreground">{entrega.endereco}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {entrega.motorista}
                        </span>
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {entrega.veiculo}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {entrega.hora}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link href="/transporte/entregas">Ver todas as entregas</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Alertas e Notificações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {veiculosAlerta.map((alerta) => {
                const prioridadeInfo = getPrioridadeBadge(alerta.prioridade);
                return (
                  <div key={alerta.id} className="flex items-start justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{alerta.matricula}</span>
                        <Badge variant={prioridadeInfo.variant as any}>{prioridadeInfo.label}</Badge>
                      </div>
                      <p className="text-sm font-medium">{alerta.tipo}</p>
                      <p className="text-xs text-muted-foreground">{alerta.descricao}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/transporte/manutencao">
                  <Wrench className="h-4 w-4 mr-1" />
                  Manutenção
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/transporte/veiculos">
                  <Truck className="h-4 w-4 mr-1" />
                  Veículos
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/transporte/combustivel">
                  <Fuel className="h-4 w-4 mr-1" />
                  Combustível
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Link href="/transporte/veiculos" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Truck className="h-8 w-8 text-blue-600 mb-2" />
                <p className="font-medium">Veículos</p>
                <p className="text-2xl font-bold">{estatisticas.veiculos.total}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/transporte/motoristas" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <User className="h-8 w-8 text-green-600 mb-2" />
                <p className="font-medium">Motoristas</p>
                <p className="text-2xl font-bold">{estatisticas.motoristas.total}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/transporte/rotas" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <MapPin className="h-8 w-8 text-purple-600 mb-2" />
                <p className="font-medium">Rotas</p>
                <p className="text-2xl font-bold">{estatisticas.rotas.ativas}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/transporte/entregas" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Package className="h-8 w-8 text-orange-600 mb-2" />
                <p className="font-medium">Entregas</p>
                <p className="text-2xl font-bold">{estatisticas.entregas.hoje}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/transporte/manutencao" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Wrench className="h-8 w-8 text-red-600 mb-2" />
                <p className="font-medium">Manutenção</p>
                <p className="text-2xl font-bold">{estatisticas.alertas.manutencoesPendentes}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/transporte/combustivel" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Fuel className="h-8 w-8 text-yellow-600 mb-2" />
                <p className="font-medium">Combustível</p>
                <p className="text-2xl font-bold">{(estatisticas.custos.combustivelMes / 1000).toFixed(0)}k</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
