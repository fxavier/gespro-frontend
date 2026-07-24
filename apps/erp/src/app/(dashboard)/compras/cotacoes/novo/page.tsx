/**
 * Nova Cotação (RFQ) — Server Component shell.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaCotacaoForm } from './_components/nova-cotacao-form';

export default async function NovaCotacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Cotação"
        description="Pedido de cotação (RFQ) a fornecedores"
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Cotações', href: '/compras/cotacoes' },
          { label: 'Nova Cotação' },
        ]}
      />
      <NovaCotacaoForm />
    </div>
  );
}
