/**
 * Testes do Route Handler `POST /api/publico/registo`.
 *
 * Cobrem o **contrato publicado** em `docs/handoff/site-provisionamento.md` §2:
 * a forma da resposta 201 e cada código de erro que o site (spec 18) mapeia em
 * copy própria. Se um destes mudar, o site parte — daí serem testados aqui e
 * não só nos serviços.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  provisionarTenant: vi.fn(),
  criarSubscricaoTrial: vi.fn(),
  verificarCaptcha: vi.fn(),
  reservarChave: vi.fn(),
  concluirChave: vi.fn(),
  falharChave: vi.fn(),
  consumir: vi.fn(),
  enviar: vi.fn(),
  tenantFindFirst: vi.fn(),
  notificacaoUpdateMany: vi.fn(),
}));

// `withApi` importa `@/lib/auth` (next-auth), que não resolve fora do runtime
// Next. O endpoint é `public: true` e nunca chama `auth()` — basta o stub.
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

vi.mock('@/server/services/plataforma/tenant-provisioning.service', () => ({
  provisionarTenant: mocks.provisionarTenant,
}));
vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  criarSubscricaoTrial: mocks.criarSubscricaoTrial,
}));
vi.mock('@/server/security/captcha', () => ({ verificarCaptcha: mocks.verificarCaptcha }));
vi.mock('@/server/provisioning/idempotencia', async () => {
  const real = await vi.importActual<typeof import('@/server/provisioning/idempotencia')>(
    '@/server/provisioning/idempotencia',
  );
  return {
    fingerprintDe: real.fingerprintDe,
    reservarChave: mocks.reservarChave,
    concluirChave: mocks.concluirChave,
    falharChave: mocks.falharChave,
  };
});
vi.mock('@/server/security/rate-limiter', () => ({
  registoLimiter: { consume: mocks.consumir },
}));
vi.mock('@/server/email', () => ({ emailProvider: { enviar: mocks.enviar } }));
vi.mock('@/server/db/client', () => ({
  prismaBase: {
    tenant: { findFirst: mocks.tenantFindFirst },
    notificacao: { updateMany: mocks.notificacaoUpdateMany },
  },
}));

import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../registo/route';
import { BusinessRuleError } from '@/lib/errors';

const CORPO_VALIDO = {
  empresa: { nome: 'Padaria Ana, Lda', nuit: '400123456' },
  admin: { nome: 'Ana Sitoe', email: 'ana@padaria.mz', senha: 'segredo123' },
  planoId: 'PROFISSIONAL',
  provincia: 'Maputo Cidade',
  captchaToken: 'ok',
};

function pedido(corpo: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/publico/registo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://www.gespro.mz',
      ...headers,
    },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

const COM_CHAVE = { 'idempotency-key': '11111111-2222-3333-4444-555555555555' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ALLOWED_ORIGINS = 'https://www.gespro.mz';
  mocks.consumir.mockResolvedValue({ limited: false, remaining: 4, retryAfterSec: 0 });
  mocks.reservarChave.mockResolvedValue({ tipo: 'NOVA' });
  mocks.verificarCaptcha.mockResolvedValue({ valido: true });
  mocks.provisionarTenant.mockResolvedValue({
    tenantId: 'tenant-1',
    tenantSlug: 'padaria-ana-lda',
    userId: 'user-1',
    adminEmail: 'ana@padaria.mz',
    adminNome: 'Ana Sitoe',
    handoffToken: 'tok-handoff',
    tokenVerificacaoEmail: 'tok-verif',
    notificacaoBoasVindasId: 'notif-1',
  });
  mocks.tenantFindFirst.mockResolvedValue({ nome: 'Padaria Ana, Lda' });
  mocks.enviar.mockResolvedValue(undefined);
  mocks.notificacaoUpdateMany.mockResolvedValue({ count: 1 });
  mocks.criarSubscricaoTrial.mockResolvedValue({ criada: true });
});

describe('201 — contrato de sucesso', () => {
  it('devolve tenantSlug e handoffToken no topo do corpo (sem envelope)', async () => {
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      tenantSlug: 'padaria-ana-lda',
      handoffToken: 'tok-handoff',
    });
  });

  it('devolve CORS para a origem do site na allowlist', async () => {
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.gespro.mz');
  });

  it('conclui a chave de idempotência com a resposta e o tenant', async () => {
    await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(mocks.concluirChave).toHaveBeenCalledWith(
      expect.any(String),
      { tenantSlug: 'padaria-ana-lda', handoffToken: 'tok-handoff' },
      'tenant-1',
    );
  });

  it('envia o email de verificação FORA da transacção e marca ENVIADO', async () => {
    await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(mocks.enviar).toHaveBeenCalledTimes(1);
    expect(mocks.enviar.mock.calls[0][0].para).toBe('ana@padaria.mz');
    expect(mocks.notificacaoUpdateMany.mock.calls[0][0].data.estadoEnvio).toBe('ENVIADO');
  });

  it('uma falha de email não invalida o registo — fica FALHA para reenvio', async () => {
    mocks.enviar.mockRejectedValue(new Error('smtp down'));
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(201);
    expect(mocks.notificacaoUpdateMany.mock.calls[0][0].data.estadoEnvio).toBe('FALHA');
  });
});

describe('códigos de erro publicados', () => {
  it('IDEMPOTENCY_KEY_OBRIGATORIA (400) sem o cabeçalho', async () => {
    const res = await POST(pedido(CORPO_VALIDO));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_OBRIGATORIA');
    expect(body.traceId).toBeTruthy();
    expect(body.erro).toBeTruthy();
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
  });

  it('IDEMPOTENCY_KEY_OBRIGATORIA (400) com chave curta de mais', async () => {
    const res = await POST(pedido(CORPO_VALIDO, { 'idempotency-key': 'curta' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('IDEMPOTENCY_KEY_OBRIGATORIA');
  });

  it('JSON_INVALIDO (400) com corpo que não é JSON', async () => {
    const res = await POST(pedido('{ isto não é json', COM_CHAVE));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('JSON_INVALIDO');
  });

  it('VALIDACAO (422) com NUIT inválido, e devolve fieldErrors', async () => {
    const res = await POST(
      pedido({ ...CORPO_VALIDO, empresa: { nome: 'X Lda', nuit: '111111111' } }, COM_CHAVE),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDACAO');
    expect(body.error.details.fieldErrors).toBeDefined();
  });

  it('VALIDACAO (422) com província fora de Moçambique', async () => {
    const res = await POST(pedido({ ...CORPO_VALIDO, provincia: 'Lisboa' }, COM_CHAVE));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('VALIDACAO');
  });

  it('VALIDACAO (422) com senha fraca — e nunca chega ao captcha', async () => {
    const res = await POST(
      pedido({ ...CORPO_VALIDO, admin: { ...CORPO_VALIDO.admin, senha: 'abc' } }, COM_CHAVE),
    );
    expect(res.status).toBe(422);
    expect(mocks.verificarCaptcha).not.toHaveBeenCalled();
  });

  it('CAPTCHA_INVALIDO (403) e liberta a chave para nova tentativa', async () => {
    mocks.verificarCaptcha.mockResolvedValue({ valido: false, motivo: 'captcha_invalido' });
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('CAPTCHA_INVALIDO');
    expect(mocks.falharChave).toHaveBeenCalled();
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
  });

  it('NUIT_JA_REGISTADO (409) propagado do serviço', async () => {
    mocks.provisionarTenant.mockRejectedValue(
      new BusinessRuleError('NUIT_JA_REGISTADO', 'Já existe uma conta com este NUIT.'),
    );
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('NUIT_JA_REGISTADO');
    expect(mocks.falharChave).toHaveBeenCalled();
  });

  it('REGISTO_EM_CURSO (409) quando a mesma chave ainda está a ser processada', async () => {
    mocks.reservarChave.mockResolvedValue({ tipo: 'EM_CURSO' });
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('REGISTO_EM_CURSO');
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
  });

  it('IDEMPOTENCY_KEY_REUTILIZADA (409) com a mesma chave e corpo diferente', async () => {
    mocks.reservarChave.mockResolvedValue({ tipo: 'CONFLITO' });
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('IDEMPOTENCY_KEY_REUTILIZADA');
  });

  it('429 com Retry-After quando o IP excede o limite', async () => {
    mocks.consumir.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 120 });
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
  });

  it('ERRO_INTERNO (500) sem stack em falha inesperada', async () => {
    mocks.provisionarTenant.mockRejectedValue(new Error('ligação perdida'));
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('ERRO_INTERNO');
    expect(body.traceId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('ligação perdida');
    expect(mocks.falharChave).toHaveBeenCalled();
  });
});

describe('idempotência no handler', () => {
  it('repetição devolve 201 com a MESMA resposta, sem reprovisionar', async () => {
    mocks.reservarChave.mockResolvedValue({
      tipo: 'REPETIDA',
      resposta: { tenantSlug: 'padaria-ana-lda', handoffToken: 'tok-original' },
    });
    const res = await POST(pedido(CORPO_VALIDO, COM_CHAVE));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      tenantSlug: 'padaria-ana-lda',
      handoffToken: 'tok-original',
    });
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
  });
});

describe('preflight CORS', () => {
  it('MAJOR-5: autoriza o cabeçalho Idempotency-Key', async () => {
    const req = new NextRequest('http://localhost:3000/api/publico/registo', {
      method: 'OPTIONS',
      headers: { origin: 'https://www.gespro.mz' },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(204);
    // Sem isto o browser recusa o POST antes sequer de o enviar.
    expect(res.headers.get('access-control-allow-headers')).toContain('Idempotency-Key');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.gespro.mz');
  });

  it('não emite Allow-Origin para origem fora da allowlist', async () => {
    const req = new NextRequest('http://localhost:3000/api/publico/registo', {
      method: 'OPTIONS',
      headers: { origin: 'https://atacante.example' },
    });
    const res = OPTIONS(req);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
