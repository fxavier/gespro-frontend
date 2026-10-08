import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { CLIENTE_CONSUMIDOR_FINAL } from '@/lib/consumidor-final';

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

/**
 * Cliente de uma venda com parte a crédito (ADR-0041 §4, #317): tem de ser identificado —
 * nem anónimo nem o Consumidor Final, que não tem conta corrente a que se cobrar — e
 * activo e não apagado. Partilhada pela venda POS e pela conversão de encomenda (#129).
 * `cliente` é `null` quando a venda não tem cliente; um id que não existe é `NotFoundError`
 * do chamador.
 */
export function exigirClienteParaCredito<T extends { codigo: string; status: string; deletedAt: Date | null }>(
  cliente: T | null,
): asserts cliente is T {
  if (cliente) exigirClienteAtivoParaCredito(cliente);
  if (!cliente || cliente.codigo === CLIENTE_CONSUMIDOR_FINAL.codigo) {
    throw new BusinessRuleError(
      'CLIENTE_OBRIGATORIO_CREDITO',
      'Uma venda a crédito exige um cliente identificado (não o Consumidor Final).',
    );
  }
}
