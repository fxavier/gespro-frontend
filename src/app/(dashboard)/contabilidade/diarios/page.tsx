/**
 * Diários Contabilísticos — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { DiariosTable, type DiarioResumo } from './_components/diarios-table';

async function DiariosSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  try {
    const diarios = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.listarDiarios({ tenantId, userId })
    );

    const items: DiarioResumo[] = diarios.map((d: any) => ({
      id: d.id,
      codigo: d.codigo,
      nome: d.nome,
      tipo: d.tipo,
      ativo: d.ativo,
    }));

    return <DiariosTable data={items} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar diários. Verifique a configuração da base de dados.
      </div>
    );
  }
}

export default async function DiariosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Diários Contabilísticos"
        description="Diários por natureza — Vendas, Compras, Caixa, Banco, Operações, Salários…"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Diários' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/diarios/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Diário
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={4} />}>
        <DiariosSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
