'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Truck,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { calcularEstadoDocumento } from '@/services/transporte-alocacao.service';
import type { Viatura, DocumentoViatura } from '@/types/transporte';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const documentoSchema = z.object({
  viaturaId: z.string().min(1, 'Seleccione uma viatura'),
  tipo: z.enum(['livrete', 'inspecao', 'seguro', 'licenca', 'manifesto', 'taxa_radio', 'outro'], {
    required_error: 'Seleccione o tipo de documento',
  }),
  numero: z.string().min(1, 'Número do documento é obrigatório'),
  dataEmissao: z.string().min(1, 'Data de emissão é obrigatória'),
  dataValidade: z.string().min(1, 'Data de validade é obrigatória'),
  entidadeEmissora: z.string().min(1, 'Entidade emissora é obrigatória'),
  prazoAlertaDias: z.coerce.number().int().min(1).max(365).default(30),
  observacoes: z.string().optional(),
});

type DocumentoFormValues = z.infer<typeof documentoSchema>;

// ─── Mock data ────────────────────────────────────────────────────────────────

type ViaturaResumo = Pick<Viatura, 'id' | 'matricula' | 'marca' | 'modelo' | 'estado' | 'documentos'>;

const viaturasMockInicial: ViaturaResumo[] = [
  {
    id: '1',
    matricula: 'ABC-1234',
    marca: 'Toyota',
    modelo: 'Hilux',
    estado: 'disponivel',
    documentos: [
      { id: 'doc-1-1', viaturaId: '1', tipo: 'livrete', numero: 'LV-2022-001', dataEmissao: new Date('2022-01-15'), dataValidade: new Date('2027-01-15'), entidadeEmissora: 'INATTER', estado: 'valido', prazoAlertaDias: 30 },
      { id: 'doc-1-2', viaturaId: '1', tipo: 'seguro', numero: 'SEG-2024-001', dataEmissao: new Date('2024-01-01'), dataValidade: new Date('2025-01-01'), entidadeEmissora: 'Seguradora Nacional', estado: 'valido', prazoAlertaDias: 30 },
      { id: 'doc-1-3', viaturaId: '1', tipo: 'inspecao', numero: 'INSP-2024-001', dataEmissao: new Date('2024-03-01'), dataValidade: new Date('2025-03-01'), entidadeEmissora: 'INATTER', estado: 'valido', prazoAlertaDias: 30 },
    ],
  },
  {
    id: '2',
    matricula: 'XYZ-5678',
    marca: 'Nissan',
    modelo: 'NP300',
    estado: 'em_actividade',
    documentos: [
      { id: 'doc-2-1', viaturaId: '2', tipo: 'livrete', numero: 'LV-2021-002', dataEmissao: new Date('2021-03-20'), dataValidade: new Date('2026-03-20'), entidadeEmissora: 'INATTER', estado: 'valido', prazoAlertaDias: 30 },
      { id: 'doc-2-2', viaturaId: '2', tipo: 'seguro', numero: 'SEG-2024-002', dataEmissao: new Date('2024-01-15'), dataValidade: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), entidadeEmissora: 'Seguradora Nacional', estado: 'proximo_expirar', prazoAlertaDias: 30 },
      { id: 'doc-2-3', viaturaId: '2', tipo: 'inspecao', numero: 'INSP-2024-002', dataEmissao: new Date('2024-02-01'), dataValidade: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), entidadeEmissora: 'INATTER', estado: 'proximo_expirar', prazoAlertaDias: 30 },
    ],
  },
  {
    id: '3',
    matricula: 'DEF-9012',
    marca: 'Isuzu',
    modelo: 'FTR',
    estado: 'em_manutencao',
    documentos: [
      { id: 'doc-3-1', viaturaId: '3', tipo: 'livrete', numero: 'LV-2020-003', dataEmissao: new Date('2020-05-10'), dataValidade: new Date('2025-05-10'), entidadeEmissora: 'INATTER', estado: 'valido', prazoAlertaDias: 30 },
      { id: 'doc-3-2', viaturaId: '3', tipo: 'seguro', numero: 'SEG-2023-003', dataEmissao: new Date('2023-01-01'), dataValidade: new Date('2024-01-01'), entidadeEmissora: 'Seguradora Nacional', estado: 'expirado', prazoAlertaDias: 30 },
      { id: 'doc-3-3', viaturaId: '3', tipo: 'inspecao', numero: 'INSP-2023-003', dataEmissao: new Date('2023-03-01'), dataValidade: new Date('2024-03-01'), entidadeEmissora: 'INATTER', estado: 'expirado', prazoAlertaDias: 30 },
    ],
  },
  {
    id: '4',
    matricula: 'GHI-3456',
    marca: 'Mercedes-Benz',
    modelo: 'Sprinter',
    estado: 'inactiva',
    documentos: [
      { id: 'doc-4-1', viaturaId: '4', tipo: 'livrete', numero: 'LV-2019-004', dataEmissao: new Date('2019-08-01'), dataValidade: new Date('2024-08-01'), entidadeEmissora: 'INATTER', estado: 'expirado', prazoAlertaDias: 30 },
      { id: 'doc-4-2', viaturaId: '4', tipo: 'licenca', numero: 'LIC-2019-004', dataEmissao: new Date('2019-08-01'), dataValidade: new Date('2024-08-01'), entidadeEmissora: 'Ministério dos Transportes', estado: 'expirado', prazoAlertaDias: 30 },
    ],
  },
];

