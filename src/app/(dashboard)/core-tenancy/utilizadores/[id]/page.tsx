/**
 * Detalhe de Utilizador — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, Mail, Shield } from 'lucide-react';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { NotFoundError } from '@/lib/errors';
import { Badge } from '@/components/ui/badge';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function UtilizadorDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let utilizador;
  try {
    utilizador = await userAdminService.obterUtilizador(id, ctx);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const metadata = [
    {
      label: 'Email',
      value: (
        <span className="flex items-center gap-1">
          <Mail className="h-3.5 w-3.5" />
          {utilizador.email}
        </span>
      ),
    },
    {
      label: 'Estado',
      value: (
        <StatusBadge
          status={utilizador.ativo ? 'ATIVO' : 'INATIVO'}
          label={utilizador.ativo ? 'Activo' : 'Inactivo'}
        />
      ),
    },
    {
      label: 'Papéis',
      value: <span className="tabular-nums font-semibold">{utilizador.roles.length}</span>,
    },
    {
      label: 'Permissões',
      value: <span className="tabular-nums">{utilizador.permissoes.length}</span>,
    },
    {
      label: 'Criado em',
      value: new Date(utilizador.createdAt).toLocaleDateString('pt-MZ', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
    },
  ];

  // Tab: Papéis
  const tabPapeis = (
    <div className="space-y-3">
      {utilizador.roles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum papel atribuído.</p>
      ) : (
        utilizador.roles.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <Link href={`/core-tenancy/roles/${r.id}`} className="text-sm font-medium hover:underline">
                  {r.nome}
                </Link>
                {r.descricao && (
                  <p className="text-xs text-muted-foreground truncate">{r.descricao}</p>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">
              {r.permissions.length} permissões
            </Badge>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={utilizador.nome}
            description={utilizador.email}
            breadcrumbs={[
              { label: 'Administração', href: '/core-tenancy' },
              { label: 'Utilizadores', href: '/core-tenancy/utilizadores' },
              { label: utilizador.nome },
            ]}
            badge={
              <StatusBadge
                status={utilizador.ativo ? 'ATIVO' : 'INATIVO'}
                label={utilizador.ativo ? 'Activo' : 'Inactivo'}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/core-tenancy/utilizadores">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/core-tenancy/utilizadores/${id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'papeis',
            label: 'Papéis',
            count: utilizador.roles.length,
            content: tabPapeis,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
