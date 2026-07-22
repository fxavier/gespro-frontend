/**
 * Editar Conta Bancária — Server Component. saldoAtual não é editável.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { ContaBancariaForm, type ContaPGCOption } from '../../_components/conta-bancaria-form';

export default async function EditarContaBancariaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const { conta, contasPGC } = await runWithTenantContext(ctx, async () => {
    const conta = await contabilidadeService.obterContaBancaria(id, ctx);
    const page = await contabilidadeService.listarContas(
      { classe: 'CLASSE_1', aceitaLancamento: true, ativo: true, take: 200 },
      ctx,
    );
    const contasPGC: ContaPGCOption[] = page.items.map((c) => ({
      id: c.id,
      label: `${c.codigo} · ${c.nome}`,
    }));
    return { conta, contasPGC };
  });
  if (!conta) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${conta.banco} — ${conta.numeroConta}`}
        description="Actualizar dados da conta bancária (saldo é derivado dos movimentos)"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Contas Bancárias', href: '/contabilidade/contas-bancarias' },
          { label: 'Editar' },
        ]}
      />
      <ContaBancariaForm
        contasPGC={contasPGC}
        contaId={conta.id}
        valoresIniciais={{
          banco: conta.banco,
          agencia: conta.agencia,
          numeroConta: conta.numeroConta,
          tipoConta: conta.tipoConta,
          moeda: conta.moeda,
          contaContabilId: conta.contaContabilId,
        }}
      />
    </div>
  );
}
