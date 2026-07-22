/**
 * Criar Novo Risco — Server Component.
 * Carrega a lista de projectos para o selector e renderiza o formulário.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { NovoRiscoForm } from './_components/novo-risco-form';

export default async function NovoRiscoPage() {
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
        title="Novo Risco"
        description="Registe um novo risco de projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Riscos', href: '/projetos/riscos' },
          { label: 'Novo Risco' },
        ]}
      />
      <NovoRiscoForm projetos={projetosOpcoes} />
    </div>
  );
}
