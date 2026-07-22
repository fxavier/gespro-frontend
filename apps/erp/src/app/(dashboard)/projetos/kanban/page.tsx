import { redirect } from 'next/navigation';

// Kanban é por projecto — redireciona para lista de projectos.
// O kanban de cada projecto está em /projetos/lista/[id]/kanban
export default function KanbanPage() {
  redirect('/projetos/lista');
}
