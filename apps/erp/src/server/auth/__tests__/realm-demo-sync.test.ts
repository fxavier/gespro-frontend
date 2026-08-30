/**
 * ADR-0013 §7 — dois ficheiros que têm de concordar levam um teste que falha
 * no `pnpm check`, não num E2E enigmático:
 *
 *  - `infra/keycloak/realm-gespro.json` fixa os `id` (= `sub` OIDC) dos cinco
 *    utilizadores de demonstração;
 *  - `prisma/seed/demo-users.ts` é o que o seed grava em `User.keycloakSub`.
 *
 * Se divergirem, o login demo autentica no Keycloak e é recusado pelo ERP
 * («não provisionado») — um sintoma que aponta para o sítio errado.
 *
 * De caminho, trava as regressões silenciosas do realm que partiriam o E2E:
 * durações de sessão fixadas (ADR-0013 §6) e o cliente OIDC sem PKCE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_USERS } from '../../../../prisma/seed/demo-users';

interface RealmUser {
  id?: string;
  username: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  serviceAccountClientId?: string;
  requiredActions?: string[];
}

interface Realm {
  realm: string;
  ssoSessionIdleTimeout: unknown;
  ssoSessionMaxLifespan: unknown;
  users: RealmUser[];
  clients: Array<{
    clientId: string;
    publicClient?: boolean;
    attributes?: Record<string, string>;
    standardFlowEnabled?: boolean;
    directAccessGrantsEnabled?: boolean;
  }>;
}

const realmPath = path.resolve(__dirname, '../../../../../../infra/keycloak/realm-gespro.json');
const realm = JSON.parse(readFileSync(realmPath, 'utf8')) as Realm;

describe('realm-gespro.json ↔ prisma/seed/demo-users.ts', () => {
  const realmDemoUsers = realm.users.filter((u) => !u.serviceAccountClientId);

  it('os cinco utilizadores demo existem no realm, e só esses', () => {
    expect(realmDemoUsers.map((u) => u.username).sort()).toEqual(
      DEMO_USERS.map((d) => d.email).sort(),
    );
  });

  it.each(DEMO_USERS.map((d) => [d.email, d] as const))(
    '%s: o `sub` do realm é exactamente o `keycloakSub` do seed',
    (_email, demo) => {
      const noRealm = realmDemoUsers.find((u) => u.email === demo.email);
      expect(noRealm, `utilizador ${demo.email} em falta no realm`).toBeDefined();
      expect(noRealm!.id).toBe(demo.keycloakSub);
      expect(noRealm!.enabled).toBe(true);
      // Sem acções pendentes: o login demo tem de fechar à primeira.
      expect(noRealm!.emailVerified).toBe(true);
      expect(noRealm!.requiredActions ?? []).toEqual([]);
    },
  );
});

describe('invariantes do realm que o E2E assume', () => {
  it('ADR-0013 §6: as durações de sessão são parâmetros de ambiente, nunca fixas', () => {
    // O import-realm.sh substitui-as; se alguém as fixar em segundos, o
    // cenário E2E obrigatório de expiração/renovação deixa de ser escrevível.
    expect(realm.ssoSessionIdleTimeout).toBe('${env.GESPRO_SSO_IDLE_SECONDS}');
    expect(realm.ssoSessionMaxLifespan).toBe('${env.GESPRO_SSO_MAX_SECONDS}');
  });

  it('o cliente gespro-erp é confidencial, com PKCE S256 e sem password grant', () => {
    const cliente = realm.clients.find((c) => c.clientId === 'gespro-erp');
    expect(cliente).toBeDefined();
    expect(cliente!.publicClient).toBe(false);
    expect(cliente!.standardFlowEnabled).toBe(true);
    // Direct Access Grant rejeitado pelo ADR-0012 §8: devolvia palavras-passe
    // ao ERP e matava MFA/federação.
    expect(cliente!.directAccessGrantsEnabled).toBe(false);
    expect(cliente!.attributes?.['pkce.code.challenge.method']).toBe('S256');
  });

  it('o segredo do cliente não está no repositório', () => {
    const bruto = readFileSync(realmPath, 'utf8');
    expect(bruto).toContain('${env.GESPRO_ERP_CLIENT_SECRET}');
  });
});
