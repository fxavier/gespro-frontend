import { redirect } from 'next/navigation';

// Rota duplicada — redireciona para a rota canónica /projetos/orcamento
export default function OrcamentosPage() {
  redirect('/projetos/orcamento');
}
