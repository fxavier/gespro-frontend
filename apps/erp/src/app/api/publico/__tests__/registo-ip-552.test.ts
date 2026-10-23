/**
 * #552 — o IP com que o registo público chama o limitador (`${ip}::registo`)
 * é o que o proxy de confiança acrescentou, não o que o cliente escreveu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const registarTenant = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/server/auth/keycloak', () => ({ enviarEmailVerificacao: vi.fn() }));
vi.mock('@/server/provisioning/registo-publico', () => ({
  CORPO_ILEGIVEL: Symbol('ilegivel'),
  registarTenant,
}));

import { POST } from '../registo/route';

beforeEach(() => {
  registarTenant.mockReset();
  registarTenant.mockResolvedValue({ ok: false, estado: 429, code: 'RATE_LIMIT_EXCEEDED', mensagem: 'x', retryAfterSec: 60 });
});

async function ipCom(headers: Record<string, string>): Promise<string> {
  const req = new NextRequest('http://localhost/api/publico/registo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });
  await POST(req, { params: Promise.resolve({}) } as never);
  return (registarTenant.mock.calls[0]?.[1] as { ip: string }).ip;
}

describe('#552 — IP do registo público', () => {
  it('primeiro XFF forjado: o limitador recebe o valor que o proxy acrescentou', async () => {
    expect(await ipCom({ 'x-forwarded-for': '1.2.3.4, 41.220.0.9' })).toBe('41.220.0.9');
  });
});
