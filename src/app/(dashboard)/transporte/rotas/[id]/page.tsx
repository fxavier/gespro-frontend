'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  PlayCircle,
  PauseCircle,
  CheckCircle,
  XCircle,
  Route,
  Target,
  DollarSign,
  Truck,
  User,
  Fuel,
  Clock,
  Navigation,
  MapPin,
  Package,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Rota {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  origem: string;
  destino: string;
  pontos: PontoRota[];
  distanciaTotal: number;
  tempoEstimado: number;
  status: 'planejada' | 'ativa' | 'concluida' | 'cancelada' | 'pausada';
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  veiculoId?: string;
  veiculoMatricula?: string;
  motoristaId?: string;
  motoristaNome?: string;
  dataInicio?: Date;
  dataFim?: Date;
  dataPlanejada: Date;
  custoEstimado: number;
  custoReal?: number;
  combustivelEstimado: number;
  combustivelReal?: number;
  entregas: EntregaRota[];
  observacoes?: string;
  criadoEm: Date;
  criadoPor: string;
}

interface PontoRota {
  id: string;
  ordem: number;
  endereco: string;
  latitude?: number;
  longitude?: number;
  tempoParada: number;
  tipo: 'coleta' | 'entrega' | 'parada';
  clienteId?: string;
  clienteNome?: string;
  observacoes?: string;
  concluido: boolean;
  horaChegada?: Date;
  horaSaida?: Date;
}

interface EntregaRota {
  id: string;
  codigo: string;
  clienteNome: string;
  endereco: string;
  status: 'pendente' | 'em_transito' | 'entregue' | 'falhada';
  tentativas: number;
  peso?: number;
  volume?: number;
}

