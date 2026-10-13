import type { DefaultSession } from 'next-auth';
import type { EstadoAcesso } from '@/lib/state-machines';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /**
       * Ausente SÓ na sessão do administrador de plataforma sem `User` de
       * tenant (#525). Essa sessão nunca chega a uma rota de tenant (o
       * middleware leva-a a `/plataforma`) nem a um pipeline de tenant
       * (`createSafeAction`/`withApi` recusam-na antes do contexto).
       */
      tenantId: string;
      permissions: string[];
      /**
       * Papel de realm `plataforma-admin` do Keycloak (ADR-0011 §5, #525):
       * administrador geral do sistema. Re-lido na re-resolução (ADR-0011).
       */
      plataformaAdmin: boolean;
      /**
       * Claim `email_verified` do Keycloak (ADR-0031 §6). Sem coluna local e
       * sem chamada ao Keycloak por pedido: viaja no access token e é
       * reavaliado na re-resolução de 15 min (ADR-0011).
       */
      emailVerificado: boolean;
      /**
       * Os três níveis de acesso do tenant (ADR-0032 §4): `aberto`, `leitura`
       * ou `fechado` — arbitrados a partir da `Assinatura` e da decisão da
       * GestPro. Um `fechado` nunca chega aqui: recusa a sessão. É o que os
       * dois pipelines de mutação lêem para bloquear a escrita em Leitura.
       */
      acesso: EstadoAcesso;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** `User.id` local (é o que as 231 actions gravam — nunca o `sub`). */
    uid: string;
    /**
     * Resolvido `sub → User → tenantId` em Postgres (ADR-0011) — nunca de
     * claim. Ausente na sessão do administrador de plataforma sem tenant (#525).
     */
    tenantId?: string;
    permissions: string[];
    /** `sub` do Keycloak — correlação com o trilho de autenticação. */
    keycloakSub?: string;
    /** Token de renovação do Keycloak (nunca sai do JWT cifrado do Auth.js). */
    kcRefreshToken?: string;
    /** Epoch (s) da próxima re-resolução obrigatória contra o Postgres. */
    resolverEm?: number;
    /**
     * `email_verified` do access token do Keycloak (ADR-0031 §6). Opcional
     * porque tokens emitidos antes deste ADR não o têm — ausente conta como
     * não verificado.
     */
    emailVerificado?: boolean;
    /**
     * Estado de acesso do tenant (ADR-0032 §4). Opcional porque tokens
     * emitidos antes deste ADR não o têm — ausente conta como `aberto`, e a
     * razão está no `callbacks.session`.
     */
    acesso?: EstadoAcesso;
    /** Papel de realm `plataforma-admin` (#525). Ausente conta como false. */
    plataformaAdmin?: boolean;
  }
}
