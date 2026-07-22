import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verify } from '@node-rs/argon2';
import { prismaBase } from '@/server/db/client';
import { ForbiddenError } from '@/lib/errors';
import { isRateLimited, recordLoginAttempt } from '@/server/auth/rate-limit';
import { consumirToken } from '@/server/services/plataforma/handoff.service';
import { handoffLimiter } from '@/server/security/rate-limiter';

/**
 * Spec 19 — o acesso do tenant é bloqueado quando a subscrição não permite
 * (`ConfiguracaoFiscal.statusAtivo = false`, escrito pela máquina de estados da
 * assinatura). Um tenant sem `ConfiguracaoFiscal` (dados anteriores à spec G)
 * é tratado como activo — a ausência de configuração não é uma suspensão.
 */
async function tenantBloqueado(tenantId: string): Promise<boolean> {
  const cfg = await prismaBase.configuracaoFiscal.findFirst({
    where: { tenantId },
    select: { statusAtivo: true },
  });
  return cfg ? !cfg.statusAtivo : false;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/auth/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Palavra-passe', type: 'password' },
        tenant: { label: 'Empresa', type: 'text' },
      },
      async authorize(creds, req) {
        const email = typeof creds?.email === 'string' ? creds.email.toLowerCase().trim() : '';
        const password = typeof creds?.password === 'string' ? creds.password : '';
        const tenantSlug = typeof creds?.tenant === 'string' && creds.tenant ? creds.tenant : undefined;
        if (!email || !password) return null;

        // Extrai IP do pedido (pode vir de X-Forwarded-For em produção)
        const ip =
          (req as Request & { headers?: Headers })?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim()
          ?? '0.0.0.0';

        // Rate limiting: 5 tentativas falhadas em 15 min por email ou IP.
        const limited = await isRateLimited(email, ip);
        if (limited) {
          // Não revelar o motivo — simplesmente recusa.
          return null;
        }

        // prismaBase (sem extensão) — o tenant ainda não está resolvido.
        const user = await prismaBase.user.findFirst({
          where: {
            email,
            ativo: true,
            deletedAt: null,
            ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
          },
          include: {
            tenant: { select: { id: true, slug: true } },
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        });

        const ok = user ? await verify(user.passwordHash, password) : false;

        await recordLoginAttempt(email, ip, ok && !!user, {
          tenantId: user?.tenantId,
          userId: user?.id,
        });

        if (!user || !ok) return null;

        // Spec 19 — o login exige email verificado, independentemente do estado
        // da subscrição (Requisito 1.6). O handoff de registo é a única forma de
        // entrar antes da verificação, e é de uso único.
        if (!user.emailVerificado) return null;

        // Spec 19 — subscrição EXPIRADA/SUSPENSA/CANCELADA bloqueia o login.
        if (await tenantBloqueado(user.tenantId)) return null;

        const permissions = [
          ...new Set(
            user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)),
          ),
        ];

        // permsVersion: timestamp da última actualização do utilizador.
        // Quando as permissões mudam, updatedAt bumpa e o JWT fica stale.
        const permsVersion = user.updatedAt.getTime();

        return {
          id: user.id,
          email: user.email,
          name: user.nome,
          tenantId: user.tenantId,
          permissions,
          permsVersion,
        };
      },
    }),

    // -----------------------------------------------------------------------
    // Handoff SSO site→app (spec 19, Requisito 7)
    // -----------------------------------------------------------------------
    Credentials({
      id: 'handoff',
      name: 'Handoff de registo',
      credentials: { token: { label: 'Token', type: 'text' } },
      /**
       * Estabelece a sessão do administrador acabado de criar, a partir de um
       * token de uso único emitido pelo endpoint de registo.
       *
       * A senha NUNCA viaja na URL: o token é assinado com um segredo dedicado
       * (`HANDOFF_SIGNING_SECRET`), dura ~60s e é consumido atomicamente — uma
       * segunda utilização falha, mesmo que o URL fique em logs de proxy ou no
       * histórico do browser.
       *
       * Não exige `emailVerificado`: é a única entrada permitida antes da
       * verificação, porque a posse do token prova que quem entra é quem
       * acabou de submeter o formulário de registo. Os logins seguintes (via
       * credenciais) já exigem o email confirmado.
       */
      async authorize(creds, req) {
        const token = typeof creds?.token === 'string' ? creds.token : '';
        if (!token) return null;

        const ip =
          (req as Request & { headers?: Headers })?.headers
            ?.get?.('x-forwarded-for')
            ?.split(',')[0]
            ?.trim() ?? '0.0.0.0';
        const rl = await handoffLimiter.consume(`${ip}::handoff`);
        if (rl.limited) return null;

        const claims = await consumirToken(token);
        if (!claims) return null;

        const user = await prismaBase.user.findFirst({
          where: {
            id: claims.userId,
            tenantId: claims.tenantId,
            ativo: true,
            deletedAt: null,
          },
          include: {
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        });
        if (!user) return null;

        // Um tenant provisionado está sempre activo; a verificação protege o
        // caso de o token ser usado depois de uma suspensão.
        if (await tenantBloqueado(user.tenantId)) return null;

        const permissions = [
          ...new Set(
            user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)),
          ),
        ];

        return {
          id: user.id,
          email: user.email,
          name: user.nome,
          tenantId: user.tenantId,
          permissions,
          permsVersion: user.updatedAt.getTime(),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.tenantId = user.tenantId;
        token.permissions = user.permissions;
        token.permsVersion = (user as typeof user & { permsVersion?: number }).permsVersion;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.tenantId = token.tenantId as string;
      session.user.permissions = token.permissions as string[];
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
