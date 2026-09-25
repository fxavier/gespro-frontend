/**
 * Resolução do meio de pagamento — contrato reutilizável por qualquer domínio
 * que precise de pagar (WS B: contas a pagar; WS E: payroll futuro).
 *
 * Resolve a conta PGC creditada e o diário a partir da forma de pagamento e
 * da ContaBancaria indicada. Para NUMERARIO localiza a sessão de caixa aberta
 * do utilizador corrente e retorna o id da sessão para o chamador registar
 * o MovimentoCaixa.
 *
 * Nunca escreve: só lê e valida. Chamar ANTES de qualquer escrita dentro da
 * $transaction, para que a recusa não deixe registos a meio.
 */
import 'server-only';

import type { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import { TIPOS_CONTA_POR_FORMA, type FormaPagamento } from '@/lib/meios-pagamento';

export interface ResolucaoMeioPagamento {
  contaCodigo: string;
  diarioTipo: 'CAIXA' | 'BANCO';
  /** Presente apenas quando forma = NUMERARIO */
  sessaoCaixaId?: string;
}

/**
 * Resolve o meio de pagamento dentro de uma transacção.
 *
 * @param tx            - TransactionClient da $transaction em curso.
 * @param forma         - Forma de pagamento escolhida.
 * @param contaBancariaId - ID da ContaBancaria (obrigatório para formas não-NUMERARIO).
 * @param ctx           - Contexto do tenant e utilizador.
 */
export async function resolverContaMeioPagamento(
  tx: Prisma.TransactionClient,
  {
    forma,
    contaBancariaId,
  }: {
    forma: FormaPagamento;
    contaBancariaId?: string;
  },
  ctx: Ctx,
): Promise<ResolucaoMeioPagamento> {
  // ── NUMERARIO ──────────────────────────────────────────────────────────────
  if (forma === 'NUMERARIO') {
    // Localizar sessão de caixa ABERTA do utilizador corrente (nunca de outro)
    const sessao = await tx.sessaoCaixa.findFirst({
      where: { tenantId: ctx.tenantId, responsavelId: ctx.userId, status: 'ABERTA' },
      select: { id: true },
    });
    if (!sessao) {
      throw new BusinessRuleError(
        'SESSAO_CAIXA_NECESSARIA',
        'Para pagar em numerário é necessário ter uma sessão de caixa aberta. Abra o caixa em Caixa › Abertura antes de pagar em numerário.',
      );
    }
    return { contaCodigo: '111', diarioTipo: 'CAIXA', sessaoCaixaId: sessao.id };
  }

  // ── Formas bancárias ────────────────────────────────────────────────────────
  if (!contaBancariaId) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_OBRIGATORIA',
      `A forma de pagamento "${forma}" requer uma conta bancária.`,
    );
  }

  // Buscar a ContaBancaria com a sua ContaPGC (tenantId explícito — findFirst é scoped, mas garantimos)
  const conta = await tx.contaBancaria.findFirst({
    where: { id: contaBancariaId, tenantId: ctx.tenantId },
    include: { contaContabil: { select: { codigo: true } } },
  });

  if (!conta) {
    throw new NotFoundError('Conta bancária não encontrada');
  }

  if (!conta.ativo) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_INATIVA',
      'A conta bancária indicada está inactiva e não pode ser utilizada.',
    );
  }

  // Verificar compatibilidade do tipo de conta com a forma de pagamento
  const tiposAceites = TIPOS_CONTA_POR_FORMA[forma];
  if (!tiposAceites) {
    throw new BusinessRuleError('FORMA_PAGAMENTO_INVALIDA', `Forma de pagamento desconhecida: "${forma}".`);
  }
  if (!tiposAceites.includes(conta.tipoConta)) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_INCOMPATIVEL',
      `A conta bancária do tipo "${conta.tipoConta}" não é compatível com a forma de pagamento "${forma}".`,
    );
  }

  const contaContabil = conta.contaContabil as { codigo: string } | null;
  if (!contaContabil) {
    throw new BusinessRuleError(
      'CONTA_CONTABIL_BANCARIA_EM_FALTA',
      'A conta bancária não tem conta contabilística associada.',
    );
  }

  return { contaCodigo: contaContabil.codigo, diarioTipo: 'BANCO' };
}
