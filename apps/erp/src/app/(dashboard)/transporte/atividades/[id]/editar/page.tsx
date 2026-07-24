/**
 * Editar Atividade — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { atividadeService } from '@/server/services/operacoes/atividade.service';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader } from '@/components/patterns';
import { AtividadeForm } from '../../_components/atividade-form';
import type { AtividadeDetalhe } from '@/server/services/operacoes/atividade.interface';

function toDateTimeInput(d: Date | null): string | null {
  if (!d) return null;
  // yyyy-mm-ddThh:mm (hora local)
  const dt = new Date(d);
  const tz = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tz).toISOString().slice(0, 16);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarAtividadePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let atividade: AtividadeDetalhe;
  try {
    atividade = await runWithTenantContext(ctx, () => atividadeService.obterAtividade(id, ctx));
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
        title={`Editar ${atividade.codigo}`}
        description={atividade.titulo}
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Atividades', href: '/transporte/atividades' },
          { label: atividade.codigo, href: `/transporte/atividades/${atividade.id}` },
          { label: 'Editar' },
        ]}
      />
      <AtividadeForm
        viaturas={viaturas}
        motoristas={motoristas}
        atividade={{
          id: atividade.id,
          titulo: atividade.titulo,
          descricao: atividade.descricao,
          tipoActividade: atividade.tipoActividade,
          localActividade: atividade.localActividade,
          dataInicioPrevista: toDateTimeInput(atividade.dataInicioPrevista)!,
          dataConclusaoPrevista: toDateTimeInput(atividade.dataConclusaoPrevista),
          motoristaResponsavelId: atividade.motoristaResponsavelId,
          viaturaId: atividade.viaturaId,
          prioridade: atividade.prioridade,
          observacoes: atividade.observacoes,
        }}
      />
    </div>
  );
}
