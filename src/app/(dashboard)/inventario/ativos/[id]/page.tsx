import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ativosMock } from '@/data/ativos';
import type { Ativo } from '@/types/inventario';
import {
  ArrowLeft,
  Edit,
  Trash2,
  RefreshCw,
  MapPin,
  User,
  DollarSign,
  Calendar,
  Shield,
  ClipboardList,
  Wrench,
  History,
  FileText,
  Tag,
  Building,
  CheckCircle,
  AlertCircle,
  Gauge
} from 'lucide-react';

const estadoMap: Record<Ativo['estado'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle | typeof AlertCircle }> = {
  novo: { label: 'Novo', variant: 'default', icon: CheckCircle },
  em_uso: { label: 'Em uso', variant: 'default', icon: CheckCircle },
  em_manutencao: { label: 'Em manutenção', variant: 'secondary', icon: AlertCircle },
  obsoleto: { label: 'Obsoleto', variant: 'outline', icon: AlertCircle },
  baixado: { label: 'Baixado', variant: 'destructive', icon: AlertCircle },
  em_transferencia: { label: 'Em transferência', variant: 'secondary', icon: RefreshCw }
};

const formatCurrency = (valor?: number | null) => {
  if (valor === undefined || valor === null) return '-';
  return `MT ${valor.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`;
};

const formatDate = (value?: Date | string) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('pt-MZ');
};

const formatDateTime = (value?: Date | string) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('pt-MZ');
};

interface PageProps {
  params: { id: string };
}

export default function DetalheAtivoPage({ params }: PageProps) {
  const ativo = ativosMock.find((item) => item.id === params.id);

  if (!ativo) {
    notFound();
  }

  const estadoInfo = estadoMap[ativo.estado];
  const valorLiquido = ativo.amortizacao.valorLiquidoContabilistico;
  const vidaUtilRestante = Math.max(
    0,
    ativo.vidaUtil - Math.round((ativo.amortizacao.percentualAmortizado / 100) * ativo.vidaUtil)
  );
  const garantiaAtiva = Boolean(
    ativo.garantia?.dataFim && ativo.garantia.dataFim > new Date()
  );

  const movimentacoesRecentes = [
    {
      id: 'MOV-2024-001',
      data: '2024-02-03T10:00:00.000Z',
      tipo: 'Transferência',
      origem: 'Armazém Central',
      destino: ativo.localizacaoNome,
      responsavel: ativo.responsavelNome ?? 'Equipe de Inventário'
    },
    {
      id: 'MOV-2023-010',
      data: '2023-11-18T09:15:00.000Z',
      tipo: 'Manutenção',
      origem: ativo.localizacaoNome,
      destino: 'Oficina Técnica',
      responsavel: 'Serviços Técnicos'
    }
  ];

  const manutencoesRecentes = [
    {
      id: 'MAN-2024-001',
      titulo: 'Revisão preventiva',
      status: 'concluída',
      data: '2024-01-20T08:30:00.000Z',
      custo: 4500,
      responsavel: 'Oficina MasterFix'
    },
    {
      id: 'MAN-2023-012',
      titulo: 'Substituição de componente',
      status: 'em análise',
      data: '2023-12-05T14:00:00.000Z',
      custo: 2500,
      responsavel: 'Tech Solutions'
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventario/ativos">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">{ativo.nome}</h1>
            <Badge variant={estadoInfo.variant} className="flex items-center gap-1 capitalize">
              <estadoInfo.icon className="h-3.5 w-3.5" />
              {estadoInfo.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-12">Código interno {ativo.codigoInterno}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/inventario/ativos/${ativo.id}/editar`}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Link>
          </Button>
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Transferir
          </Button>
          <Button variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Baixar ativo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor de compra</p>
                <p className="text-2xl font-bold">{formatCurrency(ativo.valorCompra)}</p>
              </div>
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor líquido</p>
                <p className="text-2xl font-bold">{formatCurrency(valorLiquido)}</p>
              </div>
              <Gauge className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Amortização</p>
                <p className="text-2xl font-bold">{ativo.amortizacao.percentualAmortizado}%</p>
              </div>
              <ClipboardList className="h-6 w-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vida útil restante</p>
                <p className="text-2xl font-bold">{vidaUtilRestante} anos</p>
              </div>
              <Calendar className="h-6 w-6 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Informações Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Categoria</p>
                <p className="font-semibold">{ativo.categoriaNome}</p>
                {ativo.descricao && <p className="text-sm text-muted-foreground">{ativo.descricao}</p>}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Número de Série</p>
                <p className="font-semibold">{ativo.numeroSerie ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Modelo</p>
                <p className="font-semibold">{ativo.modelo ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Marca</p>
                <p className="font-semibold">{ativo.marca ?? '-'}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Localização atual</p>
                  <p className="font-semibold">{ativo.localizacaoNome}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p className="font-semibold">{ativo.responsavelNome ?? 'Não atribuído'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building className="h-5 w-5 text-violet-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Departamento</p>
                  <p className="font-semibold">{ativo.departamentoNome ?? '-'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Garantia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ativo.garantia ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fornecedor</span>
                  <span className="font-semibold">{ativo.garantia.fornecedor}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Início</span>
                  <span className="font-semibold">{formatDate(ativo.garantia.dataInicio)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fim</span>
                  <span className="font-semibold">{formatDate(ativo.garantia.dataFim)}</span>
                </div>
                <Badge variant={garantiaAtiva ? 'default' : 'secondary'}>
                  {garantiaAtiva ? 'Garantia ativa' : 'Garantia expirada'}
                </Badge>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Este ativo não possui registro de garantia.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Movimentações Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem/Destino</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimentacoesRecentes.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="font-medium">{mov.id}</TableCell>
                    <TableCell>{mov.tipo}</TableCell>
                    <TableCell>
                      <p className="text-sm">Origem: {mov.origem}</p>
                      <p className="text-sm text-muted-foreground">Destino: {mov.destino}</p>
                    </TableCell>
                    <TableCell>{formatDateTime(mov.data)}</TableCell>
                    <TableCell>{mov.responsavel}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Manutenções
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manutencoesRecentes.map((manu) => (
                  <TableRow key={manu.id}>
                    <TableCell className="font-medium">{manu.id}</TableCell>
                    <TableCell>
                      <p className="font-semibold">{manu.titulo}</p>
                      <p className="text-xs text-muted-foreground">{manu.responsavel}</p>
                    </TableCell>
                    <TableCell>{formatDate(manu.data)}</TableCell>
                    <TableCell>{formatCurrency(manu.custo)}</TableCell>
                    <TableCell>
                      <Badge variant={manu.status === 'concluída' ? 'default' : 'secondary'}>
                        {manu.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos e Observações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ativo.observacoes && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Observações</p>
              <p>{ativo.observacoes}</p>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm text-muted-foreground mb-2">Documentos</p>
            {ativo.documentos && ativo.documentos.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {ativo.documentos.map((doc) => (
                  <div key={doc.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{doc.nome}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(doc.dataUpload)}</p>
                    </div>
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Ver
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
