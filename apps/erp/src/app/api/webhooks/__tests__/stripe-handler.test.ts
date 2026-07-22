/**
 * Testes do Route Handler `POST /api/webhooks/stripe`.
 *
 * O que interessa aqui não é o negócio (esse está em `assinatura.service`), mas
 * **o código de estado devolvido ao Stripe**: é ele que decide se o evento é
 * reentregue ou perdido para sempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumir: vi.fn(),
  verificarAssinatura: vi.fn(),
  processar: vi.fn(),
  eventoUpdateMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/server/security/rate-limiter', () => ({
  webhookLimiter: { consume: mocks.consumir },
}));
vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  verificarAssinaturaWebhook: mocks.verificarAssinatura,
  processarEventoWebhook: mocks.processar,
}));
vi.mock('@/server/db/client', () => ({
  prismaBase: { eventoWebhookStripe: { updateMany: mocks.eventoUpdateMany } },
}));

import { NextRequest } from 'next/server';
import { POST } from '../stripe/route';
import { AppError } from '@/lib/errors';

function pedido(headers: Record<string, string> = {}, corpo = '{"id":"evt_1"}') {
  return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: corpo,
  });
}

const ASSINADO = { 'stripe-signature': 't=1,v1=abc' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumir.mockResolvedValue({ limited: false, remaining: 99, retryAfterSec: 0 });
  mocks.verificarAssinatura.mockReturnValue({ id: 'evt_1', type: 'invoice.paid' });
  mocks.processar.mockResolvedValue({
    duplicado: false,
    tipo: 'invoice.paid',
    tenantId: 'tenant-1',
    transitou: true,
    naoResolvido: false,
  });
  mocks.eventoUpdateMany.mockResolvedValue({ count: 1 });
});

describe('autenticação por assinatura', () => {
  it('400 ASSINATURA_AUSENTE sem o cabeçalho stripe-signature', async () => {
    const res = await POST(pedido());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('ASSINATURA_AUSENTE');
    expect(mocks.processar).not.toHaveBeenCalled();
  });

  it('400 ASSINATURA_INVALIDA quando o HMAC não confere', async () => {
    mocks.verificarAssinatura.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('ASSINATURA_INVALIDA');
    expect(mocks.processar).not.toHaveBeenCalled();
  });

  it('503 (e não 400) quando a configuração do Stripe falta', async () => {
    // 400 diria ao Stripe que o pedido é malformado e ele desistiria da
    // reentrega — um deploy mal configurado perderia eventos em silêncio.
    mocks.verificarAssinatura.mockImplementation(() => {
      throw new AppError('STRIPE_NAO_CONFIGURADO', 'Faturação indisponível.', 503);
    });
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('STRIPE_NAO_CONFIGURADO');
  });

  it('verifica a assinatura sobre o corpo CRU, não sobre JSON reserializado', async () => {
    const corpo = '{"id":"evt_1","type":"invoice.paid","x":  1}';
    await POST(pedido(ASSINADO, corpo));
    expect(mocks.verificarAssinatura).toHaveBeenCalledWith(corpo, 't=1,v1=abc');
  });
});

describe('resposta ao Stripe', () => {
  it('200 quando o evento é processado', async () => {
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { recebido: true, duplicado: false } });
  });

  it('200 com duplicado=true numa reentrega', async () => {
    mocks.processar.mockResolvedValue({
      duplicado: true,
      tipo: 'invoice.paid',
      tenantId: 'tenant-1',
      transitou: false,
      naoResolvido: false,
    });
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(200);
    expect((await res.json()).data.duplicado).toBe(true);
  });

  it('BLOCKER-2: 503 com Retry-After quando o tenant não foi resolvido', async () => {
    mocks.processar.mockResolvedValue({
      duplicado: false,
      tipo: 'customer.subscription.created',
      tenantId: null,
      transitou: false,
      naoResolvido: true,
    });
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect((await res.json()).error.code).toBe('TENANT_NAO_RESOLVIDO');
  });

  it('500 numa falha de processamento, para o Stripe reentregar', async () => {
    mocks.processar.mockRejectedValue(new Error('DB em baixo'));
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('WEBHOOK_FALHOU');
    expect(JSON.stringify(body)).not.toContain('DB em baixo');
  });

  it('429 com Retry-After quando o IP excede o limite', async () => {
    mocks.consumir.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 45 });
    const res = await POST(pedido(ASSINADO));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('45');
    expect(mocks.verificarAssinatura).not.toHaveBeenCalled();
  });
});
