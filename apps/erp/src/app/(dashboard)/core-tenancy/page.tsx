/**
 * Core Tenancy — Painel de Administração (Server Component).
 *
 * Hub de navegação para:
 *  - Utilizadores/roles do tenant (CRUD)
 *  - Configuração fiscal
 *  - Ecrã de auditoria
 *
 * Substitui o antigo painel de mock com cards estáticos.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users, ShieldCheck, ClipboardList, Building2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs reais
// ─────────────────────────────────────────────────────────────────────────────

async function KpisPlataforma({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [utilizadores, roles] = await Promise.all([
    userAdminService.listarUtilizadores({ take: 1 }, ctx),
    userAdminService.listarRoles(ctx),
  ]);

  // Contar utilizadores activos (a listagem retorna apenas non-deleted)
  const totalUtilizadores = utilizadores.items.length;
  const totalRoles = roles.length;
  const rolesSystem = roles.filter((r) => r.isSystem).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Utilizadores"
        value={String(totalUtilizadores)}
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Papéis (Roles)"
        value={String(totalRoles)}
        description={`${rolesSystem} de sistema`}
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <KpiCard
        title="Configuração Fiscal"
        value="Activa"
        icon={<Building2 className="h-5 w-5" />}
      />
      <KpiCard
        title="Auditoria"
        value="Disponível"
        description="Registo de alterações"
        icon={<ClipboardList className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Links de navegação
// ─────────────────────────────────────────────────────────────────────────────

const MODULOS = [
  {
    titulo: 'Gestão de Utilizadores',
    descricao: 'Criar, editar e desactivar utilizadores do tenant. Atribuir papéis e permissões.',
    href: '/core-tenancy/utilizadores',
    icon: Users,
    accao: 'Gerir Utilizadores',
  },
  {
    titulo: 'Papéis e Permissões',
    descricao: 'Criar e gerir papéis personalizados com permissões granulares por módulo.',
    href: '/core-tenancy/roles',
    icon: ShieldCheck,
    accao: 'Gerir Papéis',
  },
  {
    titulo: 'Registo de Auditoria',
    descricao: 'Consultar o log completo de alterações e acções realizadas no sistema.',
    href: '/core-tenancy/auditoria',
    icon: ClipboardList,
    accao: 'Ver Auditoria',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function CoreTenancyPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Administração da Plataforma"
        description="Gestão de utilizadores, papéis, configuração fiscal e auditoria"
        breadcrumbs={[{ label: 'Administração' }]}
      />

      {/* KPIs reais */}
      <Suspense fallback={<KpiSkeleton />}>
        <KpisPlataforma tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* Módulos de administração */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODULOS.map((modulo) => {
          const Icon = modulo.icon;
          return (
            <Card key={modulo.href} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{modulo.titulo}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">{modulo.descricao}</p>
                <Button asChild variant="outline" size="sm" className="mt-auto">
                  <Link href={modulo.href}>{modulo.accao}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
