/**
 * Nova Conta PGC — Server Component.
 *
 * Carrega as contas existentes (para a conta mãe opcional) e delega o formulário
 * ao ContaForm (Client Component). Padrão sem modais.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { ContaForm } from '../_components/conta-form';

export default async function NovaContaPGCPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const opcoesIniciais = await runWithTenantContext({ tenantId, userId }, async () => {
    const { items } = await contabilidadeService.listarContas({ take: 50 }, { tenantId, userId });
    return items.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }));
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Conta PGC"
        description="Registe uma conta do plano de contas (PGC-NIRF)"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Plano de Contas', href: '/contabilidade/plano-contas' },
          { label: 'Nova Conta' },
        ]}
      />

      <ContaForm opcoesIniciais={opcoesIniciais} />
    </div>
  );
}