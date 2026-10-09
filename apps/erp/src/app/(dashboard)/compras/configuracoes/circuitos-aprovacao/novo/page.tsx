/**
 * Novo circuito de aprovação de compras (#108) — Server Component.
 *
 * Exige `compras:configurar` (a mesma da action). A primeira página de utilizadores
 * (aprovadores possíveis) vem do servidor; o resto procura-se pelo `ComboboxRemoto`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader } from '@/components/patterns';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { CircuitoForm } from '../_components/circuito-form';

const BREADCRUMBS = [
  { label: 'Compras', href: '/compras/requisicoes' },
  { label: 'Circuitos de aprovação', href: '/compras/configuracoes/circuitos-aprovacao' },
  { label: 'Novo circuito' },
];

export default async function NovoCircuitoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;

  if (!permissions.includes('compras:configurar')) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Novo circuito de aprovação" breadcrumbs={BREADCRUMBS} />
        <SemPermissao
          mensagem="Não tem permissão para configurar circuitos de aprovação. Contacte o administrador do sistema."
          voltar={{ href: '/compras/configuracoes/circuitos-aprovacao', rotulo: 'Voltar aos circuitos' }}
        />
      </div>
    );
  }

  const ctx = { tenantId, userId };
  const utilizadores = await runWithTenantContext(ctx, () => comprasService.procurarAprovadores('', ctx));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo circuito de aprovação"
        description="Níveis, faixas de valor, quórum e aprovadores. Só um circuito activo por tipo de documento."
        breadcrumbs={BREADCRUMBS}
      />
      <CircuitoForm utilizadoresIniciais={utilizadores} />
    </div>
  );
}
