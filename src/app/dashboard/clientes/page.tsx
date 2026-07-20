/**
 * Rota antiga /dashboard/clientes — consolidada em /clientes.
 * Mantém URL anterior a funcionar via redirect permanente.
 */
import { redirect } from 'next/navigation';

export default function DashboardClientesLegacy() {
  redirect('/clientes');
}
