/**
 * Novo Registo de Qualidade — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { NovoQualidadeForm } from './_components/novo-qualidade-form';

export default async function NovoQualidadePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { items: projetos } = await runWithTenantContext({ tenantId, userId }, () =>
    ProjetoService.listar({ take: 100 }, { tenantId, userId })
  );

  const projetosOpcoes = (projetos as Array<{ id: string; codigo: string; nome: string }>).map((p) => ({
    id: p.id,
    label: `${p.codigo} — ${p.nome}`,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Registo de Qualidade"
        description="Registe uma não-conformidade, inspecção ou auditoria"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Qualidade', href: '/projetos/qualidade' },
          { label: 'Novo Registo' },
        ]}
      />
      <NovoQualidadeForm projetos={projetosOpcoes} />
    </div>
  );
}
