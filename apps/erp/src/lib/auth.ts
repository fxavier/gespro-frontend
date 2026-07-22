import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verify } from '@node-rs/argon2';
import { prismaBase } from '@/server/db/client';
import { ForbiddenError } from '@/lib/errors';
import { isRateLimited, recordLoginAttempt } from '@/server/auth/rate-limit';

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
