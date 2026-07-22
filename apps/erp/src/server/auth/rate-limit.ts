import 'server-only';
import { prismaBase } from '@/server/db/client';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;

// LRU simples em memória para dev (evita round-trip ao DB em testes).
// Em produção usa a tabela LoginAttempt.
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function memoryKey(email: string, ip: string): string {
  return `${email}::${ip}`;
}

/**
 * Verifica se email ou IP atingiu o limite de tentativas falhadas.
 * Devolve `true` se está bloqueado.
 */
export async function isRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);

  if (process.env.NODE_ENV === 'development') {
    // Em dev, usa memória LRU para não exigir DB.
    const key = memoryKey(email, ip);
    const entry = memoryStore.get(key);
    if (!entry || entry.resetAt < Date.now()) return false;
    return entry.count >= MAX_ATTEMPTS;
  }

  const [byEmail, byIp] = await Promise.all([
    prismaBase.loginAttempt.count({
      where: { email, success: false, createdAt: { gte: since } },
    }),
    prismaBase.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } },
    }),
  ]);

  return byEmail >= MAX_ATTEMPTS || byIp >= MAX_ATTEMPTS;
}

/**
 * Regista uma tentativa de login (sucesso ou falha).
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
  extra?: { tenantId?: string; userId?: string },
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    const key = memoryKey(email, ip);
    if (success) {
      memoryStore.delete(key);
      return;
    }
    const now = Date.now();
    const entry = memoryStore.get(key);
    if (!entry || entry.resetAt < now) {
      memoryStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      entry.count += 1;
    }
    return;
  }

  await prismaBase.loginAttempt.create({
    data: {
      email,
      ip,
      success,
      tenantId: extra?.tenantId,
      userId: extra?.userId,
    },
  });
}
