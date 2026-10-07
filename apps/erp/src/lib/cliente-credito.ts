import { BusinessRuleError, NotFoundError } from '@/lib/errors';

/**
 * Regra partilhada da venda a crédito (#317): só um cliente activo e não apagado
 * abre conta corrente. Aplica-se à venda POS com parte a crédito e à emissão de
 * Factura (série FATURA); a venda a pronto (Factura-Recibo) não passa por aqui.
 *
 * Os chamadores leem o cliente pelo cliente cru da transacção (`prismaBase`), que
 * não filtra `deletedAt` — por isso a verificação do apagado vive aqui.
 */
export function exigirClienteAtivoParaCredito(cliente: { status: string; deletedAt: Date | null }): void {
  if (cliente.deletedAt) throw new NotFoundError('Cliente não encontrado');
  if (cliente.status !== 'ATIVO') {
    throw new BusinessRuleError(
      'CLIENTE_NAO_ATIVO',
      'Um cliente suspenso ou inactivo não pode comprar a crédito. Reactive o cliente ou receba a pronto.',
    );
  }
}
