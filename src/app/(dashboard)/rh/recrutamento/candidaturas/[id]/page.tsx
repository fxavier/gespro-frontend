/**
 * Detalhe de Candidatura — Server Component (NUNCA 'use client').
 * Mostra entrevistas, histórico e botão de Admitir (em rota separada).
 */
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, User } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { CandidaturaService } from '@/server/services/pessoas-projetos/recrutamento.service';
import { PageHeader, StatusBadge, DetailShell, Timeline } from '@/components/patterns';
import type { DetailTab, TimelineItem } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { MoverEtapaActions } from '../../_components/mover-etapa-actions';
import { EntrevistaFormInline } from '../../_components/entrevista-form-inline';
import { AdmitirButton } from '../../_components/admitir-button';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidaturaDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let candidatura;
  try {
    candidatura = await runWithTenantContext({ tenantId, userId }, () =>
      CandidaturaService.obter(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!candidatura) notFound();

  // Montar timeline com histórico
  const timelineItems: TimelineItem[] = candidatura.historico.map((h) => ({
    id: h.id,
    title: h.etapaAnterior
      ? `${etapaLabel(h.etapaAnterior)} → ${etapaLabel(h.etapaNova)}`
      : `Candidatura recebida em ${etapaLabel(h.etapaNova)}`,
    description: h.notas ?? undefined,
    date: h.createdAt,
    variant: h.etapaNova === 'CONTRATADO' ? 'success' : h.etapaNova === 'REJEITADO' || h.etapaNova === 'DESISTIU' ? 'destructive' : 'default',
  }));

  const podeAdmitir = candidatura.etapa === 'PROPOSTA' || candidatura.etapa === 'ENTREVISTA';
  const eTerminal = ['CONTRATADO', 'REJEITADO', 'DESISTIU'].includes(candidatura.etapa);

  const tabs: DetailTab[] = [
    {
      key: 'visao-geral',
      label: 'Visão Geral',
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailField label="Candidato" value={candidatura.candidato.nome} />
            <DetailField label="Email" value={candidatura.candidato.email} />
            <DetailField label="Telefone" value={candidatura.candidato.telefone} />
            <DetailField label="Vaga" value={`${candidatura.vaga.titulo} (${candidatura.vaga.codigo})`} />
            <DetailField label="Etapa Actual" value={etapaLabel(candidatura.etapa)} />
            <DetailField
              label="Pretensão Salarial"
              value={candidatura.pretensaoSalarial ? `MT ${parseFloat(candidatura.pretensaoSalarial.toString()).toLocaleString('pt-MZ')}` : '—'}
            />
            {candidatura.candidato.bi && <DetailField label="BI" value={candidatura.candidato.bi} />}
            {candidatura.candidato.nuit && <DetailField label="NUIT" value={candidatura.candidato.nuit} />}
          </div>

          {candidatura.candidato.observacoes && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Observações do Candidato</h3>
              <p className="text-sm whitespace-pre-wrap">{candidatura.candidato.observacoes}</p>
            </div>
          )}

          {podeAdmitir && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-4">
              <p className="text-sm font-medium text-success mb-3">
                Esta candidatura está em estado <strong>{etapaLabel(candidatura.etapa)}</strong>.
                Pode convertê-la numa admissão de Colaborador.
              </p>
              <AdmitirButton candidaturaId={candidatura.id} candidato={candidatura.candidato} />
            </div>
          )}

          {candidatura.colaboradorId && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">
                Candidato admitido como Colaborador.{' '}
                <Link href={`/rh/colaboradores/${candidatura.colaboradorId}`} className="text-primary underline">
                  Ver ficha do colaborador
                </Link>
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'entrevistas',
      label: `Entrevistas (${candidatura.entrevistas.length})`,
      content: (
        <div className="space-y-6">
          {candidatura.entrevistas.length > 0 ? (
            <div className="space-y-3">
              {candidatura.entrevistas.map((e) => (
                <div key={e.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={e.tipo} />
                      <span className="text-sm tabular-nums">
                        {new Date(e.dataHora).toLocaleDateString('pt-MZ')} às {new Date(e.dataHora).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {e.avaliacao != null && (
                      <span className="text-sm font-medium tabular-nums">
                        {parseFloat(e.avaliacao.toString()).toFixed(1)}/10
                      </span>
                    )}
                  </div>
                  {e.entrevistadores.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{e.entrevistadores.join(', ')}</span>
                    </div>
                  )}
                  {e.parecer && <p className="text-sm text-muted-foreground">{e.parecer}</p>}
                  {e.recomendaAvancar !== null && e.recomendaAvancar !== undefined && (
                    <StatusBadge
                      status={e.recomendaAvancar ? 'APROVADO' : 'REJEITADO'}
                      label={e.recomendaAvancar ? 'Recomenda avançar' : 'Não recomenda avançar'}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma entrevista registada.</p>
          )}

          {!eTerminal && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium mb-4">Registar Nova Entrevista</h3>
              <EntrevistaFormInline candidaturaId={candidatura.id} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'historico',
      label: 'Histórico',
      content: (
        <Timeline items={timelineItems} />
      ),
    },
  ];

  const header = (
    <PageHeader
      title={candidatura.candidato.nome}
      description={`Candidatura a: ${candidatura.vaga.titulo}`}
      breadcrumbs={[
        { label: 'RH', href: '/rh' },
        { label: 'Recrutamento', href: '/rh/recrutamento' },
        { label: candidatura.vaga.codigo, href: `/rh/recrutamento/vagas/${candidatura.vagaId}` },
        { label: candidatura.candidato.nome },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/rh/recrutamento/vagas/${candidatura.vagaId}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Vaga
            </Link>
          </Button>
          <StatusBadge status={candidatura.etapa} />
          {!eTerminal && (
            <MoverEtapaActions
              candidaturaId={candidatura.id}
              etapaActual={candidatura.etapa}
            />
          )}
        </div>
      }
    />
  );

  return (
    <div className="p-6 space-y-6">
      <DetailShell
        header={header}
        tabs={tabs}
        defaultTab="visao-geral"
        metadata={[
          { label: 'Candidato', value: candidatura.candidato.nome },
          { label: 'Etapa', value: <StatusBadge status={candidatura.etapa} /> },
          { label: 'Candidatura', value: new Date(candidatura.createdAt).toLocaleDateString('pt-MZ') },
        ]}
      />
    </div>
  );
}

function etapaLabel(etapa: string): string {
  const map: Record<string, string> = {
    RECEBIDA: 'Recebida',
    TRIAGEM: 'Triagem',
    ENTREVISTA: 'Entrevista',
    PROPOSTA: 'Proposta',
    CONTRATADO: 'Contratado',
    REJEITADO: 'Rejeitado',
    DESISTIU: 'Desistiu',
  };
  return map[etapa] ?? etapa;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
