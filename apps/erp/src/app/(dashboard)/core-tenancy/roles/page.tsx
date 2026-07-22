/**
 * Listagem de Papéis (Roles) — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { RolesTable } from './_components/roles-table';
import { Skeleton } from '@/components/ui/skeleton';

function TableSkeleton() {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center h-10 px-4 gap-4 border-b bg-muted/30">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-24" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center h-11 px-4 gap-4 border-b last:border-0">
          {[1, 2, 3, 4].map((j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

async function RolesTableSection({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const roles = await userAdminService.listarRoles({ tenantId, userId });

  return <RolesTable data={roles} />;
}

export default async function RolesPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Papéis e Permissões"
        description="Gerir os papéis e as permissões dos utilizadores do tenant"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Papéis' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/core-tenancy/roles/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Papel
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton />}>
        <RolesTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
