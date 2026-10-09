/**
 * Nova Cotação (RFQ) — Server Component shell.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { FilterRequisicaoCompraSchema } from '@/lib/validations/compras';
import { FilterFornecedorSchema } from '@/lib/validations/fornecedores';
import { PageHeader } from '@/components/patterns';
import { rotuloFornecedor, rotuloRequisicao } from '../../_components/opcoes-compras';
import { NovaCotacaoForm } from './_components/nova-cotacao-form';

export default async function NovaCotacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // Primeira página de cada `ComboboxRemoto` (#265); o resto chega pela pesquisa no servidor.
  const [requisicoes, fornecedores] = await runWithTenantContext(ctx, () =>
    Promise.all([
      comprasService.listarRequisicoes(FilterRequisicaoCompraSchema.parse({ take: 50 }), ctx),
      fornecedorService.listar(FilterFornecedorSchema.parse({ take: 50 }), ctx),
    ]),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Cotação"
        description="Pedido de cotação (RFQ) a fornecedores"
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Cotações', href: '/compras/cotacoes' },
          { label: 'Nova Cotação' },
        ]}
      />
      <NovaCotacaoForm
        requisicoesIniciais={requisicoes.items.map((r) => ({ value: r.id, label: rotuloRequisicao(r) }))}
        fornecedoresIniciais={fornecedores.items.map((f) => ({ value: f.id, label: rotuloFornecedor(f) }))}
      />
    </div>
  );
}
