/**
 * Nova Fatura Proforma — Server Component shell.
 * A série não se escolhe (#93): é a activa do tipo no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaProformaForm } from './_components/nova-proforma-form';
import { diaIsoMaputo } from '@/lib/format-date';
import { clientesIniciais } from '../../_components/clientes-iniciais';

export default async function NovaProformaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const clientes = await clientesIniciais({ tenantId: session.user.tenantId, userId: session.user.id });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Fatura Proforma"
        description="Documento pró-forma para o cliente"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Proformas', href: '/faturacao/proforma' },
          { label: 'Nova Proforma' },
        ]}
      />
      <NovaProformaForm hoje={diaIsoMaputo()} clientesIniciais={clientes} />
    </div>
  );
}
