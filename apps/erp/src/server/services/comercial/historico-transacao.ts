import 'server-only';
import type { Prisma, TipoHistoricoTransacao, StatusHistoricoTransacao } from '@prisma/client';

/**
 * Contrato publicado por A/comercial (#134): escreve uma entrada no histórico de
 * transacções do cliente (a ficha do cliente lê-o). Corre na transacção do chamador —
 * a entrada nasce e reverte com a operação que a origina. Append-only: nunca se
 * altera nem se apaga; uma mudança posterior (pagamento) é uma entrada nova.
 */
export async function registarHistoricoTransacaoEmTx(
  tx: Prisma.TransactionClient,
  dados: {
    clienteId: string;
    tipo: TipoHistoricoTransacao;
    referencia: string;
    descricao: string;
    valor: Prisma.Decimal | string;
    moeda?: string;
    dataTransacao: Date;
    status: StatusHistoricoTransacao;
  },
  ctx: { tenantId: string; userId: string },
): Promise<void> {
  await tx.historicoTransacao.create({
    data: {
      tenantId: ctx.tenantId,
      clienteId: dados.clienteId,
      tipo: dados.tipo,
      referencia: dados.referencia,
      descricao: dados.descricao,
      valor: dados.valor,
      currency: dados.moeda ?? 'MZN',
      dataTransacao: dados.dataTransacao,
      status: dados.status,
      userId: ctx.userId,
    },
  });
}
