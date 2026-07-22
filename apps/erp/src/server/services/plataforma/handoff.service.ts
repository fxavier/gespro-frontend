import 'server-only';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { AppError, UnauthorizedError } from '@/lib/errors';

/**
 * Handoff SSO site→app (spec 19, Requisito 7).
 *
 * Um token JWT HS256 assinado com `HANDOFF_SIGNING_SECRET` (segredo DEDICADO,
 * distinto de `AUTH_SECRET`), TTL ~60s, **uso único**. Emitido só pelo endpoint
 * de registo, imediatamente após a transacção de provisionamento committar.
 *
 * Porquê um token e não a senha na URL: um querystring fica em logs de proxy, no
 * histórico do browser e no `Referer` de recursos de terceiros. Este token não
 * é reutilizável, dura ~1 minuto e não serve para mais nada além de estabelecer
 * esta sessão específica — mesmo interceptado, a segunda utilização falha.
 *
 * Todas as escritas usam `prismaBase` com `tenantId` explícito: o consumo do
 * token acontece ANTES de existir sessão, logo não há contexto de tenant.
 */

const TTL_SEGUNDOS = 60;
const EMISSOR = 'gespro:registo';
const AUDIENCIA = 'gespro:app';

export interface ClaimsHandoff {
  userId: string;
  tenantId: string;
  jti: string;
}

function segredo(): Uint8Array {
  const raw = process.env.HANDOFF_SIGNING_SECRET;
  if (!raw || raw.length < 32) {
    throw new AppError(
      'HANDOFF_NAO_CONFIGURADO',
      'Handoff indisponível: segredo de assinatura não configurado.',
      503,
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Emite um token de handoff e regista o `jti` para consumo atómico posterior.
 *
 * `tx` permite emitir dentro da transacção de provisionamento; por omissão usa
 * `prismaBase`. `tenantId` é sempre escrito explicitamente.
 */
export async function emitirToken(
  input: { tenantId: string; userId: string },
  tx: Prisma.TransactionClient = prismaBase,
): Promise<string> {
  const chave = segredo();
  const jti = randomUUID();
  const agora = Math.floor(Date.now() / 1000);
  const expiraEm = new Date((agora + TTL_SEGUNDOS) * 1000);

  await tx.tokenHandoff.create({
    data: {
      jti,
      tenantId: input.tenantId,
      userId: input.userId,
      expiraEm,
    },
  });

  return new SignJWT({ tenantId: input.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setJti(jti)
    .setIssuer(EMISSOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt(agora)
    .setExpirationTime(agora + TTL_SEGUNDOS)
    .sign(chave);
}

/**
 * Valida assinatura + expiração e **consome atomicamente** o `jti`.
 *
 * O consumo é um único `UPDATE ... WHERE jti = ? AND usedAt IS NULL`: se duas
 * chamadas concorrerem com o mesmo token, uma afecta 1 linha e a outra 0 — a
 * segunda é rejeitada. Nunca `findUnique` + `update` separados.
 *
 * Devolve `null` em qualquer falha (token inválido, expirado, já usado,
 * inexistente): o chamador responde 401 sem revelar qual foi o motivo.
 */
export async function consumirToken(token: string): Promise<ClaimsHandoff | null> {
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
  try {
    const verificado = await jwtVerify(token, segredo(), {
      issuer: EMISSOR,
      audience: AUDIENCIA,
      algorithms: ['HS256'],
    });
    payload = verificado.payload;
  } catch {
    return null;
  }

  const jti = typeof payload.jti === 'string' ? payload.jti : null;
  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : null;
  if (!jti || !userId || !tenantId) return null;

  // Consumo atómico. O `where` inclui userId/tenantId dos claims: um token
  // assinado mas com linha de outro tenant (impossível sem a chave) não passa.
  const { count } = await prismaBase.tokenHandoff.updateMany({
    where: {
      jti,
      tenantId,
      userId,
      usedAt: null,
      expiraEm: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });

  if (count !== 1) return null;

  return { userId, tenantId, jti };
}

/**
 * Limpeza de tokens de handoff expirados (uso pelo cron de manutenção).
 * Idempotente.
 */
export async function purgarTokensExpirados(antesDe: Date = new Date()): Promise<number> {
  const { count } = await prismaBase.tokenHandoff.deleteMany({
    where: { expiraEm: { lt: antesDe } },
  });
  return count;
}

export const handoffService = {
  emitirToken,
  consumirToken,
  purgarTokensExpirados,
};

/** Só para testes: `UnauthorizedError` é o erro público equivalente a `null`. */
export const ERRO_HANDOFF = new UnauthorizedError('Ligação de registo inválida ou já utilizada');
