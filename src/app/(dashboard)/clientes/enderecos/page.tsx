/**
 * Endereços de Clientes — redireccionamento.
 * Os endereços são geridos no separador "Endereços" do detalhe do cliente
 * (/clientes/[id]) para manter o contexto e evitar duplicação de dados.
 */

import { redirect } from 'next/navigation';

export default function EnderecosClientesPage() {
  redirect('/clientes');
}
