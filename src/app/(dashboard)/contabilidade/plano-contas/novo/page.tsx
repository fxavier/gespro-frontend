/**
 * Nova Conta PGC — Server Component.
 *
 * Carrega as contas existentes (para o pai opcional) e delega o formulário
 * ao NovaContaForm (Client Component). Padrão sem modais.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { NovaContaForm, type ContaPaiOption } from './_components/nova-conta-form';

export default async function NovaContaPGCPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const contasPai: ContaPaiOption[] = await runWithTenantContext({ tenantId, userId }, async () => {
    const { items } = await contabilidadeService.listarContas({ take: 200 }, { tenantId, userId });
    return items.map((c: { id: string; codigo: string; nome: string }) => ({
      id: c.id,
      label: `${c.codigo} — ${c.nome}`,
    }));
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

      <NovaContaForm contasPai={contasPai} />
    </div>
  );
}