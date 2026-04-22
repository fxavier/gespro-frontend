'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  User,
  FileText,
  Calendar,
  Clock,
  Edit,
  Plus,
  Phone,
  MapPin,
  CheckCircle,
  Ban,
  History,
  XCircle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { calcularEstadoDocumento } from '@/services/transporte-alocacao.service';
import type { Motorista, DocumentoMotorista, DisponibilidadeMotorista } from '@/types/transporte';

// ─── Zod schema — Indisponibilidade Manual ────────────────────────────────────

const indisponibilidadeSchema = z.object({
  motivo: z.enum(['ferias', 'ausencia', 'suspensao', 'manual'], {
    required_error: 'Seleccione um motivo',
  }),
  dataInicio: z.string().min(1, 'Data de início obrigatória'),
  dataFim: z.string().optional(),
  observacoes: z.string().optional(),
}).refine(
  (data) => {
    if (data.dataFim && data.dataFim.length > 0) {
      return new Date(data.dataFim) >= new Date(data.dataInicio);
    }
    return true;
  },
  {
    message: 'A data de fim deve ser igual ou posterior à data de início',
    path: ['dataFim'],
  },
);

type IndisponibilidadeFormValues = z.infer<typeof indisponibilidadeSchema>;

// ─── Local types ─────────────────────────────────────────────────────────────

interface EventoMotorista {
  id: string;
  data: Date;
  tipo: 'documento' | 'disponibilidade' | 'estado' | 'registo';
  descricao: string;
  utilizador: string;
}

// ─── Label helpers ────────────────────────────────────────────────────────────

const tipoDocumentoLabel: Record<DocumentoMotorista['tipo'], string> = {
  carta_conducao: 'Carta de Condução',
  bi: 'Bilhete de Identidade',
  outro: 'Outro',
};

const estadoOperacionalConfig: Record<
  Motorista['estadoOperacional'],
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; className?: string }
> = {
  activo: { label: 'Activo', variant: 'default', className: 'bg-green-600 hover:bg-green-700 text-white' },
  inactivo: { label: 'Inactivo', variant: 'secondary' },
  suspenso: { label: 'Suspenso', variant: 'destructive' },
};

