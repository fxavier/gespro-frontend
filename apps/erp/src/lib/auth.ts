import NextAuth from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { prismaBase } from '@/server/db/client';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import {
  kcConfig,
  renovarTokens,
  intervaloResolucaoSegundos,
  tectoSessaoSegundos,
} from '@/server/auth/keycloak';

/**
 * Autenticação OIDC contra o Keycloak (ADR-0010) com a fronteira de
 * autorização em Postgres (ADR-0011): o Keycloak responde «quem és», a base
 * de dados responde «o que podes».
 *
 * O token do Keycloak transporta identidade (`sub`, `email`, `name`) — nunca
 * permissões nem tenant. O `tenantId` resolve-se `sub → User → tenantId`:
 * continua a não vir do cliente; vem de uma linha em Postgres alcançada a
 * partir de um token assinado e verificado no servidor.
 *
 * As três durações de sessão (ADR-0011, tabela das Consequências) são
 * parâmetros de ambiente — nenhum teste espera 15 minutos:
 *
 *  - `AUTH_SESSION_MAX_AGE` (900 s) — intervalo de RE-RESOLUÇÃO: a cada
 *    renovação, o `callbacks.jwt` relê do Postgres as permissões, o `ativo`,
 *    o `deletedAt` e o bloqueio de subscrição, e renova o token no Keycloak.
 *    É isto que fixa a garantia «retirar um papel, desactivar um utilizador
 *    ou suspender uma subscrição faz efeito em 15 minutos, no máximo».
 *    Deliberadamente NUNCA por pedido: o `jwt` corre em cada `auth()`, logo
 *    em quase cada Server Component.
 *  - *SSO Session Idle* do Keycloak (8 h) — quem expulsa por inactividade.
 *  - *SSO Session Max* (12 h) — tecto absoluto; é também o `maxAge` do cookie
 *    do Auth.js. O cookie NÃO morre aos 15 minutos: se morresse, o financeiro
 *    que abre uma factura de dezoito linhas e é interrompido meia hora perdia
 *    o formulário — o cenário que o ADR-0011 exclui expressamente. Os 15
 *    minutos vivem DENTRO do JWT (`resolverEm`), não no `exp` do cookie.
 *
 * Nota sobre a aresta conhecida do Auth.js v5 em App Router: um `auth()` num
 * Server Component não pode escrever cookies, portanto um token re-resolvido
 * aí não é persistido — é persistido na chamada seguinte de
 * `/api/auth/session` (o `SessionProvider` está montado globalmente). Entre
 * os dois momentos há re-resoluções repetidas, todas dentro do mesmo
 * intervalo; nunca menos verificação, apenas — transitoriamente — mais.
 * O Keycloak não roda tokens de renovação por omissão, pelo que repetir o
 * grant com o mesmo token é seguro. Coberto pelo cenário E2E de expiração e
 * renovação (obrigatório por ADR-0013 §6 — não verificável por inspecção).
 */

// ---------------------------------------------------------------------------
// Resolução sub → User local (a fronteira do ADR-0011)
// ---------------------------------------------------------------------------

type Resolucao =
  | {
      ok: true;
      userId: string;
      tenantId: string;
      permissions: string[];
    }
  | { ok: false; motivo: 'nao-provisionado' | 'inactivo' | 'subscricao' };

/**
 * Spec 19 — o acesso do tenant é bloqueado quando a subscrição não permite
 * (`ConfiguracaoFiscal.statusAtivo = false`). Regra de NEGÓCIO: fica no ERP,
 * não migra para o Keycloak (ADR-0010) — o utilizador autentica-se com
 * sucesso e é o ERP que recusa a sessão, com mensagem própria.
 */
async function tenantBloqueado(tenantId: string): Promise<boolean> {
  const cfg = await prismaBase.configuracaoFiscal.findFirst({
    where: { tenantId },
    select: { statusAtivo: true },
  });
  return cfg ? !cfg.statusAtivo : false;
}

/**
 * Resolve o `sub` do Keycloak no `User` local e expande papéis em permissões.
 *
 * Um utilizador que exista no Keycloak sem `User` local NÃO entra — recusa
 * explícita, nunca criação implícita (ADR-0011): criação implícita seria uma
 * porta aberta para qualquer identidade federada obter sessão sem passar
 * pelo provisionamento.
 */
