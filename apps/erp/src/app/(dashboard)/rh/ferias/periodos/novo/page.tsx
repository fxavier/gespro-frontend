/**
 * Iniciar período aquisitivo de férias (#156) — Server Component. Formulário em rota
 * própria (regra sem modais). O colaborador escolhe-se num `ComboboxRemoto`: a página
 * passa a primeira página de colaboradores activos e o resto vem da pesquisa no servidor.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { NovoPeriodoFeriasForm } from './_components/novo-periodo-ferias-form';

export default async function NovoPeriodoFeriasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const colaboradores = await runWithTenantContext({ tenantId, userId }, () =>
    prisma.colaborador.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { nome: 'asc' },
      take: 50,
      select: { id: true, codigo: true, nome: true },
    })
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Iniciar Período Aquisitivo"
        description="Abrir o período em que o colaborador adquire dias de férias"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Férias', href: '/rh/ferias' },
          { label: 'Novo período' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/ferias">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Voltar
            </Link>
          </Button>
        }
      />
      <NovoPeriodoFeriasForm
        opcoesIniciais={colaboradores.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
      />
    </div>
  );
}
