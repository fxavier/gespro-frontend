/**
 * Rota legada — consolidada em /inventario/movimentacoes/nova (rota canónica).
 * Redirecciona para o novo fluxo com sub-rotas dedicadas (spec 04, T5).
 */

import { redirect } from 'next/navigation';

export default function NovaMovimentacaoLegadaPage() {
  redirect('/inventario/movimentacoes/nova');
}
