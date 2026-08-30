/**
 * Reconciliação identidade↔autorização (ADR-0013 §3) — rede dublada.
 * O que se fixa: reporta e NUNCA repara; alerta por taxa (§6-quater), não por
 * linha; órfãos recentes (<1 h) não contam; fixtures de carga (sub não-UUID)
 * são ignoradas em vez de poluírem o relatório todos os dias.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/server/db/client', () => ({ prismaBase: { user: { findMany: db.findMany } } }));

const logs = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock('@/server/observability/logger', () => ({ logger: logs }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { reconciliarIdentidades } from '../reconciliacao';

const AGORA = Date.now();
const VELHO = AGORA - 2 * 60 * 60 * 1000;
const RECENTE = AGORA - 5 * 60 * 1000;

function resposta(corpo: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => corpo } as Response;
}

function prepararRealm(users: unknown[]) {
  // 1º fetch: token da conta de serviço; 2º: página única de utilizadores.
  fetchMock.mockResolvedValueOnce(resposta({ access_token: 't', expires_in: 60 }));
  fetchMock.mockResolvedValueOnce(resposta(users));
}

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RECONCILIACAO_LIMIAR_ORFAOS;
});

describe('reconciliarIdentidades', () => {
  it('sem divergências: relatório limpo, sem alertas, NENHUMA escrita', async () => {
    prepararRealm([{ id: uuid(1), createdTimestamp: VELHO }]);
    db.findMany.mockResolvedValue([{ keycloakSub: uuid(1), email: 'a@b.mz', tenantId: 't1' }]);

    const r = await reconciliarIdentidades();
    expect(r).toMatchObject({ keycloakSemLocal: 0, localSemKeycloak: 0, alerta: false });
    expect(logs.error).not.toHaveBeenCalled();
  });

  it('User local sem identidade no realm é SEMPRE alerta — é quem não entra', async () => {
    prepararRealm([]);
    db.findMany.mockResolvedValue([{ keycloakSub: uuid(9), email: 'x@y.mz', tenantId: 't1' }]);

    const r = await reconciliarIdentidades();
    expect(r.localSemKeycloak).toBe(1);
    expect(r.alerta).toBe(true);
    expect(logs.error).toHaveBeenCalledWith(
      expect.objectContaining({ contagem: 1 }),
      expect.stringContaining('não conseguem entrar'),
    );
  });

  it('órfãos Keycloak: warn abaixo do limiar, error (alerta) acima — por taxa, não por linha', async () => {
    prepararRealm([
      { id: uuid(1), createdTimestamp: VELHO },
      { id: uuid(2), createdTimestamp: VELHO },
    ]);
    db.findMany.mockResolvedValue([]);

    const abaixo = await reconciliarIdentidades();
    expect(abaixo.keycloakSemLocal).toBe(2);
    expect(abaixo.alerta).toBe(false);
    expect(logs.warn).toHaveBeenCalled();

    process.env.RECONCILIACAO_LIMIAR_ORFAOS = '1';
    prepararRealm([
      { id: uuid(1), createdTimestamp: VELHO },
      { id: uuid(2), createdTimestamp: VELHO },
    ]);
    const acima = await reconciliarIdentidades();
    expect(acima.alerta).toBe(true);
  });

  it('órfãos com menos de 1 h não contam (registo pode estar em curso)', async () => {
    prepararRealm([{ id: uuid(3), createdTimestamp: RECENTE }]);
    db.findMany.mockResolvedValue([]);
    const r = await reconciliarIdentidades();
    expect(r.keycloakSemLocal).toBe(0);
  });

  it('contas de serviço e fixtures de carga (sub não-UUID) não são divergências', async () => {
    prepararRealm([
      { id: uuid(4), createdTimestamp: VELHO, serviceAccountClientId: 'gespro-erp' },
    ]);
    db.findMany.mockResolvedValue([
      { keycloakSub: 'perf-perf-1-admin', email: 'admin@perf-1.mz', tenantId: 'tp' },
    ]);
    const r = await reconciliarIdentidades();
    expect(r).toMatchObject({
      keycloakSemLocal: 0,
      localSemKeycloak: 0,
      sinteticosIgnorados: 1,
      alerta: false,
    });
  });
});
