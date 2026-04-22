'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import {
  Calendar as CalendarIcon,
  Settings,
  CheckCircle,
  XCircle,
  Package,
  ArrowLeft,
  AlertCircle,
  DollarSign,
  Wrench,
  Activity,
  Clock,
  User,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';

interface ServicoManutencao {
  id: string;
  nome: string;
  descricao: string;
  categoria: 'motor' | 'freios' | 'suspensao' | 'eletrica' | 'carroceria' | 'outro';
  custo: number;
  tempo: number;
  concluido: boolean;
  observacoes?: string;
}

interface PecaManutencao {
  id: string;
  nome: string;
  codigo: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  fornecedor?: string;
  garantia?: number;
  original: boolean;
  status: 'solicitada' | 'em_transito' | 'disponivel' | 'instalada';
}

interface Manutencao {
  id: string;
  codigo: string;
  veiculoId: string;
  veiculoMatricula: string;
  veiculoModelo: string;
  tipo: 'preventiva' | 'corretiva' | 'preditiva' | 'emergencia';
  status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada' | 'pendente_pecas';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  dataAgendada: Date;
  dataInicio?: Date;
  dataConclusao?: Date;
  kmAtual: number;
  kmProxima?: number;
  oficina: string;
  mecanicoResponsavel?: string;
  telefoneOficina?: string;
  servicos: ServicoManutencao[];
  pecas: PecaManutencao[];
  custoMaoObra: number;
  custoPecas: number;
  custoTotal: number;
  tempoEstimado: number;
  tempoReal?: number;
  observacoes?: string;
  problemaRelatado?: string;
  diagnostico?: string;
  recomendacoes?: string;
  garantia?: {
    prazo: number;
    descricao: string;
  };
  proximaManutencao?: {
    km: number;
    data: Date;
    tipo: string;
  };
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
}

