/**
 * Rota antiga /dashboard/pos — consolidada em /pos.
 * Mantém URL anterior a funcionar via redirect permanente.
 */
import { redirect } from 'next/navigation';

export default function DashboardPosLegacy() {
  redirect('/pos');
}
