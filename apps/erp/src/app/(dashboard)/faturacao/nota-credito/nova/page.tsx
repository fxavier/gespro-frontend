/**
 * Nova Nota de Crédito — Server Component shell.
 * A série não se escolhe (#93): é a activa do tipo no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';
import { diaIsoMaputo } from '@/lib/format-date';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { procurarFaturasCreditaveis } from '@/server/services/financas/faturacao.service';
import { rotuloFaturaCreditavel } from '@/lib/documentos/rotulo-fatura';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // As 20 mais recentes; a partir daí a combobox pesquisa no servidor.
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
        description="Emissão de nota de crédito sobre factura"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Notas de Crédito', href: '/faturacao/nota-credito' },
          { label: 'Nova Nota de Crédito' },
        ]}
      />
      <NovaNotaCreditoForm hoje={diaIsoMaputo()} faturasIniciais={faturas} />
    </div>
  );
}
