/**
 * Detalhe de Avaliação — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, Star } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AvaliacaoService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { AvaliacaoAcoes } from '../_components/avaliacao-acoes';

const TIPO_LABEL: Record<string, string> = {
  DESEMPENHO: 'Desempenho',
  COMPETENCIAS: 'Competências',
  GRAU_360: 'Avaliação 360°',
  PROBATORIO: 'Período Probatório',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AvaliacaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let avaliacao;
  try {
    avaliacao = await runWithTenantContext(ctx, () =>
      AvaliacaoService.obter(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!avaliacao) notFound();

  const podeEditar = avaliacao.status === 'PENDENTE' || avaliacao.status === 'EM_ANDAMENTO';

  const metadata = [
    { label: 'Tipo', value: TIPO_LABEL[avaliacao.tipo] ?? avaliacao.tipo },
    { label: 'Período', value: avaliacao.periodo },
    { label: 'Estado', value: <StatusBadge status={avaliacao.status} /> },
    {
      label: 'Início',
      value: new Date(avaliacao.dataInicio).toLocaleDateString('pt-MZ', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
    },
    ...(avaliacao.dataConclusao
      ? [{
          label: 'Conclusão',
          value: new Date(avaliacao.dataConclusao).toLocaleDateString('pt-MZ', {
            day: '2-digit', month: 'long', year: 'numeric',
          }),
        }]
      : []),
    {
      label: 'Avaliado',
      value: <span className="font-medium">{avaliacao.colaborador.nome}</span>,
    },
    {
      label: 'Avaliador',
      value: avaliacao.avaliador.nome,
    },
    ...(avaliacao.notaFinal !== null
      ? [{
          label: 'Nota Final',
          value: (
            <span className="flex items-center gap-1 font-semibold tabular-nums">
              <Star className="h-3.5 w-3.5 text-warning" />
              {Number(avaliacao.notaFinal).toFixed(1)} / 10
            </span>
          ),
        }]
      : []),
  ];

  // Tab: Critérios
  const tabCriterios = (
    <div className="space-y-3">
      {avaliacao.criterios.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Sem critérios definidos.</p>
      ) : (
        avaliacao.criterios.map((c) => (
          <div key={c.id} className="rounded-lg border p-4 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.descricao}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums">{Number(c.nota).toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">peso {Number(c.peso).toFixed(0)}%</p>
              </div>
            </div>
            {c.comentario && (
              <p className="text-xs text-muted-foreground italic border-t pt-1.5">{c.comentario}</p>
            )}
          </div>
        ))
      )}
    </div>
  );

  // Tab: Pontos de desenvolvimento
  const tabDesenvolvimento = (
    <div className="space-y-4">
      {avaliacao.pontosFortes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Pontos Fortes</h4>
          <ul className="list-disc list-inside space-y-1">
            {avaliacao.pontosFortes.map((p, i) => (
              <li key={i} className="text-sm text-muted-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {avaliacao.pontosDesenvolvimento.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Pontos a Desenvolver</h4>
          <ul className="list-disc list-inside space-y-1">
            {avaliacao.pontosDesenvolvimento.map((p, i) => (
              <li key={i} className="text-sm text-muted-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {avaliacao.planoAcao.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Plano de Acção</h4>
          <ul className="list-disc list-inside space-y-1">
            {avaliacao.planoAcao.map((p, i) => (
              <li key={i} className="text-sm text-muted-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {avaliacao.comentarios && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Comentários</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{avaliacao.comentarios}</p>
        </div>
      )}
      {avaliacao.pontosFortes.length === 0 && avaliacao.pontosDesenvolvimento.length === 0 && avaliacao.planoAcao.length === 0 && !avaliacao.comentarios && (
        <p className="text-sm text-muted-foreground py-4 text-center">Sem notas de desenvolvimento preenchidas.</p>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Avaliação — ${avaliacao.colaborador.nome}`}
            description={`${TIPO_LABEL[avaliacao.tipo] ?? avaliacao.tipo} · ${avaliacao.periodo}`}
            breadcrumbs={[
              { label: 'RH', href: '/rh/colaboradores' },
              { label: 'Avaliações', href: '/rh/avaliacoes' },
              { label: avaliacao.colaborador.codigo },
            ]}
            badge={<StatusBadge status={avaliacao.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/rh/avaliacoes">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/rh/avaliacoes/${avaliacao.id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
                <AvaliacaoAcoes id={avaliacao.id} status={avaliacao.status} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'criterios',
            label: 'Critérios',
            count: avaliacao.criterios.length,
            content: tabCriterios,
          },
          {
            key: 'desenvolvimento',
            label: 'Desenvolvimento',
            content: tabDesenvolvimento,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
