/**
 * Detalhe de Atividade de Transporte — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, History, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { atividadeService } from '@/server/services/operacoes/atividade.service';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { AtividadeDetalhe, EventoAtividadeRef } from '@/server/services/operacoes/atividade.interface';
import { AtividadeComandos } from '../_components/atividade-comandos';

const TIPO_LABELS: Record<string, string> = {
  DESLOCACAO: 'Deslocação',
  MISSAO_SERVICO: 'Missão de Serviço',
  TRANSPORTE_MERCADORIAS: 'Transporte de Mercadorias',
  TRANSPORTE_PESSOAL: 'Transporte de Pessoal',
  MANUTENCAO_CAMPO: 'Manutenção em Campo',
  OUTRO: 'Outro',
};

function HistoricoTimeline({ historico }: { historico: EventoAtividadeRef[] }) {
  if (historico.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sem histórico de alterações.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {historico.map((evento) => (
        <li key={evento.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            <span className="flex-1 w-px bg-border" />
          </div>
          <div className="pb-3 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              {evento.estadoAnterior && (
                <>
                  <Badge variant="outline" className="text-xs">{evento.estadoAnterior}</Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </>
              )}
              <Badge variant="secondary" className="text-xs">{evento.estadoNovo}</Badge>
              <time
                dateTime={evento.data.toISOString()}
                className="ml-auto text-xs text-muted-foreground tabular-nums"
              >
                {evento.data.toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <p className="text-sm text-muted-foreground">{evento.descricao}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AtividadeDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let atividade: AtividadeDetalhe;
  try {
    atividade = await runWithTenantContext(ctx, () => atividadeService.obterAtividade(id, ctx));
  } catch {
    notFound();
  }

  const podeEditar = atividade.estado === 'PLANEADA' || atividade.estado === 'SUSPENSA';

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={atividade.codigo}
            description={atividade.titulo}
            breadcrumbs={[
              { label: 'Transporte', href: '/transporte' },
              { label: 'Atividades', href: '/transporte/atividades' },
              { label: atividade.codigo },
            ]}
            badge={<StatusBadge status={atividade.estado} />}
            actions={
              podeEditar && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/transporte/atividades/${atividade.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
              )
            }
          />
        }
        tabs={[
          ...(atividade.estado !== 'CONCLUIDA' && atividade.estado !== 'CANCELADA'
            ? [
                {
                  key: 'acoes',
                  label: 'Ações',
                  content: <AtividadeComandos atividadeId={atividade.id} estado={atividade.estado} />,
                },
              ]
            : []),
          {
            key: 'descricao',
            label: 'Descrição',
            content: (
              <Card>
                <CardContent className="p-5 space-y-4">
                  {atividade.descricao ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{atividade.descricao}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem descrição.</p>
                  )}
                  {atividade.observacoes && (
                    <div className="pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Observações</p>
                      <p className="text-sm">{atividade.observacoes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            key: 'historico',
            label: 'Histórico',
            count: atividade.historico.length,
            content: (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <History className="h-4 w-4" />
                  <span>{atividade.historico.length} evento(s)</span>
                </div>
                <Card>
                  <CardContent className="p-5">
                    <HistoricoTimeline historico={atividade.historico} />
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
        metadata={[
          {
            label: 'Estado',
            value: <StatusBadge status={atividade.estado} />,
          },
          {
            label: 'Prioridade',
            value: <StatusBadge status={atividade.prioridade} />,
          },
          {
            label: 'Tipo',
            value: <span className="text-sm">{TIPO_LABELS[atividade.tipoActividade] ?? atividade.tipoActividade}</span>,
          },
          {
            label: 'Local',
            value: <span className="text-sm">{atividade.localActividade}</span>,
          },
          {
            label: 'Início Previsto',
            value: (
              <time className="text-sm tabular-nums">
                {new Date(atividade.dataInicioPrevista).toLocaleDateString('pt-MZ', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </time>
            ),
          },
          ...(atividade.dataConclusaoPrevista
            ? [
                {
                  label: 'Conclusão Prevista',
                  value: (
                    <time className="text-sm tabular-nums">
                      {new Date(atividade.dataConclusaoPrevista).toLocaleDateString('pt-MZ', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </time>
                  ),
                },
              ]
            : []),
          ...(atividade.dataInicioReal
            ? [
                {
                  label: 'Início Real',
                  value: (
                    <time className="text-sm tabular-nums">
                      {new Date(atividade.dataInicioReal).toLocaleDateString('pt-MZ', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </time>
                  ),
                },
              ]
            : []),
          ...(atividade.dataConclusaoReal
            ? [
                {
                  label: 'Conclusão Real',
                  value: (
                    <time className="text-sm tabular-nums">
                      {new Date(atividade.dataConclusaoReal).toLocaleDateString('pt-MZ', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
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
