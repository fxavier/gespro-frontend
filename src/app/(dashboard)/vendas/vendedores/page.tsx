/**
 * Vendedores — Server Component.
 * Vendedores são utilizadores com permissão 'vendas:criar'.
 * A sua criação e gestão é feita no módulo RH/Utilizadores.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function VendedoresPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Vendedores"
        description="Consulte os vendedores activos e o seu desempenho"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Vendedores' },
        ]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/vendas/comissoes">
              Ver Comissões
            </Link>
          </Button>
        }
      />

      <EmptyState
        icon={<Users className="h-10 w-10" />}
        title="Gestão de vendedores no módulo RH"
        description="Os vendedores são utilizadores com a permissão 'vendas:criar'. Crie e gira os utilizadores no módulo de Recursos Humanos."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/rh">
              <ExternalLink className="h-4 w-4 mr-2" />
              Ir para RH
            </Link>
          </Button>
        }
      />
    </div>
  );
}