const motivoLabel: Record<NonNullable<DisponibilidadeMotorista['motivo']>, string> = {
  ferias: 'Férias',
  ausencia: 'Ausência',
  suspensao: 'Suspensão',
  manual: 'Indisponibilidade Manual',
  conflito_agenda: 'Conflito de Agenda',
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

const motoristasMock: Motorista[] = [
  {
    id: '1',
    nomeCompleto: 'Carlos Santos',
    contacto: '+258 84 123 4567',
    morada: 'Av. Julius Nyerere, 1234, Maputo',
    numeroBI: '123456789A',
    numeroCarta: 'CNH-12345',
    categoriaCarta: ['B', 'C', 'D'],
    dataEmissaoCarta: new Date('2017-06-20'),
    validadeCarta: new Date('2027-06-20'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    documentos: [
      {
        id: 'doc-1-1',
        motoristaId: '1',
        tipo: 'carta_conducao',
        numero: 'CNH-12345',
        dataEmissao: new Date('2017-06-20'),
        dataValidade: new Date('2027-06-20'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
      },
      {
        id: 'doc-1-2',
        motoristaId: '1',
        tipo: 'bi',
        numero: '123456789A',
        dataEmissao: new Date('2020-01-10'),
        dataValidade: new Date('2030-01-10'),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'valido',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: true,
      fonte: 'sistema',
    },
    criadoEm: new Date('2020-01-15'),
    actualizadoEm: new Date('2024-01-15'),
  },
  {
    id: '2',
    nomeCompleto: 'Ana Pereira',
    contacto: '+258 82 987 6543',
    morada: 'Rua da Resistência, 567, Maputo',
    numeroBI: '987654321B',
    numeroCarta: 'CNH-54321',
    categoriaCarta: ['B', 'C'],
    dataEmissaoCarta: new Date('2018-03-10'),
    validadeCarta: new Date('2028-03-10'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    documentos: [
      {
        id: 'doc-2-1',
        motoristaId: '2',
        tipo: 'carta_conducao',
        numero: 'CNH-54321',
        dataEmissao: new Date('2018-03-10'),
        dataValidade: new Date('2028-03-10'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
      },
      {
        id: 'doc-2-2',
        motoristaId: '2',
        tipo: 'bi',
        numero: '987654321B',
        dataEmissao: new Date('2019-05-15'),
        dataValidade: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'proximo_expirar',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: true,
      fonte: 'sistema',
    },
    criadoEm: new Date('2021-05-20'),
    actualizadoEm: new Date('2024-01-10'),
  },
  {
    id: '3',
    nomeCompleto: 'João Machado',
    contacto: '+258 86 555 7890',
    morada: 'Av. 25 de Setembro, 890, Maputo',
    numeroBI: '111222333C',
    numeroCarta: 'CNH-67890',
    categoriaCarta: ['B'],
    dataEmissaoCarta: new Date('2014-03-15'),
    validadeCarta: new Date('2024-03-15'),
    localActividade: 'Beira',
    estadoOperacional: 'activo',
    observacoes: 'Carta de condução expirada — renovação pendente',
    documentos: [
      {
        id: 'doc-3-1',
        motoristaId: '3',
        tipo: 'carta_conducao',
        numero: 'CNH-67890',
        dataEmissao: new Date('2014-03-15'),
        dataValidade: new Date('2024-03-15'),
        entidadeEmissora: 'INATTER',
        estado: 'expirado',
      },
      {
        id: 'doc-3-2',
        motoristaId: '3',
        tipo: 'bi',
        numero: '111222333C',
        dataEmissao: new Date('2021-07-20'),
        dataValidade: new Date('2031-07-20'),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'valido',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: true,
      fonte: 'sistema',
    },
    criadoEm: new Date('2021-08-10'),
    actualizadoEm: new Date('2024-01-05'),
  },
  {
    id: '4',
    nomeCompleto: 'Maria Costa',
    contacto: '+258 84 222 3333',
    morada: 'Rua dos Continuadores, 123, Maputo',
    numeroBI: '444555666D',
    numeroCarta: 'CNH-11111',
    categoriaCarta: ['B', 'C', 'D', 'E'],
    dataEmissaoCarta: new Date('2019-01-20'),
    validadeCarta: new Date('2029-01-20'),
    localActividade: 'Maputo',
    estadoOperacional: 'activo',
    observacoes: 'Em férias — retorno previsto para 15/02/2025',
    documentos: [
      {
        id: 'doc-4-1',
        motoristaId: '4',
        tipo: 'carta_conducao',
        numero: 'CNH-11111',
        dataEmissao: new Date('2019-01-20'),
        dataValidade: new Date('2029-01-20'),
        entidadeEmissora: 'INATTER',
        estado: 'valido',
      },
      {
        id: 'doc-4-2',
        motoristaId: '4',
        tipo: 'bi',
        numero: '444555666D',
        dataEmissao: new Date('2022-03-05'),
        dataValidade: new Date('2032-03-05'),
        entidadeEmissora: 'Arquivo de Identificação Civil',
        estado: 'valido',
      },
    ] as DocumentoMotorista[],
    disponibilidade: {
      disponivel: false,
      motivo: 'ferias',
      dataInicio: new Date('2025-01-20'),
      dataFim: new Date('2025-02-15'),
      fonte: 'rh_api',
    },
    criadoEm: new Date('2022-03-01'),
    actualizadoEm: new Date('2025-01-20'),
  },
];

// ─── Historico mock ───────────────────────────────────────────────────────────

const historicoMock: Record<string, EventoMotorista[]> = {
  '1': [
    {
      id: 'ev-1-1',
      data: new Date('2020-01-15'),
      tipo: 'registo',
      descricao: 'Motorista registado no sistema.',
      utilizador: 'admin',
    },
    {
      id: 'ev-1-2',
      data: new Date('2022-06-10'),
      tipo: 'documento',
      descricao: 'Documento adicionado: Carta de Condução (nº CNH-12345).',
      utilizador: 'admin',
    },
    {
      id: 'ev-1-3',
      data: new Date('2024-01-15'),
      tipo: 'estado',
      descricao: 'Estado operacional actualizado para Activo.',
      utilizador: 'supervisor',
    },
  ],
  '2': [
    {
      id: 'ev-2-1',
      data: new Date('2021-05-20'),
      tipo: 'registo',
      descricao: 'Motorista registado no sistema.',
      utilizador: 'admin',
    },
    {
      id: 'ev-2-2',
      data: new Date('2023-03-01'),
      tipo: 'documento',
      descricao: 'Documento adicionado: Bilhete de Identidade (nº 987654321B).',
      utilizador: 'admin',
    },
    {
      id: 'ev-2-3',
      data: new Date('2024-01-10'),
      tipo: 'disponibilidade',
      descricao: 'Disponibilidade actualizada: Disponível.',
      utilizador: 'sistema',
    },
  ],
  '3': [
    {
      id: 'ev-3-1',
      data: new Date('2021-08-10'),
      tipo: 'registo',
      descricao: 'Motorista registado no sistema.',
      utilizador: 'admin',
    },
    {
      id: 'ev-3-2',
      data: new Date('2024-03-16'),
      tipo: 'documento',
      descricao: 'Alerta gerado: Carta de Condução (nº CNH-67890) expirou em 15/03/2024.',
      utilizador: 'sistema',
    },
    {
      id: 'ev-3-3',
      data: new Date('2024-01-05'),
      tipo: 'estado',
      descricao: 'Observação adicionada: Carta de condução expirada — renovação pendente.',
      utilizador: 'supervisor',
    },
  ],
  '4': [
    {
      id: 'ev-4-1',
      data: new Date('2022-03-01'),
      tipo: 'registo',
      descricao: 'Motorista registado no sistema.',
      utilizador: 'admin',
    },
    {
      id: 'ev-4-2',
      data: new Date('2025-01-20'),
      tipo: 'disponibilidade',
      descricao: 'Motorista marcado como indisponível: Férias (20/01/2025 – 15/02/2025). Fonte: RH API.',
      utilizador: 'rh_api',
    },
    {
      id: 'ev-4-3',
      data: new Date('2024-12-15'),
      tipo: 'documento',
      descricao: 'Documento adicionado: Carta de Condução (nº CNH-11111).',
      utilizador: 'admin',
    },
  ],
};

// ─── TabDisponibilidade component ────────────────────────────────────────────

const fonteLabel: Record<DisponibilidadeMotorista['fonte'], string> = {
  sistema: 'Sistema',
  rh_api: 'Integração RH',
  manual: 'Registo Manual',
};

const motivoBadgeConfig: Record<
  NonNullable<DisponibilidadeMotorista['motivo']>,
  { className: string }
> = {
  ferias: { className: 'bg-blue-100 text-blue-800 border-blue-200' },
  ausencia: { className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  suspensao: { className: 'bg-red-100 text-red-800 border-red-200' },
  manual: { className: 'bg-orange-100 text-orange-800 border-orange-200' },
  conflito_agenda: { className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

interface TabDisponibilidadeProps {
  motorista: Motorista;
  onMarcarDisponivel: () => void;
  onRegistarIndisponibilidade: (values: IndisponibilidadeFormValues) => void;
}

function TabDisponibilidade({
  motorista,
  onMarcarDisponivel,
  onRegistarIndisponibilidade,
}: TabDisponibilidadeProps) {
  const { disponibilidade } = motorista;
  const isRhApi = disponibilidade.fonte === 'rh_api';

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<IndisponibilidadeFormValues>({
    resolver: zodResolver(indisponibilidadeSchema),
    defaultValues: {
      motivo: 'manual',
      dataInicio: new Date().toISOString().split('T')[0],
      dataFim: '',
      observacoes: '',
    },
  });

  const onSubmit = (values: IndisponibilidadeFormValues) => {
    onRegistarIndisponibilidade(values);
    reset();
  };

  return (
    <div className="space-y-6">
      {/* ── Estado actual ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado Actual de Disponibilidade</CardTitle>
          <CardDescription>
            Situação actual do motorista para alocação a actividades.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            {disponibilidade.disponivel ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-700">Disponível para alocação</p>
                  <p className="text-xs text-muted-foreground">
                    O motorista pode ser alocado a novas actividades.
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Indisponível para alocação</p>
                  <p className="text-xs text-muted-foreground">
                    O motorista não pode ser alocado a novas actividades.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Motivo + datas (quando indisponível) */}
          {!disponibilidade.disponivel && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              {disponibilidade.motivo && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Motivo</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${motivoBadgeConfig[disponibilidade.motivo].className}`}
                  >
                    {motivoLabel[disponibilidade.motivo]}
                  </Badge>
                </div>
              )}
              {disponibilidade.dataInicio && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Início</span>
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatarData(disponibilidade.dataInicio)}
                  </span>
                </div>
              )}
              {disponibilidade.dataFim && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Fim previsto</span>
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatarData(disponibilidade.dataFim)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Fonte</span>
                <span className="text-sm font-medium flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  {fonteLabel[disponibilidade.fonte]}
                </span>
              </div>
            </div>
          )}

          {/* Fonte (quando disponível) */}
          {disponibilidade.disponivel && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Fonte: {fonteLabel[disponibilidade.fonte]}
            </div>
          )}

          {/* Botão marcar como disponível */}
          {!disponibilidade.disponivel && !isRhApi && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-green-500 text-green-700 hover:bg-green-50"
                onClick={onMarcarDisponivel}
              >
                <CheckCircle className="h-4 w-4" />
                Marcar como Disponível
              </Button>
            </div>
          )}

          {/* Aviso integração RH */}
          {isRhApi && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                A disponibilidade deste motorista é gerida pela integração com o Módulo RH.
                Para alterar, contacte o departamento de Recursos Humanos.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Formulário de indisponibilidade manual ─────────────────────── */}
      {!isRhApi && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registar Período de Indisponibilidade</CardTitle>
            <CardDescription>
              Registe manualmente um período em que o motorista não estará disponível para alocação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Motivo */}
              <div className="space-y-2">
                <Label htmlFor="indisp-motivo">Motivo *</Label>
                <Controller
                  name="motivo"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="indisp-motivo">
                        <SelectValue placeholder="Seleccionar motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ferias">Férias</SelectItem>
                        <SelectItem value="ausencia">Ausência</SelectItem>
                        <SelectItem value="suspensao">Suspensão</SelectItem>
                        <SelectItem value="manual">Indisponibilidade Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.motivo && (
                  <p className="text-xs text-red-600">{errors.motivo.message}</p>
                )}
              </div>

              {/* Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="indisp-inicio">Data de Início *</Label>
                  <Input
                    id="indisp-inicio"
                    type="date"
                    {...register('dataInicio')}
                  />
                  {errors.dataInicio && (
                    <p className="text-xs text-red-600">{errors.dataInicio.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="indisp-fim">
                    Data de Fim{' '}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="indisp-fim"
                    type="date"
                    {...register('dataFim')}
                  />
                  {errors.dataFim && (
                    <p className="text-xs text-red-600">{errors.dataFim.message}</p>
                  )}
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label htmlFor="indisp-obs">
                  Observações{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Textarea
                  id="indisp-obs"
                  placeholder="Informação adicional sobre o período de indisponibilidade..."
                  rows={3}
                  {...register('observacoes')}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" className="gap-2">
                  <Ban className="h-4 w-4" />
                  Registar Indisponibilidade
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MotoristaDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // ─── State ──────────────────────────────────────────────────────────────

  const [motoristas, setMotoristas] = useState<Motorista[]>(motoristasMock);

  // Edit dialog
  const [editDialogAberto, setEditDialogAberto] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Motorista>>({});

  // Document dialog
  const [docDialogAberto, setDocDialogAberto] = useState(false);
  const [docForm, setDocForm] = useState<Partial<DocumentoMotorista>>({
    tipo: 'carta_conducao',
  });

  // Unavailability dialog
  const [indispDialogAberto, setIndispDialogAberto] = useState(false);
  const [indispForm, setIndispForm] = useState<{
    motivo: NonNullable<DisponibilidadeMotorista['motivo']>;
    dataInicio: string;
    dataFim: string;
  }>({
    motivo: 'manual',
    dataInicio: new Date().toISOString().split('T')[0],
    dataFim: '',
  });

  // ─── Lookup ──────────────────────────────────────────────────────────────

  const motorista = motoristas.find((m) => m.id === id);

  // ─── Not-found state ─────────────────────────────────────────────────────

  if (!motorista) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2 mb-8">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">Motorista não encontrado</h2>
          <p className="text-sm text-muted-foreground">
            O registo com o identificador &quot;{id}&quot; não existe.
          </p>
        </div>
      </div>
    );
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const cartaExpirada = new Date(motorista.validadeCarta) < new Date();
  const temDocumentosExpirados = motorista.documentos.some((d) => d.estado === 'expirado');
  const temDocumentosProximosExpirar = motorista.documentos.some((d) => d.estado === 'proximo_expirar');
  const temAlertas = temDocumentosExpirados || temDocumentosProximosExpirar || cartaExpirada;
  const estadoOpConfig = estadoOperacionalConfig[motorista.estadoOperacional];

  // ─── Handlers: Document ──────────────────────────────────────────────────

  const handleSalvarDoc = () => {
    if (
      !docForm.tipo ||
      !docForm.numero ||
      !docForm.dataEmissao ||
      !docForm.dataValidade ||
      !docForm.entidadeEmissora
    ) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const dataValidade = new Date(docForm.dataValidade as unknown as string);
    const estado = calcularEstadoDocumento(dataValidade, 30);
    const novoDoc: DocumentoMotorista = {
      id: `doc-${Date.now()}`,
      motoristaId: motorista.id,
      tipo: docForm.tipo as DocumentoMotorista['tipo'],
      numero: docForm.numero!,
      dataEmissao: new Date(docForm.dataEmissao as unknown as string),
      dataValidade,
      entidadeEmissora: docForm.entidadeEmissora!,
      estado,
      observacoes: docForm.observacoes,
    };
    setMotoristas((prev) =>
      prev.map((m) =>
        m.id === motorista.id
          ? { ...m, documentos: [...m.documentos, novoDoc] }
          : m,
      ),
    );
    toast.success('Documento adicionado com sucesso!');
    setDocDialogAberto(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back button */}
      <Button variant="ghost" onClick={() => router.back()} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar aos Motoristas
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{motorista.nomeCompleto}</h1>
            {/* Estado operacional badge */}
            <Badge variant={estadoOpConfig.variant} className={estadoOpConfig.className}>
              {estadoOpConfig.label}
            </Badge>
            {/* Disponibilidade badge */}
            {motorista.disponibilidade.disponivel ? (
              <Badge variant="outline" className="border-green-500 text-green-700 gap-1">
                <CheckCircle className="h-3 w-3" />
                Disponível
              </Badge>
            ) : (
              <Badge variant="outline" className="border-red-400 text-red-600 gap-1">
                <Ban className="h-3 w-3" />
                {motorista.disponibilidade.motivo
                  ? motivoLabel[motorista.disponibilidade.motivo]
                  : 'Indisponível'}
              </Badge>
            )}
            {/* Alert indicators */}
            {temDocumentosExpirados && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Documentos expirados</span>
              </div>
            )}
            {!temDocumentosExpirados && temDocumentosProximosExpirar && (
              <div className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">Documentos a expirar</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {motorista.contacto}
            </span>
            {motorista.localActividade && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {motorista.localActividade}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Carta válida até {formatarData(motorista.validadeCarta)}
              {cartaExpirada && (
                <span className="text-red-600 font-medium ml-1">(expirada)</span>
              )}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {temAlertas && (
            <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {motorista.documentos.filter((d) => d.estado !== 'valido').length} alerta(s) activo(s)
            </div>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => {
            setEditForm({ ...motorista });
            setEditDialogAberto(true);
          }}>
            <Edit className="h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>

      {/* Tabs placeholder — subtasks 12.3–12.6 will add content */}
      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">
            <User className="h-4 w-4 mr-2" />
            Dados Operacionais
          </TabsTrigger>
          <TabsTrigger value="documentacao">
            <FileText className="h-4 w-4 mr-2" />
            Documentação
          </TabsTrigger>
          <TabsTrigger value="disponibilidade">
            <Clock className="h-4 w-4 mr-2" />
            Disponibilidade
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History className="h-4 w-4 mr-2" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Dados Operacionais ─────────────────────────────────────── */}
        <TabsContent value="dados" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Identificação */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Identificação</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setEditForm({ ...motorista });
                    setEditDialogAberto(true);
                  }}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Editar
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem
                  icon={User}
                  label="Nome Completo"
                  value={motorista.nomeCompleto}
                />
                <DetalheItem
                  icon={Phone}
                  label="Contacto Telefónico"
                  value={motorista.contacto}
                />
                {motorista.morada && (
                  <DetalheItem
                    icon={MapPin}
                    label="Morada"
                    value={motorista.morada}
                  />
                )}
                {motorista.numeroBI && (
                  <DetalheItem
                    icon={FileText}
                    label="Número do BI"
                    value={<span className="font-mono">{motorista.numeroBI}</span>}
                  />
                )}
                {motorista.localActividade && (
                  <DetalheItem
                    icon={MapPin}
                    label="Local de Actividade"
                    value={motorista.localActividade}
                  />
                )}
              </CardContent>
            </Card>

            {/* Carta de Condução */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Carta de Condução</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem
                  icon={FileText}
                  label="Número da Carta"
                  value={<span className="font-mono">{motorista.numeroCarta}</span>}
                />
                <DetalheItem
                  icon={FileText}
                  label="Categorias"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {motorista.categoriaCarta.map((cat) => (
                        <Badge key={cat} variant="outline" className="text-xs">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  }
                />
                <DetalheItem
                  icon={Calendar}
                  label="Data de Emissão"
                  value={formatarData(motorista.dataEmissaoCarta)}
                />
                <DetalheItem
                  icon={Calendar}
                  label="Validade"
                  value={
                    <span className={cartaExpirada ? 'text-red-600 font-semibold' : ''}>
                      {formatarData(motorista.validadeCarta)}
                      {cartaExpirada && ' (expirada)'}
                    </span>
                  }
                />
              </CardContent>
            </Card>

            {/* Estado Operacional */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estado Operacional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetalheItem
                  icon={User}
                  label="Estado"
                  value={
                    <Badge
                      variant={estadoOpConfig.variant}
                      className={estadoOpConfig.className}
                    >
                      {estadoOpConfig.label}
                    </Badge>
                  }
                />
                <DetalheItem
                  icon={Calendar}
                  label="Registado em"
                  value={formatarData(motorista.criadoEm)}
                />
                <DetalheItem
                  icon={Calendar}
                  label="Última actualização"
                  value={formatarData(motorista.actualizadoEm)}
                />
              </CardContent>
            </Card>

            {/* Observações */}
            {motorista.observacoes && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {motorista.observacoes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Documentação ──────────────────────────────────────────── */}
        <TabsContent value="documentacao" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Documentos do Motorista</CardTitle>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => {
                  setDocForm({ tipo: 'carta_conducao' });
                  setDocDialogAberto(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Adicionar Documento
              </Button>
            </CardHeader>
            <CardContent>
              {motorista.documentos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum documento registado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adicione documentos como carta de condução, bilhete de identidade, entre outros.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {motorista.documentos.map((doc) => {
                    const estadoDocConfig = {
                      valido: {
                        label: 'Válido',
                        className: 'bg-green-100 text-green-800 border-green-200',
                        icon: CheckCircle,
                        iconClass: 'text-green-600',
                      },
                      proximo_expirar: {
                        label: 'A expirar',
                        className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                        icon: AlertTriangle,
                        iconClass: 'text-yellow-600',
                      },
                      expirado: {
                        label: 'Expirado',
                        className: 'bg-red-100 text-red-800 border-red-200',
                        icon: AlertCircle,
                        iconClass: 'text-red-600',
                      },
                    }[doc.estado];

                    const EstadoIcon = estadoDocConfig.icon;

                    return (
                      <div
                        key={doc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`mt-0.5 flex-shrink-0 ${estadoDocConfig.iconClass}`}>
                            <EstadoIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">
                                {tipoDocumentoLabel[doc.tipo]}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-xs ${estadoDocConfig.className}`}
                              >
                                {estadoDocConfig.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">
                              Nº {doc.numero}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Emissão: {formatarData(doc.dataEmissao)}
                              </span>
                              <span
                                className={`flex items-center gap-1 ${
                                  doc.estado === 'expirado'
                                    ? 'text-red-600 font-medium'
                                    : doc.estado === 'proximo_expirar'
                                    ? 'text-yellow-600 font-medium'
                                    : ''
                                }`}
                              >
                                <Calendar className="h-3 w-3" />
                                Validade: {formatarData(doc.dataValidade)}
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {doc.entidadeEmissora}
                              </span>
                            </div>
                            {doc.observacoes && (
                              <p className="text-xs text-muted-foreground italic mt-1">
                                {doc.observacoes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disponibilidade" className="mt-4">
          <TabDisponibilidade
            motorista={motorista}
            onMarcarDisponivel={() => {
              setMotoristas((prev) =>
                prev.map((m) =>
                  m.id === motorista.id
                    ? {
                        ...m,
                        disponibilidade: {
                          disponivel: true,
                          fonte: 'manual',
                        },
                        actualizadoEm: new Date(),
                      }
                    : m,
                ),
              );
              toast.success('Motorista marcado como disponível.');
            }}
            onRegistarIndisponibilidade={(values) => {
              setMotoristas((prev) =>
                prev.map((m) =>
                  m.id === motorista.id
                    ? {
                        ...m,
                        disponibilidade: {
                          disponivel: false,
                          motivo: values.motivo,
                          dataInicio: new Date(values.dataInicio),
                          dataFim: values.dataFim ? new Date(values.dataFim) : undefined,
                          fonte: 'manual',
                        },
                        actualizadoEm: new Date(),
                      }
                    : m,
                ),
              );
              toast.success('Período de indisponibilidade registado com sucesso.');
            }}
          />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {(() => {
            const eventos = (historicoMock[motorista.id] ?? [])
              .slice()
              .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Histórico de Eventos</CardTitle>
                </CardHeader>
                <CardContent>
                  {eventos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <History className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Sem eventos registados</p>
                    </div>
                  ) : (
                    <ol className="relative border-l border-border ml-3 space-y-0">
                      {eventos.map((evento, index) => (
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
                            {evento.tipo === 'disponibilidade' && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Clock className="h-3 w-3" />
                                Disponibilidade
                              </Badge>
                            )}
                            {evento.tipo === 'estado' && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <User className="h-3 w-3" />
                                Estado
                              </Badge>
                            )}
                            {evento.tipo === 'registo' && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <History className="h-3 w-3" />
                                Registo
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
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={editDialogAberto} onOpenChange={setEditDialogAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Motorista</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Nome + Contacto */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-nome">Nome Completo *</Label>
                <Input
                  id="edit-nome"
                  value={editForm.nomeCompleto ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, nomeCompleto: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contacto">Contacto Telefónico *</Label>
                <Input
                  id="edit-contacto"
                  value={editForm.contacto ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, contacto: e.target.value })}
                />
              </div>
            </div>

            {/* Morada */}
            <div className="space-y-2">
              <Label htmlFor="edit-morada">Morada</Label>
              <Input
                id="edit-morada"
                value={editForm.morada ?? ''}
                onChange={(e) => setEditForm({ ...editForm, morada: e.target.value })}
              />
            </div>

            {/* BI + Local */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-bi">Número do BI</Label>
                <Input
                  id="edit-bi"
                  value={editForm.numeroBI ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, numeroBI: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-local">Local de Actividade</Label>
                <Input
                  id="edit-local"
                  value={editForm.localActividade ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, localActividade: e.target.value })}
                />
              </div>
            </div>

            {/* Carta: número + categorias */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-carta">Número da Carta *</Label>
                <Input
                  id="edit-carta"
                  value={editForm.numeroCarta ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, numeroCarta: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-categorias">Categorias da Carta *</Label>
                <Input
                  id="edit-categorias"
                  placeholder="ex: B, C, D"
                  value={editForm.categoriaCarta?.join(', ') ?? ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      categoriaCarta: e.target.value
                        .split(',')
                        .map((c) => c.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>

            {/* Carta: emissão + validade */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-emissao-carta">Data de Emissão da Carta *</Label>
                <Input
                  id="edit-emissao-carta"
                  type="date"
                  value={
                    editForm.dataEmissaoCarta
                      ? new Date(editForm.dataEmissaoCarta).toISOString().split('T')[0]
                      : ''
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      dataEmissaoCarta: e.target.value ? new Date(e.target.value) : undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-validade-carta">Validade da Carta *</Label>
                <Input
                  id="edit-validade-carta"
                  type="date"
                  value={
                    editForm.validadeCarta
                      ? new Date(editForm.validadeCarta).toISOString().split('T')[0]
                      : ''
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      validadeCarta: e.target.value ? new Date(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* Estado operacional */}
            <div className="space-y-2">
              <Label htmlFor="edit-estado">Estado Operacional</Label>
              <Select
                value={editForm.estadoOperacional}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, estadoOperacional: v as Motorista['estadoOperacional'] })
                }
              >
                <SelectTrigger id="edit-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
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
            <Button variant="outline" onClick={() => setEditDialogAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (
                  !editForm.nomeCompleto ||
                  !editForm.contacto ||
                  !editForm.numeroCarta ||
                  !editForm.categoriaCarta?.length ||
                  !editForm.dataEmissaoCarta ||
                  !editForm.validadeCarta
                ) {
                  toast.error('Preencha todos os campos obrigatórios');
                  return;
                }
                setMotoristas((prev) =>
                  prev.map((m) =>
                    m.id === motorista.id
                      ? { ...m, ...editForm, actualizadoEm: new Date() }
                      : m,
                  ),
                );
                toast.success('Motorista actualizado com sucesso!');
                setEditDialogAberto(false);
              }}
            >
              Actualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Document Dialog ──────────────────────────────────────────────── */}
      <Dialog open={docDialogAberto} onOpenChange={setDocDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Documento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Tipo */}
            <div className="space-y-2">
              <Label htmlFor="doc-tipo">Tipo de Documento *</Label>
              <Select
                value={docForm.tipo}
                onValueChange={(v) =>
                  setDocForm({ ...docForm, tipo: v as DocumentoMotorista['tipo'] })
                }
              >
                <SelectTrigger id="doc-tipo">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carta_conducao">Carta de Condução</SelectItem>
                  <SelectItem value="bi">Bilhete de Identidade</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Número */}
            <div className="space-y-2">
              <Label htmlFor="doc-numero">Número do Documento *</Label>
              <Input
                id="doc-numero"
                placeholder="ex: CNH-12345"
                value={docForm.numero ?? ''}
                onChange={(e) => setDocForm({ ...docForm, numero: e.target.value })}
              />
            </div>

            {/* Entidade emissora */}
            <div className="space-y-2">
              <Label htmlFor="doc-entidade">Entidade Emissora *</Label>
              <Input
                id="doc-entidade"
                placeholder="ex: INATTER"
                value={docForm.entidadeEmissora ?? ''}
                onChange={(e) => setDocForm({ ...docForm, entidadeEmissora: e.target.value })}
              />
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-emissao">Data de Emissão *</Label>
                <Input
                  id="doc-emissao"
                  type="date"
                  value={
                    docForm.dataEmissao
                      ? new Date(docForm.dataEmissao as unknown as string).toISOString().split('T')[0]
                      : ''
                  }
                  onChange={(e) =>
                    setDocForm({
                      ...docForm,
                      dataEmissao: e.target.value ? (e.target.value as unknown as Date) : undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-validade">Data de Validade *</Label>
                <Input
                  id="doc-validade"
                  type="date"
                  value={
                    docForm.dataValidade
                      ? new Date(docForm.dataValidade as unknown as string).toISOString().split('T')[0]
                      : ''
                  }
                  onChange={(e) =>
                    setDocForm({
                      ...docForm,
                      dataValidade: e.target.value ? (e.target.value as unknown as Date) : undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="doc-obs">Observações</Label>
              <Textarea
                id="doc-obs"
                placeholder="Observações opcionais..."
                value={docForm.observacoes ?? ''}
                onChange={(e) => setDocForm({ ...docForm, observacoes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarDoc}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
