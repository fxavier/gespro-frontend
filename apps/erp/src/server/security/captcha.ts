import 'server-only';
import { logger } from '@/server/observability/logger';

/**
 * Verificação de captcha server-side (spec 19, Requisito 8.2).
 *
 * Mitigação central do abuso do trial sem cartão: sem captcha, qualquer script
 * cria tenants em massa. Suporta Cloudflare Turnstile e hCaptcha — o provedor é
 * escolhido por `CAPTCHA_PROVIDER`; o segredo (`CAPTCHA_SECRET_KEY`) vem do
 * Secrets Manager em produção e NUNCA do repositório.
 *
 * `CAPTCHA_PROVIDER=none` desactiva a verificação — apenas para dev/testes. Em
 * produção (`NODE_ENV=production`) essa configuração é recusada: um captcha
 * silenciosamente desligado é pior do que nenhum, porque ninguém repara.
 */

const ENDPOINTS: Record<string, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://hcaptcha.com/siteverify',
};

export interface ResultadoCaptcha {
  valido: boolean;
  motivo?: string;
}

export async function verificarCaptcha(
  token: string,
  ip?: string,
): Promise<ResultadoCaptcha> {
  const provider = (process.env.CAPTCHA_PROVIDER ?? 'none').toLowerCase();

  if (provider === 'none') {
    if (process.env.NODE_ENV === 'production') {
      logger.error({}, '[captcha] CAPTCHA_PROVIDER=none em produção — registo recusado');
      return { valido: false, motivo: 'captcha_nao_configurado' };
    }
    return { valido: true };
  }

  const endpoint = ENDPOINTS[provider];
  const secret = process.env.CAPTCHA_SECRET_KEY;
  if (!endpoint || !secret) {
    logger.error({ provider }, '[captcha] provedor ou segredo inválido');
    return { valido: false, motivo: 'captcha_nao_configurado' };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      // Não deixar o registo pendurado se o provedor estiver lento.
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, '[captcha] resposta não-OK do provedor');
      return { valido: false, motivo: 'captcha_indisponivel' };
    }

    const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (json.success === true) return { valido: true };

    // Os códigos de erro do provedor não contêm PII — seguro logar.
    logger.warn({ erros: json['error-codes'] }, '[captcha] verificação falhou');
    return { valido: false, motivo: 'captcha_invalido' };
  } catch (e) {
    logger.warn({ err: (e as Error)?.message }, '[captcha] erro de rede na verificação');
    return { valido: false, motivo: 'captcha_indisponivel' };
  }
}
