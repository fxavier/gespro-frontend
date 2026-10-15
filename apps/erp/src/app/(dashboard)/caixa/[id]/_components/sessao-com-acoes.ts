import 'server-only';

/**
 * Carrega a sessão de caixa e as acções que o utilizador pode fazer nela (#146) — partilhado
 * pelas rotas `sangria`, `reforco` e `cancelar`. A decisão é `acoesSessaoCaixa`, a mesma do detalhe.
 */
import { notFound } from 'next/navigation';
import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';
import { acoesSessaoCaixa } from '@/lib/caixa-acoes';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as caixaService from '@/server/services/financas/caixa.service';

export async function sessaoComAcoes(id: string) {
  const { session } = await exigirSessaoDeTenant();
  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  const sessao = await runWithTenantContext(ctx, () => caixaService.obterSessao(id, ctx));
  if (!sessao) notFound();

  const acoes = acoesSessaoCaixa({
    status: sessao.status,
    movimentos: sessao.movimentos,
    permissoes: permissions,
  });
  return { sessao: { id: sessao.id, numero: sessao.numero, status: sessao.status }, acoes };
}