const rotas: Rota[] = [
  {
    id: '1',
    codigo: 'RT-001',
    nome: 'Rota Centro-Norte',
    descricao: 'Entregas na zona central e norte da cidade',
    origem: 'Armazém Central - Av. Julius Nyerere',
    destino: 'Zona Norte - Bairro de Sommerschield',
    pontos: [
      {
        id: '1',
        ordem: 1,
        endereco: 'Av. Julius Nyerere, 1234',
        tempoParada: 15,
        tipo: 'entrega',
        clienteId: '1',
        clienteNome: 'João Silva',
        concluido: true,
        horaChegada: new Date('2024-06-20T08:30:00'),
        horaSaida: new Date('2024-06-20T08:45:00')
      },
      {
        id: '2',
        ordem: 2,
        endereco: 'Rua da Resistência, 567',
        tempoParada: 20,
        tipo: 'entrega',
        clienteId: '2',
        clienteNome: 'Maria Costa',
        concluido: true,
        horaChegada: new Date('2024-06-20T09:15:00'),
        horaSaida: new Date('2024-06-20T09:35:00')
      },
      {
        id: '3',
        ordem: 3,
        endereco: 'Av. 25 de Setembro, 890',
        tempoParada: 30,
        tipo: 'entrega',
        clienteId: '3',
        clienteNome: 'Empresa ABC Lda',
        concluido: false
      }
    ],
    distanciaTotal: 45.5,
    tempoEstimado: 240,
    status: 'ativa',
    prioridade: 'alta',
    veiculoId: '1',
    veiculoMatricula: 'ABC-1234',
    motoristaId: '1',
    motoristaNome: 'Carlos Santos',
    dataInicio: new Date('2024-06-20T08:00:00'),
    dataPlanejada: new Date('2024-06-20'),
    custoEstimado: 1250,
    combustivelEstimado: 18.5,
    entregas: [
      {
        id: '1',
        codigo: 'ENT-001',
        clienteNome: 'João Silva',
        endereco: 'Av. Julius Nyerere, 1234',
        status: 'entregue',
        tentativas: 1,
        peso: 5.5,
        volume: 0.2
      },
      {
        id: '2',
        codigo: 'ENT-002',
        clienteNome: 'Maria Costa',
        endereco: 'Rua da Resistência, 567',
        status: 'entregue',
        tentativas: 1,
        peso: 3.2,
        volume: 0.15
      },
      {
        id: '3',
        codigo: 'ENT-003',
        clienteNome: 'Empresa ABC Lda',
        endereco: 'Av. 25 de Setembro, 890',
        status: 'em_transito',
        tentativas: 0,
        peso: 12.8,
        volume: 0.45
      }
    ],
    criadoEm: new Date('2024-06-19'),
    criadoPor: 'admin'
  },
  {
    id: '2',
    codigo: 'RT-002',
    nome: 'Rota Matola-Maputo',
    descricao: 'Coletas e entregas entre Matola e Maputo',
    origem: 'Matola - Zona Industrial',
    destino: 'Maputo - Centro da Cidade',
    pontos: [
      {
        id: '4',
        ordem: 1,
        endereco: 'Matola - Fábrica XYZ',
        tempoParada: 45,
        tipo: 'coleta',
        clienteId: '4',
        clienteNome: 'Fábrica XYZ',
        concluido: false
      },
      {
        id: '5',
        ordem: 2,
        endereco: 'Av. Vladimir Lenine, 200',
        tempoParada: 20,
        tipo: 'entrega',
        clienteId: '5',
        clienteNome: 'Loja Central',
        concluido: false
      }
    ],
    distanciaTotal: 32.0,
    tempoEstimado: 180,
    status: 'planejada',
    prioridade: 'media',
    dataPlanejada: new Date('2024-06-21'),
    custoEstimado: 980,
    combustivelEstimado: 14.2,
    entregas: [
      {
        id: '4',
        codigo: 'ENT-004',
        clienteNome: 'Loja Central',
        endereco: 'Av. Vladimir Lenine, 200',
        status: 'pendente',
        tentativas: 0,
        peso: 8.5,
        volume: 0.3
      }
    ],
    criadoEm: new Date('2024-06-19'),
    criadoPor: 'admin'
  },
  {
    id: '3',
    codigo: 'RT-003',
    nome: 'Rota Expressa Sul',
    descricao: 'Entrega urgente zona sul',
    origem: 'Armazém Central',
    destino: 'Catembe',
    pontos: [
      {
        id: '6',
        ordem: 1,
        endereco: 'Catembe - Porto de Pesca',
        tempoParada: 30,
        tipo: 'entrega',
        clienteId: '6',
        clienteNome: 'Pescadores Unidos',
        concluido: true,
        horaChegada: new Date('2024-06-19T14:30:00'),
        horaSaida: new Date('2024-06-19T15:00:00')
      }
    ],
    distanciaTotal: 28.5,
    tempoEstimado: 120,
    status: 'concluida',
    prioridade: 'urgente',
    veiculoId: '2',
    veiculoMatricula: 'XYZ-5678',
    motoristaId: '2',
    motoristaNome: 'Ana Pereira',
    dataInicio: new Date('2024-06-19T13:30:00'),
    dataFim: new Date('2024-06-19T15:30:00'),
    dataPlanejada: new Date('2024-06-19'),
    custoEstimado: 750,
    custoReal: 720,
    combustivelEstimado: 12.0,
    combustivelReal: 11.5,
    entregas: [
      {
        id: '5',
        codigo: 'ENT-005',
        clienteNome: 'Pescadores Unidos',
        endereco: 'Catembe - Porto de Pesca',
        status: 'entregue',
        tentativas: 1,
        peso: 25.0,
        volume: 1.2
      }
    ],
    criadoEm: new Date('2024-06-19'),
    criadoPor: 'admin'
  },
  {
    id: '4',
    codigo: 'RT-004',
    nome: 'Rota Especial Cliente VIP',
    descricao: 'Atendimento exclusivo cliente premium',
    origem: 'Armazém Especial',
    destino: 'Polana Cimento',
    pontos: [
      {
        id: '7',
        ordem: 1,
        endereco: 'Polana Cimento - Escritório Principal',
        tempoParada: 60,
        tipo: 'entrega',
        clienteId: '7',
        clienteNome: 'Cliente VIP Premium',
        concluido: false
      }
    ],
    distanciaTotal: 15.2,
    tempoEstimado: 90,
    status: 'pausada',
    prioridade: 'alta',
    veiculoId: '3',
    veiculoMatricula: 'VIP-0001',
    motoristaId: '3',
    motoristaNome: 'José Manuel',
    dataInicio: new Date('2024-06-20T10:00:00'),
    dataPlanejada: new Date('2024-06-20'),
    custoEstimado: 450,
    combustivelEstimado: 6.8,
    entregas: [
      {
        id: '6',
        codigo: 'ENT-006',
        clienteNome: 'Cliente VIP Premium',
        endereco: 'Polana Cimento - Escritório Principal',
        status: 'em_transito',
        tentativas: 0,
        peso: 2.5,
        volume: 0.05
      }
    ],
    observacoes: 'Cliente VIP - Requer tratamento especial e confirmação de entrega',
    criadoEm: new Date('2024-06-20'),
    criadoPor: 'admin'
  }
];

