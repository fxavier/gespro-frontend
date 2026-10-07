/**
 * Nova Nota de Crédito — Server Component.
 * Pré-carrega as 20 facturas creditáveis mais recentes; a partir daí a combobox
 * pesquisa no servidor (#86) — a mesma de /faturacao/nota-credito/nova (sem Dialog). A série não se escolhe (#93):
 * é a activa de NOTA_CREDITO no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { procurarFaturasCreditaveis } from '@/server/services/financas/faturacao.service';
import { rotuloFaturaCreditavel } from '@/lib/documentos/rotulo-fatura';
import { PageHeader } from '@/components/patterns';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';
import { diaIsoMaputo } from '@/lib/format-date';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  // Só facturas com saldo creditável, com o saldo no rótulo (#86, #266).
  let faturas: { value: string; label: string }[] = [];
  try {
    faturas = (await runWithTenantContext(ctx, () => procurarFaturasCreditaveis(undefined, ctx))).map((f) => ({
      value: f.id,
      label: rotuloFaturaCreditavel(f),
    }));
  } catch {
    // Lista vazia: a pesquisa continua a funcionar.
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Crédito"
        description="Emitir nota de crédito por devolução ou correcção de valores"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Crédito', href: '/vendas/notas-credito' },
          { label: 'Nova Nota de Crédito' },
        ]}
      />
      <NovaNotaCreditoForm faturasIniciais={faturas} hoje={diaIsoMaputo()} />
    </div>
  );
}
