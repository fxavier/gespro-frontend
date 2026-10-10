/**
 * Fecho de Caixa — Server Component (shell).
 * Obtém a sessão a fechar (?sessaoId= ou a do utilizador) e passa-a ao wizard client.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as caixaService from '@/server/services/financas/caixa.service';
import { PageHeader } from '@/components/patterns';
import { FechamentoWizard } from './_components/fechamento-wizard';

export default async function FechamentoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ sessaoId?: string | string[] }>;
}) {
  const { sessaoId } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let sessaoActual = null;

  try {
    const dados = await runWithTenantContext({ tenantId, userId }, async () => {
      // #150: a sessão pedida em ?sessaoId= (se ABERTA no tenant), senão a do utilizador.
      const s = await caixaService.obterSessaoParaFecho(
        typeof sessaoId === 'string' ? sessaoId : undefined,
        { tenantId, userId },
      );
      if (!s) return null;
      // #91: o esperado vem do servidor (fundo + entradas − saídas, ABERTURA fora).
      return { s, resumo: await caixaService.resumoSessao(s.id, { tenantId, userId }) };
    });

    if (dados) {
      const { s, resumo } = dados;
      sessaoActual = {
        id: s.id,
        numero: s.numero,
        dataAbertura: s.dataAbertura.toISOString(),
        fundoInicial: s.fundoInicial.toString(),
        saldoEsperado: resumo.saldoEsperado.toString(),
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