function getStatusInfo(status: string): { label: string; icon: React.ReactNode; color: string } {
  const map: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    planejada: { label: 'Planejada', icon: <Calendar className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
    ativa: { label: 'Ativa', icon: <PlayCircle className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
    pausada: { label: 'Pausada', icon: <PauseCircle className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
    concluida: { label: 'Concluída', icon: <CheckCircle className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
    cancelada: { label: 'Cancelada', icon: <XCircle className="h-3 w-3" />, color: 'bg-red-100 text-red-800' },
  };
  return map[status] ?? { label: status, icon: null, color: 'bg-gray-100 text-gray-800' };
}

function getPrioridadeInfo(prioridade: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    baixa: { label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
    media: { label: 'Média', color: 'bg-blue-100 text-blue-800' },
    alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
    urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800' },
  };
  return map[prioridade] ?? { label: prioridade, color: 'bg-gray-100 text-gray-800' };
}

function getEntregaStatusInfo(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    entregue: { label: 'Entregue', color: 'bg-green-100 text-green-800' },
    em_transito: { label: 'Em Trânsito', color: 'bg-blue-100 text-blue-800' },
    pendente: { label: 'Pendente', color: 'bg-gray-100 text-gray-800' },
    falhada: { label: 'Falhada', color: 'bg-red-100 text-red-800' },
  };
  return map[status] ?? { label: status, color: 'bg-gray-100 text-gray-800' };
}

function getPontoTipoInfo(tipo: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    coleta: { label: 'Coleta', color: 'bg-purple-100 text-purple-800' },
    entrega: { label: 'Entrega', color: 'bg-blue-100 text-blue-800' },
    parada: { label: 'Parada', color: 'bg-gray-100 text-gray-800' },
  };
  return map[tipo] ?? { label: tipo, color: 'bg-gray-100 text-gray-800' };
}

function formatMoeda(valor: number): string {
  return 'MT ' + valor.toLocaleString('pt-MZ');
}

function formatCombustivel(valor: number): string {
  return valor.toFixed(1) + ' L';
}

export default function RotaDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const rota = rotas.find(r => r.id === id);

  if (!rota) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.push('/transporte/rotas')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="mt-8 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Rota não encontrada</p>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(rota.status);
  const prioridadeInfo = getPrioridadeInfo(rota.prioridade);
  const custo = rota.custoReal !== undefined ? rota.custoReal : rota.custoEstimado;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/transporte/rotas')}
          className="mt-1 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {rota.codigo} · {rota.nome}
          </h1>
          <p className="text-gray-500 mt-1">
            {rota.origem} → {rota.destino}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${statusInfo.color} flex items-center gap-1 w-fit`}>
              {statusInfo.icon}
              {statusInfo.label}
            </Badge>
          </CardContent>
        </Card>

        {/* Prioridade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${prioridadeInfo.color} flex items-center gap-1 w-fit`}>
              <Target className="h-3 w-3" />
              {prioridadeInfo.label}
            </Badge>
          </CardContent>
        </Card>

        {/* Distância Total */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Distância Total</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Route className="h-4 w-4 text-gray-400" />
            <span className="text-lg font-semibold text-gray-900">
              {rota.distanciaTotal.toFixed(1)} km
            </span>
          </CardContent>
        </Card>

        {/* Custo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {rota.custoReal !== undefined ? 'Custo Real' : 'Custo Estimado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <span className="text-lg font-semibold text-gray-900">
              {formatMoeda(custo)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="informacoes">
        <TabsList>
          <TabsTrigger value="informacoes">Informações Gerais</TabsTrigger>
          <TabsTrigger value="pontos">Pontos da Rota</TabsTrigger>
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="custos">Custos</TabsTrigger>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
        </TabsList>

        {/* Informações Gerais */}
        <TabsContent value="informacoes">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Veículo</p>
                  <p className="text-sm text-gray-900 mt-1">{rota.veiculoMatricula ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Motorista</p>
                  <p className="text-sm text-gray-900 mt-1">{rota.motoristaNome ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Planeada</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {format(rota.dataPlanejada, 'dd/MM/yyyy', { locale: pt })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Início</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {rota.dataInicio
                      ? format(rota.dataInicio, 'dd/MM/yyyy HH:mm', { locale: pt })
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Fim</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {rota.dataFim
                      ? format(rota.dataFim, 'dd/MM/yyyy HH:mm', { locale: pt })
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Distância Total</p>
                  <p className="text-sm text-gray-900 mt-1">{rota.distanciaTotal.toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Tempo Estimado</p>
                  <p className="text-sm text-gray-900 mt-1">{rota.tempoEstimado} min</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Combustível Estimado</p>
                  <p className="text-sm text-gray-900 mt-1">{formatCombustivel(rota.combustivelEstimado)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Combustível Real</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {rota.combustivelReal !== undefined
                      ? formatCombustivel(rota.combustivelReal)
                      : '—'}
                  </p>
                </div>
              </div>

              {rota.observacoes && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Observações</h3>
                  <p className="text-sm text-gray-900">{rota.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pontos da Rota */}
        <TabsContent value="pontos">
          <Card>
            <CardContent className="pt-6">
              {rota.pontos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <MapPin className="h-10 w-10 mb-3" />
                  <p className="text-sm">Nenhum ponto de rota registado</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Ordem</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tempo de Paragem</TableHead>
                      <TableHead>Hora Chegada</TableHead>
                      <TableHead>Hora Saída</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...rota.pontos]
                      .sort((a, b) => a.ordem - b.ordem)
                      .map((ponto) => {
                        const tipoInfo = getPontoTipoInfo(ponto.tipo);
                        return (
                          <TableRow key={ponto.id}>
                            <TableCell className="font-medium text-center">
                              {ponto.ordem}
                            </TableCell>
                            <TableCell>{ponto.endereco}</TableCell>
                            <TableCell>
                              <Badge className={`${tipoInfo.color}`}>
                                {tipoInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell>{ponto.clienteNome ?? '—'}</TableCell>
                            <TableCell>{ponto.tempoParada} min</TableCell>
                            <TableCell>
                              {ponto.horaChegada
                                ? format(ponto.horaChegada, 'HH:mm')
                                : '—'}
                            </TableCell>
                            <TableCell>
                              {ponto.horaSaida
                                ? format(ponto.horaSaida, 'HH:mm')
                                : '—'}
                            </TableCell>
                            <TableCell>
                              {ponto.concluido ? (
                                <Badge className="bg-green-100 text-green-800">
                                  Concluído
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-800">
                                  Pendente
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="entregas">
          <Card>
            <CardContent className="pt-6">
              {rota.entregas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Package className="h-10 w-10 mb-3" />
                  <p className="text-sm">Nenhuma entrega registada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Peso</TableHead>
                      <TableHead>Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rota.entregas.map((entrega) => {
                      const entregaStatusInfo = getEntregaStatusInfo(entrega.status);
                      return (
                        <TableRow key={entrega.id}>
                          <TableCell className="font-medium">{entrega.codigo}</TableCell>
                          <TableCell>{entrega.clienteNome}</TableCell>
                          <TableCell>{entrega.endereco}</TableCell>
                          <TableCell>
                            <Badge className={entregaStatusInfo.color}>
                              {entregaStatusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{entrega.tentativas}</TableCell>
                          <TableCell>
                            {entrega.peso !== undefined ? `${entrega.peso} kg` : '—'}
                          </TableCell>
                          <TableCell>
                            {entrega.volume !== undefined ? `${entrega.volume} m³` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="custos">
          <div className="space-y-4">
            {/* Cost Cards */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Custos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Custo Estimado — always shown */}
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium text-gray-500">Custo Estimado</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {formatMoeda(rota.custoEstimado)}
                    </p>
                  </div>

                  {/* Custo Real — only when present */}
                  {rota.custoReal !== undefined && (
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-gray-500">Custo Real</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatMoeda(rota.custoReal)}
                      </p>
                    </div>
                  )}

                  {/* Variação — only when custoReal is present */}
                  {rota.custoReal !== undefined && (() => {
                    const variacao = rota.custoReal - rota.custoEstimado;
                    const isSaving = variacao < 0;
                    return (
                      <div className="rounded-lg border p-4">
                        <p className="text-sm font-medium text-gray-500">Variação</p>
                        <p className={`text-xl font-bold mt-1 ${isSaving ? 'text-green-600' : 'text-red-600'}`}>
                          {isSaving ? '−' : '+'}{formatMoeda(Math.abs(variacao))}
                        </p>
                        <p className={`text-xs mt-1 ${isSaving ? 'text-green-500' : 'text-red-500'}`}>
                          {isSaving ? 'Economia' : 'Excesso'}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Fuel Cards */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
                  <Fuel className="h-4 w-4" />
                  Combustível
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Combustível Estimado — always shown */}
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium text-gray-500">Combustível Estimado</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {formatCombustivel(rota.combustivelEstimado)}
                    </p>
                  </div>

                  {/* Combustível Real — only when present */}
                  {rota.combustivelReal !== undefined && (
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-gray-500">Combustível Real</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {formatCombustivel(rota.combustivelReal)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardContent className="pt-6">
              {(() => {
                // Build timeline steps — omit steps whose date field is absent
                const steps: {
                  key: string;
                  label: string;
                  date: Date;
                  subtitle?: string;
                  icon: React.ReactNode;
                  iconBg: string;
                }[] = [];

                // Step 1: Criado — always present (criadoEm is required)
                steps.push({
                  key: 'criado',
                  label: 'Criado',
                  date: rota.criadoEm,
                  subtitle: rota.criadoPor,
                  icon: <Calendar className="h-4 w-4 text-white" />,
                  iconBg: 'bg-gray-500',
                });

                // Step 2: Planeado — dataPlanejada is required
                steps.push({
                  key: 'planeado',
                  label: 'Planeado',
                  date: rota.dataPlanejada,
                  icon: <Clock className="h-4 w-4 text-white" />,
                  iconBg: 'bg-blue-500',
                });

                // Step 3: Iniciado — optional
                if (rota.dataInicio) {
                  steps.push({
                    key: 'iniciado',
                    label: 'Iniciado',
                    date: rota.dataInicio,
                    icon: <PlayCircle className="h-4 w-4 text-white" />,
                    iconBg: 'bg-green-500',
                  });
                }

                // Step 4: Concluído — optional
                if (rota.dataFim) {
                  steps.push({
                    key: 'concluido',
                    label: 'Concluído',
                    date: rota.dataFim,
                    icon: <CheckCircle className="h-4 w-4 text-white" />,
                    iconBg: 'bg-emerald-600',
                  });
                }

                return (
                  <ol className="relative border-l border-gray-200 ml-4 space-y-8">
                    {steps.map((step, index) => {
                      // Use HH:mm pattern for datetime values (dataInicio, dataFim, criadoEm)
                      // Use date-only pattern for date-only values (dataPlanejada)
                      const isDateOnly =
                        step.key === 'planeado';
                      const formattedDate = isDateOnly
                        ? format(step.date, 'dd/MM/yyyy', { locale: pt })
                        : format(step.date, 'dd/MM/yyyy HH:mm', { locale: pt });

                      return (
                        <li key={step.key} className="ml-6">
                          {/* Circle icon on the timeline line */}
                          <span
                            className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${step.iconBg}`}
                          >
                            {step.icon}
                          </span>

                          <div className="rounded-lg border bg-gray-50 p-4">
                            <p className="text-sm font-semibold text-gray-900">{step.label}</p>
                            <time className="text-xs text-gray-500 mt-0.5 block">
                              {formattedDate}
                            </time>
                            {step.subtitle && (
                              <p className="text-xs text-gray-500 mt-1">
                                Por: {step.subtitle}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
