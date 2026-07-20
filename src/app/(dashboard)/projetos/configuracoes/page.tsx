/**
 * Configurações de Projectos — Server Component.
 * Permite configurar política de timesheet, tipos de tarefa e papéis de equipa
 * por projecto. Usa FormPage com configuração persistida na DB.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Settings, FolderKanban } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ConfiguracaoProjetoService } from '@/server/services/pessoas-projetos/configuracao-projeto.service';
import { PageHeader } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfiguracaoForm } from './_components/configuracao-form';

async function ConfiguracaoSection({
  projetoId,
  tenantId,
  userId,
}: {
  projetoId: string;
  tenantId: string;
  userId: string;
}) {
  const config = await runWithTenantContext({ tenantId, userId }, () =>
    ConfiguracaoProjetoService.obter(projetoId, { tenantId, userId })
  );

  return (
    <ConfiguracaoForm
      projetoId={projetoId}
      configuracao={{
        politicaAprovacaoTimesheet: config.politicaAprovacaoTimesheet,
        tiposTarefaAtivos: config.tiposTarefaAtivos,
        papeisEquipaAtivos: config.papeisEquipaAtivos,
        observacoes: config.observacoes,
      }}
    />
  );
}

async function ListaProjetosConfigSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const projetos = await runWithTenantContext({ tenantId, userId }, () =>
    ConfiguracaoProjetoService.listarProjetos({ tenantId, userId })
  );

  if (projetos.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
        <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Nenhum projecto activo.{' '}
          <Link href="/projetos/lista/novo" className="text-primary hover:underline underline-offset-4">
            Criar projecto
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projetos.map((p) => (
        <Link
          key={p.id}
          href={`/projetos/configuracoes?projeto=${p.id}`}
          className="rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-muted/20 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <Settings className="h-4 w-4 text-muted-foreground mt-0.5 group-hover:text-primary transition-colors" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                {p.nome}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{p.codigo}</p>
              {p.configuracao && (
                <p className="text-xs text-muted-foreground mt-1">
                  Aprovação: {p.configuracao.politicaAprovacaoTimesheet === 'AUTOMATICA' ? 'Automática' : 'Manual'}
                </p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConfiguracoesProjetosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const params = await searchParams;
  const projetoId = typeof params.projeto === 'string' ? params.projeto : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Configurações"
        description="Configurações por projecto: política de aprovação, tipos de tarefa e papéis"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Configurações' },
        ]}
      />

      {projetoId ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Link
              href="/projetos/configuracoes"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Todos os projectos
            </Link>
          </div>
          <Suspense
            key={projetoId}
            fallback={<Skeleton className="h-64 w-full" />}
          >
            <ConfiguracaoSection projetoId={projetoId} tenantId={tenantId} userId={userId} />
          </Suspense>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Seleccione um projecto para editar as suas configurações.
          </p>
          <Suspense
            fallback={
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
              </div>
            }
          >
            <ListaProjetosConfigSection tenantId={tenantId} userId={userId} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
