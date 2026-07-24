/**
 * Nova Entrada de Stock — Server Component.
 * Carrega produtos + localizações e passa ao Client Component de formulário.
 */

import { PageHeader } from '@/components/patterns';
import { carregarDadosMovimentacao } from '../../_data';
import { EntradaStockForm } from '../../_components/entrada-stock-form';

export default async function NovaEntradaStockPage() {
  const { produtos, localizacoes } = await carregarDadosMovimentacao();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Registar Entrada de Stock"
        description="Dar entrada de um produto numa localização"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Movimentações', href: '/inventario/movimentacoes' },
          { label: 'Nova', href: '/inventario/movimentacoes/nova' },
          { label: 'Entrada' },
        ]}
      />
      <EntradaStockForm produtos={produtos} localizacoes={localizacoes} />
    </div>
  );
}
