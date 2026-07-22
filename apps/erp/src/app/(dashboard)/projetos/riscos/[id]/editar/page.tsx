/**
 * Editar Risco — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { RiscoService } from '@/server/services/pessoas-projetos/risco.service';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { EditarRiscoForm } from './_components/editar-risco-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarRiscoPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const [risco, { items: projetos }] = await Promise.all([
    runWithTenantContext({ tenantId, userId }, () =>
      RiscoService.obter(id, { tenantId, userId })
    ).catch(() => null),
    runWithTenantContext({ tenantId, userId }, () =>
      ProjetoService.listar({ take: 100 }, { tenantId, userId })
    ),
  ]);

  if (!risco) notFound();

  const projetosOpcoes = (projetos as Array<{ id: string; codigo: string; nome: string }>).map((p) => ({
    id: p.id,
    label: `${p.codigo} — ${p.nome}`,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Risco"
        description={risco.titulo}
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Riscos', href: '/projetos/riscos' },
          { label: risco.titulo, href: `/projetos/riscos/${id}` },
          { label: 'Editar' },
        ]}
      />
      <EditarRiscoForm
        id={id}
        risco={{
          projetoId: risco.projetoId,
          titulo: risco.titulo,
          descricao: risco.descricao ?? undefined,
          probabilidade: risco.probabilidade as string,
          impacto: risco.impacto as string,
          estrategiaResposta: risco.estrategiaResposta as string,
          planoMitigacao: risco.planoMitigacao ?? undefined,
        }}
        projetos={projetosOpcoes}
      />
    </div>
  );
}
