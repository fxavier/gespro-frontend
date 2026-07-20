/**
 * Detalhe de Risco — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { RiscoService, classificarSeveridade } from '@/server/services/pessoas-projetos/risco.service';
import { PageHeader, DetailShell } from '@/components/patterns';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pencil, AlertTriangle } from 'lucide-react';

const PROB_LABEL: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', MUITO_ALTA: 'Muito Alta',
};
const IMPACTO_LABEL: Record<string, string> = {
  BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto', MUITO_ALTO: 'Muito Alto',
};
const ESTRATEGIA_LABEL: Record<string, string> = {
  EVITAR: 'Evitar', MITIGAR: 'Mitigar', TRANSFERIR: 'Transferir', ACEITAR: 'Aceitar',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RiscoDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const risco = await runWithTenantContext({ tenantId, userId }, () =>
    RiscoService.obter(id, { tenantId, userId })
  ).catch(() => null);

  if (!risco) notFound();

  const classificacao = classificarSeveridade(risco.severidade);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={risco.titulo}
        description={`Risco do projecto ${risco.projeto.codigo} — ${risco.projeto.nome}`}
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Riscos', href: '/projetos/riscos' },
          { label: risco.titulo },
        ]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/projetos/riscos/${id}/editar`}>
              <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
              Editar
            </Link>
          </Button>
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        {/* Resumo */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              Detalhe do Risco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {risco.descricao && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Descrição</p>
                <p className="text-sm whitespace-pre-wrap">{risco.descricao}</p>
              </div>
            )}
            {risco.planoMitigacao && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Plano de Mitigação</p>
                <p className="text-sm whitespace-pre-wrap">{risco.planoMitigacao}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Metadados */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <div className="mt-1"><StatusBadge status={risco.status as string} /></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Probabilidade</p>
                <p className="text-sm font-medium mt-0.5">{PROB_LABEL[risco.probabilidade as string] ?? risco.probabilidade as string}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Impacto</p>
                <p className="text-sm font-medium mt-0.5">{IMPACTO_LABEL[risco.impacto as string] ?? risco.impacto as string}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Severidade</p>
                <p className="text-sm font-semibold mt-0.5 tabular-nums">
                  {risco.severidade} / 16 — {classificacao}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estratégia</p>
                <p className="text-sm font-medium mt-0.5">{ESTRATEGIA_LABEL[risco.estrategiaResposta as string] ?? risco.estrategiaResposta as string}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Projecto</p>
                <Link
                  href={`/projetos/lista/${risco.projeto.id}`}
                  className="text-sm text-primary hover:underline underline-offset-4 mt-0.5 block"
                >
                  {risco.projeto.codigo} — {risco.projeto.nome}
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Criado em</p>
                <p className="text-sm mt-0.5 tabular-nums">
                  {new Date(risco.createdAt).toLocaleDateString('pt-MZ')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