// ─── Label helpers ────────────────────────────────────────────────────────────

const tipoDocumentoLabel: Record<DocumentoViatura['tipo'], string> = {
  livrete: 'Livrete',
  inspecao: 'Inspecção',
  seguro: 'Seguro',
  licenca: 'Licença',
  manifesto: 'Manifesto',
  taxa_radio: 'Taxa de Rádio',
  outro: 'Outro',
};

const estadoDocConfig: Record<
  DocumentoViatura['estado'],
  { label: string; icon: React.ElementType; className: string; badgeVariant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  valido: { label: 'Válido', icon: CheckCircle, className: 'text-green-600', badgeVariant: 'default' },
  proximo_expirar: { label: 'A Expirar', icon: AlertTriangle, className: 'text-yellow-600', badgeVariant: 'secondary' },
  expirado: { label: 'Expirado', icon: XCircle, className: 'text-red-600', badgeVariant: 'destructive' },
};

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Flat document row type ───────────────────────────────────────────────────

interface DocumentoRow extends DocumentoViatura {
  viaturaMatricula: string;
  viaturaNome: string;
  viaturaId: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentosViaturasPage() {
  const [viaturas, setViaturas] = useState<ViaturaResumo[]>(viaturasMockInicial);
  const [pesquisa, setPesquisa] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [dialogAberto, setDialogAberto] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DocumentoFormValues>({
    resolver: zodResolver(documentoSchema),
    defaultValues: { prazoAlertaDias: 30 },
  });

  const viaturaIdSelecionada = watch('viaturaId');

  // Flatten all documents
  const todosDocumentos = useMemo<DocumentoRow[]>(() => {
    return viaturas.flatMap((v) =>
      v.documentos.map((doc) => ({
        ...doc,
        viaturaId: v.id,
        viaturaMatricula: v.matricula,
        viaturaNome: `${v.marca} ${v.modelo}`,
      }))
    );
  }, [viaturas]);

  const documentosFiltrados = useMemo(() => {
    return todosDocumentos.filter((doc) => {
      const matchPesquisa =
        pesquisa === '' ||
        doc.numero.toLowerCase().includes(pesquisa.toLowerCase()) ||
        doc.viaturaMatricula.toLowerCase().includes(pesquisa.toLowerCase()) ||
        doc.viaturaNome.toLowerCase().includes(pesquisa.toLowerCase()) ||
        doc.entidadeEmissora.toLowerCase().includes(pesquisa.toLowerCase());
      const matchEstado = filtroEstado === 'todos' || doc.estado === filtroEstado;
      const matchTipo = filtroTipo === 'todos' || doc.tipo === filtroTipo;
      return matchPesquisa && matchEstado && matchTipo;
    });
  }, [todosDocumentos, pesquisa, filtroEstado, filtroTipo]);

  const totalValidos = todosDocumentos.filter((d) => d.estado === 'valido').length;
  const totalProximos = todosDocumentos.filter((d) => d.estado === 'proximo_expirar').length;
  const totalExpirados = todosDocumentos.filter((d) => d.estado === 'expirado').length;

  function onSubmit(values: DocumentoFormValues) {
    const dataValidade = new Date(values.dataValidade);
    const estado = calcularEstadoDocumento(dataValidade, values.prazoAlertaDias);

    const novoDoc: DocumentoViatura = {
      id: `doc-${Date.now()}`,
      viaturaId: values.viaturaId,
      tipo: values.tipo,
      numero: values.numero,
      dataEmissao: new Date(values.dataEmissao),
      dataValidade,
      entidadeEmissora: values.entidadeEmissora,
      estado,
      prazoAlertaDias: values.prazoAlertaDias,
      observacoes: values.observacoes || undefined,
    };

    setViaturas((prev) =>
      prev.map((v) =>
        v.id === values.viaturaId
          ? { ...v, documentos: [...v.documentos, novoDoc] }
          : v
      )
    );

    toast.success('Documento registado com sucesso');
    setDialogAberto(false);
    reset();
  }

  function abrirDialog() {
    reset({ prazoAlertaDias: 30 });
    setDialogAberto(true);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/transporte/veiculos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Documentos de Viaturas</h1>
            <p className="text-sm text-muted-foreground">
              Gestão centralizada de toda a documentação da frota
            </p>
          </div>
        </div>
        <Button onClick={abrirDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Documento
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{totalValidos}</p>
                <p className="text-sm text-muted-foreground">Documentos Válidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{totalProximos}</p>
                <p className="text-sm text-muted-foreground">A Expirar em Breve</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{totalExpirados}</p>
                <p className="text-sm text-muted-foreground">Documentos Expirados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por matrícula, número, entidade..."
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                <SelectItem value="valido">Válido</SelectItem>
                <SelectItem value="proximo_expirar">A Expirar</SelectItem>
                <SelectItem value="expirado">Expirado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
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
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {documentosFiltrados.length} documento{documentosFiltrados.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documentosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viatura</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Entidade Emissora</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentosFiltrados.map((doc) => {
                  const estadoCfg = estadoDocConfig[doc.estado];
                  const EstadoIcon = estadoCfg.icon;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{doc.viaturaMatricula}</p>
                            <p className="text-xs text-muted-foreground">{doc.viaturaNome}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{tipoDocumentoLabel[doc.tipo]}</TableCell>
                      <TableCell className="text-sm font-mono">{doc.numero}</TableCell>
                      <TableCell className="text-sm">{doc.entidadeEmissora}</TableCell>
                      <TableCell className="text-sm">
                        <span className={doc.estado !== 'valido' ? 'font-medium ' + (doc.estado === 'expirado' ? 'text-red-600' : 'text-yellow-600') : ''}>
                          {formatarData(doc.dataValidade)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={estadoCfg.badgeVariant}
                          className={`gap-1 text-xs ${doc.estado === 'valido' ? 'bg-green-600 hover:bg-green-700 text-white' : doc.estado === 'proximo_expirar' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : ''}`}
                        >
                          <EstadoIcon className="h-3 w-3" />
                          {estadoCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/transporte/veiculos/${doc.viaturaId}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog — Novo Documento */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registar Documento de Viatura</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            {/* Viatura */}
            <div className="space-y-1.5">
              <Label htmlFor="viaturaId">Viatura <span className="text-destructive">*</span></Label>
              <Select
                value={viaturaIdSelecionada ?? ''}
                onValueChange={(v) => setValue('viaturaId', v, { shouldValidate: true })}
              >
                <SelectTrigger id="viaturaId" className={errors.viaturaId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Seleccione a viatura" />
                </SelectTrigger>
                <SelectContent>
                  {viaturas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.matricula} — {v.marca} {v.modelo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.viaturaId && <p className="text-xs text-destructive">{errors.viaturaId.message}</p>}
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo de Documento <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setValue('tipo', v as DocumentoViatura['tipo'], { shouldValidate: true })}>
                <SelectTrigger id="tipo" className={errors.tipo ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Seleccione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(tipoDocumentoLabel) as [DocumentoViatura['tipo'], string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
            </div>

            {/* Número */}
            <div className="space-y-1.5">
              <Label htmlFor="numero">Número do Documento <span className="text-destructive">*</span></Label>
              <Input id="numero" placeholder="Ex: SEG-2025-001" {...register('numero')} className={errors.numero ? 'border-destructive' : ''} />
              {errors.numero && <p className="text-xs text-destructive">{errors.numero.message}</p>}
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dataEmissao">Data de Emissão <span className="text-destructive">*</span></Label>
                <Input id="dataEmissao" type="date" {...register('dataEmissao')} className={errors.dataEmissao ? 'border-destructive' : ''} />
                {errors.dataEmissao && <p className="text-xs text-destructive">{errors.dataEmissao.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataValidade">Data de Validade <span className="text-destructive">*</span></Label>
                <Input id="dataValidade" type="date" {...register('dataValidade')} className={errors.dataValidade ? 'border-destructive' : ''} />
                {errors.dataValidade && <p className="text-xs text-destructive">{errors.dataValidade.message}</p>}
              </div>
            </div>

            {/* Entidade Emissora */}
            <div className="space-y-1.5">
              <Label htmlFor="entidadeEmissora">Entidade Emissora <span className="text-destructive">*</span></Label>
              <Input id="entidadeEmissora" placeholder="Ex: INATTER" {...register('entidadeEmissora')} className={errors.entidadeEmissora ? 'border-destructive' : ''} />
              {errors.entidadeEmissora && <p className="text-xs text-destructive">{errors.entidadeEmissora.message}</p>}
            </div>

            {/* Prazo de Alerta */}
            <div className="space-y-1.5">
              <Label htmlFor="prazoAlertaDias">Prazo de Alerta (dias)</Label>
              <Input id="prazoAlertaDias" type="number" min={1} max={365} {...register('prazoAlertaDias')} className={errors.prazoAlertaDias ? 'border-destructive' : ''} />
              <p className="text-xs text-muted-foreground">Número de dias antes da validade para gerar alerta. Padrão: 30 dias.</p>
              {errors.prazoAlertaDias && <p className="text-xs text-destructive">{errors.prazoAlertaDias.message}</p>}
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" placeholder="Observações opcionais..." rows={2} {...register('observacoes')} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Registar Documento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
