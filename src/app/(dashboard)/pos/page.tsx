/**
 * POS — Server Component de entrada.
 * Verifica sessão POS activa e carrega produtos iniciais.
 * O terminal em si é um Client Component (interactividade total + atalhos de teclado).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { sessaoPOSService } from '@/server/services/comercial/index';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { POSTerminal } from './_components/pos-terminal';
import { POSSetup } from './_components/pos-setup';

export default async function POSPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  // Verifica sessão POS activa para este utilizador
  let sessaoAtual = null;
  try {
    sessaoAtual = await runWithTenantContext(ctx, () =>
      sessaoPOSService.obterAtual(ctx)
    );
  } catch {
    // Sem sessão activa — mostrar setup
  }

  if (!sessaoAtual) {
    return <POSSetup />;
  }

  // Carrega produtos activos para o terminal (primeiros 60)
  const { items: produtos } = await runWithTenantContext(ctx, () =>
    listarProdutos({ ativo: true, take: 60, orderBy: 'nome', orderDir: 'asc' }, ctx)
  );

  return (
    <POSTerminal
      sessaoPOS={sessaoAtual}
      produtos={produtos}
      vendedorId={userId}
    />
  );
}
