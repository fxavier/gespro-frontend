import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { inviteLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { withApi } from '@/lib/api/with-api';
import { createUserInvite } from '@/server/auth/password-reset';

const InviteSchema = z.object({
  email: z.string().email('Email inválido'),
  roleId: z.string().cuid().optional(),
});

/**
 * POST /api/auth/invite
 *
 * Cria um convite de utilizador para o tenant autenticado.
 * Rate-limitado: 10 convites em 1 hora por utilizador.
 * Requer permissão `admin:gerir_utilizadores`.
 */
export const POST = withApi(
  async (req: NextRequest, ctx) => {
    // Rate limiting por userId (chave: userId::invite)
    const rl = await inviteLimiter.consume(`${ctx.userId}::invite`);
    if (rl.limited) {
      return rateLimitedResponse(rl.retryAfterSec);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Corpo do pedido inválido' } },
        { status: 400 },
      );
    }

    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const token = await createUserInvite(
      ctx.tenantId,
      ctx.userId,
      parsed.data.email,
      parsed.data.roleId,
    );

    // O token seria enviado por email; aqui apenas confirmamos que foi criado.
    // Em produção: never log the raw token.
    return NextResponse.json({ data: { message: 'Convite criado com sucesso.', tokenPreview: token.slice(0, 8) + '...' } });
  },
  { permission: 'admin:gerir_utilizadores' },
);
