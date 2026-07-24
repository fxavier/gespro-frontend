/**
 * Detalhe de Motorista — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, FileText, User, Phone, MapPin, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { MotoristaDetalhe } from '@/server/services/operacoes/motorista.service';
import { MotoristaComandos } from '../_components/motorista-comandos';
import { DocumentoUploadForm } from '../../_components/documento-upload-form';

const TIPOS_DOC_MOTORISTA = [
  { value: 'CARTA_CONDUCAO', label: 'Carta de Condução' },
  { value: 'BI', label: 'Bilhete de Identidade' },
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MotoristaDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let motorista: MotoristaDetalhe;
  try {
    motorista = await runWithTenantContext(ctx, () => motoristaService.obterMotorista(id, ctx));
  } catch {
    notFound();
  }

  const podeEditar = motorista.estadoOperacional !== 'SUSPENSO';

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={motorista.nomeCompleto}
            description={`Carta n.º ${motorista.numeroCarta} — ${motorista.categoriaCarta.join(', ')}`}
            breadcrumbs={[
              { label: 'Transporte', href: '/transporte' },
              { label: 'Motoristas', href: '/transporte/motoristas' },
              { label: motorista.nomeCompleto },
            ]}
            badge={<StatusBadge status={motorista.estadoOperacional} />}
            actions={
              podeEditar && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/transporte/motoristas/${motorista.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
              )
            }
          />
        }
        tabs={[
          {
            key: 'documentos',
            label: 'Documentos',
            count: motorista.documentos.length,
            content: (
              <div className="space-y-4">
                {podeEditar && (
                  <Card>
                    <CardContent className="p-5">
                      <p className="font-medium text-sm mb-3">Adicionar Documento</p>
                      <DocumentoUploadForm recurso="motorista" recursoId={motorista.id} tipos={TIPOS_DOC_MOTORISTA} />
                    </CardContent>
                  </Card>
                )}
                {motorista.documentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Sem documentos registados.
                  </p>
                ) : (
                  motorista.documentos.map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-sm">{doc.tipo}</span>
                              <Badge variant={DOC_ESTADO_VARIANT[doc.estado] ?? 'outline'}>
                                {DOC_ESTADO_LABEL[doc.estado] ?? doc.estado}
                              </Badge>
                              {doc.estado === 'EXPIRADO' && (
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">N.º {doc.numero}</p>
                            <a
                              href={`/api/documentos/${doc.id}/download?recurso=motorista`}
                              className="text-xs text-primary hover:underline inline-block mt-1"
                            >
                              Descarregar ficheiro
                            </a>
                          </div>
                          <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                            <p>Validade: {new Date(doc.dataValidade).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            ),
          },
          {
            key: 'disponibilidade',
            label: 'Disponibilidade',
            content: (
              <div className="space-y-4">
                {podeEditar && (
                  <MotoristaComandos
                    motoristaId={motorista.id}
                    disponivelActual={motorista.disponibilidade?.disponivel ?? true}
                  />
                )}
              <Card>
                <CardContent className="p-5">
                  {motorista.disponibilidade ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={motorista.disponibilidade.disponivel ? 'default' : 'secondary'}>
                          {motorista.disponibilidade.disponivel ? 'Disponível' : 'Indisponível'}
                        </Badge>
                      </div>
                      {motorista.disponibilidade.motivo && (
                        <p className="text-muted-foreground">{motorista.disponibilidade.motivo}</p>
                      )}
                      {motorista.disponibilidade.dataFim && (
                        <p className="text-muted-foreground text-xs">
                          Até: {new Date(motorista.disponibilidade.dataFim).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem registo de disponibilidade.</p>
                  )}
                </CardContent>
              </Card>
              </div>
            ),
          },
        ]}
        metadata={[
          {
            label: 'Estado Operacional',
            value: <StatusBadge status={motorista.estadoOperacional} />,
          },
          {
            label: 'Contacto',
            value: (
              <div className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {motorista.contacto}
              </div>
            ),
          },
          {
            label: 'Carta de Condução',
            value: (
              <div className="text-sm space-y-0.5">
                <p className="font-medium tabular-nums">{motorista.numeroCarta}</p>
                <p className="text-muted-foreground">Categorias: {motorista.categoriaCarta.join(', ')}</p>
                <p className="text-muted-foreground tabular-nums text-xs">
                  Validade: {new Date(motorista.validadeCarta).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
            ),
          },
          ...(motorista.numeroBI
            ? [{ label: 'BI', value: <span className="text-sm tabular-nums">{motorista.numeroBI}</span> }]
            : []),
          ...(motorista.morada
            ? [
                {
                  label: 'Morada',
                  value: (
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {motorista.morada}
                    </div>
                  ),
                },
              ]
            : []),
          ...(motorista.localActividade
            ? [
                {
                  label: 'Local de Actividade',
                  value: (
                    <div className="flex items-center gap-1.5 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {motorista.localActividade}
                    </div>
                  ),
                },
              ]
            : []),
          ...(motorista.observacoes
            ? [{ label: 'Observações', value: <span className="text-sm">{motorista.observacoes}</span> }]
            : []),
        ]}
      />
    </div>
  );
}
