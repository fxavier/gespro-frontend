'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Activity,
  Plus,
  Search,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import type { Atividade, EventoAtividade, Viatura, Motorista } from '@/types/transporte';
import {
  validarAlocacaoViatura,
  validarAlocacaoMotorista,
} from '@/services/transporte-alocacao.service';

// ─── Mock data (subtask 6.1) ─────────────────────────────────────────────────

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

// ─── Badge helpers ────────────────────────────────────────────────────────────

const estadoBadge: Record<
  Atividade['estado'],
  { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }
> = {
  planeada: { variant: 'secondary', label: 'Planeada' },
  em_curso: { variant: 'default', label: 'Em Curso' },
  suspensa: { variant: 'outline', label: 'Suspensa' },
  concluida: { variant: 'default', label: 'Concluída' },
  cancelada: { variant: 'destructive', label: 'Cancelada' },
};

const prioridadeBadge: Record<
  Atividade['prioridade'],
  { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }
> = {
  baixa: { variant: 'outline', label: 'Baixa' },
  media: { variant: 'secondary', label: 'Média' },
  alta: { variant: 'default', label: 'Alta' },
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

// ─── Zod schema (subtask 6.4) ─────────────────────────────────────────────────

const atividadeSchema = z.object({
  titulo: z.string().min(1, 'Título é obrigatório'),
  tipoActividade: z.enum([
    'deslocacao',
    'missao_servico',
    'transporte_mercadorias',
    'transporte_pessoal',
    'manutencao_campo',
    'outro',
  ]),
  localActividade: z.string().min(1, 'Local de actividade é obrigatório'),
  dataInicioPrevista: z.string().min(1, 'Data de início é obrigatória'),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente']),
  descricao: z.string().optional(),
  dataConclusaoPrevista: z.string().optional(),
  motoristaResponsavelId: z.string().optional(),
  viaturaId: z.string().optional(),
  observacoes: z.string().optional(),
});

type AtividadeFormValues = z.infer<typeof atividadeSchema>;

// ─── State transitions (subtask 6.5) ─────────────────────────────────────────

const transicoesEstado: Record<Atividade['estado'], Atividade['estado'][]> = {
  planeada: ['em_curso'],
  em_curso: ['suspensa', 'concluida', 'cancelada'],
  suspensa: ['em_curso', 'cancelada'],
  concluida: [],
  cancelada: [],
};

const estadosTerminais: Atividade['estado'][] = ['concluida', 'cancelada'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AtividadesPage() {
  const [atividades, setAtividades] = useState<Atividade[]>(atividadesMock);

  // Filters (subtask 6.3)
  const [busca, setBusca] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  // Creation dialog (subtask 6.4)
  const [dialogCriacaoAberto, setDialogCriacaoAberto] = useState(false);

  // State change confirmation dialog (subtask 6.5)
  const [confirmacaoEstado, setConfirmacaoEstado] = useState<{
    atividade: Atividade;
    novoEstado: Atividade['estado'];
  } | null>(null);

  // react-hook-form
  const form = useForm<AtividadeFormValues>({
    resolver: zodResolver(atividadeSchema),
    defaultValues: {
      titulo: '',
      tipoActividade: 'deslocacao',
      localActividade: '',
      dataInicioPrevista: '',
      prioridade: 'media',
      descricao: '',
      dataConclusaoPrevista: '',
      motoristaResponsavelId: '',
      viaturaId: '',
      observacoes: '',
    },
  });

  // ─── Filtered data (subtask 6.3) ───────────────────────────────────────────

  const dadosFiltrados = useMemo(() => {
    return atividades.filter((a) => {
      const matchBusca =
        busca === '' ||
        a.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        a.codigo.toLowerCase().includes(busca.toLowerCase());
      const matchEstado = filtroEstado === 'todos' || a.estado === filtroEstado;
      const matchTipo = filtroTipo === 'todos' || a.tipoActividade === filtroTipo;
      return matchBusca && matchEstado && matchTipo;
    });
  }, [atividades, busca, filtroEstado, filtroTipo]);

  // ─── Pagination (subtask 6.2) ──────────────────────────────────────────────

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  // ─── Auto-generate codigo ──────────────────────────────────────────────────

  const gerarCodigo = (): string => {
    const ano = new Date().getFullYear();
    const sequencia = atividades.length + 1;
    return `AT-${ano}-${String(sequencia).padStart(4, '0')}`;
  };

  // ─── Creation submit (subtask 6.4) ────────────────────────────────────────

  const onSubmit = async (values: AtividadeFormValues) => {
    const dataInicio = new Date(values.dataInicioPrevista);
    const dataFim = values.dataConclusaoPrevista
      ? new Date(values.dataConclusaoPrevista)
      : undefined;

    // Validate viatura allocation
    if (values.viaturaId) {
      const viatura = viaturasMock.find((v) => v.id === values.viaturaId);
      if (viatura) {
        const resultado = validarAlocacaoViatura(viatura, dataInicio, dataFim, atividades);
        if (!resultado.isValid) {
          resultado.errors.forEach((err, idx) => {
            form.setError(idx === 0 ? 'viaturaId' : 'root', { message: err });
          });
          return;
        }
      }
    }

    // Validate motorista allocation
    if (values.motoristaResponsavelId) {
      const motorista = motoristasMock.find((m) => m.id === values.motoristaResponsavelId);
      if (motorista) {
        const resultado = validarAlocacaoMotorista(motorista, dataInicio, dataFim, atividades);
        if (!resultado.isValid) {
          resultado.errors.forEach((err, idx) => {
            form.setError(idx === 0 ? 'motoristaResponsavelId' : 'root', { message: err });
          });
          return;
        }
      }
    }

    const viatura = values.viaturaId
      ? viaturasMock.find((v) => v.id === values.viaturaId)
      : undefined;
    const motorista = values.motoristaResponsavelId
      ? motoristasMock.find((m) => m.id === values.motoristaResponsavelId)
      : undefined;

    const eventoInicial: EventoAtividade = {
      id: `evt-${Date.now()}`,
      data: new Date(),
      estadoNovo: 'planeada',
      utilizador: 'admin',
      descricao: 'Atividade criada',
    };

    const novaAtividade: Atividade = {
      id: `a${Date.now()}`,
      codigo: gerarCodigo(),
      titulo: values.titulo,
      descricao: values.descricao || undefined,
      tipoActividade: values.tipoActividade,
      localActividade: values.localActividade,
      dataInicioPrevista: dataInicio,
      dataConclusaoPrevista: dataFim,
      motoristaResponsavelId: motorista?.id,
      motoristaResponsavelNome: motorista?.nomeCompleto,
      viaturaId: viatura?.id,
      viaturaMatricula: viatura?.matricula,
      prioridade: values.prioridade,
      estado: 'planeada',
      observacoes: values.observacoes || undefined,
      historico: [eventoInicial],
      criadoEm: new Date(),
      criadoPor: 'admin',
    };

    setAtividades((prev) => [novaAtividade, ...prev]);
    toast.success('Atividade criada com sucesso!');
    setDialogCriacaoAberto(false);
    form.reset();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    setDialogCriacaoAberto(open);
  };

  // ─── State change (subtask 6.5) ────────────────────────────────────────────

  const handleMudarEstado = (atividade: Atividade, novoEstado: Atividade['estado']) => {
    if (estadosTerminais.includes(novoEstado)) {
      setConfirmacaoEstado({ atividade, novoEstado });
    } else {
      aplicarMudancaEstado(atividade, novoEstado);
    }
  };

  const aplicarMudancaEstado = (atividade: Atividade, novoEstado: Atividade['estado']) => {
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
      aplicarMudancaEstado(confirmacaoEstado.atividade, confirmacaoEstado.novoEstado);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Atividades</h1>
          <p className="text-muted-foreground">Gestão de atividades de transporte e logística</p>
        </div>
        <Button className="gap-2" onClick={() => setDialogCriacaoAberto(true)}>
          <Plus className="h-4 w-4" />
          Nova Atividade
        </Button>
      </div>

      {/* Filters (subtask 6.3) */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros e Pesquisa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por título ou código..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                <SelectItem value="planeada">Planeada</SelectItem>
                <SelectItem value="em_curso">Em Curso</SelectItem>
                <SelectItem value="suspensa">Suspensa</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Atividade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="deslocacao">Deslocação</SelectItem>
                <SelectItem value="missao_servico">Missão de Serviço</SelectItem>
                <SelectItem value="transporte_mercadorias">Transporte de Mercadorias</SelectItem>
                <SelectItem value="transporte_pessoal">Transporte de Pessoal</SelectItem>
                <SelectItem value="manutencao_campo">Manutenção em Campo</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table (subtask 6.2) */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Atividades ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Código</th>
                  <th className="text-left p-4 font-medium">Título</th>
                  <th className="text-left p-4 font-medium">Tipo</th>
                  <th className="text-left p-4 font-medium">Local</th>
                  <th className="text-left p-4 font-medium">Data Início</th>
                  <th className="text-left p-4 font-medium">Motorista</th>
                  <th className="text-left p-4 font-medium">Viatura</th>
                  <th className="text-left p-4 font-medium">Prioridade</th>
                  <th className="text-left p-4 font-medium">Estado</th>
                  <th className="text-left p-4 font-medium">Acções</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((atividade) => {
                  const estadoInfo = estadoBadge[atividade.estado];
                  const prioridadeInfo = prioridadeBadge[atividade.prioridade];
                  const transicoes = transicoesEstado[atividade.estado];

                  return (
                    <tr key={atividade.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <span className="font-mono text-sm">{atividade.codigo}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-medium">{atividade.titulo}</span>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{tipoLabel[atividade.tipoActividade]}</Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {atividade.localActividade}
                      </td>
                      <td className="p-4 text-sm">
                        {new Date(atividade.dataInicioPrevista).toLocaleDateString('pt-PT')}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {atividade.motoristaResponsavelNome ?? '—'}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {atividade.viaturaMatricula ?? '—'}
                      </td>
                      <td className="p-4">
                        <Badge variant={prioridadeInfo.variant}>{prioridadeInfo.label}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={estadoInfo.variant}>{estadoInfo.label}</Badge>
                      </td>
                      <td className="p-4">
                        {transicoes.length > 0 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1">
                                Mudar Estado
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {transicoes.map((novoEstado) => (
                                <DropdownMenuItem
                                  key={novoEstado}
                                  onClick={() => handleMudarEstado(atividade, novoEstado)}
                                >
                                  {estadoBadge[novoEstado].label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma atividade encontrada</p>
            </div>
          )}

          {dadosFiltrados.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={totalItems}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </CardContent>
      </Card>

      {/* Creation Dialog (subtask 6.4) */}
      <Dialog open={dialogCriacaoAberto} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Atividade</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              {/* Root errors (from allocation validation) */}
              {form.formState.errors.root && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{form.formState.errors.root.message}</span>
                </div>
              )}

              <FormField
                control={form.control}
                name="titulo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input placeholder="Título da atividade" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipoActividade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Atividade *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="deslocacao">Deslocação</SelectItem>
                          <SelectItem value="missao_servico">Missão de Serviço</SelectItem>
                          <SelectItem value="transporte_mercadorias">Transporte de Mercadorias</SelectItem>
                          <SelectItem value="transporte_pessoal">Transporte de Pessoal</SelectItem>
                          <SelectItem value="manutencao_campo">Manutenção em Campo</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prioridade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="localActividade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Local de Actividade *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Maputo, Beira, Nampula..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dataInicioPrevista"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Início Prevista *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dataConclusaoPrevista"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Conclusão Prevista</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Descrição da atividade..." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="motoristaResponsavelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motorista Responsável</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Nenhum" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Nenhum</SelectItem>
                          {motoristasMock.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nomeCompleto}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="viaturaId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Viatura Associada</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Nenhuma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Nenhuma</SelectItem>
                          {viaturasMock.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.matricula} — {v.marca} {v.modelo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Observações adicionais..." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Criar Atividade</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* State change confirmation dialog (subtask 6.5) */}
      <Dialog
        open={confirmacaoEstado !== null}
        onOpenChange={(open) => { if (!open) setConfirmacaoEstado(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Mudança de Estado</DialogTitle>
          </DialogHeader>
          {confirmacaoEstado && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Tem a certeza que pretende alterar o estado da atividade{' '}
                <span className="font-semibold text-foreground">
                  {confirmacaoEstado.atividade.titulo}
                </span>{' '}
                para{' '}
                <Badge variant={estadoBadge[confirmacaoEstado.novoEstado].variant}>
                  {estadoBadge[confirmacaoEstado.novoEstado].label}
                </Badge>
                ?
              </p>
              <p className="text-sm text-muted-foreground">
                Esta acção é irreversível.
              </p>
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
