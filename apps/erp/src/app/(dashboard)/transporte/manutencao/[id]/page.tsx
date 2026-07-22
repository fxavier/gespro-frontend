/**
 * Detalhe de Manutenção de Viatura — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Wrench, Calendar, Car } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prismaBase } from '@/server/db/client';
import { TipoManutencaoViatura } from '@prisma/client';
import { PageHeader, DetailShell } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const TIPO_LABELS: Record<TipoManutencaoViatura, string> = {
  PREVENTIVA: 'Preventiva',
  CORRECTIVA: 'Correctiva',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManutencaoDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId } = session.user;
  const { id } = await params;

  const manutencao = await prismaBase.manutencaoViatura.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      viaturaId: true,
      tipo: true,
      data: true,
      quilometragem: true,
      criterio: true,
      descricao: true,
      fornecedor: true,
      custo: true,
      pecasSubstituidas: true,
      responsavel: true,
      proximaManutencaoData: true,
      proximaManutencaoKm: true,
      proximaManutencaoCriterio: true,
      createdAt: true,
      viatura: {
        select: { matricula: true, marca: true, modelo: true },
      },
    },
  });

  if (!manutencao) notFound();

  const custoStr = manutencao.custo ? manutencao.custo.toString() : null;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`${manutencao.viatura.matricula} — ${TIPO_LABELS[manutencao.tipo]}`}
            description={`${manutencao.viatura.marca} ${manutencao.viatura.modelo}`}
            breadcrumbs={[
              { label: 'Transporte', href: '/transporte' },
              { label: 'Manutenção', href: '/transporte/manutencao' },
              { label: manutencao.viatura.matricula },
            ]}
            badge={
              <Badge variant="outline">
                {TIPO_LABELS[manutencao.tipo]}
              </Badge>
            }
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href={`/transporte/veiculos/${manutencao.viaturaId}`}>
                  <Car className="h-4 w-4 mr-1.5" />
                  Ver Viatura
                </Link>
              </Button>
            }
          />
        }
        tabs={[
          {
            key: 'detalhes',
            label: 'Detalhes',
            content: (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Data</p>
                        <p className="text-sm font-medium tabular-nums mt-0.5">
                          {new Date(manutencao.data).toLocaleDateString('pt-MZ', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Quilometragem</p>
                        <p className="text-sm font-medium tabular-nums mt-0.5">
                          {manutencao.quilometragem
                            ? `${manutencao.quilometragem.toLocaleString('pt-MZ')} km`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Responsável</p>
                        <p className="text-sm font-medium mt-0.5">{manutencao.responsavel}</p>
                      </div>
                      {manutencao.fornecedor && (
                        <div>
                          <p className="text-xs text-muted-foreground">Fornecedor / Oficina</p>
                          <p className="text-sm font-medium mt-0.5">{manutencao.fornecedor}</p>
                        </div>
                      )}
                      {manutencao.criterio && (
                        <div>
                          <p className="text-xs text-muted-foreground">Critério</p>
                          <p className="text-sm font-medium mt-0.5">{manutencao.criterio}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Descrição</p>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{manutencao.descricao}</p>
                    </div>

                    {manutencao.pecasSubstituidas && (
                      <div>
                        <p className="text-xs text-muted-foreground">Peças Substituídas</p>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{manutencao.pecasSubstituidas}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {(manutencao.proximaManutencaoData ||
                  manutencao.proximaManutencaoKm ||
                  manutencao.proximaManutencaoCriterio) && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 text-sm font-medium mb-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        Próxima Manutenção
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {manutencao.proximaManutencaoData && (
                          <div>
                            <p className="text-xs text-muted-foreground">Data Prevista</p>
                            <p className="text-sm font-medium tabular-nums mt-0.5">
                              {new Date(manutencao.proximaManutencaoData).toLocaleDateString('pt-MZ', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        )}
                        {manutencao.proximaManutencaoKm && (
                          <div>
                            <p className="text-xs text-muted-foreground">KM Previsto</p>
                            <p className="text-sm font-medium tabular-nums mt-0.5">
                              {manutencao.proximaManutencaoKm.toLocaleString('pt-MZ')} km
                            </p>
                          </div>
                        )}
                        {manutencao.proximaManutencaoCriterio && (
                          <div>
                            <p className="text-xs text-muted-foreground">Critério</p>
                            <p className="text-sm font-medium mt-0.5">{manutencao.proximaManutencaoCriterio}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ),
          },
        ]}
        metadata={[
          {
            label: 'Tipo',
            value: (
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{TIPO_LABELS[manutencao.tipo]}</span>
              </div>
            ),
          },
          {
            label: 'Viatura',
            value: (
              <span className="text-sm font-medium tabular-nums">
                {manutencao.viatura.matricula}
              </span>
            ),
          },
          {
            label: 'Data',
            value: (
              <time className="text-sm tabular-nums">
                {new Date(manutencao.data).toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </time>
            ),
          },
          ...(manutencao.quilometragem
            ? [
                {
                  label: 'Quilometragem',
                  value: (
                    <span className="text-sm tabular-nums">
                      {manutencao.quilometragem.toLocaleString('pt-MZ')} km
                    </span>
                  ),
                },
              ]
            : []),
          ...(custoStr
            ? [
                {
                  label: 'Custo',
                  value: (
                    <span className="text-sm tabular-nums font-medium">
                      MZN{' '}
                      {parseFloat(custoStr).toLocaleString('pt-MZ', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: 'Responsável',
            value: <span className="text-sm">{manutencao.responsavel}</span>,
          },
          ...(manutencao.fornecedor
            ? [{ label: 'Fornecedor', value: <span className="text-sm">{manutencao.fornecedor}</span> }]
            : []),
          ...(manutencao.proximaManutencaoData
            ? [
                {
                  label: 'Próxima Manutenção',
                  value: (
                    <time className="text-sm tabular-nums">
                      {new Date(manutencao.proximaManutencaoData).toLocaleDateString('pt-MZ', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </time>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
