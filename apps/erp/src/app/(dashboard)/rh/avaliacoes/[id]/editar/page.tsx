/**
 * Editar Avaliação — Server Component.
 *
 * Carrega os dados via AvaliacaoService e passa ao formulário cliente.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AvaliacaoService } from '@/server/services/pessoas-projetos/rh.service';
import { PageHeader } from '@/components/patterns';
import { EditarAvaliacaoForm } from './_components/editar-avaliacao-form';

const TIPO_LABEL: Record<string, string> = {
  DESEMPENHO: 'Desempenho',
  COMPETENCIAS: 'Competências',
  GRAU_360: 'Avaliação 360°',
  PROBATORIO: 'Período Probatório',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarAvaliacaoPage({ params }: Props) {
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

  // Apenas avaliações pendentes ou em andamento podem ser editadas
  if (avaliacao.status === 'CONCLUIDA' || avaliacao.status === 'CANCELADA') {
    redirect(`/rh/avaliacoes/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Avaliação"
        description={`${TIPO_LABEL[avaliacao.tipo] ?? avaliacao.tipo} — ${avaliacao.colaborador.nome} · ${avaliacao.periodo}`}
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Avaliações', href: '/rh/avaliacoes' },
          { label: avaliacao.colaborador.codigo, href: `/rh/avaliacoes/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarAvaliacaoForm
        id={id}
        defaultValues={{
          criterios: avaliacao.criterios.map((c) => ({
            nome: c.nome,
            descricao: c.descricao,
            peso: c.peso.toString(),
            nota: c.nota.toString(),
            comentario: c.comentario,
          })),
          pontosFortes: avaliacao.pontosFortes,
          pontosDesenvolvimento: avaliacao.pontosDesenvolvimento,
          planoAcao: avaliacao.planoAcao,
          comentarios: avaliacao.comentarios,
        }}
      />
    </div>
  );
}
