/**
 * POS — Server Component de entrada.
 *
 * Regra: caixa aberto = POS pronto. A sessão de caixa é a do próprio
 * utilizador (`obterSessaoAtual`, por responsável): quem vende é quem presta
 * contas do fundo no fecho. Três estados:
 *   1. Há sessão POS aberta → terminal.
 *   2. Não há sessão POS mas o caixa está aberto → `POSIniciar` abre uma
 *      (server action ao montar, e não uma escrita durante o render).
 *   3. Não há caixa aberto → redirecção para a abertura, com `voltar=/pos`
 *      para regressar aqui assim que o fundo estiver registado.
 * Ninguém escreve cuids.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { sessaoPOSService } from '@/server/services/comercial/index';
import { obterSessaoAtual as obterSessaoCaixaAtual } from '@/server/services/financas/caixa.service';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { POSTerminal } from './_components/pos-terminal';
import { POSIniciar } from './_components/pos-iniciar';

export default async function POSPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const sessaoAtual = await runWithTenantContext(ctx, () =>
    sessaoPOSService.obterAtual(ctx).catch(() => null)
  );

  if (!sessaoAtual) {
    const caixa = await runWithTenantContext(ctx, () => obterSessaoCaixaAtual(ctx));
    if (!caixa) redirect('/caixa/abertura?voltar=/pos');
    return <POSIniciar sessaoCaixaId={caixa.id} numeroCaixa={caixa.numero} />;
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
