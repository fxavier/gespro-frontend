import { redirect } from 'next/navigation';

/** Documentos de fornecedores em /fornecedores. */
export default function DocumentosPage() {
  redirect('/fornecedores/lista');
}
