/**
 * Nova Reconciliação Bancária — Server Component.
 *
 * Carrega as contas bancárias e delega o formulário interactivo ao
 * NovaReconciliacaoForm (Client Component). Padrão sem modais.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { NovaReconciliacaoForm, type ContaOption } from './_components/nova-reconciliacao-form';

export default async function NovaReconciliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ contaBancariaId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { contaBancariaId } = await searchParams;

  const contas: ContaOption[] = await runWithTenantContext({ tenantId, userId }, async () => {
    const rows = await contabilidadeService.listarContasBancarias({ tenantId, userId });
    return rows.map((c: { id: string; banco: string; numeroConta: string }) => ({
      id: c.id,
      label: `${c.banco} — ${c.numeroConta}`,
    }));
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Reconciliação Bancária"
        description="Confronte o extracto do banco com o razão contabilístico do período"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: 'Nova Reconciliação' },
        ]}
      />

      {contas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Não existem contas bancárias configuradas. Configure uma conta antes de iniciar uma
            reconciliação.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/contabilidade/reconciliacao">Voltar</Link>
          </Button>
        </div>
      ) : (
        <NovaReconciliacaoForm contas={contas} contaBancariaIdInicial={contaBancariaId} />
      )}
    </div>
  );
}