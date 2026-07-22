/**
 * Detalhe de Manutenção — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { manutencaoService } from '@/server/services/inventario/manutencao.service';
import { Button } from '@/components/ui/button';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { ManutencaoAcoes } from '../_components/manutencao-acoes';

const STATUS_VARIANTES = {
  AGENDADA: 'info',
  EM_ANDAMENTO: 'warning',
  ORCAMENTO: 'secondary',
  CONCLUIDA: 'success',
  CANCELADA: 'destructive',
} as const;

const STATUS_LABELS: Record<string, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em Andamento',
  ORCAMENTO: 'Orçamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const TIPO_LABELS: Record<string, string> = {
  PREVENTIVA: 'Preventiva',
  CORRETIVA: 'Corretiva',
  INSPECAO: 'Inspecção',
  CALIBRACAO: 'Calibração',
};

const PRIORIDADE_LABELS: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtMt = (v: string | null | undefined) =>
  v
    ? `MT ${Number(v).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ManutencaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let manutencao;
  try {
    manutencao = await runWithTenantContext({ tenantId, userId }, () =>
      manutencaoService.obterManutencao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!manutencao) notFound();

  const podeEditar = !['CONCLUIDA', 'CANCELADA'].includes(manutencao.status);
  const variant = STATUS_VARIANTES[manutencao.status as keyof typeof STATUS_VARIANTES] ?? 'default';

  const metadata = [
    { label: 'Tipo', value: TIPO_LABELS[manutencao.tipo] ?? manutencao.tipo },
    { label: 'Prioridade', value: manutencao.prioridade ? (PRIORIDADE_LABELS[manutencao.prioridade] ?? manutencao.prioridade) : '—' },
    { label: 'Data Agendada', value: fmt(manutencao.dataAgendada) },
    { label: 'Data Início', value: fmt(manutencao.dataInicio) },
    { label: 'Data Conclusão', value: fmt(manutencao.dataConclusao) },
    { label: 'Custo Estimado', value: fmtMt(manutencao.custoEstimado) },
    { label: 'Custo Real', value: fmtMt(manutencao.custoReal) },
  ];

  const tabDetalhes = (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      <div className="sm:col-span-2">
        <dt className="text-sm font-medium text-muted-foreground">Descrição</dt>
        <dd className="mt-1 text-sm whitespace-pre-wrap">{manutencao.descricao}</dd>
      </div>
      {manutencao.procedimentos && (
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-muted-foreground">Procedimentos</dt>
          <dd className="mt-1 text-sm whitespace-pre-wrap">{manutencao.procedimentos}</dd>
        </div>
      )}
      {manutencao.observacoes && (
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-muted-foreground">Observações</dt>
          <dd className="mt-1 text-sm">{manutencao.observacoes}</dd>
        </div>
      )}
      {manutencao.proximaManutencao && (
        <div>
          <dt className="text-sm font-medium text-muted-foreground">Próxima Manutenção</dt>
          <dd className="mt-1 text-sm">{fmt(manutencao.proximaManutencao)}</dd>
        </div>
      )}
    </dl>
  );

  const tabCustos = (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      <div>
        <dt className="text-sm font-medium text-muted-foreground">Custo Estimado</dt>
        <dd className="mt-1 text-sm tabular-nums font-medium">{fmtMt(manutencao.custoEstimado)}</dd>
      </div>
      <div>
        <dt className="text-sm font-medium text-muted-foreground">Custo Real</dt>
        <dd className="mt-1 text-sm tabular-nums font-medium">{fmtMt(manutencao.custoReal)}</dd>
      </div>
      <div>
        <dt className="text-sm font-medium text-muted-foreground">Mão de Obra</dt>
        <dd className="mt-1 text-sm tabular-nums">{fmtMt(manutencao.custoMaoObra)}</dd>
      </div>
      <div>
        <dt className="text-sm font-medium text-muted-foreground">Peças</dt>
        <dd className="mt-1 text-sm tabular-nums">{fmtMt(manutencao.custoPecas)}</dd>
      </div>
    </dl>
  );

  const tabRelatorio = manutencao.relatorio ? (
    <p className="text-sm whitespace-pre-wrap">{manutencao.relatorio}</p>
  ) : (
    <p className="text-sm text-muted-foreground">Sem relatório disponível.</p>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={manutencao.titulo}
            description={`Tipo: ${TIPO_LABELS[manutencao.tipo] ?? manutencao.tipo}`}
            breadcrumbs={[
              { label: 'Inventário', href: '/inventario' },
              { label: 'Manutenção', href: '/inventario/manutencao' },
              { label: manutencao.titulo },
            ]}
            badge={
              <StatusBadge
                status={manutencao.status}
                variant={variant}
                label={STATUS_LABELS[manutencao.status]}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                {podeEditar && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/inventario/manutencao/${id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
                <ManutencaoAcoes id={id} status={manutencao.status} />
              </div>
            }
          />
        }
        tabs={[
          { key: 'detalhes', label: 'Detalhes', content: tabDetalhes },
          { key: 'custos', label: 'Custos', content: tabCustos },
          { key: 'relatorio', label: 'Relatório', content: tabRelatorio },
          ...(manutencao.motivoCancelamento
            ? [
                {
                  key: 'cancelamento',
                  label: 'Cancelamento',
                  content: <p className="text-sm text-destructive">{manutencao.motivoCancelamento}</p>,
                },
              ]
            : []),
        ]}
        metadata={metadata}
      />
    </div>
  );
}
