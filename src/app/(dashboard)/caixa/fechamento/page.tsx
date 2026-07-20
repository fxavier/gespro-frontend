/**
 * Fecho de Caixa — Server Component (shell).
 * Obtém sessão activa do servidor e passa para o wizard client.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as caixaService from '@/server/services/financas/caixa.service';
import { PageHeader } from '@/components/patterns';
import { FechamentoWizard } from './_components/fechamento-wizard';

export default async function FechamentoCaixaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let sessaoActual = null;

  try {
    const s = await runWithTenantContext({ tenantId, userId }, () =>
      caixaService.obterSessaoAtual({ tenantId, userId })
    );

    if (s) {
      sessaoActual = {
        id: s.id,
        numero: s.numero,
        dataAbertura: s.dataAbertura.toISOString(),
        fundoInicial: s.fundoInicial.toString(),
        status: s.status,
      };
    }
  } catch {
    // Se o serviço falhar, o wizard mostra mensagem de sem sessão
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fecho de Caixa"
        description="Contagem física e encerramento da sessão"
        breadcrumbs={[
          { label: 'Caixa', href: '/caixa' },
          { label: 'Fecho' },
        ]}
      />

      <FechamentoWizard sessaoActual={sessaoActual} />
    </div>
  );
}
