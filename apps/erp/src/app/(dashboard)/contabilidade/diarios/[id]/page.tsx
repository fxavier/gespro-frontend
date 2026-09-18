/**
 * Detalhe de Diário Contabilístico — Server Component.
 *
 * Um diário é uma entidade de configuração (código, nome, natureza, estado):
 * o detalhe mostra esses campos e encaminha para os lançamentos que lhe
 * pertencem — a listagem de lançamentos já filtra por `diarioId`, por isso
 * não se duplica aqui a tabela.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Edit, ListTree } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { TIPO_DIARIO_LABEL } from '../_components/tipos';

const formatarData = (d: Date) =>
  new Intl.DateTimeFormat('pt-MZ', { dateStyle: 'long', timeStyle: 'short' }).format(d);

export default async function DiarioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const { diario, totalLancamentos } = await runWithTenantContext(ctx, async () => {
    const diario = await contabilidadeService.obterDiario(id, ctx);
    if (!diario) return { diario: null, totalLancamentos: 0 };
    return {
      diario,
      totalLancamentos: await contabilidadeService.contarLancamentosDoDiario(diario.id, ctx),
    };
  });
  if (!diario) notFound();

  const campos: { label: string; value: React.ReactNode }[] = [
    { label: 'Código', value: <span className="font-mono">{diario.codigo}</span> },
    { label: 'Nome', value: diario.nome },
    { label: 'Natureza', value: TIPO_DIARIO_LABEL[diario.tipo] ?? diario.tipo },
    { label: 'Estado', value: <StatusBadge status={diario.ativo ? 'ATIVO' : 'INATIVO'} /> },
    { label: 'Lançamentos', value: totalLancamentos.toLocaleString('pt-MZ') },
    { label: 'Criado em', value: formatarData(diario.createdAt) },
    { label: 'Actualizado em', value: formatarData(diario.updatedAt) },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`${diario.codigo} — ${diario.nome}`}
        description="Diário contabilístico"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Diários', href: '/contabilidade/diarios' },
          { label: diario.codigo },
        ]}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/contabilidade/lancamentos?diarioId=${diario.id}`}>
                <ListTree className="h-4 w-4 mr-2" />
                Ver lançamentos
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/contabilidade/diarios/${diario.id}/editar`}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map((campo) => (
              <div key={campo.label} className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {campo.label}
                </dt>
                <dd className="text-sm font-medium">{campo.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
