import 'server-only';

import type { Session } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Guarda ÚNICA de servidor da área do administrador geral do sistema
 * (ADR-0011 §5, #525). Usa-se no layout de `/plataforma` e em qualquer
 * Server Component ou Route Handler da área; as Server Actions usam
 * `createSafeAction({ plataforma: true })`, que aplica a mesma regra.
 *
 * Decide pelo papel de realm `plataforma-admin` na sessão — ausente conta
 * como não — e só numa sessão SEM `tenantId` (#549, adenda ao ADR-0049 §5). Quem falha
 * recebe `notFound()` (404), nunca 403: a área não se revela. Não estabelece
 * contexto de tenant.
 */
export async function exigirPlataformaAdmin(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  if (session.user.plataformaAdmin !== true || session.user.tenantId) notFound();
  return session;
}
