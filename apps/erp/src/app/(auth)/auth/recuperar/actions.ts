'use server';

/**
 * Recuperação de palavra-passe self-service (#178).
 *
 * O ecrã é nosso (ADR-0029); quem trata da palavra-passe continua a ser o
 * Keycloak: o servidor pede-lhe, pela Admin API, o e-mail de acções com
 * `UPDATE_PASSWORD`, e é a ligação desse e-mail que define a nova.
 *
 * Sem `createSafeAction`, como a mudança no primeiro acesso: aqui não há
 * sessão nenhuma.
 *
 * A resposta é SEMPRE a mesma para um e-mail bem formado — conta existente,
 * inexistente ou desactivada, Keycloak em baixa, envio falhado ou limite
 * atingido. Distinguir qualquer destes casos diria a quem pergunta se o
 * endereço tem conta. O endereço também nunca vai para o log.
 */

import { headers } from 'next/headers';
import { dispararRecuperacaoPalavraPasse, procurarPorEmail } from '@/server/auth/keycloak';
import { recuperacaoEmailLimiter, recuperacaoIpLimiter } from '@/server/security/rate-limiter';
import { RecuperarPalavraPasseSchema } from '@/lib/validations/plataforma';
import { logger } from '@/server/observability/logger';

export type ResultadoRecuperacao = { ok: true } | { ok: false; erro: string };

function ipDosCabecalhos(h: Headers): string {
  const encaminhado = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return encaminhado || h.get('x-real-ip')?.trim() || 'unknown';
}

export async function pedirRecuperacaoPalavraPasse(dados: unknown): Promise<ResultadoRecuperacao> {
  const parsed = RecuperarPalavraPasseSchema.safeParse(dados);
  if (!parsed.success) {
    // Recusar um endereço mal formado não revela nada sobre contas.
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Indique um e-mail válido.' };
  }
  const { email } = parsed.data;

  try {
    const ip = ipDosCabecalhos(await headers());
    // IP primeiro: um varrimento parado no IP não gasta a quota dos endereços.
    if ((await recuperacaoIpLimiter.consume(`${ip}::recuperacao`)).limited) return { ok: true };
    if ((await recuperacaoEmailLimiter.consume(`${email}::recuperacao`)).limited) return { ok: true };

    const conta = await procurarPorEmail(email);
    if (!conta || conta.enabled === false) return { ok: true };

    const enviado = await dispararRecuperacaoPalavraPasse(conta.id);
    logger.info(
      { evento: 'recuperacao.pedida', sub: conta.id, enviado },
      '[recuperacao] e-mail de recuperação pedido ao Keycloak',
    );
  } catch (e) {
    logger.error(
      { evento: 'recuperacao.pedida', err: (e as Error)?.message },
      '[recuperacao] pedido de recuperação falhou',
    );
  }
  return { ok: true };
}
