/**
 * Editar Rota — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { rotaService } from '@/server/services/operacoes/rota.service';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader } from '@/components/patterns';
import { RotaForm } from '../../_components/rota-form';
import type { RotaDetalhe } from '@/server/services/operacoes/rota.interface';

function toDateInput(d: Date | null): string | null {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarRotaPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let rota: RotaDetalhe;
  try {
    rota = await runWithTenantContext(ctx, () => rotaService.obterRota(id, ctx));
  } catch {
    notFound();
  }

  const [viaturasResult, motoristasResult] = await Promise.all([
    runWithTenantContext(ctx, () =>
      viaturaService.listarViaturas({ take: 100, orderBy: 'matricula', order: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      motoristaService.listarMotoristas({ take: 100, orderBy: 'nomeCompleto', order: 'asc' }, ctx)
    ),
  ]);

  const viaturas = viaturasResult.items.map((v) => ({ id: v.id, label: `${v.matricula} — ${v.marca} ${v.modelo}` }));
  const motoristas = motoristasResult.items.map((m) => ({ id: m.id, label: m.nomeCompleto }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${rota.codigo}`}
        description={`${rota.origem} → ${rota.destino}`}
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Rotas', href: '/transporte/rotas' },
          { label: rota.codigo, href: `/transporte/rotas/${rota.id}` },
          { label: 'Editar' },
        ]}
      />
      <RotaForm
        viaturas={viaturas}
        motoristas={motoristas}
        rota={{
          id: rota.id,
          nome: rota.nome,
          descricao: rota.descricao,
          origem: rota.origem,
          destino: rota.destino,
          viaturaId: rota.viaturaId,
          motoristaId: rota.motoristaId,
          dataInicio: toDateInput(rota.dataInicio)!,
          dataFim: toDateInput(rota.dataFim),
          distanciaTotal: rota.distanciaTotal,
          tempoEstimadoMin: rota.tempoEstimadoMin,
          custoEstimado: rota.custoEstimado,
          observacoes: rota.observacoes,
        }}
      />
    </div>
  );
}
