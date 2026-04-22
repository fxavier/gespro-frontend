'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Truck,
  FileText,
  Wrench,
  ClipboardCheck,
  Clock,
  Edit,
  Plus,
  ChevronDown,
  ChevronUp,
  User,
  MapPin,
  Calendar,
  Package,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Viatura,
  DocumentoViatura,
  ManutencaoViatura,
  ChecklistViatura,
  ItemChecklist,
} from '@/types/transporte';

// ─── Extended type with checklists ───────────────────────────────────────────

type ViaturaComChecklist = Viatura & { checklists: ChecklistViatura[] };

// ─── Label helpers ────────────────────────────────────────────────────────────

const tipoViaturaLabel: Record<Viatura['tipoViatura'], string> = {
  ligeiro_passageiros: 'Ligeiro Passageiros',
  ligeiro_mercadorias: 'Ligeiro Mercadorias',
  pesado_mercadorias: 'Pesado Mercadorias',
  pesado_passageiros: 'Pesado Passageiros',
  motociclo: 'Motociclo',
  outro: 'Outro',
};

const tipoDocumentoLabel: Record<DocumentoViatura['tipo'], string> = {
  livrete: 'Livrete',
  inspecao: 'Inspecção',
  seguro: 'Seguro',
  licenca: 'Licença',
  manifesto: 'Manifesto',
  taxa_radio: 'Taxa de Rádio',
  outro: 'Outro',
};

