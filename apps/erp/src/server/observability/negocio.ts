import 'server-only';
import {
  negocioVendasTotal,
  negocioFaturasEmitidasTotal,
  negocioStripeWebhookFalhasTotal,
  negocioTarefasAgendadasEmFalta,
} from './prom-registry';

/**
 * Sinais de negócio (ADR-0019 §2).
 *
 * Funções de registo que os serviços de domínio chamam ao concluir operações
 * de negócio relevantes. Separadas dos serviços para manter a fronteira de
 * domínio limpa e para poder substituir a implementação sem tocar nos serviços.
 *
 * Regra de cardinalidade:
 *   - tenant_id: etiqueta OBRIGATÓRIA (cardinalidade controlada)
 *   - user_id, request_id: PROIBIDOS como etiqueta — vão no log e no trace
 *
 * Exemplo de integração num serviço:
 *   import { registarVenda } from '@/server/observability/negocio';
 *   // Após confirmar a transacção:
 *   registarVenda(tenantId);
 */

/**
 * Regista uma venda processada com sucesso.
 * Chamado pelo serviço de vendas/POS ao confirmar a transacção.
 * A queda a zero para um tenant activo é frequentemente o primeiro sinal de avaria.
 */
export function registarVenda(tenantId: string): void {
  negocioVendasTotal.inc({ tenant_id: tenantId });
}

/**
 * Regista uma factura emitida definitivamente.
 * Chamado pelo serviço de faturação ao passar para estado EMITIDA.
 * Facturas em rascunho não contam.
 */
export function registarFaturaEmitida(tenantId: string): void {
  negocioFaturasEmitidasTotal.inc({ tenant_id: tenantId });
}

/**
 * Regista uma falha no processamento de um webhook Stripe.
 * Chamado pelo handler /api/webhooks/stripe quando o processamento falha.
 * SLO: 99,9 % dos webhooks processados em 5 min (ADR-0019 §3).
 */
export function registarStripeWebhookFalha(tenantId: string, eventType: string): void {
  negocioStripeWebhookFalhasTotal.inc({
    tenant_id: tenantId,
    event_type: eventType,
  });
}

/**
 * Sinaliza o estado de uma tarefa agendada.
 * emFalta = true: a tarefa não correu na janela esperada → gauge = 1
 * emFalta = false: a tarefa correu com sucesso → gauge = 0
 *
 * Chamado pelos handlers de cron (/api/cron/*) no início e no fim.
 * Padrão recomendado:
 *   1. No início do cron: verificar se a tarefa anterior correu (gauge > 0 → alerta)
 *   2. No fim do cron (sucesso): registarTarefaAgendadaEmFalta(tenantId, tarefa, false)
 *   3. No fim do cron (falha): registarTarefaAgendadaEmFalta(tenantId, tarefa, true)
 */
export function registarTarefaAgendadaEmFalta(
  tenantId: string,
  tarefa: string,
  emFalta: boolean,
): void {
  negocioTarefasAgendadasEmFalta.set({ tenant_id: tenantId, tarefa }, emFalta ? 1 : 0);
}
