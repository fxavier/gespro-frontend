/**
 * #54 / ADR-0011 (adenda de 2026-10-22) — o trilho de autenticação do Keycloak
 * só existe se o realm o ligar. As chaves vivem no ficheiro de realm, não na
 * consola: um realm reimportado (CI, ambiente novo, `docker compose down -v`)
 * não pode voltar a nascer sem eventos, e foi exactamente isso que aconteceu
 * até à #54 — a omissão é «desligado» e nada avisava.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface RealmEventos {
  eventsEnabled?: boolean;
  eventsExpiration?: number;
  eventsListeners?: string[];
  enabledEventTypes?: string[];
  adminEventsEnabled?: boolean;
  adminEventsDetailsEnabled?: boolean;
}

const realmPath = path.resolve(__dirname, '../../../../../../infra/keycloak/realm-gespro.json');
const realm = JSON.parse(readFileSync(realmPath, 'utf8')) as RealmEventos;

/** 90 dias em segundos — a retenção decidida na #54. */
const NOVENTA_DIAS = 90 * 24 * 60 * 60;

describe('#54 — eventos do Keycloak ligados no ficheiro de realm', () => {
  it('eventos de utilizador ligados, com retenção de 90 dias', () => {
    expect(realm.eventsEnabled).toBe(true);
    expect(realm.eventsExpiration).toBe(NOVENTA_DIAS);
  });

  it('eventos de administração ligados, SEM corpos dos pedidos (dados pessoais)', () => {
    expect(realm.adminEventsEnabled).toBe(true);
    // `true` guardaria a representação completa de cada escrita (nome,
    // e-mail, atributos) no Postgres do Keycloak — fora da decisão da #54.
    expect(realm.adminEventsDetailsEnabled).toBe(false);
  });

  it('guarda os inícios de sessão, as recusas e as escritas da conta de serviço', () => {
    // Os três critérios observáveis da #54: login com sucesso, login
    // recusado e o token da conta de serviço do ERP (client_credentials).
    // Uma lista vazia ou ausente significaria «todos os tipos por omissão».
    expect(realm.enabledEventTypes).toEqual(
      expect.arrayContaining(['LOGIN', 'LOGIN_ERROR', 'CLIENT_LOGIN', 'CLIENT_LOGIN_ERROR']),
    );
  });

  it('mantém o listener jboss-logging', () => {
    expect(realm.eventsListeners).toContain('jboss-logging');
  });
});
