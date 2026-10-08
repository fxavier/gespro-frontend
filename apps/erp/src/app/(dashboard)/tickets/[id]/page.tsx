/**
 * Detalhe de Ticket — Server Component (NUNCA 'use client').
 *
 * Padrão: DetailShell com abas (descrição, actividades) + sidebar de metadados.
 * Acções de mutação delegadas a TicketAcoes (client component).
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Clock, User, Mail, Phone, Tag, Star,
  AlertTriangle, Edit, MessageSquare,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TicketAcoes } from '../_components/ticket-acoes';
import { AtribuirAgenteTicket, ComentarTicket, AvaliarTicket } from '../_components/ticket-gestao';
import type { AtividadeTicketRef, TicketDetalhe } from '@/server/services/operacoes/ticket.interface';

// ─── Timeline de actividades ──────────────────────────────────────────────────

const TIPO_ATIVIDADE_LABELS: Record<string, string> = {
  COMENTARIO: 'Comentário',
  MUDANCA_STATUS: 'Alteração de Estado',
  ATRIBUICAO: 'Atribuição',
  ANEXO: 'Anexo',
  SISTEMA: 'Sistema',
};

function AtividadeTimeline({ atividades }: { atividades: AtividadeTicketRef[] }) {
  if (atividades.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sem actividades registadas.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {atividades.map((a) => (
        <li key={a.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            <span className="flex-1 w-px bg-border" />
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-medium">{a.autorNome}</span>
              <Badge variant="outline" className="text-xs">
                {TIPO_ATIVIDADE_LABELS[a.tipo] ?? a.tipo}
              </Badge>
              {a.visibilidade === 'INTERNA' && (
                <Badge variant="secondary" className="text-xs">Interno</Badge>
              )}
              <time
                dateTime={a.createdAt.toISOString()}
                className="ml-auto text-xs text-muted-foreground tabular-nums"
              >
                {a.createdAt.toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <p className="text-sm text-foreground">{a.descricao}</p>
            {a.detalhes && (
              <p className="text-xs text-muted-foreground mt-1">{a.detalhes}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── SLA badge helper ─────────────────────────────────────────────────────────

function SlaBadge({ ticket }: { ticket: TicketDetalhe }) {
  if (ticket.slaEmAtraso) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        SLA em Atraso
      </Badge>
    );
  }
  const agora = new Date();
  const horas = Math.round(
    (ticket.slaDataLimiteResolucao.getTime() - agora.getTime()) / (1000 * 60 * 60)
  );
  if (horas < 24) {
    return (
      <Badge variant="outline" className="border-warning text-warning gap-1">
        <Clock className="h-3 w-3" />
        {horas}h restantes
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {Math.round(horas / 24)}d restantes
    </Badge>
  );
}

// ─── Página principal — Server Component ──────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let ticket: TicketDetalhe;
  try {
    ticket = await runWithTenantContext(ctx, () => ticketService.obterTicket(id, ctx));
  } catch {
    notFound();
  }

  const podeEditar = ticket.estado !== 'FECHADO' && ticket.estado !== 'CANCELADO';
  const permissoes = session.user.permissions ?? [];
  const podeAtribuir = podeEditar && permissoes.includes('tickets:atribuir');
  const podeComentar = ticket.estado !== 'CANCELADO' && permissoes.includes('tickets:comentar');
  // Só o solicitante avalia, uma vez, depois do fecho (o serviço impõe o mesmo).
  const podeAvaliar =
    ticket.estado === 'FECHADO' &&
    ticket.avaliacaoNota === null &&
    ticket.solicitanteId === userId &&
    permissoes.includes('tickets:avaliar');

  // Primeira página de agentes fundida por id com o agente já atribuído (ComboboxRemoto).
  let agentesIniciais: Array<{ id: string; nome: string; email: string }> = [];
  if (podeAtribuir) {
    const pagina = await runWithTenantContext(ctx, () => ticketService.procurarAgentes('', ctx));
    const porId = new Map(pagina.map((u) => [u.id, u]));
    if (ticket.atribuidoParaId && !porId.has(ticket.atribuidoParaId)) {
      porId.set(ticket.atribuidoParaId, {
        id: ticket.atribuidoParaId,
        nome: ticket.atribuidoParaNome ?? ticket.atribuidoParaId,
        email: '',
      });
    }
    agentesIniciais = [...porId.values()];
  }

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={ticket.numero}
            description={ticket.titulo}
            breadcrumbs={[
              { label: 'Tickets', href: '/tickets' },
              { label: 'Lista', href: '/tickets/lista' },
              { label: ticket.numero },
            ]}
            badge={<StatusBadge status={ticket.estado} />}
            actions={
              <div className="flex items-center gap-2">
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/tickets/${ticket.id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
                <TicketAcoes id={ticket.id} estado={ticket.estado} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'descricao',
            label: 'Descrição',
            content: (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {ticket.descricao}
                    </p>
                  </CardContent>
                </Card>
                {podeAvaliar && (
                  <Card>
                    <CardContent className="p-5">
                      <AvaliarTicket ticketId={ticket.id} />
                    </CardContent>
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'atividades',
            label: 'Actividades',
            count: ticket.atividades.length,
            content: (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  <span>{ticket.atividades.length} entrada(s) no histórico</span>
                </div>
                {podeComentar && (
                  <Card>
                    <CardContent className="p-5">
                      <ComentarTicket ticketId={ticket.id} />
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardContent className="p-5">
                    <AtividadeTimeline atividades={ticket.atividades} />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          ...(ticket.avaliacaoNota !== null
            ? [
                {
                  key: 'avaliacao',
                  label: 'Avaliação',
                  content: (
                    <Card>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-5 w-5 ${
                                i < (ticket.avaliacaoNota ?? 0)
                                  ? 'fill-warning text-warning'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-sm font-medium tabular-nums">
                            {ticket.avaliacaoNota}/5
                          </span>
                        </div>
                        {ticket.avaliacaoComentario && (
                          <p className="text-sm text-muted-foreground">
                            {ticket.avaliacaoComentario}
                          </p>
                        )}
                        {ticket.avaliacaoData && (
                          <p className="text-xs text-muted-foreground">
                            Avaliado em{' '}
                            {ticket.avaliacaoData.toLocaleDateString('pt-MZ', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </p>
                        )}
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
            value: <StatusBadge status={ticket.estado} />,
          },
          {
            label: 'Prioridade',
            value: <StatusBadge status={ticket.prioridade} />,
          },
          {
            label: 'SLA',
            value: <SlaBadge ticket={ticket} />,
          },
          {
            label: 'Tipo',
            value: (
              <span className="flex items-center gap-1.5 text-sm">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {ticket.tipo}
              </span>
            ),
          },
          {
            label: 'Solicitante',
            value: (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {ticket.solicitanteNome}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {ticket.solicitanteEmail}
                </div>
                {ticket.solicitanteTelefone && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {ticket.solicitanteTelefone}
                  </div>
                )}
              </div>
            ),
          },
          {
            label: 'Atribuído a',
            value: (
              <div className="space-y-2">
                <span className="text-sm">
                  {ticket.atribuidoParaNome ?? (
                    <span className="text-muted-foreground">Não atribuído</span>
                  )}
                </span>
                {podeAtribuir && (
                  <AtribuirAgenteTicket
                    ticketId={ticket.id}
                    agenteActualId={ticket.atribuidoParaId}
                    agentesIniciais={agentesIniciais}
                  />
                )}
              </div>
            ),
          },
          {
            label: 'Abertura',
            value: (
              <time
                dateTime={ticket.dataAbertura.toISOString()}
                className="text-sm tabular-nums"
              >
                {ticket.dataAbertura.toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            ),
          },
          ...(ticket.dataResolucao
            ? [
                {
                  label: 'Resolução',
                  value: (
                    <time
                      dateTime={ticket.dataResolucao.toISOString()}
                      className="text-sm tabular-nums"
                    >
                      {ticket.dataResolucao.toLocaleDateString('pt-MZ', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  ),
                },
              ]
            : []),
          {
            label: 'Limite SLA',
            value: (
              <time
                dateTime={ticket.slaDataLimiteResolucao.toISOString()}
                className="text-sm tabular-nums text-muted-foreground"
              >
                {ticket.slaDataLimiteResolucao.toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            ),
          },
        ]}
      />
    </div>
  );
}
