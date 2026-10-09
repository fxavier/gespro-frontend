/**
 * Novo Orçamento de Projecto — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { NovoOrcamentoProjetoForm } from './_components/novo-orcamento-projeto-form';

export default async function NovoOrcamentoProjetoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // Primeira página do `ComboboxRemoto` de projecto (#265); o resto vem da pesquisa.
  const projetos = await runWithTenantContext(ctx, () => ProjetoService.listar({ take: 50 }, ctx));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Orçamento"
        description="Defina as categorias e valores planeados do projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos' },
          { label: 'Orçamento', href: '/projetos/orcamento' },
          { label: 'Novo' },
        ]}
      />
      <NovoOrcamentoProjetoForm
        opcoesProjeto={projetos.items.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }))}
      />
    </div>
  );
}
