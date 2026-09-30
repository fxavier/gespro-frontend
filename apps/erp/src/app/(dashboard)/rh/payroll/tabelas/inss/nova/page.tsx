/**
 * Nova vigência INSS — Server Component.
 * D4: pré-preenchido com a vigência em vigor.
 * D5: sem editar/apagar.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { PageHeader } from '@/components/patterns';
import { fraccaoParaPercentagem } from '@/lib/payroll-vigencia';
import { diaIsoMaputo } from '@/lib/format-date';
import { INSSNovaForm } from './_components/inss-nova-form';

export default async function INSSNovaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const tabelas = await runWithTenantContext(ctx, () =>
    PayrollService.listarTabelasINSS(ctx),
  );

  // Vigência em vigor (vigenciaFim IS NULL) — pré-preenchimento D4
  const vigente = tabelas.find((t) => t.vigenciaFim === null);
  const taxaTrabalhadorPct = vigente
    ? fraccaoParaPercentagem(Number(vigente.taxaTrabalhador.toString()))
    : 3;
  const taxaEntidadePct = vigente
    ? fraccaoParaPercentagem(Number(vigente.taxaEntidade.toString()))
    : 4;

  // Mês/ano por omissão: dia civil em Maputo (evita `new Date()` no client)
  const hojeMaputo = diaIsoMaputo(); // 'aaaa-mm-dd'
  const defaultAno = Number(hojeMaputo.slice(0, 4));
  const defaultMes = Number(hojeMaputo.slice(5, 7));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova vigência INSS"
        description="A nova vigência fecha automaticamente a anterior"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: 'Tabelas INSS/IRPS', href: '/rh/payroll/tabelas' },
          { label: 'Nova vigência INSS' },
        ]}
      />
      <INSSNovaForm
        taxaTrabalhadorPct={taxaTrabalhadorPct}
        taxaEntidadePct={taxaEntidadePct}
        defaultMes={defaultMes}
        defaultAno={defaultAno}
      />
    </div>
  );
}
