/**
 * Novo Pedido de Compra — Server Component shell.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { listarCentrosCusto } from '@/server/services/financas/contabilidade.service';
import { FilterCotacaoSchema, FilterRequisicaoCompraSchema } from '@/lib/validations/compras';
import { FilterFornecedorSchema } from '@/lib/validations/fornecedores';
import { PageHeader } from '@/components/patterns';
import { rotuloCotacao, rotuloFornecedor, rotuloRequisicao } from '../../_components/opcoes-compras';
import { NovoPedidoForm } from './_components/novo-pedido-form';

export default async function NovoPedidoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // #265: fornecedor, requisição e cotação são `ComboboxRemoto` (primeira página aqui, o resto pela
  // pesquisa no servidor); os centros de custo activos são poucos e filtram-se no cliente.
  const [fornecedores, requisicoes, cotacoes, centros] = await runWithTenantContext(ctx, () =>
    Promise.all([
      fornecedorService.listar(FilterFornecedorSchema.parse({ take: 50 }), ctx),
      comprasService.listarRequisicoes(FilterRequisicaoCompraSchema.parse({ take: 50 }), ctx),
      comprasService.listarCotacoes(FilterCotacaoSchema.parse({ take: 50 }), ctx),
      listarCentrosCusto({ ativo: true, take: 100 }, ctx),
    ]),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Pedido de Compra"
        description="Emissão de pedido de compra a fornecedor"
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Pedidos', href: '/compras/pedidos' },
          { label: 'Novo Pedido' },
        ]}
      />
      <NovoPedidoForm
        fornecedoresIniciais={fornecedores.items.map((f) => ({ value: f.id, label: rotuloFornecedor(f) }))}
        requisicoesIniciais={requisicoes.items.map((r) => ({ value: r.id, label: rotuloRequisicao(r) }))}
        cotacoesIniciais={cotacoes.items.map((c) => ({ value: c.id, label: rotuloCotacao(c) }))}
        centrosCusto={centros.items.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
      />
    </div>
  );
}
