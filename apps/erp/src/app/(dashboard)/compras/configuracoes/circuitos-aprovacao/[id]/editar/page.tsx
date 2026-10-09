/**
 * Editar um circuito de aprovação de compras (#445) — Server Component.
 *
 * Rota própria (nunca Dialog), com o mesmo formulário da criação. Exige `compras:configurar`
 * (a mesma da action). Circuito de outro tenant ou inexistente → 404.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader } from '@/components/patterns';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { CircuitoForm } from '../../_components/circuito-form';

const BREADCRUMBS = [
  { label: 'Compras', href: '/compras/requisicoes' },
  { label: 'Circuitos de aprovação', href: '/compras/configuracoes/circuitos-aprovacao' },
  { label: 'Editar circuito' },
];

export default async function EditarCircuitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;

  if (!permissions.includes('compras:configurar')) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Editar circuito de aprovação" breadcrumbs={BREADCRUMBS} />
        <SemPermissao
          mensagem="Não tem permissão para configurar circuitos de aprovação. Contacte o administrador do sistema."
          voltar={{ href: '/compras/configuracoes/circuitos-aprovacao', rotulo: 'Voltar aos circuitos' }}
        />
      </div>
    );
  }

  const ctx = { tenantId, userId };
  const [circuitos, utilizadores] = await runWithTenantContext(ctx, () =>
    Promise.all([comprasService.listarConfiguracoesWorkflow(ctx), comprasService.procurarAprovadores('', ctx)]),
  );
  const c = circuitos.find((w) => w.id === id);
  if (!c) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar circuito de aprovação"
        description="Níveis, faixas de valor, quórum e aprovadores. Só um circuito activo por tipo de documento."
        breadcrumbs={BREADCRUMBS}
      />
      <CircuitoForm
        utilizadoresIniciais={utilizadores}
        circuito={{
          id: c.id,
          valores: {
            nome: c.nome,
            tipo: c.tipo,
            ativo: c.ativo,
            niveis: c.niveis.map((n) => ({
              nivel: n.nivel,
              nome: n.nome,
              valorMinimo: Number(n.valorMinimo),
              valorMaximo: Number(n.valorMaximo),
              tipoAprovacao: n.tipoAprovacao,
              aprovadores: n.aprovadores,
            })),
          },
        }}
      />
    </div>
  );
}
