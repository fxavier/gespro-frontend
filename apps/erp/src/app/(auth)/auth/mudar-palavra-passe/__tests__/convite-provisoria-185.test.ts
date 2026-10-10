/**
 * #185 — o ecrã «Defina a sua palavra-passe» é só da palavra-passe provisória.
 *
 * Um convidado que ainda não concluiu o convite (`VERIFY_EMAIL` pendente) não
 * se resolve aqui: escrever-lhe uma palavra-passe definitiva limpa o
 * `UPDATE_PASSWORD` mas deixa o `VERIFY_EMAIL`, e o *direct grant* continua a
 * recusar — a pessoa fica num ciclo login → mudar → login. A acção tem de o
 * recusar com mensagem própria e NÃO escrever nada no Keycloak (opção mais
 * conservadora: nenhum dado alterado).
 *
 * O caso feliz da provisória (ADR-0030 §4) fica guardado ao lado, para que a
 * correcção não o parta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const autenticarPorPalavraPasse = vi.fn();
const definirPalavraPasse = vi.fn();
const procurarPorEmail = vi.fn();

vi.mock('@/server/auth/direct-grant', () => ({
  autenticarPorPalavraPasse: (...a: unknown[]) => autenticarPorPalavraPasse(...a),
}));
vi.mock('@/server/auth/keycloak', () => ({
  definirPalavraPasse: (...a: unknown[]) => definirPalavraPasse(...a),
  procurarPorEmail: (...a: unknown[]) => procurarPorEmail(...a),
}));
vi.mock('@/server/security/rate-limiter', () => ({
  loginLimiter: {
    check: vi.fn(async () => ({ limited: false, retryAfterSec: 0 })),
    increment: vi.fn(async () => undefined),
  },
}));
vi.mock('@/server/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { mudarPalavraPasse } from '../actions';

const DADOS = {
  identificador: 'convidado.185@demo.mz',
  actual: 'Provisoria-185-x',
  nova: 'UmaNovaSegura-2026',
  confirmacao: 'UmaNovaSegura-2026',
};

beforeEach(() => {
  vi.clearAllMocks();
  procurarPorEmail.mockResolvedValue({ id: 'sub-convidado-185', email: DADOS.identificador });
  definirPalavraPasse.mockResolvedValue(undefined);
});

describe('#185 — mudarPalavraPasse com o convite por concluir', () => {
  it('recusa com mensagem própria sobre o convite e não escreve a palavra-passe', async () => {
    autenticarPorPalavraPasse.mockResolvedValue({ ok: false, motivo: 'convite-por-concluir' });

    const r = (await mudarPalavraPasse(DADOS)) as { ok: boolean; erro?: string };

    expect(r.ok).toBe(false);
    expect(r.erro ?? '').toMatch(/convite/i);
    // Não é «palavra-passe errada»: a palavra-passe estava certa.
    expect(r.erro ?? '').not.toMatch(/incorrect/i);
    expect(definirPalavraPasse).not.toHaveBeenCalled();
  });
});

describe('#185 — a palavra-passe provisória continua a resolver-se aqui', () => {
  it('conta-por-activar (só UPDATE_PASSWORD) escreve a nova como definitiva', async () => {
    autenticarPorPalavraPasse.mockResolvedValue({ ok: false, motivo: 'conta-por-activar' });

    const r = await mudarPalavraPasse(DADOS);

    expect(r).toEqual({ ok: true });
    expect(definirPalavraPasse).toHaveBeenCalledWith('sub-convidado-185', DADOS.nova, {
      temporaria: false,
    });
  });
});
