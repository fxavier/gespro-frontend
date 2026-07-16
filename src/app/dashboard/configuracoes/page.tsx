/**
 * Rota antiga /dashboard/configuracoes — ainda sem equivalente moderno.
 * Redireccionado para o dashboard principal até a página de perfil de utilizador
 * ser criada em /core-tenancy/utilizadores/[id] ou rota dedicada /perfil.
 */
import { redirect } from 'next/navigation';

export default function DashboardConfiguracoesLegacy() {
  redirect('/dashboard');
}
