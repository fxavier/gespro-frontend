import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { exigirPlataformaAdmin } from '@/server/auth/plataforma-admin';
import { listarPlanosAdmin } from '@/server/services/plataforma/plano-admin.service';
import { PlanosTabela } from './_components/planos-tabela';
import { serializarPlano } from './_components/plano-serializado';

export const metadata = { title: 'Planos — Plataforma — GestPro' };

/**
 * Catálogo de planos (ADR-0049, #526): todos, arquivados incluídos, por `ordem`, com o n.º de
 * assinaturas. Só o administrador de plataforma (a guarda repete-se aqui: o layout e a página
 * renderizam em paralelo).
 */
export default async function PlanosPage() {
  await exigirPlataformaAdmin();
  const planos = (await listarPlanosAdmin()).map(serializarPlano);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos"
        description="Catálogo de planos de subscrição. Um plano arquivado sai do site e de checkouts novos; quem já o tem mantém-no."
        actions={
          <Button asChild size="sm">
            <Link href="/plataforma/planos/novo">
              <Plus className="h-4 w-4" aria-hidden />
              Novo plano
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton cols={7} />}>
        <PlanosTabela planos={planos} />
      </Suspense>
    </div>
  );
}
