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
  User,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { calcularEstadoDocumento } from '@/services/transporte-alocacao.service';
import type { Motorista, DocumentoMotorista } from '@/types/transporte';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const documentoSchema = z.object({
  motoristaId: z.string().min(1, 'Seleccione um motorista'),
  tipo: z.enum(['carta_conducao', 'bi', 'outro'], {
    required_error: 'Seleccione o tipo de documento',
  }),
  numero: z.string().min(1, 'Número do documento é obrigatório'),
  dataEmissao: z.string().min(1, 'Data de emissão é obrigatória'),
  dataValidade: z.string().min(1, 'Data de validade é obrigatória'),
  entidadeEmissora: z.string().min(1, 'Entidade emissora é obrigatória'),
  observacoes: z.string().optional(),
});

type DocumentoFormValues = z.infer<typeof documentoSchema>;

// ─── Mock data ────────────────────────────────────────────────────────────────

type MotoristaResumo = Pick<Motorista, 'id' | 'nomeCompleto' | 'estadoOperacional' | 'documentos'>;

const motoristasMockInicial: MotoristaResumo[] = [
  {
    id: '1',
    nomeCompleto: 'Carlos Santos',
    estadoOperacional: 'activo',
    documentos: [
      { id: 'doc-1-1', motoristaId: '1', tipo: 'carta_conducao', numero: 'CNH-12345', dataEmissao: new Date('2017-06-20'), dataValidade: new Date('2027-06-20'), entidadeEmissora: 'INATTER', estado: 'valido' },
      { id: 'doc-1-2', motoristaId: '1', tipo: 'bi', numero: '123456789A', dataEmissao: new Date('2020-01-10'), dataValidade: new Date('2030-01-10'), entidadeEmissora: 'Arquivo de Identificação Civil', estado: 'valido' },
    ] as DocumentoMotorista[],
  },
  {
    id: '2',
    nomeCompleto: 'Ana Pereira',
    estadoOperacional: 'activo',
    documentos: [
      { id: 'doc-2-1', motoristaId: '2', tipo: 'carta_conducao', numero: 'CNH-54321', dataEmissao: new Date('2018-03-10'), dataValidade: new Date('2028-03-10'), entidadeEmissora: 'INATTER', estado: 'valido' },
      { id: 'doc-2-2', motoristaId: '2', tipo: 'bi', numero: '987654321B', dataEmissao: new Date('2019-05-15'), dataValidade: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), entidadeEmissora: 'Arquivo de Identificação Civil', estado: 'proximo_expirar' },
    ] as DocumentoMotorista[],
  },
  {
    id: '3',
    nomeCompleto: 'João Machado',
    estadoOperacional: 'activo',
    documentos: [
      { id: 'doc-3-1', motoristaId: '3', tipo: 'carta_conducao', numero: 'CNH-67890', dataEmissao: new Date('2014-03-15'), dataValidade: new Date('2024-03-15'), entidadeEmissora: 'INATTER', estado: 'expirado' },
      { id: 'doc-3-2', motoristaId: '3', tipo: 'bi', numero: '111222333C', dataEmissao: new Date('2018-07-20'), dataValidade: new Date('2028-07-20'), entidadeEmissora: 'Arquivo de Identificação Civil', estado: 'valido' },
    ] as DocumentoMotorista[],
  },
  {
    id: '4',
    nomeCompleto: 'Maria Cossa',
    estadoOperacional: 'suspenso',
    documentos: [
      { id: 'doc-4-1', motoristaId: '4', tipo: 'carta_conducao', numero: 'CNH-11111', dataEmissao: new Date('2016-09-01'), dataValidade: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), entidadeEmissora: 'INATTER', estado: 'proximo_expirar' },
    ] as DocumentoMotorista[],
  },
];

// ─── Label helpers ────────────────────────────────────────────────────────────

const tipoDocumentoLabel: Record<DocumentoMotorista['tipo'], string> = {
  carta_conducao: 'Carta de Condução',
  bi: 'Bilhete de Identidade',
  outro: 'Outro',
};

const estadoDocConfig: Record<
  DocumentoMotorista['estado'],
  { label: string; icon: React.ElementType; badgeVariant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  valido: { label: 'Válido', icon: CheckCircle, badgeVariant: 'default' },
  proximo_expirar: { label: 'A Expirar', icon: AlertTriangle, badgeVariant: 'secondary' },
  expirado: { label: 'Expirado', icon: XCircle, badgeVariant: 'destructive' },
};

