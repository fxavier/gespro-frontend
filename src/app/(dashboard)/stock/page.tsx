/**
 * Stock — redireciona para o dashboard de stock.
 */

import { redirect } from 'next/navigation';

export default function StockPage() {
  redirect('/stock/dashboard');
}
