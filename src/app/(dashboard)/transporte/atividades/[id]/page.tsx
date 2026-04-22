'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  AlertCircle,
  Activity,
  MapPin,
  Calendar,
  User,
  Truck,
  FileText,
  Clock,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Atividade, EventoAtividade } from '@/types/transporte';

// ─── Mock data (shared with list page — in a real app this would come from a store/API) ──

const atividadesMock: Atividade[] = [
  {
    id: 'a1',
    codigo: 'AT-2025-0001',
    titulo: 'Transporte de materiais para Beira',
    descricao: 'Entrega de equipamentos ao escritório da Beira. Inclui 3 caixas de material informático e 2 impressoras.',
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
    observacoes: 'Confirmar recepção com o responsável do escritório da Beira.',
    historico: [
      {
        id: 'evt-a1-1',
        data: new Date('2025-02-08T09:00:00'),
        estadoNovo: 'planeada',
        utilizador: 'admin',
        descricao: 'Atividade criada',
      },
      {
        id: 'evt-a1-2',
        data: new Date('2025-02-10T07:55:00'),
        estadoAnterior: 'planeada',
        estadoNovo: 'em_curso',
        utilizador: 'admin',
        descricao: 'Estado alterado de "Planeada" para "Em Curso"',
      },
    ],
    criadoEm: new Date('2025-02-08T09:00:00'),
    criadoPor: 'admin',
  },
  {
    id: 'a2',
    codigo: 'AT-2025-0002',
    titulo: 'Missão de serviço — Nampula',
    descricao: 'Visita técnica ao cliente em Nampula para instalação de equipamento.',
    tipoActividade: 'missao_servico',
    localActividade: 'Nampula',
    dataInicioPrevista: new Date('2025-02-12T07:00:00'),
    motoristaResponsavelId: 'm4',
    motoristaResponsavelNome: 'Fátima Zinha Cumbe',
    viaturaId: 'v3',
    viaturaMatricula: 'MZ-03-EF',
    prioridade: 'media',
    estado: 'planeada',
    historico: [
      {
        id: 'evt-a2-1',
        data: new Date('2025-02-07T14:00:00'),
        estadoNovo: 'planeada',
        utilizador: 'admin',
        descricao: 'Atividade criada',
      },
    ],
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
    historico: [
      {
        id: 'evt-a3-1',
        data: new Date('2025-02-04T16:00:00'),
        estadoNovo: 'planeada',
        utilizador: 'admin',
        descricao: 'Atividade criada',
      },
      {
        id: 'evt-a3-2',
        data: new Date('2025-02-05T06:05:00'),
        estadoAnterior: 'planeada',
        estadoNovo: 'em_curso',
        utilizador: 'admin',
        descricao: 'Estado alterado de "Planeada" para "Em Curso"',
      },
      {
        id: 'evt-a3-3',
        data: new Date('2025-02-05T19:45:00'),
        estadoAnterior: 'em_curso',
        estadoNovo: 'concluida',
        utilizador: 'admin',
        descricao: 'Estado alterado de "Em Curso" para "Concluída"',
      },
    ],
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
    observacoes: 'Suspensa por falta de viatura disponível.',
    historico: [
      {
        id: 'evt-a4-1',
        data: new Date('2025-02-01T10:00:00'),
        estadoNovo: 'planeada',
        utilizador: 'admin',
        descricao: 'Atividade criada',
      },
      {
        id: 'evt-a4-2',
        data: new Date('2025-02-02T15:30:00'),
        estadoAnterior: 'planeada',
        estadoNovo: 'suspensa',
        utilizador: 'admin',
        descricao: 'Estado alterado de "Planeada" para "Suspensa"',
      },
    ],
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
    historico: [
      {
        id: 'evt-a5-1',
        data: new Date('2025-01-25T11:00:00'),
        estadoNovo: 'planeada',
        utilizador: 'admin',
        descricao: 'Atividade criada',
      },
      {
        id: 'evt-a5-2',
        data: new Date('2025-01-27T09:00:00'),
        estadoAnterior: 'planeada',
        estadoNovo: 'cancelada',
        utilizador: 'admin',
        descricao: 'Estado alterado de "Planeada" para "Cancelada"',
      },
    ],
    criadoEm: new Date('2025-01-25T11:00:00'),
    criadoPor: 'admin',
  },
];

// ─── Badge helpers ────────────────────────────────────────────────────────────

const estadoBadge: Record<
  Atividade['estado'],
  { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; className?: string }
> = {
  planeada: { variant: 'secondary', label: 'Planeada' },
  em_curso: { variant: 'default', label: 'Em Curso', className: 'bg-blue-600 hover:bg-blue-700' },
  suspensa: { variant: 'outline', label: 'Suspensa' },
  concluida: { variant: 'default', label: 'Concluída', className: 'bg-green-600 hover:bg-green-700' },
  cancelada: { variant: 'destructive', label: 'Cancelada' },
};

const prioridadeBadge: Record<
  Atividade['prioridade'],
  { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; className?: string }
