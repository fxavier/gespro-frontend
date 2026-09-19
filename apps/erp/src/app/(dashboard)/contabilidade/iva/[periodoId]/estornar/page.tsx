/**
 * Estornar apuramento de IVA — formulário com motivo.
 *
 * Estornar cancela o apuramento activo e permite criar uma nova versão.
 * Exige motivo mínimo de 10 caracteres (schema impõe-o).
 * Só funciona se o apuramento não estiver DECLARADO — nesse caso é rota que
 * mostra esse impedimento claramente.
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
import { AlertTriangle } from 'lucide-react';
import { EstornarApuramentoForm } from './_components/estornar-apuramento-form';

export default async function EstornarApuramentoPage({
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

  // Se não há apuramento activo ou já está declarado, mostra aviso
  if (!apuramento) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Estornar apuramento"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Apuramento de IVA', href: '/contabilidade/iva' },
            { label: periodo.codigo, href: `/contabilidade/iva/${periodoId}` },
            { label: 'Estornar' },
          ]}
        />
        <div className="max-w-2xl rounded-lg border border-muted bg-muted/20 p-5 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="space-y-2">
            <p className="font-medium">Sem apuramento activo</p>
            <p className="text-sm text-muted-foreground">
              O período {periodo.codigo} não tem nenhum apuramento no estado APURADO.
              Só é possível estornar um apuramento activo.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/contabilidade/iva/${periodoId}`}>Voltar ao detalhe</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (apuramento.estado === 'DECLARADO') {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Estornar apuramento"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Apuramento de IVA', href: '/contabilidade/iva' },
            { label: periodo.codigo, href: `/contabilidade/iva/${periodoId}` },
            { label: 'Estornar' },
          ]}
        />
        <div className="max-w-2xl rounded-lg border border-destructive/40 bg-destructive/10 p-5 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div className="space-y-2">
            <p className="font-medium text-destructive">Apuramento já declarado à AT</p>
            <p className="text-sm text-muted-foreground">
              O apuramento do período {periodo.codigo} já foi declarado à Autoridade Tributária
              (referência: {apuramento.referenciaEntrega ?? 'n/d'}). Não é possível estorná-lo.
            </p>
            <p className="text-sm text-muted-foreground">
              Para corrigir um apuramento já declarado, a correcção tem de ser uma regularização
              nas contas 44341/44342 do período seguinte — é o que a Declaração Periódica prevê
              (ADR-0034 §7).
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/contabilidade/iva/${periodoId}`}>Voltar ao detalhe</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Estornar apuramento"
        description={`Cancelar o apuramento v${apuramento.versao} do período ${periodo.codigo} e permitir novo cálculo`}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Apuramento de IVA', href: '/contabilidade/iva' },
          { label: periodo.codigo, href: `/contabilidade/iva/${periodoId}` },
          { label: 'Estornar' },
        ]}
      />
      <EstornarApuramentoForm
        apuramentoId={apuramento.id}
        versao={apuramento.versao}
        periodoCodigo={periodo.codigo}
        periodoId={periodoId}
      />
    </div>
  );
}
