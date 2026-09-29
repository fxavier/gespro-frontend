/**
 * Rota de ajuste manual de linha de payroll — Server Component (Spec 06 / issue #159).
 * Só disponível quando o payroll está PENDENTE; redirige para o detalhe noutro estado.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { NotFoundError } from '@/lib/errors';
import { PageHeader } from '@/components/patterns';
import type { ReciboDados } from '@/server/services/pessoas-projetos/payroll.interface';
import { AjusteForm } from './_components/ajuste-form';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default async function AjustePayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  let recibo: ReciboDados;
  try {
    recibo = await runWithTenantContext({ tenantId, userId }, () =>
      PayrollService.obterRecibo(id, { tenantId, userId }),
    );
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  // Só PENDENTE pode receber ajustes
  if (recibo.payroll.status !== 'PENDENTE') {
    redirect(`/rh/payroll/${id}`);
  }

  const { payroll, colaborador } = recibo;
  const periodo = `${MESES[payroll.mesReferencia - 1]} ${payroll.anoReferencia}`;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Adicionar ajuste"
        description={`${colaborador.nome} · ${periodo}`}
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: `Recibo — ${colaborador.nome}`, href: `/rh/payroll/${id}` },
          { label: 'Adicionar ajuste' },
        ]}
      />
      <AjusteForm payrollId={id} cancelHref={`/rh/payroll/${id}`} />
    </div>
  );
}
