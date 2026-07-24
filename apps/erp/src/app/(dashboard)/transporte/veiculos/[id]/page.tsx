/**
 * Detalhe de Viatura — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, FileText, Wrench, CheckSquare, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ViaturaDetalhe, DocumentoViaturaRef, ManutencaoViaturaRef } from '@/server/services/operacoes/viatura.interface';
import { ViaturaComandos } from '../_components/viatura-comandos';
import { DocumentoUploadForm } from '../../_components/documento-upload-form';

const TIPOS_DOC_VIATURA = [
  { value: 'LIVRETE', label: 'Livrete' },
  { value: 'INSPECAO', label: 'Inspecção' },
  { value: 'SEGURO', label: 'Seguro' },
  { value: 'LICENCA', label: 'Licença' },
  { value: 'MANIFESTO', label: 'Manifesto' },
  { value: 'TAXA_RADIO', label: 'Taxa de Rádio' },
  { value: 'OUTRO', label: 'Outro' },
];

const DOC_ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  VALIDO: 'default',
  PROXIMO_EXPIRAR: 'outline',
  EXPIRADO: 'destructive',
};

const DOC_ESTADO_LABEL: Record<string, string> = {
  VALIDO: 'Válido',
  PROXIMO_EXPIRAR: 'A Expirar',
  EXPIRADO: 'Expirado',
};

function DocumentosTab({ documentos }: { documentos: DocumentoViaturaRef[] }) {
  if (documentos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sem documentos registados.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {documentos.map((doc) => (
        <Card key={doc.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-sm">{doc.tipo}</span>
                  <Badge variant={DOC_ESTADO_VARIANT[doc.estado]}>
                    {DOC_ESTADO_LABEL[doc.estado] ?? doc.estado}
                  </Badge>
                  {doc.estado === 'EXPIRADO' && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">N.º {doc.numero} — {doc.entidadeEmissora}</p>
                <a
                  href={`/api/documentos/${doc.id}/download?recurso=viatura`}
                  className="text-xs text-primary hover:underline inline-block mt-1"
                >
                  Descarregar ficheiro
                </a>
              </div>
              <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                <p>Emissão: {new Date(doc.dataEmissao).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                <p>Validade: {new Date(doc.dataValidade).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ManutencoesTab({ manutencoes }: { manutencoes: ManutencaoViaturaRef[] }) {
  if (manutencoes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sem intervenções de manutenção registadas.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {manutencoes.map((m) => (
        <Card key={m.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-sm">{m.tipo}</span>
                  {m.custo && (
                    <span className="text-sm tabular-nums font-medium">
                      MZN {parseFloat(m.custo).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{m.descricao}</p>
                {m.quilometragem && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {m.quilometragem.toLocaleString('pt-MZ')} km
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                <p>{new Date(m.data).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                {m.proximaManutencaoData && (
                  <p className="mt-1">
                    Próx.: {new Date(m.proximaManutencaoData).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ViaturaDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let viatura: ViaturaDetalhe;
  try {
    viatura = await runWithTenantContext(ctx, () => viaturaService.obterViatura(id, ctx));
  } catch {
    notFound();
  }

  const podeEditar = viatura.estado !== 'ABATIDA';

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={viatura.matricula}
            description={`${viatura.marca} ${viatura.modelo} — ${viatura.tipoViatura}`}
            breadcrumbs={[
              { label: 'Transporte', href: '/transporte' },
              { label: 'Viaturas', href: '/transporte/veiculos' },
              { label: viatura.matricula },
            ]}
            badge={<StatusBadge status={viatura.estado} />}
            actions={
              podeEditar && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/transporte/veiculos/${viatura.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
              )
            }
          />
        }
        tabs={[
          ...(podeEditar
            ? [
                {
                  key: 'acoes',
                  label: 'Ações',
                  content: <ViaturaComandos viaturaId={viatura.id} estado={viatura.estado} />,
                },
              ]
            : []),
          {
            key: 'documentos',
            label: 'Documentos',
            count: viatura.documentos.length,
            content: (
              <div className="space-y-4">
                {podeEditar && (
                  <Card>
                    <CardContent className="p-5">
                      <p className="font-medium text-sm mb-3">Adicionar Documento</p>
                      <DocumentoUploadForm recurso="viatura" recursoId={viatura.id} tipos={TIPOS_DOC_VIATURA} />
                    </CardContent>
                  </Card>
                )}
                <DocumentosTab documentos={viatura.documentos} />
              </div>
            ),
          },
          {
            key: 'manutencoes',
            label: 'Manutenções',
            count: viatura.manutencoes.length,
            content: <ManutencoesTab manutencoes={viatura.manutencoes} />,
          },
          ...(viatura.checklistRecente
            ? [
                {
                  key: 'checklist',
                  label: 'Última Inspecção',
                  content: (
                    <Card>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckSquare className="h-4 w-4" />
                          <span>
                            Inspecção de{' '}
                            {new Date(viatura.checklistRecente.dataInspeccao).toLocaleDateString('pt-MZ', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}{' '}
                            — {viatura.checklistRecente.responsavel}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {viatura.checklistRecente.itens.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-sm">
                              <span>{item.nome}</span>
                              <Badge
                                variant={
                                  item.estado === 'OK'
                                    ? 'default'
                                    : item.estado === 'AVARIA'
                                    ? 'destructive'
                                    : 'outline'
                                }
                              >
                                {item.estado}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ),
                },
              ]
            : []),
        ]}
        metadata={[
          {
            label: 'Estado',
            value: <StatusBadge status={viatura.estado} />,
          },
          {
            label: 'Tipo',
            value: <span className="text-sm">{viatura.tipoViatura}</span>,
          },
          {
            label: 'Capacidade',
            value: (
              <span className="text-sm tabular-nums">
                {parseFloat(viatura.capacidade).toLocaleString('pt-MZ')} {viatura.unidadeCapacidade}
              </span>
            ),
          },
          {
            label: 'Local de Actividade',
            value: <span className="text-sm">{viatura.localActividade}</span>,
          },
          {
            label: 'Início de Actividade',
            value: (
              <time className="text-sm tabular-nums">
                {new Date(viatura.dataInicioActividade).toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </time>
            ),
          },
          ...(viatura.observacoes
            ? [{ label: 'Observações', value: <span className="text-sm">{viatura.observacoes}</span> }]
            : []),
        ]}
      />
    </div>
  );
}
