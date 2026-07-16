/**
 * Histórico de Vendas — Server Component.
 * O histórico de vendas está disponível na listagem principal de vendas.
 */

import { redirect } from 'next/navigation';

export default function VendasHistoricoPage() {
  redirect('/vendas');
}
