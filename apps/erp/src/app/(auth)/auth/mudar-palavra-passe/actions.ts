'use server';

/**
 * Mudança de palavra-passe no primeiro acesso (ADR-0030 §4/§5).
 *
 * Não passa pelo `createSafeAction` de propósito: aquele começa por exigir
 * `auth()`, e aqui ainda não há sessão nenhuma — é esse o ponto. A prova de
 * identidade é a palavra-passe actual, revalidada no Keycloak, que continua a
 * ser quem verifica credenciais.
 *
 * Nenhuma das duas palavras-passe é registada, aqui ou mais abaixo.
 */

import { autenticarPorPalavraPasse } from '@/server/auth/direct-grant';
import { definirPalavraPasse, procurarPorEmail } from '@/server/auth/keycloak';
import { loginLimiter } from '@/server/security/rate-limiter';
import { MudarPalavraPasseSchema } from '@/lib/validations/plataforma';
import { logger } from '@/server/observability/logger';

type Campo = 'actual' | 'nova' | 'confirmacao';

export type ResultadoMudanca = { ok: true } | { ok: false; erro: string; campo?: Campo };

const CAMPOS: readonly string[] = ['actual', 'nova', 'confirmacao'];

export async function mudarPalavraPasse(dados: unknown): Promise<ResultadoMudanca> {
  const parsed = MudarPalavraPasseSchema.safeParse(dados);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    const caminho = String(primeiro?.path[0] ?? '');
    return {
      ok: false,
      erro: primeiro?.message ?? 'Dados inválidos.',
      ...(CAMPOS.includes(caminho) ? { campo: caminho as Campo } : {}),
    };
  }

  const { identificador, actual, nova } = parsed.data;
  const email = identificador.toLowerCase().trim();
  const chave = `${email}::mudanca`;

  const rl = await loginLimiter.check(chave);
  if (rl.limited) {
    return {
      ok: false,
      erro: `Demasiadas tentativas. Tente novamente dentro de ${Math.ceil(rl.retryAfterSec / 60)} minutos.`,
    };
  }

  // O Keycloak distingue «palavra-passe errada» («Invalid user credentials»)
  // de «conta por activar» («Account is not fully set up»): a segunda só
  // acontece com a palavra-passe CERTA, e é a situação normal deste ecrã.
  const res = await autenticarPorPalavraPasse(email, actual);
  if (!res.ok && res.motivo !== 'conta-por-activar') {
    await loginLimiter.increment(chave);
    if (res.motivo === 'indisponivel') {
      return { ok: false, erro: 'O serviço de identidade não respondeu. Tente de novo.' };
    }
    if (res.motivo === 'conta-desactivada') {
      return { ok: false, erro: 'Esta conta está desactivada. Contacte o administrador.' };
    }
    return { ok: false, erro: 'A palavra-passe actual está incorrecta.', campo: 'actual' };
  }

  // Com a conta por activar não há token, logo não há `sub` na resposta: lê-se
  // do realm. Em qualquer dos casos o `sub` vem do Keycloak e nunca do cliente.
  let sub: string | null = res.ok ? res.sub : null;
  if (!sub) {
    sub = (await procurarPorEmail(email))?.id ?? null;
  }
  if (!sub) {
    logger.error({ email }, '[mudanca-palavra-passe] identidade validada mas não encontrada');
    return { ok: false, erro: 'Não foi possível concluir. Tente de novo.' };
  }

  try {
    // `temporaria: false` limpa a acção obrigatória UPDATE_PASSWORD: a partir
    // daqui o início de sessão normal funciona.
    await definirPalavraPasse(sub, nova, { temporaria: false });
  } catch (e) {
    logger.error({ err: (e as Error)?.message }, '[mudanca-palavra-passe] escrita falhou');
    return { ok: false, erro: 'Não foi possível guardar a nova palavra-passe. Tente de novo.' };
  }

  return { ok: true };
}