const estadoViaturaConfig: Record<
  Viatura['estado'],
  { label: string; className?: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  disponivel: { label: 'Disponível', variant: 'default', className: 'bg-green-600 hover:bg-green-700 text-white' },
  em_actividade: { label: 'Em Actividade', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700 text-white' },
  em_manutencao: { label: 'Em Manutenção', variant: 'default', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
  inactiva: { label: 'Inactiva', variant: 'outline' },
  abatida: { label: 'Abatida', variant: 'destructive' },
};

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── DetalheItem helper ───────────────────────────────────────────────────────

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const manutencoesMock: ManutencaoViatura[] = [
  {
    id: 'man-1',
    viaturaId: '1',
    tipo: 'preventiva',
    data: new Date('2024-11-10'),
    quilometragem: 45000,
    criterio: 'Cada 10 000 km',
    descricao: 'Troca de óleo, filtro de óleo e filtro de ar.',
    fornecedor: 'Auto Serviço Maputo',
    custo: 8500,
    pecasSubstituidas: 'Óleo 5W-30 (5L), filtro de óleo, filtro de ar',
    responsavel: 'João Machava',
    proximaManutencaoPrevista: {
      data: new Date('2025-05-10'),
      quilometragem: 55000,
      criterio: 'Cada 10 000 km',
    },
    criadoEm: new Date('2024-11-10'),
  },
  {
    id: 'man-2',
    viaturaId: '3',
    tipo: 'correctiva',
    data: new Date('2024-12-05'),
    quilometragem: 120000,
    descricao: 'Substituição de pastilhas de travão dianteiras e traseiras. Rectificação de discos.',
    fornecedor: 'Oficina Central Nampula',
    custo: 22000,
    pecasSubstituidas: 'Pastilhas dianteiras, pastilhas traseiras, discos dianteiros',
    responsavel: 'Técnico Oficina',
    criadoEm: new Date('2024-12-05'),
  },
  {
    id: 'man-3',
    viaturaId: '1',
    tipo: 'preventiva',
    data: new Date('2024-06-20'),
    quilometragem: 35000,
    criterio: 'Cada 10 000 km',
    descricao: 'Troca de óleo e filtros. Verificação de fluidos.',
    fornecedor: 'Auto Serviço Maputo',
    custo: 7200,
    responsavel: 'João Machava',
    proximaManutencaoPrevista: {
      data: new Date('2024-11-10'),
      quilometragem: 45000,
    },
    criadoEm: new Date('2024-06-20'),
  },
  {
    id: 'man-4',
    viaturaId: '2',
    tipo: 'correctiva',
    data: new Date('2024-10-15'),
    descricao: 'Reparação de avaria eléctrica — substituição de alternador.',
    fornecedor: 'Electro Auto Beira',
    custo: 15000,
    pecasSubstituidas: 'Alternador 12V',
    responsavel: 'Carlos Sitoe',
    criadoEm: new Date('2024-10-15'),
  },
  {
    id: 'man-5',
    viaturaId: '4',
    tipo: 'preventiva',
    data: new Date('2023-08-01'),
    quilometragem: 200000,
    descricao: 'Revisão geral — troca de correia de distribuição, óleo e filtros.',
    fornecedor: 'Mercedes Service Maputo',
    custo: 45000,
    responsavel: 'Técnico Mercedes',
    criadoEm: new Date('2023-08-01'),
  },
];

const viaturasMock: ViaturaComChecklist[] = [
  {
    id: '1',
    matricula: 'ABC-1234',
    marca: 'Toyota',
    modelo: 'Hilux',
    tipoViatura: 'ligeiro_mercadorias',
    capacidade: 1000,
    unidadeCapacidade: 'kg',
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2022-01-15'),
    motoristaResponsavelId: 'mot-1',
    motoristaResponsavelNome: 'João Machava',
    estado: 'disponivel',
    documentos: [
      {
        id: 'doc-1-1',
        viaturaId: '1',
        tipo: 'livrete',
        numero: 'LV-2022-001',
        dataEmissao: new Date('2022-01-15'),
        dataValidade: new Date('2027-01-15'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-1-2',
        viaturaId: '1',
        tipo: 'seguro',
        numero: 'SEG-2024-001',
        dataEmissao: new Date('2024-01-01'),
        dataValidade: new Date('2025-01-01'),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-1-3',
        viaturaId: '1',
        tipo: 'inspecao',
        numero: 'INSP-2024-001',
        dataEmissao: new Date('2024-03-01'),
        dataValidade: new Date('2025-03-01'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
    ],
    checklists: [
      {
        id: 'chk-1-1',
        viaturaId: '1',
        tipoViatura: 'ligeiro_mercadorias',
        responsavel: 'João Machava',
        dataInspeccao: new Date('2025-01-10'),
        observacoes: 'Inspecção de rotina antes de missão.',
        itens: [
          { id: 'i1', nome: 'Pneus', categoria: 'componente', estado: 'ok' },
          { id: 'i2', nome: 'Travões', categoria: 'componente', estado: 'ok' },
          { id: 'i3', nome: 'Luzes', categoria: 'componente', estado: 'ok' },
          { id: 'i4', nome: 'Extintor', categoria: 'acessorio', estado: 'ok' },
          { id: 'i5', nome: 'Triângulo', categoria: 'acessorio', estado: 'ok' },
          { id: 'i6', nome: 'Colete Reflector', categoria: 'acessorio', estado: 'ok' },
          { id: 'i7', nome: 'Roda Sobressalente', categoria: 'sobressalente', estado: 'ok' },
          { id: 'i8', nome: 'Macaco', categoria: 'sobressalente', estado: 'ok' },
          { id: 'i9', nome: 'Kit de Primeiros Socorros', categoria: 'sobressalente', estado: 'falta', observacoes: 'Kit em falta — necessário repor.' },
        ],
      },
      {
        id: 'chk-1-2',
        viaturaId: '1',
        tipoViatura: 'ligeiro_mercadorias',
        responsavel: 'Supervisor Frota',
        dataInspeccao: new Date('2024-11-05'),
        itens: [
          { id: 'j1', nome: 'Pneus', categoria: 'componente', estado: 'ok' },
          { id: 'j2', nome: 'Travões', categoria: 'componente', estado: 'avaria', observacoes: 'Pastilhas desgastadas.' },
          { id: 'j3', nome: 'Luzes', categoria: 'componente', estado: 'ok' },
          { id: 'j4', nome: 'Extintor', categoria: 'acessorio', estado: 'ok' },
          { id: 'j5', nome: 'Triângulo', categoria: 'acessorio', estado: 'ok' },
          { id: 'j6', nome: 'Colete Reflector', categoria: 'acessorio', estado: 'ok' },
          { id: 'j7', nome: 'Roda Sobressalente', categoria: 'sobressalente', estado: 'ok' },
          { id: 'j8', nome: 'Macaco', categoria: 'sobressalente', estado: 'ok' },
          { id: 'j9', nome: 'Kit de Primeiros Socorros', categoria: 'sobressalente', estado: 'ok' },
        ],
      },
    ],
    criadoEm: new Date('2022-01-15'),
    actualizadoEm: new Date('2024-01-15'),
  },
  {
    id: '2',
    matricula: 'XYZ-5678',
    marca: 'Nissan',
    modelo: 'NP300',
    tipoViatura: 'ligeiro_passageiros',
    capacidade: 5,
    unidadeCapacidade: 'passageiros',
    localActividade: 'Beira',
    dataInicioActividade: new Date('2021-03-20'),
    motoristaResponsavelId: 'mot-2',
    motoristaResponsavelNome: 'Carlos Sitoe',
    estado: 'em_actividade',
    documentos: [
      {
        id: 'doc-2-1',
        viaturaId: '2',
        tipo: 'livrete',
        numero: 'LV-2021-002',
        dataEmissao: new Date('2021-03-20'),
        dataValidade: new Date('2026-03-20'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-2-2',
        viaturaId: '2',
        tipo: 'seguro',
        numero: 'SEG-2024-002',
        dataEmissao: new Date('2024-01-15'),
        dataValidade: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'proximo_expirar',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-2-3',
        viaturaId: '2',
        tipo: 'inspecao',
        numero: 'INSP-2024-002',
        dataEmissao: new Date('2024-02-01'),
        dataValidade: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        entidadeEmissora: 'INATTER',
        estado: 'proximo_expirar',
        prazoAlertaDias: 30,
      },
    ],
    checklists: [
      {
        id: 'chk-2-1',
        viaturaId: '2',
        tipoViatura: 'ligeiro_passageiros',
        responsavel: 'Carlos Sitoe',
        dataInspeccao: new Date('2025-01-08'),
        itens: [
          { id: 'k1', nome: 'Pneus', categoria: 'componente', estado: 'ok' },
          { id: 'k2', nome: 'Travões', categoria: 'componente', estado: 'ok' },
          { id: 'k3', nome: 'Luzes', categoria: 'componente', estado: 'avaria', observacoes: 'Luz traseira direita fundida.' },
          { id: 'k4', nome: 'Extintor', categoria: 'acessorio', estado: 'ok' },
          { id: 'k5', nome: 'Triângulo', categoria: 'acessorio', estado: 'ok' },
          { id: 'k6', nome: 'Colete Reflector', categoria: 'acessorio', estado: 'ok' },
          { id: 'k7', nome: 'Roda Sobressalente', categoria: 'sobressalente', estado: 'ok' },
          { id: 'k8', nome: 'Macaco', categoria: 'sobressalente', estado: 'ok' },
          { id: 'k9', nome: 'Kit de Primeiros Socorros', categoria: 'sobressalente', estado: 'ok' },
        ],
      },
    ],
    criadoEm: new Date('2021-03-20'),
    actualizadoEm: new Date('2024-01-10'),
  },
  {
    id: '3',
    matricula: 'DEF-9012',
    marca: 'Isuzu',
    modelo: 'FTR',
    tipoViatura: 'pesado_mercadorias',
    capacidade: 10,
    unidadeCapacidade: 'ton',
    localActividade: 'Nampula',
    dataInicioActividade: new Date('2020-05-10'),
    estado: 'em_manutencao',
    observacoes: 'Em manutenção preventiva — troca de óleo e filtros',
    documentos: [
      {
        id: 'doc-3-1',
        viaturaId: '3',
        tipo: 'livrete',
        numero: 'LV-2020-003',
        dataEmissao: new Date('2020-05-10'),
        dataValidade: new Date('2025-05-10'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-3-2',
        viaturaId: '3',
        tipo: 'seguro',
        numero: 'SEG-2023-003',
        dataEmissao: new Date('2023-01-01'),
        dataValidade: new Date('2024-01-01'),
        entidadeEmissora: 'Seguradora Nacional',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-3-3',
        viaturaId: '3',
        tipo: 'inspecao',
        numero: 'INSP-2023-003',
        dataEmissao: new Date('2023-03-01'),
        dataValidade: new Date('2024-03-01'),
        entidadeEmissora: 'INATTER',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
    ],
    checklists: [
      {
        id: 'chk-3-1',
        viaturaId: '3',
        tipoViatura: 'pesado_mercadorias',
        responsavel: 'Técnico Oficina',
        dataInspeccao: new Date('2024-12-01'),
        observacoes: 'Inspecção antes de entrada em manutenção.',
        itens: [
          { id: 'l1', nome: 'Pneus', categoria: 'componente', estado: 'ok' },
          { id: 'l2', nome: 'Travões', categoria: 'componente', estado: 'avaria', observacoes: 'Pastilhas desgastadas — em substituição.' },
          { id: 'l3', nome: 'Luzes', categoria: 'componente', estado: 'ok' },
          { id: 'l4', nome: 'Extintor', categoria: 'acessorio', estado: 'ok' },
          { id: 'l5', nome: 'Triângulo', categoria: 'acessorio', estado: 'ok' },
          { id: 'l6', nome: 'Colete Reflector', categoria: 'acessorio', estado: 'ok' },
          { id: 'l7', nome: 'Roda Sobressalente', categoria: 'sobressalente', estado: 'ok' },
          { id: 'l8', nome: 'Macaco', categoria: 'sobressalente', estado: 'ok' },
          { id: 'l9', nome: 'Kit de Primeiros Socorros', categoria: 'sobressalente', estado: 'falta' },
        ],
      },
    ],
    criadoEm: new Date('2020-05-10'),
    actualizadoEm: new Date('2024-01-05'),
  },
  {
    id: '4',
    matricula: 'GHI-3456',
    marca: 'Mercedes-Benz',
    modelo: 'Sprinter',
    tipoViatura: 'pesado_passageiros',
    capacidade: 20,
    unidadeCapacidade: 'passageiros',
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2019-08-01'),
    estado: 'inactiva',
    observacoes: 'Aguarda renovação de documentação',
    documentos: [
      {
        id: 'doc-4-1',
        viaturaId: '4',
        tipo: 'livrete',
        numero: 'LV-2019-004',
        dataEmissao: new Date('2019-08-01'),
        dataValidade: new Date('2024-08-01'),
        entidadeEmissora: 'INATTER',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
      {
        id: 'doc-4-2',
        viaturaId: '4',
        tipo: 'licenca',
        numero: 'LIC-2019-004',
        dataEmissao: new Date('2019-08-01'),
        dataValidade: new Date('2024-08-01'),
        entidadeEmissora: 'Ministério dos Transportes',
        estado: 'expirado',
        prazoAlertaDias: 30,
      },
    ],
    checklists: [
      {
        id: 'chk-4-1',
        viaturaId: '4',
        tipoViatura: 'pesado_passageiros',
        responsavel: 'Supervisor Frota',
        dataInspeccao: new Date('2024-07-15'),
        observacoes: 'Última inspecção antes de inactivação.',
        itens: [
          { id: 'm1', nome: 'Pneus', categoria: 'componente', estado: 'ok' },
          { id: 'm2', nome: 'Travões', categoria: 'componente', estado: 'ok' },
          { id: 'm3', nome: 'Luzes', categoria: 'componente', estado: 'ok' },
          { id: 'm4', nome: 'Extintor', categoria: 'acessorio', estado: 'ok' },
          { id: 'm5', nome: 'Triângulo', categoria: 'acessorio', estado: 'ok' },
          { id: 'm6', nome: 'Colete Reflector', categoria: 'acessorio', estado: 'ok' },
          { id: 'm7', nome: 'Roda Sobressalente', categoria: 'sobressalente', estado: 'ok' },
          { id: 'm8', nome: 'Macaco', categoria: 'sobressalente', estado: 'ok' },
          { id: 'm9', nome: 'Kit de Primeiros Socorros', categoria: 'sobressalente', estado: 'ok' },
        ],
      },
    ],
    criadoEm: new Date('2019-08-01'),
    actualizadoEm: new Date('2024-01-01'),
  },
];

const defaultChecklistItems: { nome: string; categoria: ItemChecklist['categoria'] }[] = [
  { nome: 'Pneus', categoria: 'componente' },
  { nome: 'Travões', categoria: 'componente' },
  { nome: 'Luzes', categoria: 'componente' },
  { nome: 'Extintor', categoria: 'acessorio' },
  { nome: 'Triângulo', categoria: 'acessorio' },
  { nome: 'Colete Reflector', categoria: 'acessorio' },
  { nome: 'Roda Sobressalente', categoria: 'sobressalente' },
  { nome: 'Macaco', categoria: 'sobressalente' },
  { nome: 'Kit de Primeiros Socorros', categoria: 'sobressalente' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ViaturaDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // ─── State ──────────────────────────────────────────────────────────────

  const [viaturas, setViaturas] = useState<ViaturaComChecklist[]>(viaturasMock);
  const [manutencoes, setManutencoes] = useState<ManutencaoViatura[]>(manutencoesMock);

  // Edit dialog
  const [editDialogAberto, setEditDialogAberto] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Viatura>>({});

  // Document dialog
  const [docDialogAberto, setDocDialogAberto] = useState(false);
  const [docForm, setDocForm] = useState<Partial<DocumentoViatura>>({
    tipo: 'livrete',
    prazoAlertaDias: 30,
  });

  // Maintenance dialog
  const [manutDialogAberto, setManutDialogAberto] = useState(false);
  const [manutForm, setManutForm] = useState<Partial<ManutencaoViatura> & {
    proximaData?: string;
    proximaQuilometragem?: string;
    proximaCriterio?: string;
  }>({
    tipo: 'preventiva',
  });

  // Checklist dialog
  const [checklistDialogAberto, setChecklistDialogAberto] = useState(false);
  const [checklistForm, setChecklistForm] = useState<{
    responsavel: string;
    dataInspeccao: string;
    observacoes: string;
    itens: { nome: string; categoria: ItemChecklist['categoria']; estado: ItemChecklist['estado']; observacoes: string }[];
  }>({
    responsavel: '',
    dataInspeccao: new Date().toISOString().split('T')[0],
    observacoes: '',
    itens: defaultChecklistItems.map((item) => ({
      nome: item.nome,
      categoria: item.categoria,
      estado: 'ok' as ItemChecklist['estado'],
      observacoes: '',
    })),
  });

  // Checklist expand/collapse
  const [expandedChecklists, setExpandedChecklists] = useState<Set<string>>(new Set());

  // ─── Lookup ──────────────────────────────────────────────────────────────

  const viatura = viaturas.find((v) => v.id === id);

  // ─── Not-found state ─────────────────────────────────────────────────────

  if (!viatura) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2 mb-8">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">Viatura não encontrada</h2>
          <p className="text-sm text-muted-foreground">
            O registo com o identificador &quot;{id}&quot; não existe.
          </p>
        </div>
      </div>
    );
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const temDocumentosExpirados = viatura.documentos.some((d) => d.estado === 'expirado');
  const temDocumentosProximosExpirar = viatura.documentos.some((d) => d.estado === 'proximo_expirar');
  const estadoConfig = estadoViaturaConfig[viatura.estado];
  const manutencoesViatura = manutencoes
    .filter((m) => m.viaturaId === viatura.id)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  const checklistsViatura = [...viatura.checklists].sort(
    (a, b) => new Date(b.dataInspeccao).getTime() - new Date(a.dataInspeccao).getTime(),
  );

  // ─── Handlers: Edit ──────────────────────────────────────────────────────

  const handleAbrirEditar = () => {
    setEditForm({ ...viatura });
    setEditDialogAberto(true);
  };

  const handleSalvarEdicao = () => {
    if (!editForm.matricula || !editForm.marca || !editForm.modelo || !editForm.localActividade) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setViaturas((prev) =>
      prev.map((v) =>
        v.id === viatura.id
          ? { ...v, ...editForm, actualizadoEm: new Date() }
          : v,
      ),
    );
    toast.success('Viatura actualizada com sucesso!');
    setEditDialogAberto(false);
  };

  // ─── Handlers: Document ──────────────────────────────────────────────────

  const handleAbrirAdicionarDoc = () => {
    setDocForm({ tipo: 'livrete', prazoAlertaDias: 30 });
    setDocDialogAberto(true);
  };

  const handleSalvarDoc = () => {
    if (!docForm.tipo || !docForm.numero || !docForm.dataEmissao || !docForm.dataValidade || !docForm.entidadeEmissora) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const novoDoc: DocumentoViatura = {
      id: `doc-${Date.now()}`,
      viaturaId: viatura.id,
      tipo: docForm.tipo as DocumentoViatura['tipo'],
      numero: docForm.numero!,
      dataEmissao: new Date(docForm.dataEmissao as unknown as string),
      dataValidade: new Date(docForm.dataValidade as unknown as string),
      entidadeEmissora: docForm.entidadeEmissora!,
      estado: 'valido',
      prazoAlertaDias: docForm.prazoAlertaDias ?? 30,
      observacoes: docForm.observacoes,
    };
    setViaturas((prev) =>
      prev.map((v) =>
        v.id === viatura.id
          ? { ...v, documentos: [...v.documentos, novoDoc] }
          : v,
      ),
    );
    toast.success('Documento adicionado com sucesso!');
    setDocDialogAberto(false);
  };

  // ─── Handlers: Maintenance ───────────────────────────────────────────────

  const handleAbrirRegistarManut = () => {
    setManutForm({ tipo: 'preventiva' });
    setManutDialogAberto(true);
  };

  const handleSalvarManut = () => {
    if (!manutForm.tipo || !manutForm.data || !manutForm.descricao || !manutForm.responsavel) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const novaManut: ManutencaoViatura = {
      id: `man-${Date.now()}`,
      viaturaId: viatura.id,
      tipo: manutForm.tipo as ManutencaoViatura['tipo'],
      data: new Date(manutForm.data as unknown as string),
      quilometragem: manutForm.quilometragem,
      criterio: manutForm.criterio,
      descricao: manutForm.descricao!,
      fornecedor: manutForm.fornecedor,
      custo: manutForm.custo,
      pecasSubstituidas: manutForm.pecasSubstituidas,
      responsavel: manutForm.responsavel!,
      proximaManutencaoPrevista:
        manutForm.proximaData || manutForm.proximaQuilometragem || manutForm.proximaCriterio
          ? {
              data: manutForm.proximaData ? new Date(manutForm.proximaData) : undefined,
              quilometragem: manutForm.proximaQuilometragem ? Number(manutForm.proximaQuilometragem) : undefined,
              criterio: manutForm.proximaCriterio || undefined,
            }
          : undefined,
      criadoEm: new Date(),
    };
    setManutencoes((prev) => [novaManut, ...prev]);
    toast.success('Manutenção registada com sucesso!');
    setManutDialogAberto(false);
  };

  // ─── Handlers: Checklist ─────────────────────────────────────────────────

  const handleAbrirNovaInspeccao = () => {
    setChecklistForm({
      responsavel: '',
      dataInspeccao: new Date().toISOString().split('T')[0],
      observacoes: '',
      itens: defaultChecklistItems.map((item) => ({
        nome: item.nome,
        categoria: item.categoria,
        estado: 'ok' as ItemChecklist['estado'],
        observacoes: '',
      })),
    });
    setChecklistDialogAberto(true);
  };

  const handleSalvarChecklist = () => {
    if (!checklistForm.responsavel || !checklistForm.dataInspeccao) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const novoChecklist: ChecklistViatura = {
      id: `chk-${Date.now()}`,
      viaturaId: viatura.id,
      tipoViatura: viatura.tipoViatura,
      responsavel: checklistForm.responsavel,
      dataInspeccao: new Date(checklistForm.dataInspeccao),
      observacoes: checklistForm.observacoes || undefined,
      itens: checklistForm.itens.map((item, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        nome: item.nome,
        categoria: item.categoria,
        estado: item.estado,
        observacoes: item.observacoes || undefined,
      })),
    };
    setViaturas((prev) =>
      prev.map((v) =>
        v.id === viatura.id
          ? { ...v, checklists: [novoChecklist, ...v.checklists] }
          : v,
      ),
    );
    toast.success('Inspecção registada com sucesso!');
    setChecklistDialogAberto(false);
  };

  const toggleChecklist = (checklistId: string) => {
    setExpandedChecklists((prev) => {
      const next = new Set(prev);
      if (next.has(checklistId)) {
        next.delete(checklistId);
      } else {
        next.add(checklistId);
      }
      return next;
    });
  };

  // ─── Timeline events ─────────────────────────────────────────────────────

  type TimelineEvent = {
    id: string;
    data: Date;
    tipo: 'documento' | 'manutencao' | 'checklist';
    descricao: string;
    utilizador: string;
  };

  const timelineEvents: TimelineEvent[] = [
    ...viatura.documentos.map((doc) => ({
      id: `tl-doc-${doc.id}`,
      data: new Date(doc.dataEmissao),
      tipo: 'documento' as const,
      descricao: `Documento adicionado: ${tipoDocumentoLabel[doc.tipo]} (nº ${doc.numero})`,
      utilizador: 'admin',
    })),
    ...manutencoesViatura.map((m) => ({
      id: `tl-man-${m.id}`,
      data: new Date(m.data),
      tipo: 'manutencao' as const,
      descricao: `Manutenção ${m.tipo === 'preventiva' ? 'preventiva' : 'correctiva'}: ${m.descricao}`,
      utilizador: m.responsavel,
    })),
    ...checklistsViatura.map((c) => ({
      id: `tl-chk-${c.id}`,
      data: new Date(c.dataInspeccao),
      tipo: 'checklist' as const,
      descricao: `Inspecção realizada por ${c.responsavel}`,
      utilizador: c.responsavel,
    })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back button */}
      <Button variant="ghost" onClick={() => router.back()} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar às Viaturas
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-lg font-bold">{viatura.matricula}</span>
            <Badge variant={estadoConfig.variant} className={estadoConfig.className}>
              {estadoConfig.label}
            </Badge>
            <Badge variant="outline">{tipoViaturaLabel[viatura.tipoViatura]}</Badge>
            {temDocumentosExpirados && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Documentos expirados</span>
              </div>
            )}
            {!temDocumentosExpirados && temDocumentosProximosExpirar && (
              <div className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">A expirar em breve</span>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-tight">
            {viatura.marca} {viatura.modelo}
          </h1>
          {viatura.motoristaResponsavelNome && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Motorista: {viatura.motoristaResponsavelNome}
            </p>
          )}
        </div>
        <Button variant="outline" className="gap-2 flex-shrink-0" onClick={handleAbrirEditar}>
          <Edit className="h-4 w-4" />
          Editar
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dados">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dados" className="gap-2">
            <Truck className="h-4 w-4" />
            Dados Base
          </TabsTrigger>
          <TabsTrigger value="documentacao" className="gap-2">
            <FileText className="h-4 w-4" />
            Documentação
            <Badge variant="secondary" className="ml-1 text-xs">{viatura.documentos.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="manutencao" className="gap-2">
            <Wrench className="h-4 w-4" />
            Manutenção
            <Badge variant="secondary" className="ml-1 text-xs">{manutencoesViatura.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="checklist" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Checklist
            <Badge variant="secondary" className="ml-1 text-xs">{checklistsViatura.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <Clock className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Dados Base ─────────────────────────────────────────────── */}
        <TabsContent value="dados" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Identificação</CardTitle>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleAbrirEditar}>
                  <Edit className="h-3.5 w-3.5" />
                  Editar
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem icon={Truck} label="Matrícula" value={<span className="font-mono">{viatura.matricula}</span>} />
                <DetalheItem icon={Package} label="Marca" value={viatura.marca} />
                <DetalheItem icon={Package} label="Modelo" value={viatura.modelo} />
                <DetalheItem icon={Truck} label="Tipo de Viatura" value={<Badge variant="outline">{tipoViaturaLabel[viatura.tipoViatura]}</Badge>} />
                <DetalheItem
                  icon={Package}
                  label="Capacidade"
                  value={`${viatura.capacidade} ${viatura.unidadeCapacidade}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Operação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem icon={MapPin} label="Local de Actividade" value={viatura.localActividade} />
                <DetalheItem
                  icon={Calendar}
                  label="Data de Início de Actividade"
                  value={formatarData(viatura.dataInicioActividade)}
                />
                <DetalheItem
                  icon={CheckCircle}
                  label="Estado"
                  value={
                    <Badge variant={estadoConfig.variant} className={estadoConfig.className}>
                      {estadoConfig.label}
                    </Badge>
                  }
                />
                <DetalheItem
                  icon={User}
                  label="Motorista Responsável"
                  value={
                    viatura.motoristaResponsavelNome ? (
                      viatura.motoristaResponsavelNome
                    ) : (
                      <span className="text-muted-foreground">Não atribuído</span>
                    )
                  }
                />
              </CardContent>
            </Card>

            {viatura.observacoes && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viatura.observacoes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Documentação ───────────────────────────────────────────── */}
        <TabsContent value="documentacao" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Documentos</CardTitle>
              <Button size="sm" className="gap-2" onClick={handleAbrirAdicionarDoc}>
                <Plus className="h-4 w-4" />
                Adicionar Documento
              </Button>
            </CardHeader>
            <CardContent>
              {viatura.documentos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum documento registado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium">Tipo</th>
                        <th className="text-left p-3 font-medium">Número</th>
                        <th className="text-left p-3 font-medium">Emissão</th>
                        <th className="text-left p-3 font-medium">Validade</th>
                        <th className="text-left p-3 font-medium">Entidade</th>
                        <th className="text-left p-3 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viatura.documentos.map((doc) => (
                        <tr key={doc.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{tipoDocumentoLabel[doc.tipo]}</td>
                          <td className="p-3 font-mono text-xs">{doc.numero}</td>
                          <td className="p-3">{formatarData(doc.dataEmissao)}</td>
                          <td className="p-3">{formatarData(doc.dataValidade)}</td>
                          <td className="p-3">{doc.entidadeEmissora}</td>
                          <td className="p-3">
                            {doc.estado === 'valido' && (
                              <Badge className="bg-green-600 hover:bg-green-700 text-white">Válido</Badge>
                            )}
                            {doc.estado === 'proximo_expirar' && (
                              <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">A Expirar</Badge>
                            )}
                            {doc.estado === 'expirado' && (
                              <Badge variant="destructive">Expirado</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Manutenção ─────────────────────────────────────────────── */}
        <TabsContent value="manutencao" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Histórico de Manutenção</CardTitle>
              <Button size="sm" className="gap-2" onClick={handleAbrirRegistarManut}>
                <Plus className="h-4 w-4" />
                Registar Manutenção
              </Button>
            </CardHeader>
            <CardContent>
              {manutencoesViatura.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma manutenção registada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {manutencoesViatura.map((m) => (
                    <div key={m.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{formatarData(m.data)}</span>
                          {m.tipo === 'preventiva' ? (
                            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Preventiva</Badge>
                          ) : (
                            <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs">Correctiva</Badge>
                          )}
                        </div>
                        {m.custo !== undefined && (
                          <span className="text-sm text-muted-foreground">
                            Custo: <span className="font-medium text-foreground">{m.custo.toLocaleString('pt-PT')} MZN</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{m.descricao}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {m.responsavel}
                        </span>
                        {m.fornecedor && <span>Fornecedor: {m.fornecedor}</span>}
                        {m.quilometragem && <span>Km: {m.quilometragem.toLocaleString('pt-PT')}</span>}
                      </div>
                      {m.pecasSubstituidas && (
                        <p className="text-xs text-muted-foreground">Peças: {m.pecasSubstituidas}</p>
                      )}
                      {m.proximaManutencaoPrevista && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs">
                          <span className="font-medium">Próxima manutenção prevista: </span>
                          {m.proximaManutencaoPrevista.data && formatarData(m.proximaManutencaoPrevista.data)}
                          {m.proximaManutencaoPrevista.quilometragem && ` / ${m.proximaManutencaoPrevista.quilometragem.toLocaleString('pt-PT')} km`}
                          {m.proximaManutencaoPrevista.criterio && ` (${m.proximaManutencaoPrevista.criterio})`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Checklist ──────────────────────────────────────────────── */}
        <TabsContent value="checklist" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Inspecções / Checklist</CardTitle>
              <Button size="sm" className="gap-2" onClick={handleAbrirNovaInspeccao}>
                <Plus className="h-4 w-4" />
                Nova Inspecção
              </Button>
            </CardHeader>
            <CardContent>
              {checklistsViatura.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardCheck className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma inspecção registada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {checklistsViatura.map((chk) => {
                    const isExpanded = expandedChecklists.has(chk.id);
                    const itensOk = chk.itens.filter((i) => i.estado === 'ok').length;
                    const itensProblema = chk.itens.filter((i) => i.estado !== 'ok').length;
                    return (
                      <div key={chk.id} className="border rounded-lg overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 text-left"
                          onClick={() => toggleChecklist(chk.id)}
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-medium text-sm">{formatarData(chk.dataInspeccao)}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {chk.responsavel}
                            </span>
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {itensOk} ok
                            </span>
                            {itensProblema > 0 && (
                              <span className="text-xs text-red-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {itensProblema} problema{itensProblema > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="border-t px-4 pb-4 pt-3 space-y-2">
                            {chk.itens.map((item) => (
                              <div key={item.id} className="flex items-start gap-2 text-sm">
                                {item.estado === 'ok' ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                ) : item.estado === 'avaria' ? (
                                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                )}
                                <div>
                                  <span className="font-medium">{item.nome}</span>
                                  {item.estado !== 'ok' && (
                                    <Badge
                                      variant={item.estado === 'avaria' ? 'destructive' : 'outline'}
                                      className="ml-2 text-xs"
                                    >
                                      {item.estado === 'avaria' ? 'Avaria' : 'Falta'}
                                    </Badge>
                                  )}
                                  {item.observacoes && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{item.observacoes}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                            {chk.observacoes && (
                              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                                Obs: {chk.observacoes}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Histórico ──────────────────────────────────────────────── */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              {timelineEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Sem eventos registados</p>
                </div>
              ) : (
                <ol className="relative border-l border-border ml-3 space-y-0">
                  {timelineEvents.map((evento, index) => (
                    <li key={evento.id} className="mb-6 ml-6">
                      <span
                        className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background ${
                          index === 0 ? 'bg-primary' : 'bg-muted-foreground/40'
                        }`}
                      />
                      <time className="mb-1 block text-xs text-muted-foreground">
                        {new Date(evento.data).toLocaleDateString('pt-PT', {
                          dateStyle: 'long',
                        })}
                      </time>
                      <div className="flex items-center gap-2 mb-1">
                        {evento.tipo === 'documento' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <FileText className="h-3 w-3" />
                            Documento
                          </Badge>
                        )}
                        {evento.tipo === 'manutencao' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Wrench className="h-3 w-3" />
                            Manutenção
                          </Badge>
                        )}
                        {evento.tipo === 'checklist' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <ClipboardCheck className="h-3 w-3" />
                            Inspecção
                          </Badge>
                        )}
                      </div>
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

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={editDialogAberto} onOpenChange={setEditDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Viatura</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-matricula">Matrícula *</Label>
                <Input
                  id="edit-matricula"
                  value={editForm.matricula ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, matricula: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tipo">Tipo de Viatura *</Label>
                <Select
                  value={editForm.tipoViatura}
                  onValueChange={(v) => setEditForm({ ...editForm, tipoViatura: v as Viatura['tipoViatura'] })}
                >
                  <SelectTrigger id="edit-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ligeiro_passageiros">Ligeiro Passageiros</SelectItem>
                    <SelectItem value="ligeiro_mercadorias">Ligeiro Mercadorias</SelectItem>
                    <SelectItem value="pesado_mercadorias">Pesado Mercadorias</SelectItem>
                    <SelectItem value="pesado_passageiros">Pesado Passageiros</SelectItem>
                    <SelectItem value="motociclo">Motociclo</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-marca">Marca *</Label>
                <Input
                  id="edit-marca"
                  value={editForm.marca ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, marca: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-modelo">Modelo *</Label>
                <Input
                  id="edit-modelo"
                  value={editForm.modelo ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, modelo: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-capacidade">Capacidade *</Label>
                <Input
                  id="edit-capacidade"
                  type="number"
                  value={editForm.capacidade ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, capacidade: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unidade">Unidade</Label>
                <Select
                  value={editForm.unidadeCapacidade}
                  onValueChange={(v) => setEditForm({ ...editForm, unidadeCapacidade: v as Viatura['unidadeCapacidade'] })}
                >
                  <SelectTrigger id="edit-unidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="ton">ton</SelectItem>
                    <SelectItem value="m3">m³</SelectItem>
                    <SelectItem value="passageiros">passageiros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-estado">Estado *</Label>
                <Select
                  value={editForm.estado}
                  onValueChange={(v) => setEditForm({ ...editForm, estado: v as Viatura['estado'] })}
                >
                  <SelectTrigger id="edit-estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="em_actividade">Em Actividade</SelectItem>
                    <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                    <SelectItem value="inactiva">Inactiva</SelectItem>
                    <SelectItem value="abatida">Abatida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-local">Local de Actividade *</Label>
              <Input
                id="edit-local"
                value={editForm.localActividade ?? ''}
                onChange={(e) => setEditForm({ ...editForm, localActividade: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-data">Data de Início de Actividade *</Label>
              <Input
                id="edit-data"
                type="date"
                value={
                  editForm.dataInicioActividade
                    ? new Date(editForm.dataInicioActividade).toISOString().split('T')[0]
                    : ''
                }
                onChange={(e) =>
                  setEditForm({ ...editForm, dataInicioActividade: e.target.value ? new Date(e.target.value) : undefined })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-obs">Observações</Label>
              <Textarea
                id="edit-obs"
                value={editForm.observacoes ?? ''}
                onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvarEdicao}>Actualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Document Dialog ─────────────────────────────────────────────── */}
      <Dialog open={docDialogAberto} onOpenChange={setDocDialogAberto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Documento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-tipo">Tipo *</Label>
              <Select
                value={docForm.tipo}
                onValueChange={(v) => setDocForm({ ...docForm, tipo: v as DocumentoViatura['tipo'] })}
              >
                <SelectTrigger id="doc-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="livrete">Livrete</SelectItem>
                  <SelectItem value="inspecao">Inspecção</SelectItem>
                  <SelectItem value="seguro">Seguro</SelectItem>
                  <SelectItem value="licenca">Licença</SelectItem>
                  <SelectItem value="manifesto">Manifesto</SelectItem>
                  <SelectItem value="taxa_radio">Taxa de Rádio</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-numero">Número *</Label>
              <Input
                id="doc-numero"
                value={docForm.numero ?? ''}
                onChange={(e) => setDocForm({ ...docForm, numero: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-emissao">Data de Emissão *</Label>
                <Input
                  id="doc-emissao"
                  type="date"
                  value={docForm.dataEmissao ? new Date(docForm.dataEmissao as unknown as string).toISOString().split('T')[0] : ''}
                  onChange={(e) => setDocForm({ ...docForm, dataEmissao: e.target.value as unknown as Date })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-validade">Data de Validade *</Label>
                <Input
                  id="doc-validade"
                  type="date"
                  value={docForm.dataValidade ? new Date(docForm.dataValidade as unknown as string).toISOString().split('T')[0] : ''}
                  onChange={(e) => setDocForm({ ...docForm, dataValidade: e.target.value as unknown as Date })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-entidade">Entidade Emissora *</Label>
              <Input
                id="doc-entidade"
                value={docForm.entidadeEmissora ?? ''}
                onChange={(e) => setDocForm({ ...docForm, entidadeEmissora: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-prazo">Prazo de Alerta (dias)</Label>
              <Input
                id="doc-prazo"
                type="number"
                value={docForm.prazoAlertaDias ?? 30}
                onChange={(e) => setDocForm({ ...docForm, prazoAlertaDias: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-obs">Observações</Label>
              <Textarea
                id="doc-obs"
                value={docForm.observacoes ?? ''}
                onChange={(e) => setDocForm({ ...docForm, observacoes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDialogAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvarDoc}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Maintenance Dialog ──────────────────────────────────────────── */}
      <Dialog open={manutDialogAberto} onOpenChange={setManutDialogAberto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registar Manutenção</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="man-tipo">Tipo *</Label>
                <Select
                  value={manutForm.tipo}
                  onValueChange={(v) => setManutForm({ ...manutForm, tipo: v as ManutencaoViatura['tipo'] })}
                >
                  <SelectTrigger id="man-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventiva">Preventiva</SelectItem>
                    <SelectItem value="correctiva">Correctiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="man-data">Data *</Label>
                <Input
                  id="man-data"
                  type="date"
                  value={manutForm.data ? new Date(manutForm.data as unknown as string).toISOString().split('T')[0] : ''}
                  onChange={(e) => setManutForm({ ...manutForm, data: e.target.value as unknown as Date })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="man-descricao">Descrição *</Label>
              <Textarea
                id="man-descricao"
                value={manutForm.descricao ?? ''}
                onChange={(e) => setManutForm({ ...manutForm, descricao: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="man-responsavel">Responsável *</Label>
              <Input
                id="man-responsavel"
                value={manutForm.responsavel ?? ''}
                onChange={(e) => setManutForm({ ...manutForm, responsavel: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="man-km">Quilometragem</Label>
                <Input
                  id="man-km"
                  type="number"
                  value={manutForm.quilometragem ?? ''}
                  onChange={(e) => setManutForm({ ...manutForm, quilometragem: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="man-criterio">Critério</Label>
                <Input
                  id="man-criterio"
                  value={manutForm.criterio ?? ''}
                  onChange={(e) => setManutForm({ ...manutForm, criterio: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="man-fornecedor">Fornecedor</Label>
                <Input
                  id="man-fornecedor"
                  value={manutForm.fornecedor ?? ''}
                  onChange={(e) => setManutForm({ ...manutForm, fornecedor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="man-custo">Custo (MZN)</Label>
                <Input
                  id="man-custo"
                  type="number"
                  value={manutForm.custo ?? ''}
                  onChange={(e) => setManutForm({ ...manutForm, custo: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="man-pecas">Peças Substituídas</Label>
              <Textarea
                id="man-pecas"
                value={manutForm.pecasSubstituidas ?? ''}
                onChange={(e) => setManutForm({ ...manutForm, pecasSubstituidas: e.target.value })}
                rows={2}
              />
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium">Próxima Manutenção Prevista</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="man-prox-data">Data</Label>
                  <Input
                    id="man-prox-data"
                    type="date"
                    value={manutForm.proximaData ?? ''}
                    onChange={(e) => setManutForm({ ...manutForm, proximaData: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="man-prox-km">Quilometragem</Label>
                  <Input
                    id="man-prox-km"
                    type="number"
                    value={manutForm.proximaQuilometragem ?? ''}
                    onChange={(e) => setManutForm({ ...manutForm, proximaQuilometragem: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="man-prox-criterio">Critério</Label>
                <Input
                  id="man-prox-criterio"
                  value={manutForm.proximaCriterio ?? ''}
                  onChange={(e) => setManutForm({ ...manutForm, proximaCriterio: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManutDialogAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvarManut}>Registar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Checklist Dialog ────────────────────────────────────────────── */}
      <Dialog open={checklistDialogAberto} onOpenChange={setChecklistDialogAberto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Inspecção</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chk-responsavel">Responsável *</Label>
                <Input
                  id="chk-responsavel"
                  value={checklistForm.responsavel}
                  onChange={(e) => setChecklistForm({ ...checklistForm, responsavel: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chk-data">Data *</Label>
                <Input
                  id="chk-data"
                  type="date"
                  value={checklistForm.dataInspeccao}
                  onChange={(e) => setChecklistForm({ ...checklistForm, dataInspeccao: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Itens de Inspecção</p>
              {checklistForm.itens.map((item, idx) => (
                <div key={item.nome} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.nome}</span>
                    <Select
                      value={item.estado}
                      onValueChange={(v) => {
                        const novosItens = [...checklistForm.itens];
                        novosItens[idx] = { ...novosItens[idx], estado: v as ItemChecklist['estado'] };
                        setChecklistForm({ ...checklistForm, itens: novosItens });
                      }}
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="avaria">Avaria</SelectItem>
                        <SelectItem value="falta">Falta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {item.estado !== 'ok' && (
                    <Input
                      placeholder="Observações..."
                      className="h-8 text-xs"
                      value={item.observacoes}
                      onChange={(e) => {
                        const novosItens = [...checklistForm.itens];
                        novosItens[idx] = { ...novosItens[idx], observacoes: e.target.value };
                        setChecklistForm({ ...checklistForm, itens: novosItens });
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="chk-obs">Observações Gerais</Label>
              <Textarea
                id="chk-obs"
                value={checklistForm.observacoes}
                onChange={(e) => setChecklistForm({ ...checklistForm, observacoes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialogAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvarChecklist}>Registar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
