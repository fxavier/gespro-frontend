import { redirect } from 'next/navigation';

// Redireciona para a lista de projetos (rota canónica)
export default function ProjetosPage() {
  redirect('/projetos/lista');
}
