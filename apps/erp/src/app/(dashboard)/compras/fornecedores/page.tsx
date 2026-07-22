import { redirect } from 'next/navigation';

/** O módulo canónico de fornecedores é /fornecedores. */
export default function ComprasFornecedoresPage() {
  redirect('/fornecedores/lista');
}
