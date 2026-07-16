/**
 * Cronograma de Projectos — Server Component.
 * Redireciona para marcos ou mostra vista Gantt (em breve).
 */

import { CalendarDays } from 'lucide-react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function CronogramaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cronograma"
        description="Vista de Gantt e linha de tempo dos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Cronograma' },
        ]}
      />
      <EmptyState
        icon={<CalendarDays className="h-8 w-8" />}
        title="Vista de Gantt em breve"
        description="A vista de cronograma com diagrama de Gantt estará disponível brevemente. Pode consultar os marcos dos projectos enquanto isso."
        action={
          <Button variant="outline" asChild>
            <Link href="/projetos/marcos">Ver Marcos</Link>
          </Button>
        }
      />
    </div>
  );
}