> = {
  baixa: { variant: 'outline', label: 'Baixa' },
  media: { variant: 'secondary', label: 'Média' },
  alta: { variant: 'default', label: 'Alta', className: 'bg-orange-500 hover:bg-orange-600' },
  urgente: { variant: 'destructive', label: 'Urgente' },
};

const tipoLabel: Record<Atividade['tipoActividade'], string> = {
  deslocacao: 'Deslocação',
  missao_servico: 'Missão de Serviço',
  transporte_mercadorias: 'Transporte de Mercadorias',
  transporte_pessoal: 'Transporte de Pessoal',
  manutencao_campo: 'Manutenção em Campo',
  outro: 'Outro',
};

// ─── State transitions ────────────────────────────────────────────────────────

const transicoesEstado: Record<Atividade['estado'], Atividade['estado'][]> = {
  planeada: ['em_curso'],
  em_curso: ['suspensa', 'concluida', 'cancelada'],
  suspensa: ['em_curso', 'cancelada'],
  concluida: [],
  cancelada: [],
};

const estadosTerminais: Atividade['estado'][] = ['concluida', 'cancelada'];

// ─── Detail field component ───────────────────────────────────────────────────

function DetalheItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AtividadeDetalhesPage() {
  const params = useParams();
  const router = useRouter();

  const [atividades, setAtividades] = useState<Atividade[]>(atividadesMock);

  // Confirmation dialog for terminal state changes
  const [confirmacaoEstado, setConfirmacaoEstado] = useState<{
    novoEstado: Atividade['estado'];
  } | null>(null);

  // ─── Lookup ──────────────────────────────────────────────────────────────

  const atividade = atividades.find((a) => a.id === params.id);

  // ─── Not-found state (subtask 7.1) ───────────────────────────────────────

  if (!atividade) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2 mb-8">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">Atividade não encontrada</h2>
          <p className="text-sm text-muted-foreground">
            O registo com o identificador &quot;{params.id}&quot; não existe.
          </p>
        </div>
      </div>
    );
  }

  // ─── State change handlers ────────────────────────────────────────────────

  const handleMudarEstado = (novoEstado: Atividade['estado']) => {
    if (estadosTerminais.includes(novoEstado)) {
      setConfirmacaoEstado({ novoEstado });
    } else {
      aplicarMudancaEstado(novoEstado);
    }
  };

  const aplicarMudancaEstado = (novoEstado: Atividade['estado']) => {
    const evento: EventoAtividade = {
      id: `evt-${Date.now()}`,
      data: new Date(),
      estadoAnterior: atividade.estado,
      estadoNovo: novoEstado,
      utilizador: 'admin',
      descricao: `Estado alterado de "${estadoBadge[atividade.estado].label}" para "${estadoBadge[novoEstado].label}"`,
    };

    setAtividades((prev) =>
      prev.map((a) =>
        a.id === atividade.id
          ? { ...a, estado: novoEstado, historico: [...a.historico, evento] }
          : a,
      ),
    );

    toast.success(`Estado alterado para "${estadoBadge[novoEstado].label}"`);
    setConfirmacaoEstado(null);
  };

  const confirmarMudancaEstado = () => {
    if (confirmacaoEstado) {
      aplicarMudancaEstado(confirmacaoEstado.novoEstado);
    }
  };

  const transicoes = transicoesEstado[atividade.estado];
  const estadoInfo = estadoBadge[atividade.estado];
  const prioridadeInfo = prioridadeBadge[atividade.prioridade];

  // Histórico ordenado por data decrescente (subtask 7.4)
  const historicoOrdenado = [...atividade.historico].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back navigation */}
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar às Atividades
      </Button>

      {/* Header (subtask 7.2) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">{atividade.codigo}</span>
            <Badge
              variant={estadoInfo.variant}
              className={estadoInfo.className}
            >
              {estadoInfo.label}
            </Badge>
            <Badge
              variant={prioridadeInfo.variant}
              className={prioridadeInfo.className}
            >
              {prioridadeInfo.label}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold leading-tight">{atividade.titulo}</h1>
          {atividade.descricao && (
            <p className="text-sm text-muted-foreground max-w-2xl">{atividade.descricao}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {transicoes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  Mudar Estado
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {transicoes.map((novoEstado) => (
                  <DropdownMenuItem
                    key={novoEstado}
                    onClick={() => handleMudarEstado(novoEstado)}
                  >
                    {estadoBadge[novoEstado].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Tabs (subtasks 7.3 + 7.4) */}
      <Tabs defaultValue="detalhes">
        <TabsList>
          <TabsTrigger value="detalhes" className="gap-2">
            <FileText className="h-4 w-4" />
            Detalhes
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <Clock className="h-4 w-4" />
            Histórico
            <Badge variant="secondary" className="ml-1 text-xs">
              {atividade.historico.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Detalhes (subtask 7.3) ─────────────────────────────────── */}
        <TabsContent value="detalhes" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Informações da Operação */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informações da Operação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem
                  icon={Activity}
                  label="Tipo de Atividade"
                  value={
                    <Badge variant="outline">{tipoLabel[atividade.tipoActividade]}</Badge>
                  }
                />
                <DetalheItem
                  icon={MapPin}
                  label="Local de Actividade"
                  value={atividade.localActividade}
                />
                <DetalheItem
                  icon={Calendar}
                  label="Data de Início Prevista"
                  value={new Date(atividade.dataInicioPrevista).toLocaleString('pt-PT', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                />
                <DetalheItem
                  icon={Calendar}
                  label="Data de Conclusão Prevista"
                  value={
                    atividade.dataConclusaoPrevista
                      ? new Date(atividade.dataConclusaoPrevista).toLocaleString('pt-PT', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        })
                      : <span className="text-muted-foreground">—</span>
                  }
                />
              </CardContent>
            </Card>

            {/* Recursos Alocados */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recursos Alocados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem
                  icon={User}
                  label="Motorista Responsável"
                  value={
                    atividade.motoristaResponsavelNome ? (
                      atividade.motoristaResponsavelNome
                    ) : (
                      <span className="text-muted-foreground">Não atribuído</span>
                    )
                  }
                />
                <DetalheItem
                  icon={Truck}
                  label="Viatura Associada"
                  value={
                    atividade.viaturaMatricula ? (
                      <span className="font-mono">{atividade.viaturaMatricula}</span>
                    ) : (
                      <span className="text-muted-foreground">Não atribuída</span>
                    )
                  }
                />
              </CardContent>
            </Card>

            {/* Observações */}
            {atividade.observacoes && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {atividade.observacoes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Metadados */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Metadados</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <DetalheItem
                  icon={Clock}
                  label="Criado em"
                  value={new Date(atividade.criadoEm).toLocaleString('pt-PT', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                />
                <DetalheItem
                  icon={User}
                  label="Criado por"
                  value={atividade.criadoPor}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab: Histórico (subtask 7.4) ─────────────────────────────────── */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              {historicoOrdenado.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Sem eventos registados</p>
                </div>
              ) : (
                <ol className="relative border-l border-border ml-3 space-y-0">
                  {historicoOrdenado.map((evento, index) => (
                    <li key={evento.id} className="mb-6 ml-6">
                      {/* Timeline dot */}
                      <span
                        className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background ${
                          index === 0
                            ? 'bg-primary'
                            : 'bg-muted-foreground/40'
                        }`}
                      />

                      {/* Date/time */}
                      <time className="mb-1 block text-xs text-muted-foreground">
                        {new Date(evento.data).toLocaleString('pt-PT', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        })}
                      </time>

                      {/* State transition */}
                      {evento.estadoAnterior ? (
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <Badge
                            variant={estadoBadge[evento.estadoAnterior as Atividade['estado']]?.variant ?? 'outline'}
                            className={`text-xs ${estadoBadge[evento.estadoAnterior as Atividade['estado']]?.className ?? ''}`}
                          >
                            {estadoBadge[evento.estadoAnterior as Atividade['estado']]?.label ?? evento.estadoAnterior}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <Badge
                            variant={estadoBadge[evento.estadoNovo as Atividade['estado']]?.variant ?? 'outline'}
                            className={`text-xs ${estadoBadge[evento.estadoNovo as Atividade['estado']]?.className ?? ''}`}
                          >
                            {estadoBadge[evento.estadoNovo as Atividade['estado']]?.label ?? evento.estadoNovo}
                          </Badge>
                        </div>
                      ) : (
                        <div className="mb-1">
                          <Badge
                            variant={estadoBadge[evento.estadoNovo as Atividade['estado']]?.variant ?? 'outline'}
                            className={`text-xs ${estadoBadge[evento.estadoNovo as Atividade['estado']]?.className ?? ''}`}
                          >
                            {estadoBadge[evento.estadoNovo as Atividade['estado']]?.label ?? evento.estadoNovo}
                          </Badge>
                        </div>
                      )}

                      {/* Description and user */}
                      <p className="text-sm text-foreground">{evento.descricao}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        por <span className="font-medium">{evento.utilizador}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* State change confirmation dialog */}
      <Dialog
        open={confirmacaoEstado !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmacaoEstado(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Mudança de Estado</DialogTitle>
          </DialogHeader>
          {confirmacaoEstado && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Tem a certeza que pretende alterar o estado da atividade{' '}
                <span className="font-semibold text-foreground">{atividade.titulo}</span>{' '}
                para{' '}
                <Badge
                  variant={estadoBadge[confirmacaoEstado.novoEstado].variant}
                  className={estadoBadge[confirmacaoEstado.novoEstado].className}
                >
                  {estadoBadge[confirmacaoEstado.novoEstado].label}
                </Badge>
                ?
              </p>
              <p className="text-sm text-muted-foreground">Esta acção é irreversível.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmacaoEstado(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarMudancaEstado}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
