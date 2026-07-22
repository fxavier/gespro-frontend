/**
 * Novo Lançamento Contabilístico — Server Component.
 * Carrega contas e diários do servidor para o formulário inline.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { NovoLancamentoForm } from './_components/novo-lancamento-form';

export default async function NovoLancamentoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let contas: { id: string; codigo: string; nome: string }[] = [];
  let diarios: { id: string; codigo: string; nome: string; tipo: string }[] = [];

  try {
    const [contasResult, diariosResult] = await runWithTenantContext({ tenantId, userId }, () =>
      Promise.all([
        contabilidadeService.listarContas({ aceitaLancamento: true, take: 200 }, { tenantId, userId }),
        contabilidadeService.listarDiarios({ tenantId, userId }),
      ])
    );

    contas = contasResult.items.map((c: any) => ({
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
    }));

    diarios = diariosResult.map((d: any) => ({
      id: d.id,
      codigo: d.codigo,
      nome: d.nome,
      tipo: d.tipo,
    }));
  } catch {
    // Se o serviço falhar, formulário mostra selects vazios
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-6 pb-0">
        <PageHeader
          title="Novo Lançamento Contabilístico"
          description="Registar lançamento com partidas dobradas (débito = crédito)"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Lançamentos', href: '/contabilidade/lancamentos' },
            { label: 'Novo' },
          ]}
        />
      </div>

      <NovoLancamentoForm contas={contas} diarios={diarios} />
    </div>
  );
}
