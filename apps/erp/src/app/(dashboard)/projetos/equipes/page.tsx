import { redirect } from 'next/navigation';

// Rota antiga (grafia incorrecta) — redireciona para a rota canónica /projetos/equipa
export default function EquipesPage() {
  redirect('/projetos/equipa');
}
