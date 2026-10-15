import { PageHeader } from '@/components/patterns';
import { exigirPlataformaAdmin } from '@/server/auth/plataforma-admin';
import { PlanoForm } from '../_components/plano-form';

export const metadata = { title: 'Novo plano — Plataforma — GestPro' };

export default async function NovoPlanoPage() {
  await exigirPlataformaAdmin();
  return (
    <div className="space-y-2">
      <PageHeader title="Novo plano" description="Um plano novo aparece no site e no checkout assim que é criado." />
      <PlanoForm />
    </div>
  );
}
