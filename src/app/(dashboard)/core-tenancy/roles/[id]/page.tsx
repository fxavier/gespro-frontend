/**
 * Detalhe de Papel (Role) — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { Button } from '@/components/ui/button';
import { PageHeader, DetailShell } from '@/components/patterns';
import { NotFoundError } from '@/lib/errors';
import { Badge } from '@/components/ui/badge';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoleDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let role;
  try {
    role = await userAdminService.obterRole(id, ctx);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const metadata = [
    { label: 'Nome', value: <span className="font-medium">{role.nome}</span> },
    ...(role.descricao ? [{ label: 'Descrição', value: role.descricao }] : []),
    {
      label: 'Permissões',
      value: <span className="tabular-nums font-semibold">{role.permissions.length}</span>,
    },
    ...(role.isSystem
      ? [{ label: 'Tipo', value: <span className="text-muted-foreground text-sm">Papel de sistema (não editável)</span> }]
      : []),
  ];

  // Agrupar permissões por módulo (prefixo antes de ':')
  const permsByModule: Record<string, string[]> = {};
  for (const p of role.permissions) {
    const mod = p.code.split(':')[0] ?? 'geral';
    permsByModule[mod] = [...(permsByModule[mod] ?? []), p.code];
  }

  const tabPermissoes = (
    <div className="space-y-4">
      {Object.entries(permsByModule).sort(([a], [b]) => a.localeCompare(b)).map(([mod, perms]) => (
        <div key={mod}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {mod}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {perms.sort().map((p) => (
              <Badge key={p} variant="secondary" className="text-xs font-mono">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      ))}
      {role.permissions.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma permissão atribuída.</p>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={role.nome}
            description={role.descricao ?? 'Papel de acesso'}
            breadcrumbs={[
              { label: 'Administração', href: '/core-tenancy' },
              { label: 'Papéis', href: '/core-tenancy/roles' },
              { label: role.nome },
            ]}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/core-tenancy/roles">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {!role.isSystem && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/core-tenancy/roles/${id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'permissoes',
            label: 'Permissões',
            count: role.permissions.length,
            content: tabPermissoes,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