const manutencoes: Manutencao[] = [
  {
    id: '1',
    codigo: 'MAN-001',
    veiculoId: '1',
    veiculoMatricula: 'ABC-1234',
    veiculoModelo: 'Toyota Hilux',
    tipo: 'preventiva',
    status: 'agendada',
    prioridade: 'media',
    dataAgendada: new Date('2024-06-25'),
    kmAtual: 35000,
    kmProxima: 40000,
    oficina: 'Toyota Service Center',
    mecanicoResponsavel: 'José António',
    telefoneOficina: '+258 21 123 456',
    servicos: [
      {
        id: '1',
        nome: 'Troca de Óleo',
        descricao: 'Troca de óleo do motor e filtro',
        categoria: 'motor',
        custo: 1500,
        tempo: 60,
        concluido: false
      },
      {
        id: '2',
        nome: 'Revisão dos Freios',
        descricao: 'Inspeção e ajuste do sistema de freios',
        categoria: 'freios',
        custo: 800,
        tempo: 90,
        concluido: false
      }
    ],
    pecas: [
      {
        id: '1',
        nome: 'Filtro de Óleo',
        codigo: 'FO-TOY-001',
        quantidade: 1,
        valorUnitario: 250,
        valorTotal: 250,
        fornecedor: 'Toyota Parts',
        garantia: 6,
        original: true,
        status: 'disponivel'
      },
      {
        id: '2',
        nome: 'Óleo Motor 5W-30',
        codigo: 'OM-TOY-002',
        quantidade: 5,
        valorUnitario: 180,
        valorTotal: 900,
        fornecedor: 'Toyota Parts',
        original: true,
        status: 'disponivel'
      }
    ],
    custoMaoObra: 2300,
    custoPecas: 1150,
    custoTotal: 3450,
    tempoEstimado: 150,
    observacoes: 'Manutenção preventiva aos 35.000km',
    proximaManutencao: {
      km: 40000,
      data: new Date('2024-09-25'),
      tipo: 'Revisão 40.000km'
    },
    criadoEm: new Date('2024-06-20'),
    criadoPor: 'admin'
  },
  {
    id: '2',
    codigo: 'MAN-002',
    veiculoId: '2',
    veiculoMatricula: 'XYZ-5678',
    veiculoModelo: 'Isuzu D-Max',
    tipo: 'corretiva',
    status: 'em_andamento',
    prioridade: 'alta',
    dataAgendada: new Date('2024-06-22'),
    dataInicio: new Date('2024-06-22T08:00:00'),
    kmAtual: 42000,
    oficina: 'Isuzu Motors Maputo',
    mecanicoResponsavel: 'Carlos Macamo',
    telefoneOficina: '+258 21 987 654',
    problemaRelatado: 'Ruído estranho no motor e perda de potência',
    diagnostico: 'Problema na bomba de combustível e filtros entupidos',
    servicos: [
      {
        id: '3',
        nome: 'Substituição Bomba Combustível',
        descricao: 'Troca da bomba de combustível defeituosa',
        categoria: 'motor',
        custo: 2500,
        tempo: 180,
        concluido: false
      },
      {
        id: '4',
        nome: 'Troca Filtros Combustível',
        descricao: 'Substituição dos filtros de combustível',
        categoria: 'motor',
        custo: 400,
        tempo: 45,
        concluido: true
      }
    ],
    pecas: [
      {
        id: '3',
        nome: 'Bomba de Combustível',
        codigo: 'BC-ISU-001',
        quantidade: 1,
        valorUnitario: 4500,
        valorTotal: 4500,
        fornecedor: 'Isuzu Parts',
        garantia: 12,
        original: true,
        status: 'instalada'
      }
    ],
    custoMaoObra: 2900,
    custoPecas: 4500,
    custoTotal: 7400,
    tempoEstimado: 225,
    tempoReal: 180,
    observacoes: 'Reparação urgente - veículo parado',
    recomendacoes: 'Verificar qualidade do combustível utilizado',
    criadoEm: new Date('2024-06-21'),
    criadoPor: 'admin',
    atualizadoEm: new Date('2024-06-22T14:00:00')
  },
  {
    id: '3',
    codigo: 'MAN-003',
    veiculoId: '1',
    veiculoMatricula: 'ABC-1234',
    veiculoModelo: 'Toyota Hilux',
    tipo: 'preventiva',
    status: 'concluida',
    prioridade: 'media',
    dataAgendada: new Date('2024-05-15'),
    dataInicio: new Date('2024-05-15T09:00:00'),
    dataConclusao: new Date('2024-05-15T12:30:00'),
    kmAtual: 30000,
    oficina: 'Toyota Service Center',
    mecanicoResponsavel: 'José António',
    servicos: [
      {
        id: '5',
        nome: 'Revisão 30.000km',
        descricao: 'Revisão completa aos 30.000km',
        categoria: 'motor',
        custo: 2800,
        tempo: 210,
        concluido: true,
        observacoes: 'Todos os itens verificados e aprovados'
      }
    ],
    pecas: [
      {
        id: '4',
        nome: 'Kit Filtros',
        codigo: 'KF-TOY-001',
        quantidade: 1,
        valorUnitario: 850,
        valorTotal: 850,
        fornecedor: 'Toyota Parts',
        original: true,
        status: 'instalada'
      }
    ],
    custoMaoObra: 2800,
    custoPecas: 850,
    custoTotal: 3650,
    tempoEstimado: 210,
    tempoReal: 210,
    garantia: {
      prazo: 6,
      descricao: 'Garantia de 6 meses ou 10.000km para serviços realizados'
    },
    proximaManutencao: {
      km: 35000,
      data: new Date('2024-08-15'),
      tipo: 'Revisão 35.000km'
    },
    criadoEm: new Date('2024-05-10'),
    criadoPor: 'admin',
    atualizadoEm: new Date('2024-05-15T12:30:00')
  },
  {
    id: '4',
    codigo: 'MAN-004',
    veiculoId: '3',
    veiculoMatricula: 'VIP-0001',
    veiculoModelo: 'Mercedes Sprinter',
    tipo: 'emergencia',
    status: 'pendente_pecas',
    prioridade: 'critica',
    dataAgendada: new Date('2024-06-23'),
    dataInicio: new Date('2024-06-23T14:00:00'),
    kmAtual: 18000,
    oficina: 'Mercedes Service Maputo',
    mecanicoResponsavel: 'Fernando Silva',
    telefoneOficina: '+258 21 555 777',
    problemaRelatado: 'Veículo não liga - suspeita de problema elétrico',
    diagnostico: 'Alternador queimado e bateria descarregada',
    servicos: [
      {
        id: '6',
        nome: 'Substituição Alternador',
        descricao: 'Troca do alternador queimado',
        categoria: 'eletrica',
        custo: 1800,
        tempo: 120,
        concluido: false
      },
      {
        id: '7',
        nome: 'Troca de Bateria',
        descricao: 'Instalação de nova bateria',
        categoria: 'eletrica',
        custo: 600,
        tempo: 30,
        concluido: true
      }
    ],
    pecas: [
      {
        id: '5',
        nome: 'Alternador',
        codigo: 'ALT-MER-001',
        quantidade: 1,
        valorUnitario: 8500,
        valorTotal: 8500,
        fornecedor: 'Mercedes Parts',
        garantia: 24,
        original: true,
        status: 'solicitada'
      }
    ],
    custoMaoObra: 2400,
    custoPecas: 8500,
    custoTotal: 10900,
    tempoEstimado: 150,
    observacoes: 'Aguardando peça original da Mercedes - ETA 3 dias',
    criadoEm: new Date('2024-06-23'),
    criadoPor: 'admin'
  }
];

