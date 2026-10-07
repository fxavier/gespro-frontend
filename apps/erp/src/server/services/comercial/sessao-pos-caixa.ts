/**
 * Contrato publicado pelo comercial para o caixa (#270): quando a sessão de caixa fecha ou é
 * cancelada, as SessaoPOS ABERTA/SUSPENSA que vivem sobre ela fecham na mesma transacção — senão
 * ficam órfãs e o /pos mostra um terminal onde todas as vendas falham com SESSAO_CAIXA_FECHADA.
 *
 * Conservador: se alguma delas tiver vendas PENDENTE, recusa tudo com
 * SESSAO_COM_VENDAS_PENDENTES (o mesmo código de `sessaoPOSService.fechar`) e não escreve nada.
 * Corre na tx do chamador (cliente cru) — o tenantId vai explícito em todas as leituras/escritas.
 */
import 'server-only';

import { BusinessRuleError } from '@/lib/errors';
import type { Ctx, TxClient } from '@/server/services/types';

export async function fecharSessoesPOSDoCaixaEmTx(
  tx: TxClient,
  sessaoCaixaId: string,
  ctx: Ctx,
): Promise<number> {
  // Tranca as sessões POS vivas do caixa: uma venda concorrente não entra entre a verificação e o fecho.
  const vivas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "SessaoPOS"
    WHERE "tenantId" = ${ctx.tenantId} AND "sessaoCaixaId" = ${sessaoCaixaId}
      AND status IN ('ABERTA', 'SUSPENSA')
    FOR UPDATE`;
  if (vivas.length === 0) return 0;
  const ids = vivas.map((s) => s.id);

  const pendentes = await tx.venda.count({
    where: { tenantId: ctx.tenantId, sessaoPOSId: { in: ids }, status: 'PENDENTE' },
  });
  if (pendentes > 0) {
    throw new BusinessRuleError(
      'SESSAO_COM_VENDAS_PENDENTES',
      `Existem ${pendentes} vendas pendentes nas sessões POS deste caixa. Conclua-as ou anule-as antes de encerrar o caixa.`,
    );
  }

  const { count } = await tx.sessaoPOS.updateMany({
    where: { tenantId: ctx.tenantId, id: { in: ids }, status: { in: ['ABERTA', 'SUSPENSA'] } },
    data: { status: 'FECHADA', fechadoEm: new Date() },
  });
  return count;
}
