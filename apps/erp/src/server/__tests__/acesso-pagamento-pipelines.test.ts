/**
 * Oráculo da issue #99 — o nível de acesso `pagamento` nos dois pipelines.
 *
 * Com a Assinatura FECHADA (comercial), quem tem permissão de gerir a
 * subscrição entra numa sessão restrita, `acesso === 'pagamento'`, só para
 * regularizar. Os pipelines tratam-na como a Leitura (ADR-0032 §2):
 *
 *   - escrita recusada, com o mesmo código estável `ACESSO_LEITURA` (409), e
 *     ANTES do handler — nenhum efeito lateral;
 *   - as actions/rotas que declaram `permiteEmLeitura` (as três de subscrição
 *     inclusive) passam — senão o cliente entrava para pagar e não conseguia;
 *   - a declaração não substitui a permissão.
 *
 * Os mocks seguem `safe-action-leitura.test.ts`. O valor `'pagamento'` vai
 * como string solta: o tipo `EstadoAcesso` ainda não o conhece, e o caso tem
 * de falhar pela asserção, não pelo `tsc`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

import { createSafeAction } from '@/server/safe-action';
import { withApi } from '@/lib/api/with-api';

const PAGAMENTO = 'pagamento' as unknown as 'leitura';

function sessao(acesso: string, permissions: string[] = ['assinatura:gerir', 'modulo:escrever']) {
  return {
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      permissions,
      emailVerificado: true,
      acesso: acesso as 'leitura',
    },
  };
}

const escrita = vi.fn().mockResolvedValue({ feito: true });

const gravar = createSafeAction({
  schema: z.object({ valor: z.string() }),
  permission: 'modulo:escrever',
  revalidate: { paths: ['/algures'] },
  handler: escrita,
});

// Molde das actions de subscrição: escrevem (abrem Checkout/Portal) e declaram
// a bandeira — é por elas que o cliente sai do `pagamento`.
const subscrever = createSafeAction({
  schema: z.object({ plano: z.string() }),
  permission: 'assinatura:gerir',
  permiteEmLeitura: true,
  handler: escrita,
});

const rotaHandler = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
const rotaEscrita = withApi(rotaHandler, { permission: 'modulo:escrever' });
const rotaDeclarada = withApi(rotaHandler, {
  permission: 'assinatura:gerir',
  permiteEmLeitura: true,
});

function pedido(method: string) {
  return new NextRequest('http://localhost/api/algures', { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  escrita.mockResolvedValue({ feito: true });
  rotaHandler.mockImplementation(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
});

describe('createSafeAction com acesso `pagamento` (issue #99)', () => {
  it('a escrita é recusada como na Leitura, antes do handler', async () => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO));
    const r = await gravar({ valor: 'x' });

    expect(r).toMatchObject({ ok: false, error: { code: 'ACESSO_LEITURA' } });
    expect(escrita).not.toHaveBeenCalled();
  });

  it('uma action de subscrição (permiteEmLeitura) passa — é a saída', async () => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO));
    const r = await subscrever({ plano: 'BASICO' });

    expect(r.ok).toBe(true);
    expect(escrita).toHaveBeenCalled();
  });

  it('a declaração não substitui a permissão', async () => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO, []));
    const r = await subscrever({ plano: 'BASICO' });
    expect(r).toMatchObject({ ok: false, error: { code: 'SEM_PERMISSAO' } });
    expect(escrita).not.toHaveBeenCalled();
  });
});

describe('withApi com acesso `pagamento` (issue #99)', () => {
  it('um POST sem declaração é recusado com 409 ACESSO_LEITURA, antes do handler', async () => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO));
    const res = await rotaEscrita(pedido('POST'));

    expect(res.status).toBe(409);
    const corpo = await res.json();
    expect(corpo.error.code).toBe('ACESSO_LEITURA');
    expect(rotaHandler).not.toHaveBeenCalled();
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('um %s sem declaração também é recusado', async (m) => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO));
    const res = await rotaEscrita(pedido(m));
    expect(res.status).toBe(409);
    expect(rotaHandler).not.toHaveBeenCalled();
  });

  it('um POST declarado (permiteEmLeitura) passa', async () => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO));
    const res = await rotaDeclarada(pedido('POST'));
    expect(res.status).toBe(200);
    expect(rotaHandler).toHaveBeenCalled();
  });

  it('um GET passa — exportar nunca se trava', async () => {
    mocks.auth.mockResolvedValue(sessao(PAGAMENTO));
    const res = await rotaEscrita(pedido('GET'));
    expect(res.status).toBe(200);
  });
});
