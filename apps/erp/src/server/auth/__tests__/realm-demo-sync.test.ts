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
  realmRoles?: string[];
  credentials?: Array<{ type?: string; value?: string; temporary?: boolean }>;
}

interface Realm {
  realm: string;
  roles?: { realm?: Array<{ name: string }> };
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

/** #525 — papel de realm do administrador de plataforma (ADR-0011 §5). */
const PAPEL_PLATAFORMA = 'plataforma-admin';
const EMAIL_PLATAFORMA = 'plataforma@gespro.mz';

describe('realm-gespro.json ↔ prisma/seed/demo-users.ts', () => {
  // Utilizadores de TENANT do realm: nem contas de serviço nem administradores
  // de plataforma (#525). O administrador de plataforma não tem `User` local —
  // é verificado à parte, abaixo, e NÃO pode entrar no seed.
  const realmDemoUsers = realm.users.filter(
    (u) => !u.serviceAccountClientId && !(u.realmRoles ?? []).includes(PAPEL_PLATAFORMA),
  );

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

describe('#525 — administrador de plataforma no realm local', () => {
  const plataforma = realm.users.find((u) => u.username === EMAIL_PLATAFORMA);

  it('o papel de realm `plataforma-admin` existe', () => {
    expect((realm.roles?.realm ?? []).map((r) => r.name)).toContain(PAPEL_PLATAFORMA);
  });

  it('existe o utilizador plataforma@gespro.mz, com sub fixo, activo e sem acções pendentes', () => {
    expect(plataforma, `${EMAIL_PLATAFORMA} em falta no realm`).toBeDefined();
    expect(plataforma!.email).toBe(EMAIL_PLATAFORMA);
    // `sub` fixo (UUID), como os demo: o E2E e o ADR dependem dele.
    expect(plataforma!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(plataforma!.enabled).toBe(true);
    expect(plataforma!.emailVerified).toBe(true);
    expect(plataforma!.requiredActions ?? []).toEqual([]);
    expect(plataforma!.serviceAccountClientId).toBeUndefined();
  });

  it('tem o papel de realm `plataforma-admin`', () => {
    expect(plataforma?.realmRoles ?? []).toContain(PAPEL_PLATAFORMA);
  });

  it('usa a mesma palavra-passe de demonstração dos outros utilizadores demo, não provisória', () => {
    const credDemo = realm.users.find((u) => u.username === 'admin@demo.mz')?.credentials?.[0];
    const cred = plataforma?.credentials?.find((c) => c.type === 'password');
    expect(cred, 'credencial de palavra-passe em falta').toBeDefined();
    // Compara-se com a do admin demo, sem a escrever aqui.
    expect(cred!.value).toBe(credDemo?.value);
    expect(cred!.temporary).toBe(false);
  });

  it('NÃO tem `User` de tenant no seed (nem por e-mail nem por sub)', () => {
    expect(DEMO_USERS.map((d) => d.email)).not.toContain(EMAIL_PLATAFORMA);
    expect(DEMO_USERS.map((d) => d.keycloakSub)).not.toContain(plataforma?.id);
  });

  it('nenhum utilizador demo de tenant recebe o papel de plataforma', () => {
    for (const demo of DEMO_USERS) {
      const u = realm.users.find((x) => x.email === demo.email);
      expect(u?.realmRoles ?? [], demo.email).not.toContain(PAPEL_PLATAFORMA);
    }
  });
});

describe('invariantes do realm que o E2E assume', () => {
  it('ADR-0013 §6: as durações de sessão são parâmetros de ambiente, nunca fixas', () => {
    // O import-realm.sh substitui-as; se alguém as fixar em segundos, o
    // cenário E2E obrigatório de expiração/renovação deixa de ser escrevível.
    expect(realm.ssoSessionIdleTimeout).toBe('${env.GESPRO_SSO_IDLE_SECONDS}');
    expect(realm.ssoSessionMaxLifespan).toBe('${env.GESPRO_SSO_MAX_SECONDS}');
  });

  it('o cliente gespro-erp é confidencial, com PKCE S256 e com password grant', () => {
    const cliente = realm.clients.find((c) => c.clientId === 'gespro-erp');
    expect(cliente).toBeDefined();

    // Confidencial: o segredo fica no servidor. Isto NÃO mudou com o
    // ADR-0029, e é o que torna o direct grant defensável de todo — um
    // cliente público a fazer password grant seria outra conversa.
    expect(cliente!.publicClient).toBe(false);

    // Direct Access Grant: rejeitado pelo ADR-0012 §8, ADOPTADO pelo
    // ADR-0029. O que se perdeu com a inversão — federação e MFA a sério —
    // está escrito no §3 desse ADR. Este teste passou de guardar a ausência
    // a guardar a presença: se um dia voltar a `false`, o login do produto
    // deixa de funcionar, e é melhor descobri-lo aqui.
    expect(cliente!.directAccessGrantsEnabled).toBe(true);

    // O fluxo padrão fica ligado: o tema `gespro` continua a servir o
    // primeiro acesso e a recuperação de palavra-passe (ADR-0029 §5).
    expect(cliente!.standardFlowEnabled).toBe(true);
    expect(cliente!.attributes?.['pkce.code.challenge.method']).toBe('S256');
  });

  it('o segredo do cliente não está no repositório', () => {
    const bruto = readFileSync(realmPath, 'utf8');
    expect(bruto).toContain('${env.GESPRO_ERP_CLIENT_SECRET}');
  });
});
