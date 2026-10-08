/**
 * Decisão pendente de um aprovador numa requisição de compra (#108) — puro, client-safe.
 *
 * O nível corrente é o mais alto já criado (o serviço só cria o nível seguinte quando o
 * anterior fecha). Devolve esse nível quando a requisição está EM_APROVACAO e o utilizador
 * tem lá uma decisão PENDENTE; senão `null`. É o mesmo critério do `decidirAprovacao`, que
 * continua a ser quem decide — isto só escolhe o que a UI mostra.
 */
export function nivelPendenteDoAprovador(
  requisicao: {
    status: string;
    aprovacoes: ReadonlyArray<{ nivel: number; aprovadorId: string; status: string }>;
  },
  userId: string,
): number | null {
  if (requisicao.status !== 'EM_APROVACAO' || requisicao.aprovacoes.length === 0) return null;
  const nivelCorrente = Math.max(...requisicao.aprovacoes.map((a) => a.nivel));
  const pendente = requisicao.aprovacoes.some(
    (a) => a.nivel === nivelCorrente && a.aprovadorId === userId && a.status === 'PENDENTE',
  );
  return pendente ? nivelCorrente : null;
}

export const ROTULO_TIPO_CIRCUITO: Record<'REQUISICAO_COMPRA' | 'PEDIDO_COMPRA', string> = {
  REQUISICAO_COMPRA: 'Requisições de compra',
  PEDIDO_COMPRA: 'Pedidos de compra',
};

export const ROTULO_TIPO_APROVACAO: Record<'QUALQUER_UM' | 'TODOS' | 'MAIORIA', string> = {
  QUALQUER_UM: 'Qualquer um',
  TODOS: 'Todos',
  MAIORIA: 'Maioria',
};
