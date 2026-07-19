/**
 * Nova Conta Bancária — Server Component. Formulário em componente-folha.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { ContaBancariaForm, type ContaPGCOption } from '../_components/conta-bancaria-form';

export default async function NovaContaBancariaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const contasPGC: ContaPGCOption[] = await runWithTenantContext(ctx, async () => {
    const page = await contabilidadeService.listarContas(
      { classe: 'CLASSE_1', aceitaLancamento: true, ativo: true, take: 200 },
      ctx,
    );
    return page.items.map((c) => ({ id: c.id, label: `${c.codigo} · ${c.nome}` }));
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Conta Bancária"
        description="Conta bancária ligada a uma conta folha do PGC (classe 1)"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Contas Bancárias', href: '/contabilidade/contas-bancarias' },
          { label: 'Nova Conta' },
        ]}
      />
      <ContaBancariaForm contasPGC={contasPGC} />
    </div>
  );
}
