/**
 * Editar Colaborador — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';
import { PageHeader } from '@/components/patterns';
import { EditarColaboradorForm } from './_components/editar-colaborador-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarColaboradorPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let colaborador;
  let opcoes;
  try {
    [colaborador, opcoes] = await runWithTenantContext(ctx, () =>
      Promise.all([ColaboradorService.obter(id, ctx), ColaboradorService.listarOpcoes(ctx)])
    );
  } catch {
    notFound();
  }

  if (!colaborador) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar: ${colaborador.nome}`}
        description="Actualizar os dados do colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Colaboradores', href: '/rh/colaboradores' },
          { label: colaborador.codigo, href: `/rh/colaboradores/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarColaboradorForm
        opcoes={opcoes}
        colaborador={{
          id: colaborador.id,
          codigo: colaborador.codigo,
          nome: colaborador.nome,
          email: colaborador.email,
          telefone: colaborador.telefone,
          tipoContrato: colaborador.tipoContrato,
          regimeTrabalho: colaborador.regimeTrabalho,
          observacoes: colaborador.observacoes,
          departamentoId: colaborador.departamentoId,
          cargoId: colaborador.cargoId,
          salarioBase: colaborador.salarioBase.toString(),
          subsidioAlimentacao: colaborador.subsidioAlimentacao?.toString() ?? null,
          subsidioTransporte: colaborador.subsidioTransporte?.toString() ?? null,
          subsidioHabitacao: colaborador.subsidioHabitacao?.toString() ?? null,
          subsidiosOutros: colaborador.subsidiosOutros?.toString() ?? null,
        }}
      />
    </div>
  );
}
