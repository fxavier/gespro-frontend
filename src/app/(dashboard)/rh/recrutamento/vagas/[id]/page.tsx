/**
 * Detalhe da Vaga + Kanban de Candidaturas — Server Component (NUNCA 'use client').
 */
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { VagaService } from '@/server/services/pessoas-projetos/recrutamento.service';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import type { DetailTab } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { VagaStatusActions } from '../../_components/vaga-status-actions';
import { CandidaturaKanban } from '../../_components/candidatura-kanban';
import { CandidaturaForm } from '../../_components/candidatura-form';

interface Props {
  params: Promise<{ id: string }>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function contratoLabel(tipo: string): string {
  const map: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    TERMO_CERTO: 'Termo Certo',
    ESTAGIO: 'Estágio',
    TEMPORARIO: 'Temporário',
    PRESTACAO_SERVICOS: 'Prestação de Serviços',
  };
  return map[tipo] ?? tipo;
}

export default async function VagaDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let vaga;
  try {
    vaga = await runWithTenantContext({ tenantId, userId }, () =>
      VagaService.obter(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!vaga) notFound();

  const aceitaCandidaturas = vaga.status === 'ABERTA' || vaga.status === 'EM_TRIAGEM';

  const tabs: DetailTab[] = [
    {
      key: 'candidaturas',
      label: `Pipeline (${vaga.candidaturas.length})`,
      content: (
        <CandidaturaKanban
          candidaturas={vaga.candidaturas.map((c) => ({
            id: c.id,
            etapa: c.etapa,
            posicao: c.posicao,
            candidato: c.candidato,
            entrevistaCount: c.entrevistas.length,
            pretensaoSalarial: c.pretensaoSalarial?.toString() ?? null,
          }))}
          vagaId={vaga.id}
          vagaStatus={vaga.status}
        />
      ),
    },
    {
      key: 'nova-candidatura',
      label: 'Adicionar Candidato',
      content: aceitaCandidaturas ? (
        <CandidaturaForm vagaId={vaga.id} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>Não é possível adicionar candidaturas a uma vaga com estado <strong>{vaga.status}</strong>.</p>
        </div>
      ),
    },
    {
      key: 'detalhes',
      label: 'Detalhes',
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailField
              label="Regime"
              value={vaga.regimeTrabalho === 'TEMPO_INTEGRAL' ? 'Tempo Integral' : 'Tempo Parcial'}
            />
            <DetailField label="Contrato" value={contratoLabel(vaga.tipoContrato)} />
            <DetailField label="Localização" value={vaga.localizacao ?? '—'} />
            <DetailField
              label="Faixa Salarial"
              value={
                vaga.salarioMin || vaga.salarioMax
                  ? `MT ${vaga.salarioMin?.toString() ?? '?'} – ${vaga.salarioMax?.toString() ?? '?'}`
                  : '—'
              }
            />
            <DetailField
              label="Data de Abertura"
              value={vaga.dataAbertura ? new Date(vaga.dataAbertura).toLocaleDateString('pt-MZ') : '—'}
            />
            <DetailField
              label="Data de Fecho"
              value={vaga.dataFecho ? new Date(vaga.dataFecho).toLocaleDateString('pt-MZ') : '—'}
            />
          </div>

          {vaga.descricao && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Descrição</h3>
              <p className="text-sm whitespace-pre-wrap">{vaga.descricao}</p>
            </div>
          )}

          {vaga.requisitos.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Requisitos</h3>
              <ul className="list-disc list-inside space-y-1">
                {vaga.requisitos.map((r, i) => (
                  <li key={i} className="text-sm">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
    },
  ];

  const header = (
    <PageHeader
      title={vaga.titulo}
      description={`${vaga.codigo} · ${vaga.posicoesPreenchidas}/${vaga.numeroPosicoes} posições preenchidas`}
      breadcrumbs={[
        { label: 'RH', href: '/rh' },
        { label: 'Recrutamento', href: '/rh/recrutamento' },
        { label: vaga.codigo },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/recrutamento">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Vagas
            </Link>
          </Button>
          <StatusBadge status={vaga.status} />
          <VagaStatusActions vagaId={vaga.id} statusActual={vaga.status} />
        </div>
      }
    />
  );

  return (
    <div className="p-6 space-y-6">
      <DetailShell
        header={header}
        tabs={tabs}
        defaultTab="candidaturas"
        metadata={[
          { label: 'Código', value: vaga.codigo },
          { label: 'Posições', value: `${vaga.posicoesPreenchidas}/${vaga.numeroPosicoes}` },
          { label: 'Estado', value: <StatusBadge status={vaga.status} /> },
        ]}
      />
    </div>
  );
}