const estadoOperacionalConfig: Record<
  Motorista['estadoOperacional'],
  { label: string; className: string }
> = {
  activo: { label: 'Activo', className: 'bg-green-600 text-white' },
  inactivo: { label: 'Inactivo', className: '' },
  suspenso: { label: 'Suspenso', className: 'bg-red-600 text-white' },
};

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Flat document row type ───────────────────────────────────────────────────

interface DocumentoRow extends DocumentoMotorista {
  motoristaNome: string;
  motoristaId: string;
  motoristaEstado: Motorista['estadoOperacional'];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentosMotoristasPage() {
  const [motoristas, setMotoristas] = useState<MotoristaResumo[]>(motoristasMockInicial);
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
  });

  const motoristaIdSelecionado = watch('motoristaId');

  // Flatten all documents
  const todosDocumentos = useMemo<DocumentoRow[]>(() => {
    return motoristas.flatMap((m) =>
      m.documentos.map((doc) => ({
        ...doc,
        motoristaId: m.id,
        motoristaNome: m.nomeCompleto,
        motoristaEstado: m.estadoOperacional,
      }))
    );
  }, [motoristas]);

  const documentosFiltrados = useMemo(() => {
    return todosDocumentos.filter((doc) => {
      const matchPesquisa =
        pesquisa === '' ||
        doc.numero.toLowerCase().includes(pesquisa.toLowerCase()) ||
        doc.motoristaNome.toLowerCase().includes(pesquisa.toLowerCase()) ||
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
    // Documentos de motoristas não têm prazoAlertaDias — usar 30 dias como padrão para calcular estado
    const estado = calcularEstadoDocumento(dataValidade, 30);

    const novoDoc: DocumentoMotorista = {
      id: `doc-${Date.now()}`,
      motoristaId: values.motoristaId,
      tipo: values.tipo,
      numero: values.numero,
      dataEmissao: new Date(values.dataEmissao),
      dataValidade,
      entidadeEmissora: values.entidadeEmissora,
      estado,
      observacoes: values.observacoes || undefined,
    };

    setMotoristas((prev) =>
      prev.map((m) =>
        m.id === values.motoristaId
          ? { ...m, documentos: [...m.documentos, novoDoc] }
          : m
      )
    );

    toast.success('Documento registado com sucesso');
    setDialogAberto(false);
    reset();
  }

  function abrirDialog() {
    reset();
    setDialogAberto(true);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/transporte/motoristas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Documentos de Motoristas</h1>
            <p className="text-sm text-muted-foreground">
              Gestão centralizada de toda a documentação dos motoristas
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
                placeholder="Pesquisar por nome, número, entidade..."
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
                <SelectItem value="carta_conducao">Carta de Condução</SelectItem>
                <SelectItem value="bi">Bilhete de Identidade</SelectItem>
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
                  <TableHead>Motorista</TableHead>
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
                  const opCfg = estadoOperacionalConfig[doc.motoristaEstado];
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{doc.motoristaNome}</p>
                            <Badge variant="outline" className={`text-xs mt-0.5 ${opCfg.className}`}>
                              {opCfg.label}
                            </Badge>
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
                          <Link href={`/transporte/motoristas/${doc.motoristaId}`}>
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
            <DialogTitle>Registar Documento de Motorista</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            {/* Motorista */}
            <div className="space-y-1.5">
              <Label htmlFor="motoristaId">Motorista <span className="text-destructive">*</span></Label>
              <Select
                value={motoristaIdSelecionado ?? ''}
                onValueChange={(v) => setValue('motoristaId', v, { shouldValidate: true })}
              >
                <SelectTrigger id="motoristaId" className={errors.motoristaId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Seleccione o motorista" />
                </SelectTrigger>
                <SelectContent>
                  {motoristas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nomeCompleto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.motoristaId && <p className="text-xs text-destructive">{errors.motoristaId.message}</p>}
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo de Documento <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setValue('tipo', v as DocumentoMotorista['tipo'], { shouldValidate: true })}>
                <SelectTrigger id="tipo" className={errors.tipo ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Seleccione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(tipoDocumentoLabel) as [DocumentoMotorista['tipo'], string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
            </div>

            {/* Número */}
            <div className="space-y-1.5">
              <Label htmlFor="numero">Número do Documento <span className="text-destructive">*</span></Label>
              <Input id="numero" placeholder="Ex: CNH-99999" {...register('numero')} className={errors.numero ? 'border-destructive' : ''} />
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
