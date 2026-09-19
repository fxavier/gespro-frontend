/**
 * Configurações de Contabilidade — Server Component shell.
 *
 * Dois defeitos corrigidos face à versão anterior:
 * 1. Verificação de permissão `financas:configurar` (não só de sessão).
 * 2. Formulário ligado às actions reais — o estado inicial é carregado aqui
 *    e passado ao Client Component como `initialData`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { CalendarioForm } from './_components/calendario-form';

export default async function ConfiguracoesContabilidadePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;

  if (!permissions.includes('financas:configurar')) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Configurações de Contabilidade"
          description="Regime contabilístico, exercício fiscal e contas padrão"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Configurações' },
          ]}
        />
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          <p className="font-medium text-destructive">Acesso não autorizado</p>
          <p className="mt-1 text-muted-foreground">
            Não tem permissão para aceder às configurações de contabilidade. Contacte o
            administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const ctx = { tenantId, userId };
  const calendario = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterCalendarioContabilistico(ctx)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Configurações de Contabilidade"
        description="Calendário de abertura de exercícios e fecho automático de períodos"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Configurações' },
        ]}
      />
      <CalendarioForm initialData={calendario} />
    </div>
  );
}
