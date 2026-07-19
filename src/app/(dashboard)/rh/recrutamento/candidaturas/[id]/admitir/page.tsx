/**
 * Página de Admissão — converte Candidatura em Colaborador.
 * Server Component wrapper; formulário é Client Component.
 */
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { CandidaturaService } from '@/server/services/pessoas-projetos/recrutamento.service';
import { PageHeader } from '@/components/patterns';
import { AdmitirForm } from '../../../_components/admitir-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdmitirPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let candidatura;
  try {
    candidatura = await runWithTenantContext({ tenantId, userId }, () =>
      CandidaturaService.obter(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!candidatura) notFound();

  // Só pode admitir em PROPOSTA ou ENTREVISTA
  if (!['PROPOSTA', 'ENTREVISTA'].includes(candidatura.etapa)) {
    redirect(`/rh/recrutamento/candidaturas/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Admitir como Colaborador"
        description={`Converter candidatura de ${candidatura.candidato.nome} em registo de colaborador`}
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Recrutamento', href: '/rh/recrutamento' },
          { label: candidatura.vaga.titulo, href: `/rh/recrutamento/vagas/${candidatura.vagaId}` },
          { label: candidatura.candidato.nome, href: `/rh/recrutamento/candidaturas/${id}` },
          { label: 'Admitir' },
        ]}
      />
      <AdmitirForm
        candidaturaId={id}
        candidato={{
          nome: candidatura.candidato.nome,
          email: candidatura.candidato.email,
          telefone: candidatura.candidato.telefone,
          bi: candidatura.candidato.bi ?? undefined,
          nuit: candidatura.candidato.nuit ?? undefined,
        }}
        vaga={{
          titulo: candidatura.vaga.titulo,
          regimeTrabalho: candidatura.vaga.regimeTrabalho,
          tipoContrato: candidatura.vaga.tipoContrato,
        }}
      />
    </div>
  );
}
