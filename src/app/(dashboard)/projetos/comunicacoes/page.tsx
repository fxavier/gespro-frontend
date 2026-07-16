/**
 * Comunicações de Projecto — Server Component.
 * Funcionalidade em desenvolvimento.
 */

import { MessageSquare } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function ComunicacoesPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Comunicações"
        description="Mensagens, reuniões e comunicações de projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Comunicações' },
        ]}
      />
      <EmptyState
        icon={<MessageSquare className="h-8 w-8" />}
        title="Comunicações em breve"
        description="O módulo de comunicações e reuniões de projecto estará disponível brevemente."
      />
    </div>
  );
}
