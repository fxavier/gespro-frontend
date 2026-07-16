/**
 * Categorias de Tickets — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Tag, Clock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { categoriaTicketService } from '@/server/services/operacoes/ticket.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

async function CategoriasList({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const categorias = await runWithTenantContext(ctx, () =>
    categoriaTicketService.listarCategorias(ctx)
  );

  if (categorias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        Sem categorias configuradas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {categorias.map((cat) => (
        <Card key={cat.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{cat.nome}</p>
                  {cat.descricao && (
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.descricao}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right text-xs text-muted-foreground">
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Resp.: {Math.round(cat.slaTempoResposta / 60)}h
                  </p>
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Res.: {Math.round(cat.slaTempoResolucao / 60)}h
                  </p>
                </div>
                <Badge variant={cat.ativa ? 'default' : 'secondary'}>
                  {cat.ativa ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function CategoriasTicketPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Categorias de Tickets"
        description="Configuração de categorias e SLA por categoria"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Categorias' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/tickets/categorias/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<ListSkeleton />}>
        <CategoriasList tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
