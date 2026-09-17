/**
 * O bloqueio de escrita em Leitura, nos dois pipelines (ADR-0032 §2).
 *
 * O ticket #33 chama a lista de excepções «a parte frágil», e nomeia os dois
 * modos de falha que este ficheiro existe para apanhar:
 *
 *   - uma **excepção em falta prende o cliente** — fica em Leitura sem
 *     conseguir ver o que é seu, que é o oposto do que o estado promete;
 *   - uma **excepção a mais fura o bloqueio** — uma escrita passa em silêncio.
 *
 * Testa-se a regra, não cada uma das 358 actions: quem garante a cobertura de
 * todas é o `gate-leitura`, que obriga cada uma a declarar o que faz.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

import { createSafeAction } from '@/server/safe-action';

type Acesso = 'aberto' | 'leitura' | 'fechado';

function sessao(acesso: Acesso, permissions: string[] = ['modulo:escrever']) {
  return {
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      permissions,
      emailVerificado: true,
      acesso,
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

const listar = createSafeAction({
  permission: 'modulo:escrever',
  permiteEmLeitura: true,
  handler: escrita,
});

beforeEach(() => {
  vi.clearAllMocks();
  escrita.mockResolvedValue({ feito: true });
});

describe('escrita em Leitura', () => {
  it('passa com o acesso aberto', async () => {
    mocks.auth.mockResolvedValue(sessao('aberto'));
    const r = await gravar({ valor: 'x' });
    expect(r.ok).toBe(true);
    expect(escrita).toHaveBeenCalled();
  });

  it('é recusada em Leitura, com código estável e sem chegar ao handler', async () => {
    mocks.auth.mockResolvedValue(sessao('leitura'));
    const r = await gravar({ valor: 'x' });

    expect(r).toMatchObject({ ok: false, error: { code: 'ACESSO_LEITURA' } });
    // O handler não corre: a recusa é ANTES de qualquer escrita, e não um
    // rollback depois. Se isto falhar, houve efeito lateral antes da recusa.
    expect(escrita).not.toHaveBeenCalled();
  });

  it('a mensagem diz o que se pode fazer, não só o que não se pode', async () => {
    mocks.auth.mockResolvedValue(sessao('leitura'));
    const r = await gravar({ valor: 'x' });
    if (r.ok) throw new Error('devia ter sido recusada');

    // Quem lê isto está preso e precisa de saber a saída. Um «acesso negado»
    // seco mandava-o abrir um ticket de suporte.
    expect(r.error.message).toMatch(/exportar/i);
    expect(r.error.message).toMatch(/subscreva/i);
  });
});

describe('o que passa em Leitura', () => {
  it('uma leitura declarada passa — senão o cliente não vê o que é seu', async () => {
    mocks.auth.mockResolvedValue(sessao('leitura'));
    const r = await listar(undefined as never);
    expect(r.ok).toBe(true);
    expect(escrita).toHaveBeenCalled();
  });

  it('a declaração não substitui a permissão', async () => {
    // Uma excepção a mais não pode furar OUTRA defesa: quem não tem a
    // permissão continua a levar 403, esteja em que estado estiver.
    mocks.auth.mockResolvedValue(sessao('leitura', []));
    const r = await listar(undefined as never);
    expect(r).toMatchObject({ ok: false, error: { code: 'SEM_PERMISSAO' } });
  });

  it('a permissão é verificada primeiro: sem ela, o motivo não é a subscrição', async () => {
    mocks.auth.mockResolvedValue(sessao('leitura', []));
    const r = await gravar({ valor: 'x' });
    if (r.ok) throw new Error('devia ter sido recusada');
    // Dizer «a sua subscrição terminou» a quem nunca teve a permissão seria
    // uma explicação errada — e mandava-o pagar para nada.
    expect(r.error.code).not.toBe('ACESSO_LEITURA');
  });
});

describe('o acesso fechado nunca chega aqui', () => {
  it('quem está fechado não tem sessão — o pipeline nem é exercitado', async () => {
    // `estadoDeAcesso` devolve `fechado` e o `auth.ts` recusa a sessão, por
    // isso o caso de fronteira do pipeline é «sem sessão», não «fechado».
    mocks.auth.mockResolvedValue(null);
    const r = await gravar({ valor: 'x' });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTENTICADO' } });
    expect(escrita).not.toHaveBeenCalled();
  });
});
