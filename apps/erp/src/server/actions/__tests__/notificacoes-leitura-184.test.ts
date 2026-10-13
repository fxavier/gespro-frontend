/**
 * Oráculo da issue #184 — notificações em modo Leitura (nó C:notificacoes-export-leitura-183-184;
 * escrito pelo VERIFICADOR — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * Contrato: em Leitura (ADR-0027 §6, ADR-0032 §2) o utilizador continua a poder marcar as SUAS
 * notificações como lidas e a mudar as SUAS preferências. São dados do próprio utilizador, não
 * dados do tenant — as três actions de `notificacoes.actions.ts` declaram `permiteEmLeitura: true`.
 * O `gate-leitura` tem de continuar verde (e continua: as três já declaram `revalidate`).
 *
 * O que NÃO muda (para que a excepção não fure mais do que devia):
 *   - continua a ser preciso ter sessão (sem sessão → UNAUTHORIZED, sem chegar ao serviço);
 *   - com o acesso aberto continua tudo a passar;
 *   - o serviço continua a receber o ctx da sessão (tenantId/userId nunca vêm do cliente).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  marcarLida: vi.fn(),
  marcarTodasLidas: vi.fn(),
  actualizarPreferencia: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: h.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/server/services/plataforma/notificacao.service', () => ({
  notificacaoService: {
    marcarLida: h.marcarLida,
    marcarTodasLidas: h.marcarTodasLidas,
    actualizarPreferencia: h.actualizarPreferencia,
  },
}));

type Acesso = 'aberto' | 'leitura';

function sessao(acesso: Acesso) {
  return {
    user: {
      id: 'user-184',
      tenantId: 'tenant-184',
      // Nenhuma permissão: as actions de notificações são self-scoped e não têm permissão RBAC.
      permissions: [] as string[],
      emailVerificado: true,
      acesso,
    },
  };
}

const ID_NOTIFICACAO = 'clh3am8ka0000qwer1234abcd'; // cuid válido para o MarcarLidaSchema

async function actions(): Promise<any> {
  return import('@/server/actions/notificacoes.actions');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.marcarLida.mockResolvedValue(undefined);
  h.marcarTodasLidas.mockResolvedValue({ count: 3 });
  h.actualizarPreferencia.mockResolvedValue(undefined);
});

describe('#184 — em Leitura, o utilizador gere as suas notificações', () => {
  it('marcar uma notificação como lida passa em Leitura e chega ao serviço com o ctx da sessão', async () => {
    h.auth.mockResolvedValue(sessao('leitura'));
    const { marcarNotificacaoLida } = await actions();

    const r = await marcarNotificacaoLida({ id: ID_NOTIFICACAO });

    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(h.marcarLida).toHaveBeenCalledTimes(1);
    expect(h.marcarLida.mock.calls[0]![0]).toBe(ID_NOTIFICACAO);
    expect(h.marcarLida.mock.calls[0]![1]).toMatchObject({ tenantId: 'tenant-184', userId: 'user-184' });
  });

  it('marcar todas como lidas passa em Leitura', async () => {
    h.auth.mockResolvedValue(sessao('leitura'));
    const { marcarTodasNotificacoesLidas } = await actions();

    const r = await marcarTodasNotificacoesLidas(undefined);

    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(h.marcarTodasLidas).toHaveBeenCalledTimes(1);
    expect(h.marcarTodasLidas.mock.calls[0]![0]).toMatchObject({ tenantId: 'tenant-184', userId: 'user-184' });
  });

  it('mudar uma preferência de notificação passa em Leitura', async () => {
    h.auth.mockResolvedValue(sessao('leitura'));
    const { actualizarPreferenciaNotificacao } = await actions();

    const r = await actualizarPreferenciaNotificacao({ tipo: 'ALERTA_SISTEMA', canais: ['IN_APP'] });

    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(h.actualizarPreferencia).toHaveBeenCalledTimes(1);
    expect(h.actualizarPreferencia.mock.calls[0]!.slice(0, 2)).toEqual(['ALERTA_SISTEMA', ['IN_APP']]);
    expect(h.actualizarPreferencia.mock.calls[0]![2]).toMatchObject({ tenantId: 'tenant-184', userId: 'user-184' });
  });

  it('nenhuma das três é recusada com ACESSO_LEITURA', async () => {
    h.auth.mockResolvedValue(sessao('leitura'));
    const a = await actions();
    const resultados = [
      await a.marcarNotificacaoLida({ id: ID_NOTIFICACAO }),
      await a.marcarTodasNotificacoesLidas(undefined),
      await a.actualizarPreferenciaNotificacao({ tipo: 'ALERTA_SISTEMA', canais: [] }),
    ];
    const codigos = resultados.map((r: any) => (r.ok ? 'ok' : r.error?.code));
    expect(codigos).toEqual(['ok', 'ok', 'ok']);
  });
});

describe('#184 — a excepção não fura mais do que devia', () => {
  it('com o acesso aberto continua a passar', async () => {
    h.auth.mockResolvedValue(sessao('aberto'));
    const { marcarNotificacaoLida } = await actions();
    const r = await marcarNotificacaoLida({ id: ID_NOTIFICACAO });
    expect(r).toMatchObject({ ok: true });
    expect(h.marcarLida).toHaveBeenCalledTimes(1);
  });

  it('sem sessão continua recusada e não chega ao serviço', async () => {
    h.auth.mockResolvedValue(null);
    const a = await actions();
    const r1 = await a.marcarNotificacaoLida({ id: ID_NOTIFICACAO });
    const r2 = await a.marcarTodasNotificacoesLidas(undefined);
    const r3 = await a.actualizarPreferenciaNotificacao({ tipo: 'ALERTA_SISTEMA', canais: ['IN_APP'] });
    for (const r of [r1, r2, r3]) expect(r.ok).toBe(false);
    expect(h.marcarLida).not.toHaveBeenCalled();
    expect(h.marcarTodasLidas).not.toHaveBeenCalled();
    expect(h.actualizarPreferencia).not.toHaveBeenCalled();
  });

  it('em Leitura, input inválido continua a ser recusado pela validação (não pelo acesso)', async () => {
    h.auth.mockResolvedValue(sessao('leitura'));
    const { marcarNotificacaoLida } = await actions();
    const r = await marcarNotificacaoLida({ id: 'nao-e-um-id' });
    expect(r.ok).toBe(false);
    expect(r.error.code).not.toBe('ACESSO_LEITURA');
    expect(h.marcarLida).not.toHaveBeenCalled();
  });
});