async function resolverUtilizadorLocal(keycloakSub: string): Promise<Resolucao> {
  const user = await prismaBase.user.findUnique({
    where: { keycloakSub },
    include: {
      roles: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });

  if (!user) return { ok: false, motivo: 'nao-provisionado' };
  if (!user.ativo || user.deletedAt) return { ok: false, motivo: 'inactivo' };
  if (await tenantBloqueado(user.tenantId)) return { ok: false, motivo: 'subscricao' };

  const permissions = [
    ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
  ];

  return { ok: true, userId: user.id, tenantId: user.tenantId, permissions };
}

// ---------------------------------------------------------------------------
// NextAuth
// ---------------------------------------------------------------------------

const cfg = kcConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    // Tecto do cookie = SSO Session Max. A validade REAL é governada pela
    // renovação no Keycloak (idle de 8 h) e pela re-resolução em Postgres.
    maxAge: tectoSessaoSegundos(),
  },
  trustHost: true,
  pages: { signIn: '/auth/login', error: '/auth/erro' },
  providers: [
    // PKCE (S256, imposto pelo realm) + state; o segredo do cliente fica no
    // servidor — nunca no navegador (ADR-0010 §3). Endpoints divididos:
    // autorização pelo issuer público (é o browser que lá vai), troca de
    // código/userinfo pelo interno (é o servidor que lá vai — na pilha docker
    // o público não é alcançável de dentro do contentor).
    Keycloak({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      issuer: cfg.issuer,
      authorization: {
        url: `${cfg.issuer}/protocol/openid-connect/auth`,
        params: { scope: 'openid profile email' },
      },
      token: `${cfg.issuerInterno}/protocol/openid-connect/token`,
      userinfo: `${cfg.issuerInterno}/protocol/openid-connect/userinfo`,
    }),
  ],
  callbacks: {
    /**
     * Porta de entrada. Recusas com mensagem explícita em `/auth/erro`:
     * «contacte o administrador da sua empresa» é o caso legítimo de um
     * colaborador ainda não provisionado (ADR-0013), não um erro anónimo.
     */
    async signIn({ profile }) {
      const sub = profile?.sub;
      if (!sub) return '/auth/erro?motivo=sem-identidade';

      const res = await resolverUtilizadorLocal(sub);
      if (!res.ok) {
        logger.warn({ keycloakSub: sub, motivo: res.motivo }, '[auth] sessão recusada no signIn');
        return `/auth/erro?motivo=${res.motivo}`;
      }

      // «Por activar» é primeiroAcessoEm == null (ADR-0013 §5-bis): escrita
      // única, idempotente por construção (updateMany com filtro null).
      await prismaBase.user.updateMany({
        where: { keycloakSub: sub, primeiroAcessoEm: null },
        data: { primeiroAcessoEm: new Date() },
      });

      return true;
    },

    async jwt({ token, account, profile }) {
      const agora = Math.floor(Date.now() / 1000);

      // --- Emissão inicial (login acabado de acontecer) --------------------
      if (account && profile?.sub) {
        const res = await resolverUtilizadorLocal(profile.sub);
        // O signIn já recusou os casos !ok; isto cobre a corrida entre os dois.
        if (!res.ok) return null;

        token.uid = res.userId;
        token.tenantId = res.tenantId;
        token.permissions = res.permissions;
        token.keycloakSub = profile.sub;
        token.kcRefreshToken = account.refresh_token;
        token.resolverEm = agora + intervaloResolucaoSegundos();
        return token;
      }

      // --- Dentro do intervalo: NENHUMA consulta (ADR-0011 §3) -------------
      if (typeof token.resolverEm === 'number' && agora < token.resolverEm) {
        return token;
      }

      // --- Renovação: Keycloak primeiro, Postgres depois -------------------
      if (typeof token.kcRefreshToken !== 'string' || typeof token.keycloakSub !== 'string') {
        // Token de uma era anterior (Credentials) ou corrompido: sessão cai.
        return null;
      }

      const renovado = await renovarTokens(token.kcRefreshToken);
      if (!renovado.ok && renovado.motivo === 'recusada') {
        // Sessão SSO terminou (idle/max/logout administrativo) — cai aqui,
        // na re-resolução seguinte: 15 minutos no máximo (ADR-0010).
        return null;
      }
      if (renovado.ok && renovado.refreshToken) {
        token.kcRefreshToken = renovado.refreshToken;
      }
      // `indisponivel`: mantém-se o token de renovação actual e segue-se para
      // a re-resolução em Postgres — é ela que impõe a revogação (ADR-0011).

      const res = await resolverUtilizadorLocal(token.keycloakSub);
      if (!res.ok) {
        logger.warn(
          { keycloakSub: token.keycloakSub, motivo: res.motivo },
          '[auth] sessão terminada na re-resolução',
        );
        return null;
      }

      token.uid = res.userId;
      token.tenantId = res.tenantId;
      token.permissions = res.permissions;
      token.resolverEm = agora + intervaloResolucaoSegundos();
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.uid;
      session.user.tenantId = token.tenantId;
      session.user.permissions = token.permissions;
      return session;
    },
  },
});

/** RBAC: true se o utilizador autenticado tem a permissão `modulo:accao`. */
export async function can(permission: string): Promise<boolean> {
  const session = await auth();
  return !!session?.user.permissions.includes(permission);
}

export async function requirePermission(permission: string): Promise<void> {
  if (!(await can(permission))) throw new ForbiddenError();
}
