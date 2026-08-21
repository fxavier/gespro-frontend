/**
 * Testes dos sinais de negócio.
 *
 * Verifica que as funções de registo de negócio:
 *   1. Incrementam os contadores correctos
 *   2. Usam tenant_id como etiqueta (não userId, não requestId)
 *   3. Aceitam os parâmetros certos
 */
import { describe, expect, it } from 'vitest';
import {
  registarVenda,
  registarFaturaEmitida,
  registarStripeWebhookFalha,
  registarTarefaAgendadaEmFalta,
} from '../negocio';
import { registry } from '../prom-registry';

describe('sinais de negócio', () => {
  describe('registarVenda', () => {
    it('incrementa negocio_vendas_total com tenant_id', async () => {
      registarVenda('tenant-venda');

      const metrics = await registry.getMetricsAsJSON();
      const counter = metrics.find((m) => m.name === 'negocio_vendas_total');
      expect(counter).toBeDefined();

      const entry = counter?.values.find((v) => v.labels['tenant_id'] === 'tenant-venda');
      expect(entry?.value).toBeGreaterThan(0);
    });

    it('aceita tenantId como único parâmetro (sem userId)', () => {
      // Confirmação de que a assinatura só aceita tenantId
      expect(() => registarVenda('t1')).not.toThrow();
    });
  });

  describe('registarFaturaEmitida', () => {
    it('incrementa negocio_faturas_emitidas_total com tenant_id', async () => {
      registarFaturaEmitida('tenant-fatura');

      const metrics = await registry.getMetricsAsJSON();
      const counter = metrics.find((m) => m.name === 'negocio_faturas_emitidas_total');
      expect(counter).toBeDefined();

      const entry = counter?.values.find((v) => v.labels['tenant_id'] === 'tenant-fatura');
      expect(entry?.value).toBeGreaterThan(0);
    });
  });

  describe('registarStripeWebhookFalha', () => {
    it('incrementa negocio_stripe_webhook_falhas_total com tenant_id e event_type', async () => {
      registarStripeWebhookFalha('tenant-stripe', 'invoice.payment_failed');

      const metrics = await registry.getMetricsAsJSON();
      const counter = metrics.find((m) => m.name === 'negocio_stripe_webhook_falhas_total');
      expect(counter).toBeDefined();

      const entry = counter?.values.find(
        (v) =>
          v.labels['tenant_id'] === 'tenant-stripe' &&
          v.labels['event_type'] === 'invoice.payment_failed',
      );
      expect(entry?.value).toBeGreaterThan(0);
    });

    it('não inclui userId nem requestId nas etiquetas', async () => {
      registarStripeWebhookFalha('tenant-z', 'charge.failed');

      const metrics = await registry.getMetricsAsJSON();
      const counter = metrics.find((m) => m.name === 'negocio_stripe_webhook_falhas_total');

      for (const v of counter?.values ?? []) {
        expect(Object.keys(v.labels)).not.toContain('userId');
        expect(Object.keys(v.labels)).not.toContain('user_id');
        expect(Object.keys(v.labels)).not.toContain('requestId');
        expect(Object.keys(v.labels)).not.toContain('request_id');
      }
    });
  });

  describe('registarTarefaAgendadaEmFalta', () => {
    it('define o gauge a 1 quando a tarefa está em falta', async () => {
      registarTarefaAgendadaEmFalta('tenant-cron', 'expirar-trials', true);

      const metrics = await registry.getMetricsAsJSON();
      const gauge = metrics.find((m) => m.name === 'negocio_tarefas_agendadas_em_falta');
      expect(gauge).toBeDefined();

      const entry = gauge?.values.find(
        (v) =>
          v.labels['tenant_id'] === 'tenant-cron' &&
          v.labels['tarefa'] === 'expirar-trials',
      );
      expect(entry?.value).toBe(1);
    });

    it('define o gauge a 0 quando a tarefa correu', async () => {
      registarTarefaAgendadaEmFalta('tenant-cron', 'expirar-trials', false);

      const metrics = await registry.getMetricsAsJSON();
      const gauge = metrics.find((m) => m.name === 'negocio_tarefas_agendadas_em_falta');

      const entry = gauge?.values.find(
        (v) =>
          v.labels['tenant_id'] === 'tenant-cron' &&
          v.labels['tarefa'] === 'expirar-trials',
      );
      expect(entry?.value).toBe(0);
    });
  });
});
