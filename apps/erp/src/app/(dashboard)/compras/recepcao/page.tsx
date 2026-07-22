import { redirect } from 'next/navigation';

/** Recepção de mercadorias integrada em /compras/pedidos. */
export default function RecepcaoPage() {
  redirect('/compras/pedidos');
}