function getStatusInfo(status: string): { label: string; icon: React.JSX.Element; color: string } {
  const statusMap = {
    agendada: { label: 'Agendada', icon: <CalendarIcon className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
    em_andamento: { label: 'Em Andamento', icon: <Settings className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
    concluida: { label: 'Concluída', icon: <CheckCircle className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
    cancelada: { label: 'Cancelada', icon: <XCircle className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
    pendente_pecas: { label: 'Pendente Peças', icon: <Package className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800' }
  };
  return statusMap[status as keyof typeof statusMap] || statusMap.agendada;
}

function getTipoInfo(tipo: string): { label: string; color: string } {
  const tipoMap = {
    preventiva: { label: 'Preventiva', color: 'bg-blue-100 text-blue-800' },
    corretiva: { label: 'Corretiva', color: 'bg-yellow-100 text-yellow-800' },
    preditiva: { label: 'Preditiva', color: 'bg-green-100 text-green-800' },
    emergencia: { label: 'Emergência', color: 'bg-red-100 text-red-800' }
  };
  return tipoMap[tipo as keyof typeof tipoMap] || tipoMap.preventiva;
}

function getPrioridadeInfo(prioridade: string): { label: string; color: string } {
  const prioridadeMap = {
    baixa: { label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
    media: { label: 'Média', color: 'bg-blue-100 text-blue-800' },
    alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
    critica: { label: 'Crítica', color: 'bg-red-100 text-red-800' }
  };
  return prioridadeMap[prioridade as keyof typeof prioridadeMap] || prioridadeMap.media;
}

function getPecaStatusInfo(status: string): { label: string; color: string } {
  const statusMap = {
    solicitada: { label: 'Solicitada', color: 'bg-gray-100 text-gray-800' },
    em_transito: { label: 'Em Trânsito', color: 'bg-orange-100 text-orange-800' },
    disponivel: { label: 'Disponível', color: 'bg-blue-100 text-blue-800' },
    instalada: { label: 'Instalada', color: 'bg-green-100 text-green-800' }
  };
  return statusMap[status as keyof typeof statusMap] || statusMap.solicitada;
}

function formatMoeda(valor: number): string {
  return `MT ${valor.toLocaleString('pt-MZ')}`;
}

export default function ManutencaoDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const manutencao = manutencoes.find(m => m.id === id);

  if (!manutencao) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.push('/transporte/manutencao')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="mt-8 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Manutenção não encontrada</p>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(manutencao.status);
  const tipoInfo = getTipoInfo(manutencao.tipo);
  const prioridadeInfo = getPrioridadeInfo(manutencao.prioridade);

  return (
    <div className="p-6">
      {/* Back button */}
      <Button variant="ghost" onClick={() => router.push('/transporte/manutencao')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{manutencao.codigo} · {manutencao.veiculoMatricula}</h1>
        <p className="text-gray-500">{manutencao.veiculoModelo}</p>
      </div>

      {/* Four summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Status card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={statusInfo.color}>
              <span className="mr-1">{statusInfo.icon}</span>
              {statusInfo.label}
            </Badge>
          </CardContent>
        </Card>

        {/* Tipo card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={tipoInfo.color}>
              {tipoInfo.label}
            </Badge>
          </CardContent>
        </Card>

        {/* Prioridade card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={prioridadeInfo.color}>
              {prioridadeInfo.label}
            </Badge>
          </CardContent>
        </Card>

        {/* Custo Total card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Custo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatMoeda(manutencao.custoTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="informacoes-gerais">
        <TabsList className="mb-4">
          <TabsTrigger value="informacoes-gerais">Informações Gerais</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="pecas">Peças</TabsTrigger>
          <TabsTrigger value="custos">Custos</TabsTrigger>
          <TabsTrigger value="linha-do-tempo">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="proxima-manutencao">Próxima Manutenção</TabsTrigger>
        </TabsList>

        {/* Tab: Informações Gerais */}
        <TabsContent value="informacoes-gerais">
          <Card>
            <CardHeader>
              <CardTitle>Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Two-column grid of labeled fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Veículo</p>
                  <p className="mt-1">{manutencao.veiculoModelo}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Matrícula</p>
                  <p className="mt-1">{manutencao.veiculoMatricula}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">KM Atual</p>
                  <p className="mt-1">{manutencao.kmAtual.toLocaleString('pt-MZ')} km</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">KM Próxima</p>
                  <p className="mt-1">
                    {manutencao.kmProxima !== undefined
                      ? `${manutencao.kmProxima.toLocaleString('pt-MZ')} km`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Agendada</p>
                  <p className="mt-1">{format(manutencao.dataAgendada, 'dd/MM/yyyy', { locale: pt })}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Início</p>
                  <p className="mt-1">
                    {manutencao.dataInicio !== undefined
                      ? format(manutencao.dataInicio, 'dd/MM/yyyy', { locale: pt })
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Conclusão</p>
                  <p className="mt-1">
                    {manutencao.dataConclusao !== undefined
                      ? format(manutencao.dataConclusao, 'dd/MM/yyyy', { locale: pt })
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Oficina</p>
                  <p className="mt-1">{manutencao.oficina}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Mecânico Responsável</p>
                  <p className="mt-1">{manutencao.mecanicoResponsavel ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Telefone Oficina</p>
                  <p className="mt-1">{manutencao.telefoneOficina ?? '—'}</p>
                </div>
              </div>

              {/* Optional text sections */}
              {manutencao.problemaRelatado !== undefined && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Problema Relatado</p>
                  <p className="text-sm bg-gray-50 rounded p-3">{manutencao.problemaRelatado}</p>
                </div>
              )}
              {manutencao.diagnostico !== undefined && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Diagnóstico</p>
                  <p className="text-sm bg-gray-50 rounded p-3">{manutencao.diagnostico}</p>
                </div>
              )}
              {manutencao.recomendacoes !== undefined && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Recomendações</p>
                  <p className="text-sm bg-gray-50 rounded p-3">{manutencao.recomendacoes}</p>
                </div>
              )}
              {manutencao.observacoes !== undefined && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Observações</p>
                  <p className="text-sm bg-gray-50 rounded p-3">{manutencao.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Serviços */}
        <TabsContent value="servicos">
          <Card>
            <CardHeader>
              <CardTitle>Serviços</CardTitle>
            </CardHeader>
            <CardContent>
              {manutencao.servicos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Wrench className="h-12 w-12 mb-4" />
                  <p className="text-sm">Nenhum serviço registado para esta manutenção.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Custo</TableHead>
                      <TableHead>Tempo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manutencao.servicos.map((servico) => (
                      <TableRow key={servico.id}>
                        <TableCell className="font-medium">{servico.nome}</TableCell>
                        <TableCell className="capitalize">{servico.categoria}</TableCell>
                        <TableCell>{servico.descricao}</TableCell>
                        <TableCell>{formatMoeda(servico.custo)}</TableCell>
                        <TableCell>
                          {servico.tempo >= 60
                            ? `${Math.floor(servico.tempo / 60)}h${servico.tempo % 60 > 0 ? ` ${servico.tempo % 60}min` : ''}`
                            : `${servico.tempo} min`}
                        </TableCell>
                        <TableCell>
                          {servico.concluido ? (
                            <Badge className="bg-green-100 text-green-800 flex items-center gap-1 w-fit">
                              <CheckCircle className="h-3 w-3" />
                              Concluído
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 flex items-center gap-1 w-fit">
                              <XCircle className="h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Peças */}
        <TabsContent value="pecas">
          <Card>
            <CardHeader>
              <CardTitle>Peças</CardTitle>
            </CardHeader>
            <CardContent>
              {manutencao.pecas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Package className="h-12 w-12 mb-4" />
                  <p className="text-sm">Nenhuma peça registada para esta manutenção.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Valor Unit.</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Original</TableHead>
                      <TableHead>Garantia</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manutencao.pecas.map((peca) => {
                      const pecaStatus = getPecaStatusInfo(peca.status);
                      return (
                        <TableRow key={peca.id}>
                          <TableCell className="font-medium">{peca.nome}</TableCell>
                          <TableCell>{peca.codigo}</TableCell>
                          <TableCell>{peca.quantidade}</TableCell>
                          <TableCell>{formatMoeda(peca.valorUnitario)}</TableCell>
                          <TableCell>{formatMoeda(peca.valorTotal)}</TableCell>
                          <TableCell>{peca.fornecedor ?? '—'}</TableCell>
                          <TableCell>
                            {peca.original ? (
                              <Badge className="bg-purple-100 text-purple-800">Original</Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            {peca.garantia !== undefined ? `${peca.garantia} meses` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge className={pecaStatus.color}>{pecaStatus.label}</Badge>
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

        {/* Tab: Custos */}
        <TabsContent value="custos">
          <div className="space-y-6">
            {/* Three cost cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Mão de Obra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-800">{formatMoeda(manutencao.custoMaoObra)}</p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-orange-600 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Peças
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-orange-800">{formatMoeda(manutencao.custoPecas)}</p>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-800">{formatMoeda(manutencao.custoTotal)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Time fields */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Tempo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Tempo Estimado</p>
                    <p className="mt-1 text-lg font-semibold">
                      {manutencao.tempoEstimado >= 60
                        ? `${Math.floor(manutencao.tempoEstimado / 60)}h${manutencao.tempoEstimado % 60 > 0 ? ` ${manutencao.tempoEstimado % 60}min` : ''}`
                        : `${manutencao.tempoEstimado} min`}
                    </p>
                  </div>
                  {manutencao.tempoReal !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Tempo Real</p>
                      <p className="mt-1 text-lg font-semibold">
                        {manutencao.tempoReal >= 60
                          ? `${Math.floor(manutencao.tempoReal / 60)}h${manutencao.tempoReal % 60 > 0 ? ` ${manutencao.tempoReal % 60}min` : ''}`
                          : `${manutencao.tempoReal} min`}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Garantia section (conditional) */}
            {manutencao.garantia !== undefined && (
              <Card className="border-purple-200">
                <CardHeader>
                  <CardTitle className="text-purple-700">Garantia</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Prazo</p>
                    <p className="mt-1">{manutencao.garantia.prazo} meses</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Descrição</p>
                    <p className="mt-1 text-sm bg-purple-50 rounded p-3">{manutencao.garantia.descricao}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab: Linha do Tempo */}
        <TabsContent value="linha-do-tempo">
          <Card>
            <CardHeader>
              <CardTitle>Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const steps: {
                  key: string;
                  label: string;
                  icon: React.JSX.Element;
                  date: string;
                  extra?: string;
                }[] = [];

                // Criado — always present
                steps.push({
                  key: 'criado',
                  label: 'Criado',
                  icon: <User className="h-4 w-4" />,
                  date: format(manutencao.criadoEm, 'dd/MM/yyyy HH:mm', { locale: pt }),
                  extra: manutencao.criadoPor,
                });

                // Agendado — always present (dataAgendada is required)
                steps.push({
                  key: 'agendado',
                  label: 'Agendado',
                  icon: <CalendarIcon className="h-4 w-4" />,
                  date: format(manutencao.dataAgendada, 'dd/MM/yyyy', { locale: pt }),
                });

                // Iniciado — optional
                if (manutencao.dataInicio !== undefined) {
                  steps.push({
                    key: 'iniciado',
                    label: 'Iniciado',
                    icon: <PlayCircle className="h-4 w-4" />,
                    date: format(manutencao.dataInicio, 'dd/MM/yyyy HH:mm', { locale: pt }),
                  });
                }

                // Concluído — optional
                if (manutencao.dataConclusao !== undefined) {
                  steps.push({
                    key: 'concluido',
                    label: 'Concluído',
                    icon: <CheckCircle className="h-4 w-4" />,
                    date: format(manutencao.dataConclusao, 'dd/MM/yyyy HH:mm', { locale: pt }),
                  });
                }

                // Atualizado — optional
                if (manutencao.atualizadoEm !== undefined) {
                  steps.push({
                    key: 'atualizado',
                    label: 'Atualizado',
                    icon: <RefreshCw className="h-4 w-4" />,
                    date: format(manutencao.atualizadoEm, 'dd/MM/yyyy HH:mm', { locale: pt }),
                  });
                }

                return (
                  <ol className="relative border-l border-gray-200 ml-4">
                    {steps.map((step, index) => (
                      <li key={step.key} className={`ml-6 ${index < steps.length - 1 ? 'mb-8' : ''}`}>
                        {/* Circle icon on the timeline line */}
                        <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 ring-4 ring-white">
                          {step.icon}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{step.label}</p>
                          <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {step.date}
                          </p>
                          {step.extra !== undefined && (
                            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                              <User className="h-3 w-3" />
                              {step.extra}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Próxima Manutenção */}
        <TabsContent value="proxima-manutencao">
          {manutencao.proximaManutencao !== undefined ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Próxima Manutenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm font-medium text-gray-500">KM Previsto</p>
                    <p className="mt-1 text-lg font-semibold">
                      {manutencao.proximaManutencao.km.toLocaleString('pt-MZ')} km
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Data Prevista</p>
                    <p className="mt-1 text-lg font-semibold">
                      {format(manutencao.proximaManutencao.data, 'dd/MM/yyyy', { locale: pt })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Tipo</p>
                    <p className="mt-1 text-lg font-semibold">
                      {manutencao.proximaManutencao.tipo}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Próxima Manutenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Wrench className="h-12 w-12 mb-4" />
                  <p className="text-sm mb-4">Nenhuma próxima manutenção agendada.</p>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Agendar Próxima Manutenção
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
