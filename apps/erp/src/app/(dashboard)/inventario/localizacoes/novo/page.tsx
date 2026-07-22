/**
 * Nova Localização — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaLocalizacaoForm } from '../_components/nova-localizacao-form';

export default async function NovaLocalizacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Localização"
        description="Registe uma nova localização para armazenar ativos e stock"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Localizações', href: '/inventario/localizacoes' },
          { label: 'Nova Localização' },
        ]}
      />

      <NovaLocalizacaoForm />
    </div>
  );
}
