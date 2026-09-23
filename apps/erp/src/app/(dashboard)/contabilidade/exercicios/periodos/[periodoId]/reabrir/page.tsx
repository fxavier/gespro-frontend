/**
 * Reabrir período contabilístico — página com formulário de motivo.
 *
 * Reabrir exige motivo escrito (mínimo 10 caracteres) e grava um registo de
 * ReaberturaPeriodo para o trilho de auditoria.
 *
 * Recusa se o apuramento do IVA do período já estiver DECLARADO à AT
 * (ADR-0033 §7, ADR-0034 §7). Esse impedimento é mostrado claramente no
 * servidor, antes de renderizar o formulário.
 *
 * NUNCA 'use client'.
 */

import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { obterApuramento } from '@/server/services/financas/apuramento-iva.service';
import { PageHeader } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { ReabrirPeriodoForm } from './_components/reabrir-periodo-form';

export default async function ReabrirPeriodoPage({
  params,
}: {
  params: Promise<{ periodoId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { periodoId } = await params;
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [periodos, apuramento] = await Promise.all([
    runWithTenantContext(ctx, () =>
      contabilidadeService.listarPeriodos({}, ctx)
    ),
    runWithTenantContext(ctx, () => obterApuramento(periodoId, ctx)),
  ]);

  const periodo = periodos.find((p) => p.id === periodoId);
  if (!periodo) notFound();

  // Verifica se o IVA já está declarado — impede reabertura
  const ivaDeclarado = apuramento?.estado === 'DECLARADO';

  if (ivaDeclarado) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Reabrir período"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Exercícios', href: '/contabilidade/exercicios' },
            { label: `Período ${periodo.codigo}` },
            { label: 'Reabrir' },
          ]}
        />
        <div className="max-w-2xl rounded-lg border border-destructive/40 bg-destructive/10 p-5 flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div className="space-y-2">
            <p className="font-medium text-destructive">
              Período trancado — IVA declarado à AT
            </p>
            <p className="text-sm text-muted-foreground">
              O apuramento do IVA do período {periodo.codigo} foi declarado à
              Autoridade Tributária (referência:{' '}
              {apuramento?.referenciaEntrega ?? 'n/d'}). A reabertura não é
              possível.
            </p>
            <p className="text-sm text-muted-foreground">
              Reabrir um período já declarado poria o razão em desacordo
              permanente com uma entrega feita ao Estado. Para corrigir,
              registe as regularizações nas contas 44341/44342 do período
              seguinte (ADR-0034 §7).
            </p>
            <div className="flex gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <Link href="/contabilidade/exercicios">Voltar a Exercícios</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/contabilidade/iva/${periodoId}`}>
                  Ver apuramento de IVA
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (periodo.estado !== 'FECHADO') {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Reabrir período"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Exercícios', href: '/contabilidade/exercicios' },
            { label: `Período ${periodo.codigo}` },
            { label: 'Reabrir' },
          ]}
        />
        <div className="max-w-2xl rounded-lg border border-muted bg-muted/20 p-5">
          <p className="font-medium">Período não está fechado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Só é possível reabrir um período que esteja fechado. O período{' '}
            {periodo.codigo} está no estado {periodo.estado}.
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link href="/contabilidade/exercicios">Voltar a Exercícios</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reabrir período"
        description={`Reabrir o período ${periodo.codigo} para permitir novos lançamentos`}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Exercícios', href: '/contabilidade/exercicios' },
          { label: `Período ${periodo.codigo}` },
          { label: 'Reabrir' },
        ]}
      />
      <ReabrirPeriodoForm periodoId={periodoId} periodoCodigo={periodo.codigo} />
    </div>
  );
}
