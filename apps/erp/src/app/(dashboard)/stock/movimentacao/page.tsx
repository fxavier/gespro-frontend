/**
 * Rota legada — consolidada em /inventario/movimentacoes (rota canónica de stock).
 * Redirecciona para evitar dois fluxos divergentes (spec 04, T5).
 */

import { redirect } from 'next/navigation';

export default function MovimentacaoLegadaPage() {
  redirect('/inventario/movimentacoes');
}
