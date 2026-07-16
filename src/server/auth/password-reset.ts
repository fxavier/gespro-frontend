import 'server-only';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { prismaBase } from '@/server/db/client';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 horas

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Cria (ou substitui) um token de recuperação de palavra-passe para o email
 * no tenant indicado. Devolve o token em claro para envio por email.
 * Idempotente: tokens anteriores do mesmo utilizador ficam inválidos.
 */
export async function createPasswordResetToken(
  email: string,
  tenantSlug: string,
): Promise<{ token: string; userId: string } | null> {
  const user = await prismaBase.user.findFirst({
    where: { email, ativo: true, deletedAt: null, tenant: { slug: tenantSlug } },
    select: { id: true, tenantId: true },
  });

  // Não revelar se o email existe ou não — devolver null silenciosamente.
  if (!user) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Invalida tokens anteriores e cria novo (dentro de uma transacção).
  await prismaBase.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }, // marca como usado = invalida
    });
    await tx.passwordResetToken.create({
      data: { tenantId: user.tenantId, userId: user.id, token, expiresAt },
    });
  });

  return { token, userId: user.id };
}

/**
 * Valida um token e, se válido, actualiza a palavra-passe do utilizador.
 * Marca o token como usado e invalida todas as sessões activas incrementando
 * `permsVersion` (via bump em updatedAt, relido no próximo pedido autenticado).
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const record = await prismaBase.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record) throw new NotFoundError('Token inválido ou inexistente');
  if (record.usedAt) throw new BusinessRuleError('TOKEN_USADO', 'Este token já foi utilizado');
  if (record.expiresAt < new Date()) {
    throw new BusinessRuleError('TOKEN_EXPIRADO', 'O token expirou. Solicite um novo.');
  }

  const passwordHash = await hash(newPassword);

  await prismaBase.$transaction(async (tx) => {
    // Actualiza senha e bumpa updatedAt (invalida sessões JWT baseadas em permsVersion)
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, updatedAt: new Date() },
    });
    // Marca token como usado
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
  });
}

// ---------------------------------------------------------------------------
// User invite
// ---------------------------------------------------------------------------

/**
 * Cria um convite de utilizador para um email num tenant.
 * Devolve o token para envio por email.
 */
export async function createUserInvite(
  tenantId: string,
  invitedById: string,
  email: string,
  roleId?: string,
): Promise<string> {
  // Verificar se já existe utilizador activo com esse email no tenant
  const existing = await prismaBase.user.findUnique({
    where: { tenantId_email: { tenantId, email } },
  });
  if (existing && !existing.deletedAt) {
    throw new BusinessRuleError('UTILIZADOR_JA_EXISTE', 'Já existe um utilizador com este email neste tenant');
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await prismaBase.userInvite.create({
    data: { tenantId, email, token, roleId, invitedById, expiresAt },
  });

  return token;
}

/**
 * Aceita um convite, criando o utilizador e marcando o convite como aceite.
 */
export async function acceptUserInvite(
  token: string,
  nome: string,
  password: string,
): Promise<{ userId: string }> {
  const invite = await prismaBase.userInvite.findUnique({ where: { token } });

  if (!invite) throw new NotFoundError('Convite inválido ou inexistente');
  if (invite.acceptedAt) throw new BusinessRuleError('CONVITE_JA_ACEITE', 'Este convite já foi utilizado');
  if (invite.expiresAt < new Date()) {
    throw new BusinessRuleError('CONVITE_EXPIRADO', 'O convite expirou. Solicite um novo convite.');
  }

  const passwordHash = await hash(password);

  const result = await prismaBase.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: invite.tenantId,
        email: invite.email,
        nome,
        passwordHash,
      },
    });

    if (invite.roleId) {
      await tx.userRole.create({
        data: { userId: user.id, roleId: invite.roleId },
      });
    }

    await tx.userInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return { userId: user.id };
  });

  return result;
}
