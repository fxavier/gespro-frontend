/**
 * Preferências de Notificação — Server Component (NUNCA 'use client').
 *
 * Permite ao utilizador configurar os canais activos (in-app, email) por tipo
 * de notificação. Sem modais — página dedicada.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { PreferenciasForm } from './_components/preferencias-form';

// ─────────────────────────────────────────────────────────────────────────────
// Secção de preferências
// ─────────────────────────────────────────────────────────────────────────────

async function PreferenciasSection({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const preferencias = await runWithTenantContext({ tenantId, userId }, () =>
    notificacaoService.obterPreferencias({ tenantId, userId }),
  );

  return <PreferenciasForm preferencias={preferencias} />;
}

function PreferenciasSkeleton() {
  return (
    <div className="divide-y divide-border animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
          <div className="flex gap-4">
            <div className="h-5 w-16 bg-muted rounded" />
            <div className="h-5 w-16 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

export default async function PreferenciasNotificacoesPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Preferências de Notificação"
        description="Configure os canais de entrega para cada tipo de notificação"
        breadcrumbs={[
          { label: 'Notificações', href: '/notificacoes' },
          { label: 'Preferências' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/notificacoes">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="rounded-lg border bg-card shadow-sm">
        {/* Cabeçalho da tabela */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground">Tipo de Notificação</span>
          <div className="flex gap-6 text-sm font-medium text-muted-foreground">
            <span className="w-16 text-center">In-App</span>
            <span className="w-16 text-center">Email</span>
          </div>
        </div>

        {/* Preferências */}
        <div className="p-4">
          <Suspense fallback={<PreferenciasSkeleton />}>
            <PreferenciasSection tenantId={tenantId} userId={userId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
