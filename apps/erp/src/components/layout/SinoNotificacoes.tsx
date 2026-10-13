import { Suspense } from 'react';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';

interface SinoNotificacoesProps {
  tenantId: string;
  userId: string;
}

/** Lê o contador real de não-lidas e renderiza o sino (Server Component). */
async function SinoComContador({ tenantId, userId }: SinoNotificacoesProps) {
  const count = await runWithTenantContext({ tenantId, userId }, () =>
    notificacaoService.naoLidasCount({ tenantId, userId }),
  );
  return <NotificationBell count={count} />;
}

/**
 * Sino de notificações do cabeçalho — Server Component partilhado pelos layouts
 * `(dashboard)` e `dashboard` (#182), injectado no `AppHeader` por `notificationSlot`.
 * Envolto em Suspense para não bloquear o layout em caso de lentidão da DB.
 */
export function SinoNotificacoes({ tenantId, userId }: SinoNotificacoesProps) {
  return (
    <Suspense fallback={<NotificationBell count={0} />}>
      <SinoComContador tenantId={tenantId} userId={userId} />
    </Suspense>
  );
}
