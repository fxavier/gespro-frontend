/**
 * Detalhe de Projecto — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, Kanban, Target, TrendingUp } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';

const TIPO_LABEL: Record<string, string> = {
  INTERNO: 'Interno',
  EXTERNO: 'Externo',
  PESQUISA: 'Pesquisa',
  DESENVOLVIMENTO: 'Desenvolvimento',
};

const PRIORIDADE_LABEL: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjetoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let projeto;
  try {
    projeto = await runWithTenantContext(ctx, () =>
      ProjetoService.obter(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!projeto) notFound();

  const podeEditar = projeto.status !== 'ARQUIVADO' && projeto.status !== 'CANCELADO';

  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{projeto.codigo}</span> },
    { label: 'Tipo', value: TIPO_LABEL[projeto.tipo] ?? projeto.tipo },
    { label: 'Estado', value: <StatusBadge status={projeto.status} /> },
    { label: 'Prioridade', value: <StatusBadge status={projeto.prioridade} label={PRIORIDADE_LABEL[projeto.prioridade]} /> },
    {
      label: 'Início',
      value: new Date(projeto.dataInicio).toLocaleDateString('pt-MZ', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
    },
    {
      label: 'Prazo',
      value: new Date(projeto.dataFimPrevista).toLocaleDateString('pt-MZ', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
    },
    ...(projeto.dataFimReal
      ? [{
          label: 'Conclusão Real',
          value: new Date(projeto.dataFimReal).toLocaleDateString('pt-MZ', {
            day: '2-digit', month: 'long', year: 'numeric',
          }),
        }]
      : []),
    {
      label: 'Progresso',
      value: (
        <span className="flex items-center gap-1 tabular-nums font-medium">
          <TrendingUp className="h-3.5 w-3.5" />
          {projeto.progresso}%
        </span>
      ),
    },
    ...(projeto.orcamentoPlanejado !== null
      ? [{
          label: 'Orçamento',
          value: (
            <span className="font-semibold tabular-nums">
              MT {Number(projeto.orcamentoPlanejado).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
            </span>
          ),
        }]
      : []),
    { label: 'Tarefas', value: <span className="tabular-nums">{projeto._count.tarefas}</span> },
  ];

  // Tab: Marcos
  const tabMarcos = (
    <div className="space-y-3">
      {projeto.marcos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Sem marcos definidos.</p>
      ) : (
        projeto.marcos.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.nome}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {new Date(m.dataPrevista).toLocaleDateString('pt-PT')}
                </p>
              </div>
            </div>
            <StatusBadge status={m.status} />
          </div>
        ))
      )}
    </div>
  );

  // Tab: Equipas
  const tabEquipas = (
    <div className="space-y-3">
      {projeto.equipas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma equipa associada.</p>
      ) : (
        projeto.equipas.map((pe) => (
          <div key={pe.equipaId} className="rounded-lg border p-3">
            <Link
              href={`/projetos/equipa`}
              className="text-sm font-medium hover:underline"
            >
              {pe.equipa.nome}
            </Link>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={projeto.nome}
            description={projeto.descricao ?? TIPO_LABEL[projeto.tipo]}
            breadcrumbs={[
              { label: 'Projectos', href: '/projetos/lista' },
              { label: projeto.codigo },
            ]}
            badge={<StatusBadge status={projeto.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/projetos/lista">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/projetos/lista/${id}/kanban`}>
                    <Kanban className="h-4 w-4 mr-1.5" />
                    Kanban
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/projetos/lista/${id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'marcos',
            label: 'Marcos',
            count: projeto.marcos.length,
            content: tabMarcos,
          },
          {
            key: 'equipas',
            label: 'Equipas',
            count: projeto.equipas.length,
            content: tabEquipas,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
