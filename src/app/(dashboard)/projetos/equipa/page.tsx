import { redirect } from 'next/navigation';

// Rota antiga — redireciona para a rota canónica /projetos/equipas
export default function EquipaPage() {
  redirect('/projetos/equipas');
}
