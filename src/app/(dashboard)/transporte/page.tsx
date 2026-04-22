'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Truck,
  User,
  MapPin,
  Activity,
  Wrench,
  Fuel,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Atividade, Viatura, Motorista, ManutencaoViatura } from '@/types/transporte';
import {
  gerarAlertasDocumentos,
  gerarAlertasManutencao,
} from '@/services/transporte-alertas.service';

// ─── Mock data (subtask 5.1) ────────────────────────────────────────────────

const viaturasMock: Viatura[] = [
  {
    id: 'v1',
    matricula: 'MZ-01-AB',
    marca: 'Toyota',
    modelo: 'Hilux',
    tipoViatura: 'ligeiro_mercadorias',
    capacidade: 1000,
    unidadeCapacidade: 'kg',
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2022-01-10'),
    estado: 'disponivel',
    documentos: [
      {
        id: 'dv1',
        viaturaId: 'v1',
        tipo: 'seguro',
        numero: 'SEG-2024-001',
        dataEmissao: new Date('2024-01-01'),
        dataValidade: new Date('2025-01-01'),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2022-01-10'),
    actualizadoEm: new Date('2024-01-01'),
  },
  {
    id: 'v2',
    matricula: 'MZ-02-CD',
    marca: 'Mitsubishi',
    modelo: 'L200',
    tipoViatura: 'ligeiro_mercadorias',
    capacidade: 800,
    unidadeCapacidade: 'kg',
    localActividade: 'Beira',
    dataInicioActividade: new Date('2021-06-15'),
    estado: 'em_actividade',
    documentos: [
      {
        id: 'dv2',
        viaturaId: 'v2',
        tipo: 'inspecao',
        numero: 'INSP-2025-002',
        dataEmissao: new Date('2025-01-01'),
        dataValidade: new Date('2025-03-15'),
        entidadeEmissora: 'IMTT',
        estado: 'proximo_expirar',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2021-06-15'),
    actualizadoEm: new Date('2025-01-01'),
  },
  {
    id: 'v3',
    matricula: 'MZ-03-EF',
    marca: 'Ford',
    modelo: 'Ranger',
    tipoViatura: 'ligeiro_mercadorias',
    capacidade: 900,
    unidadeCapacidade: 'kg',
    localActividade: 'Nampula',
    dataInicioActividade: new Date('2023-03-20'),
    estado: 'disponivel',
    documentos: [
      {
        id: 'dv3',
        viaturaId: 'v3',
        tipo: 'livrete',
        numero: 'LIV-2023-003',
        dataEmissao: new Date('2023-03-20'),
        dataValidade: new Date('2028-03-20'),
        entidadeEmissora: 'DNVT',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2023-03-20'),
    actualizadoEm: new Date('2023-03-20'),
  },
  {
    id: 'v4',
    matricula: 'MZ-04-GH',
    marca: 'Isuzu',
    modelo: 'D-Max',
    tipoViatura: 'pesado_mercadorias',
    capacidade: 5000,
    unidadeCapacidade: 'kg',
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2020-11-01'),
    estado: 'em_manutencao',
    documentos: [
      {
        id: 'dv4',
        viaturaId: 'v4',
        tipo: 'seguro',
        numero: 'SEG-2025-004',
        dataEmissao: new Date('2025-01-01'),
        dataValidade: new Date('2026-01-01'),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
    ],
    criadoEm: new Date('2020-11-01'),
    actualizadoEm: new Date('2025-01-01'),
  },
];

const motoristasMock: Motorista[] = [
  {
    id: 'm1',
    nomeCompleto: 'Carlos Manuel Santos',
    contacto: '+258 84 111 2222',
    numeroCarta: 'CARTA-001',
    categoriaCarta: ['B', 'C'],
    dataEmissaoCarta: new Date('2015-05-10'),
    validadeCarta: new Date('2027-05-10'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    documentos: [
      {
        id: 'dm1',
        motoristaId: 'm1',
        tipo: 'carta_conducao',
        numero: 'CARTA-001',
        dataEmissao: new Date('2015-05-10'),
        dataValidade: new Date('2027-05-10'),
        entidadeEmissora: 'DNVT',
        estado: 'valido',
      },
    ],
    disponibilidade: { disponivel: true, fonte: 'manual' },
    criadoEm: new Date('2020-01-01'),
    actualizadoEm: new Date('2025-01-01'),
  },
  {
    id: 'm2',
    nomeCompleto: 'Ana Beatriz Pereira',
    contacto: '+258 82 333 4444',
    numeroCarta: 'CARTA-002',
    categoriaCarta: ['B'],
    dataEmissaoCarta: new Date('2018-08-20'),
    validadeCarta: new Date('2026-08-20'),
    localActividade: 'Beira',
    estadoOperacional: 'activo',
    documentos: [
      {
        id: 'dm2',
        motoristaId: 'm2',
        tipo: 'bi',
        numero: 'BI-123456789',
        dataEmissao: new Date('2020-01-01'),
        dataValidade: new Date('2025-01-01'),
        entidadeEmissora: 'CGER',
        estado: 'expirado',
      },
    ],
    disponibilidade: { disponivel: true, fonte: 'manual' },
    criadoEm: new Date('2020-06-01'),
    actualizadoEm: new Date('2025-01-01'),
  },
  {
    id: 'm3',
    nomeCompleto: 'João Pedro Machava',
    contacto: '+258 86 555 6666',
    numeroCarta: 'CARTA-003',
    categoriaCarta: ['B', 'C', 'D'],
    dataEmissaoCarta: new Date('2012-03-15'),
    validadeCarta: new Date('2028-03-15'),
    localActividade: 'Nampula',
    estadoOperacional: 'activo',
    documentos: [],
    disponibilidade: {
      disponivel: false,
      motivo: 'ferias',
      dataInicio: new Date('2025-02-01'),
      dataFim: new Date('2025-02-28'),
      fonte: 'rh_api',
    },
    criadoEm: new Date('2019-03-15'),
    actualizadoEm: new Date('2025-02-01'),
  },
  {
    id: 'm4',
    nomeCompleto: 'Fátima Zinha Cumbe',
    contacto: '+258 84 777 8888',
    numeroCarta: 'CARTA-004',
    categoriaCarta: ['B'],
    dataEmissaoCarta: new Date('2019-11-05'),
    validadeCarta: new Date('2027-11-05'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    documentos: [],
    disponibilidade: { disponivel: true, fonte: 'manual' },
    criadoEm: new Date('2021-11-05'),
    actualizadoEm: new Date('2025-01-01'),
  },
];

const atividadesMock: Atividade[] = [
  {
    id: 'a1',
    codigo: 'AT-2025-0001',
    titulo: 'Transporte de materiais para Beira',
    descricao: 'Entrega de equipamentos ao escritório da Beira',
    tipoActividade: 'transporte_mercadorias',
    localActividade: 'Beira',
    dataInicioPrevista: new Date('2025-02-10T08:00:00'),
    dataConclusaoPrevista: new Date('2025-02-10T18:00:00'),
    motoristaResponsavelId: 'm1',
    motoristaResponsavelNome: 'Carlos Manuel Santos',
    viaturaId: 'v1',
    viaturaMatricula: 'MZ-01-AB',
    prioridade: 'alta',
    estado: 'em_curso',
    historico: [],
    criadoEm: new Date('2025-02-08T09:00:00'),
    criadoPor: 'admin',
  },
  {
    id: 'a2',
    codigo: 'AT-2025-0002',
    titulo: 'Missão de serviço — Nampula',
    tipoActividade: 'missao_servico',
    localActividade: 'Nampula',
    dataInicioPrevista: new Date('2025-02-12T07:00:00'),
    motoristaResponsavelId: 'm4',
    motoristaResponsavelNome: 'Fátima Zinha Cumbe',
    viaturaId: 'v3',
    viaturaMatricula: 'MZ-03-EF',
    prioridade: 'media',
    estado: 'planeada',
    historico: [],
    criadoEm: new Date('2025-02-07T14:00:00'),
    criadoPor: 'admin',
  },
  {
    id: 'a3',
    codigo: 'AT-2025-0003',
    titulo: 'Deslocação urgente — Inhambane',
    tipoActividade: 'deslocacao',
    localActividade: 'Inhambane',
    dataInicioPrevista: new Date('2025-02-05T06:00:00'),
    dataConclusaoPrevista: new Date('2025-02-05T20:00:00'),
    motoristaResponsavelId: 'm2',
    motoristaResponsavelNome: 'Ana Beatriz Pereira',
    viaturaId: 'v2',
    viaturaMatricula: 'MZ-02-CD',
    prioridade: 'urgente',
    estado: 'concluida',
    historico: [],
    criadoEm: new Date('2025-02-04T16:00:00'),
    criadoPor: 'admin',
  },
  {
    id: 'a4',
    codigo: 'AT-2025-0004',
    titulo: 'Transporte de pessoal — Tete',
    tipoActividade: 'transporte_pessoal',
    localActividade: 'Tete',
    dataInicioPrevista: new Date('2025-02-03T08:00:00'),
    prioridade: 'baixa',
    estado: 'suspensa',
    historico: [],
    criadoEm: new Date('2025-02-01T10:00:00'),
    criadoPor: 'admin',
  },
  {
    id: 'a5',
    codigo: 'AT-2025-0005',
    titulo: 'Manutenção de campo — Quelimane',
    tipoActividade: 'manutencao_campo',
    localActividade: 'Quelimane',
    dataInicioPrevista: new Date('2025-01-28T08:00:00'),
    dataConclusaoPrevista: new Date('2025-01-28T17:00:00'),
    prioridade: 'media',
    estado: 'cancelada',
    historico: [],
    criadoEm: new Date('2025-01-25T11:00:00'),
    criadoPor: 'admin',
  },
];

const manutencoesMock: ManutencaoViatura[] = [
  {
    id: 'mn1',
    viaturaId: 'v1',
    tipo: 'preventiva',
    data: new Date('2024-06-01'),
    quilometragem: 50000,
    descricao: 'Revisão dos 50.000 km',
    responsavel: 'Oficina Central',
    proximaManutencaoPrevista: {
      data: new Date('2024-12-01'),
      quilometragem: 60000,
    },
    criadoEm: new Date('2024-06-01'),
  },
  {
    id: 'mn2',
    viaturaId: 'v3',
    tipo: 'correctiva',
    data: new Date('2025-01-15'),
    descricao: 'Substituição de pastilhas de travão',
    responsavel: 'Oficina Norte',
    criadoEm: new Date('2025-01-15'),
  },
];

// ─── Estado badge helper (subtask 5.2 / 5.5) ────────────────────────────────

const estadoAtividadeBadge: Record<
  Atividade['estado'],
  { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }
> = {
  planeada: { variant: 'secondary', label: 'Planeada' },
  em_curso: { variant: 'default', label: 'Em Curso' },
  suspensa: { variant: 'outline', label: 'Suspensa' },
  concluida: { variant: 'default', label: 'Concluída' },
  cancelada: { variant: 'destructive', label: 'Cancelada' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransporteDashboardPage() {
  // KPI derivations (subtask 5.2)
  const viaturasDisponiveis = viaturasMock.filter((v) => v.estado === 'disponivel').length;
  const atividadesEmCurso = atividadesMock.filter((a) => a.estado === 'em_curso').length;
  const motoristasDisponiveis = motoristasMock.filter((m) => m.disponibilidade.disponivel).length;

  const alertasDocumentos = gerarAlertasDocumentos(viaturasMock, motoristasMock);
  const alertasManutencao = gerarAlertasManutencao(viaturasMock, manutencoesMock);
  const todosAlertas = [...alertasDocumentos, ...alertasManutencao];
  const totalAlertas = todosAlertas.length;

  // Summary card counts
  const viaturasEmActividade = viaturasMock.filter((v) => v.estado === 'em_actividade').length;
  const viaturasEmManutencao = viaturasMock.filter((v) => v.estado === 'em_manutencao').length;
  const motoristasEmRota = motoristasMock.filter(
    (m) => m.estadoOperacional === 'activo' && !m.disponibilidade.disponivel,
  ).length;
  const motoristasAtivos = motoristasMock.filter((m) => m.estadoOperacional === 'activo').length;

  // Atividades recentes — 5 most recent sorted by criadoEm desc (subtask 5.5)
  const atividadesRecentes = [...atividadesMock]
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .slice(0, 5);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Transporte</h1>
          <p className="text-muted-foreground">
            Visão geral das operações de transporte e logística
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/transporte/rotas/nova">
              <MapPin className="h-4 w-4 mr-2" />
              Nova Rota
            </Link>
          </Button>
          <Button asChild>
            <Link href="/transporte/atividades">
              <Activity className="h-4 w-4 mr-2" />
              Nova Atividade
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards (subtask 5.2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Viaturas Disponíveis</p>
                <p className="text-3xl font-bold">{viaturasDisponiveis}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  de {viaturasMock.length} viaturas
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
                <p className="text-sm text-muted-foreground">Atividades em Curso</p>
                <p className="text-3xl font-bold">{atividadesEmCurso}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  de {atividadesMock.length} atividades
                </p>
              </div>
              <Activity className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Motoristas Disponíveis</p>
                <p className="text-3xl font-bold">{motoristasDisponiveis}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  de {motoristasMock.length} motoristas
                </p>
              </div>
              <User className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertas Activos</p>
                <p className="text-3xl font-bold">{totalAlertas}</p>
                <p className="text-xs text-muted-foreground mt-1">documentos e manutenção</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary cards — Viaturas + Motoristas (no Custos Mensais) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                <span className="font-medium">Viaturas</span>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transporte/veiculos">Ver todas</Link>
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Disponíveis</span>
                <Badge variant="default">{viaturasDisponiveis}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Em Actividade</span>
                <Badge variant="secondary">{viaturasEmActividade}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Em Manutenção</span>
                <Badge variant="destructive">{viaturasEmManutencao}</Badge>
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
                <Badge variant="default">{motoristasDisponiveis}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Em Rota</span>
                <Badge variant="secondary">{motoristasEmRota}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Activos</span>
                <Badge variant="secondary">{motoristasAtivos}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas operacionais (subtask 5.4) + Atividades recentes (subtask 5.5) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas operacionais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Alertas Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todosAlertas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sem alertas activos.
              </p>
            ) : (
              <div className="space-y-3">
                {todosAlertas.map((alerta) => (
                  <div
                    key={alerta.id}
                    className={`p-3 rounded-lg border ${
                      alerta.urgencia === 'critico'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                          alerta.urgencia === 'critico'
                            ? 'text-red-600'
                            : 'text-yellow-600'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            alerta.urgencia === 'critico'
                              ? 'text-red-700'
                              : 'text-yellow-700'
                          }`}
                        >
                          {alerta.entidadeNome}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${
                            alerta.urgencia === 'critico'
                              ? 'text-red-600'
                              : 'text-yellow-600'
                          }`}
                        >
                          {alerta.descricao}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividades recentes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Atividades Recentes
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transporte/atividades">Ver todas</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {atividadesRecentes.map((atividade) => {
                const badgeInfo = estadoAtividadeBadge[atividade.estado];
                return (
                  <div
                    key={atividade.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-medium text-sm truncate">{atividade.titulo}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {atividade.viaturaMatricula ?? '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {atividade.motoristaResponsavelNome ?? '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(atividade.criadoEm).toLocaleDateString('pt-PT')}
                        </span>
                      </div>
                    </div>
                    <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick-access navigation cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Link href="/transporte/veiculos" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Truck className="h-8 w-8 text-blue-600 mb-2" />
                <p className="font-medium">Veículos</p>
                <p className="text-2xl font-bold">{viaturasMock.length}</p>
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
                <p className="text-2xl font-bold">{motoristasMock.length}</p>
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
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/transporte/atividades" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Activity className="h-8 w-8 text-orange-600 mb-2" />
                <p className="font-medium">Atividades</p>
                <p className="text-2xl font-bold">{atividadesMock.length}</p>
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
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
