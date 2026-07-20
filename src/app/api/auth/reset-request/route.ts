import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { passwordResetLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { createPasswordResetToken } from '@/server/auth/password-reset';

const schema = z.object({
  email: z.string().email('Email inválido'),
  tenant: z.string().min(1, 'Empresa obrigatória'),
});

/**
 * POST /api/auth/reset-request
 *
 * Solicita um token de recuperação de palavra-passe.
 * Rate-limitado: 5 pedidos em 15 min por IP.
 * Não revela se o email existe (resposta sempre 200 em caso de sucesso).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // Rate limiting por IP (chave: ip::reset-request)
  const rl = await passwordResetLimiter.consume(`${ip}::reset-request`);
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  // Não revelar se o email existe ou não
  await createPasswordResetToken(parsed.data.email, parsed.data.tenant);

  // Sempre responder com 200 para não vazar informação sobre emails registados
  return NextResponse.json({
    data: { message: 'Se o email existir, receberá instruções de recuperação.' },
  });
}
