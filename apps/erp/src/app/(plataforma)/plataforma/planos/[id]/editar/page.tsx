import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/patterns';
import { exigirPlataformaAdmin } from '@/server/auth/plataforma-admin';
import { obterPlanoAdmin } from '@/server/services/plataforma/plano-admin.service';
import { PlanoForm } from '../../_components/plano-form';
import { serializarPlano } from '../../_components/plano-serializado';

export const metadata = { title: 'Editar plano — Plataforma — GestPro' };

export default async function EditarPlanoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPlataformaAdmin();
  const { id } = await params;
  const p = await obterPlanoAdmin(id);
  if (!p) notFound();

  return (
    <div className="space-y-2">
      <PageHeader title={`Editar ${p.nome}`} description={`Plano ${p.codigo}`} />
      <PlanoForm plano={serializarPlano(p)} />
    </div>
  );
}
