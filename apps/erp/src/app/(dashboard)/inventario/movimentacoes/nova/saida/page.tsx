/**
 * Nova Saída de Stock — Server Component.
 * Carrega produtos + localizações e passa ao Client Component de formulário.
 */

import { PageHeader } from '@/components/patterns';
import { carregarDadosMovimentacao } from '../../_data';
import { SaidaStockForm } from '../../_components/saida-stock-form';

export default async function NovaSaidaStockPage() {
  const { produtos, localizacoes } = await carregarDadosMovimentacao();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Registar Saída de Stock"
        description="Dar saída de um produto de uma localização"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Movimentações', href: '/inventario/movimentacoes' },
          { label: 'Nova', href: '/inventario/movimentacoes/nova' },
          { label: 'Saída' },
        ]}
      />
      <SaidaStockForm produtos={produtos} localizacoes={localizacoes} />
    </div>
  );
}
