import { redirect } from 'next/navigation';

// Rota descontinuada — redireciona para a rota canónica /projetos/equipa
export default function EquipasPage() {
  redirect('/projetos/equipa');
}
