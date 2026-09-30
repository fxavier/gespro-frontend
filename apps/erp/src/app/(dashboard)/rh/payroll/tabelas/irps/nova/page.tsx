/**
 * Nova vigência IRPS — Server Component.
 * D3: só tabela geral (numeroDependentes = 0).
 * D4: pré-preenchido com os escalões da vigência em vigor.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { PageHeader } from '@/components/patterns';
import { diaIsoMaputo } from '@/lib/format-date';
import type { EscalaoInicial } from './_components/irps-nova-form';
import { IRPSNovaForm } from './_components/irps-nova-form';

export default async function IRPSNovaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const todosEscaloes = await runWithTenantContext(ctx, () =>
    PayrollService.listarEscaloesIRPS(ctx),
  );

  // Vigentes (vigenciaFim IS NULL) — D4: pré-preenchimento
  // D3: só numeroDependentes = 0
  const vigentes = todosEscaloes
    .filter((e) => e.vigenciaFim === null && e.numeroDependentes === 0)
    .sort((a, b) => a.ordem - b.ordem);

  // Serializa Decimal→string para passar SC→CC
  const escaloesIniciais: EscalaoInicial[] = vigentes.map((e) => ({
    limiteInferior: e.limiteInferior.toString(),
    limiteSuperior: e.limiteSuperior?.toString() ?? null,
    taxa: e.taxa.toString(),
    parcelaAbater: e.parcelaAbater.toString(),
  }));

  // Mês/ano por omissão: dia civil em Maputo (evita `new Date()` no client)
  const hojeMaputo = diaIsoMaputo();
  const defaultAno = Number(hojeMaputo.slice(0, 4));
  const defaultMes = Number(hojeMaputo.slice(5, 7));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova vigência IRPS"
        description="Tabela geral de escalões (sem dependentes)"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: 'Tabelas INSS/IRPS', href: '/rh/payroll/tabelas' },
          { label: 'Nova vigência IRPS' },
        ]}
      />
      <IRPSNovaForm
        escaloesIniciais={escaloesIniciais}
        defaultMes={defaultMes}
        defaultAno={defaultAno}
      />
    </div>
  );
}
