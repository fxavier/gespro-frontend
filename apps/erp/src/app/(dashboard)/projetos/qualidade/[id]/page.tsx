/**
 * Detalhe de Registo de Qualidade — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { QualidadeService } from '@/server/services/pessoas-projetos/qualidade.service';
import { PageHeader } from '@/components/patterns';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

const TIPO_LABEL: Record<string, string> = {
  NAO_CONFORMIDADE: 'Não Conformidade',
  INSPECAO: 'Inspeção',
  AUDITORIA: 'Auditoria',
  REVISAO: 'Revisão',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QualidadeDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const registo = await runWithTenantContext({ tenantId, userId }, () =>
    QualidadeService.obter(id, { tenantId, userId })
  ).catch(() => null);

  if (!registo) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={TIPO_LABEL[registo.tipo as string] ?? registo.tipo as string}
        description={`Registo de qualidade do projecto ${registo.projeto.codigo}`}
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Qualidade', href: '/projetos/qualidade' },
          { label: TIPO_LABEL[registo.tipo as string] ?? registo.tipo as string },
        ]}
      />

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-info" aria-hidden="true" />
              Detalhe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Descrição</p>
              <p className="text-sm whitespace-pre-wrap">{registo.descricao}</p>
            </div>
            {registo.acaoCorretiva && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Acção Correctiva</p>
                <p className="text-sm whitespace-pre-wrap">{registo.acaoCorretiva}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <div className="mt-1"><StatusBadge status={registo.status as string} /></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <p className="text-sm font-medium mt-0.5">{TIPO_LABEL[registo.tipo as string]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Projecto</p>
                <Link
                  href={`/projetos/lista/${registo.projeto.id}`}
                  className="text-sm text-primary hover:underline underline-offset-4 mt-0.5 block"
                >
                  {registo.projeto.codigo} — {registo.projeto.nome}
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Criado em</p>
                <p className="text-sm mt-0.5 tabular-nums">
                  {new Date(registo.createdAt).toLocaleDateString('pt-MZ')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
