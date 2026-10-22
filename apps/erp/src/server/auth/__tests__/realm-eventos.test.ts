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

  it('guarda exactamente os tipos de autenticação e credenciais decididos', () => {
    // A lista é a decisão (adenda #54 do ADR-0011): acrescentar ou retirar um
    // tipo é mudar a decisão, e o teste obriga a dizê-lo. Uma lista vazia ou
    // ausente significaria «quase todos os tipos por omissão».
    // UPDATE_PASSWORD/_ERROR estão @Deprecated no Keycloak 26.7 e coexistem
    // com UPDATE_CREDENTIAL/_ERROR enquanto o Keycloak os emitir.
    const decididos = [
      'LOGIN',
      'LOGIN_ERROR',
      'LOGOUT',
      'LOGOUT_ERROR',
      'CODE_TO_TOKEN',
      'CODE_TO_TOKEN_ERROR',
      'CLIENT_LOGIN',
      'CLIENT_LOGIN_ERROR',
      'UPDATE_PASSWORD',
      'UPDATE_PASSWORD_ERROR',
      'UPDATE_CREDENTIAL',
      'UPDATE_CREDENTIAL_ERROR',
      'RESET_PASSWORD',
      'RESET_PASSWORD_ERROR',
      'SEND_RESET_PASSWORD',
      'SEND_VERIFY_EMAIL',
      'VERIFY_EMAIL',
      'EXECUTE_ACTION_TOKEN',
      'EXECUTE_ACTION_TOKEN_ERROR',
      'REFRESH_TOKEN_ERROR',
      'USER_DISABLED_BY_TEMPORARY_LOCKOUT',
      'USER_DISABLED_BY_PERMANENT_LOCKOUT',
    ];
    expect([...(realm.enabledEventTypes ?? [])].sort()).toEqual([...decididos].sort());
  });

  it('mantém o listener jboss-logging', () => {
    expect(realm.eventsListeners).toContain('jboss-logging');
  });
});
