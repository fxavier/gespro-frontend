import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** `User.id` local (é o que as 231 actions gravam — nunca o `sub`). */
    uid: string;
    /** Resolvido `sub → User → tenantId` em Postgres (ADR-0011) — nunca de claim. */
    tenantId: string;
    permissions: string[];
    /** `sub` do Keycloak — correlação com o trilho de autenticação. */
    keycloakSub?: string;
    /** Token de renovação do Keycloak (nunca sai do JWT cifrado do Auth.js). */
    kcRefreshToken?: string;
    /** Epoch (s) da próxima re-resolução obrigatória contra o Postgres. */
    resolverEm?: number;
  }
}
