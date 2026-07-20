/**
 * Detalhe de Comunicação — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ComunicacaoService } from '@/server/services/pessoas-projetos/comunicacao.service';
import { PageHeader } from '@/components/patterns';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Users } from 'lucide-react';

const TIPO_LABEL: Record<string, string> = {
  REUNIAO: 'Reunião', ATA: 'Ata', DECISAO: 'Decisão', ANUNCIO: 'Anúncio', RELATORIO: 'Relatório',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ComunicacaoDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const comunicacao = await runWithTenantContext({ tenantId, userId }, () =>
    ComunicacaoService.obter(id, { tenantId, userId })
  ).catch(() => null);

  if (!comunicacao) notFound();

  const tipo = TIPO_LABEL[comunicacao.tipo as string] ?? comunicacao.tipo as string;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={tipo}
        description={`${new Date(comunicacao.data).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' })} — ${comunicacao.projeto.nome}`}
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Comunicações', href: '/projetos/comunicacoes' },
          { label: tipo },
        ]}
      />

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-info" aria-hidden="true" />
              Resumo / Ata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{comunicacao.resumo}</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <div className="mt-1"><StatusBadge status={comunicacao.tipo as string} label={tipo} /></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data</p>
                <p className="text-sm mt-0.5 tabular-nums">
                  {new Date(comunicacao.data).toLocaleDateString('pt-MZ')}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Projecto</p>
                <Link
                  href={`/projetos/lista/${comunicacao.projeto.id}`}
                  className="text-sm text-primary hover:underline underline-offset-4 mt-0.5 block"
                >
                  {comunicacao.projeto.codigo} — {comunicacao.projeto.nome}
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  Participantes ({comunicacao.participantes.length})
                </p>
                <ul className="space-y-0.5">
                  {comunicacao.participantes.map((p, i) => (
                    <li key={i} className="text-sm">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registado em</p>
                <p className="text-sm mt-0.5 tabular-nums">
                  {new Date(comunicacao.createdAt).toLocaleDateString('pt-MZ')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
