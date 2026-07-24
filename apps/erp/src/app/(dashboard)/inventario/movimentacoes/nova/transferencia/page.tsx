/**
 * Nova Transferência de Stock — Server Component.
 * Carrega produtos + localizações e passa ao Client Component de formulário.
 */

import { PageHeader } from '@/components/patterns';
import { carregarDadosMovimentacao } from '../../_data';
import { TransferenciaStockForm } from '../../_components/transferencia-stock-form';

export default async function NovaTransferenciaStockPage() {
  const { produtos, localizacoes } = await carregarDadosMovimentacao();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Registar Transferência de Stock"
        description="Mover um produto entre duas localizações"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Movimentações', href: '/inventario/movimentacoes' },
          { label: 'Nova', href: '/inventario/movimentacoes/nova' },
          { label: 'Transferência' },
        ]}
      />
      <TransferenciaStockForm produtos={produtos} localizacoes={localizacoes} />
    </div>
  );
}
