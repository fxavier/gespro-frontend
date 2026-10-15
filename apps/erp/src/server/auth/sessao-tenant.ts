import 'server-only';

import type { Session } from 'next-auth';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/** A sessão com o tenant já provado: `session.user.tenantId` é `string`. */
export type SessionDeTenant = Session & { user: Session['user'] & { tenantId: string } };

export interface SessaoDeTenant {
  tenantId: string;
  userId: string;
  session: SessionDeTenant;
}

/**
 * Guarda ÚNICA de servidor das páginas e layouts do tenant (#537).
 *
 * `Session.user.tenantId` é opcional: a sessão do administrador de plataforma
 * sem `User` de tenant (#525) não o tem. Em vez de cada página o afirmar com
 * um cast, pede-o aqui:
 *   - sem sessão          → `/auth/login`;
 *   - sessão sem tenant   → `/plataforma` (um tenant vazio conta como ausente);
 *   - sessão de tenant    → `{ tenantId, userId, session }`.
 *
 * As Server Actions e as Route Handlers não a usam: `createSafeAction` e
 * `withApi` recusam a sessão sem tenant com 403 antes de qualquer contexto.
 */
export async function exigirSessaoDeTenant(): Promise<SessaoDeTenant> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId } = session.user;
  if (!tenantId) redirect('/plataforma');
  const user = { ...session.user, tenantId };
  return { tenantId, userId: user.id, session: { ...session, user } };
}
