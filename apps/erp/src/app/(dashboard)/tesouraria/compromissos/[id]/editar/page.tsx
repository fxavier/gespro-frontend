/**
 * Editar Compromisso de Tesouraria — Server Component.
 *
 * Carrega o compromisso pelo serviço (`obterCompromisso` lança
 * `NotFoundError` para inexistente, eliminado ou de outro tenant — I4) e
 * entrega os valores SERIALIZADOS (`Decimal`→string, `Date`→ISO) ao
 * `CompromissoForm`. Rota dedicada — sem modais (R7.3).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterCompromisso } from '@/server/services/financas/projecao.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import {
  CompromissoForm,
  type CompromissoFormDefaults,
} from '../../_components/compromisso-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarCompromissoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let compromisso;
  try {
    compromisso = await runWithTenantContext({ tenantId, userId }, () =>
      obterCompromisso(id, { tenantId, userId }),
    );
  } catch {
    notFound();
  }

  if (!compromisso) notFound();

  const defaults: CompromissoFormDefaults = {
    descricao: compromisso.descricao,
    tipo: compromisso.tipo,
    valor: compromisso.valor.toString(),
    dataPrevista: compromisso.dataPrevista.toISOString(),
    recorrencia: compromisso.recorrencia,
    dataFimRecorrencia: compromisso.dataFimRecorrencia?.toISOString() ?? null,
    observacoes: compromisso.observacoes,
    ativo: compromisso.ativo,
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Compromisso"
        description={compromisso.descricao}
        breadcrumbs={[
          { label: 'Tesouraria', href: '/tesouraria' },
          { label: 'Compromissos', href: '/tesouraria/compromissos' },
          { label: 'Editar' },
        ]}
        badge={<StatusBadge status={compromisso.ativo ? 'ATIVO' : 'INATIVO'} />}
      />

      <CompromissoForm modo="editar" id={id} defaults={defaults} />
    </div>
  );
}
