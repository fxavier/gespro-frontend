import { redirect } from 'next/navigation';

/** Redireccionamento: /clientes/lista → /clientes (consolidação de rotas) */
export default function ClientesListaPage() {
  redirect('/clientes');
}
