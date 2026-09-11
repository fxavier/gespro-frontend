import 'server-only';

import { logger } from '@/server/observability/logger';
import { kcConfig } from './keycloak';

/**
 * Direct Access Grant — ADR-0029.
 *
 * Esta função é a ÚNICA fronteira do produto por onde passa uma palavra-passe
 * de utilizador. Tudo o que ela recebe morre aqui: não é registada, não é
 * devolvida, não é guardada. Quem a chamar recebe um `sub` ou um motivo.
 *
 * Foi adoptada contra a recomendação da RFC 9700 §2.4, que desaconselha este
 * fluxo. O ADR-0029 diz porquê e o que se perdeu com isso — federação e MFA
 * a sério. Não é uma escolha a repetir por comodidade noutro sítio.
 */

export type ResultadoAutenticacao =
  | { ok: true; sub: string; refreshToken: string }
  /**
   * `credenciais` — o Keycloak disse que não. É a única que se pode mostrar
   * ao utilizador como «dados errados».
   *
   * `conta-por-activar` — há acções obrigatórias pendentes (`VERIFY_EMAIL`,
   * `UPDATE_PASSWORD`). Pelo ADR-0013 §2 é o estado NORMAL de quem nunca
   * entrou: o *direct grant* recusa-o, e a saída é o ecrã do Keycloak.
   *
   * `conta-desactivada` — desactivada no fornecedor de identidade.
   *
   * `indisponivel` — o Keycloak não respondeu, ou respondeu coisa que não se
   * percebe. Nunca se diz a alguém que errou a palavra-passe por causa de uma
   * falha nossa.
   */
  | { ok: false; motivo: 'credenciais' | 'conta-por-activar' | 'conta-desactivada' | 'indisponivel' };

/**
 * Lê o `sub` da payload do access token, sem verificar assinatura: o token
 * acabou de chegar do endpoint de token por canal de confiança, servidor a
 * servidor. Verificá-lo aqui seria verificar a nossa própria chamada.
 */
function subDoToken(accessToken: string): string | null {
  const partes = accessToken.split('.');
  if (partes.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Mapeia a descrição de erro do Keycloak para um motivo nosso. */
function motivoDaRecusa(descricao: string): Exclude<
  Extract<ResultadoAutenticacao, { ok: false }>['motivo'],
  'indisponivel'
> {
  const d = descricao.toLowerCase();
  if (d.includes('not fully set up')) return 'conta-por-activar';
  if (d.includes('disabled')) return 'conta-desactivada';
  return 'credenciais';
}

export async function autenticarPorPalavraPasse(
  identificador: string,
  palavraPasse: string,
): Promise<ResultadoAutenticacao> {
  const cfg = kcConfig();

  let res: Response;
  try {
    res = await fetch(`${cfg.issuerInterno}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Nada daqui vai para log. O `URLSearchParams` fica confinado a esta chamada.
      body: new URLSearchParams({
        grant_type: 'password',
        username: identificador,
        password: palavraPasse,
        scope: 'openid profile email',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
  } catch (e) {
    logger.error({ err: (e as Error)?.message }, '[auth] direct grant indisponível (rede)');
    return { ok: false, motivo: 'indisponivel' };
  }

  if (res.status >= 500) {
    logger.error({ status: res.status }, '[auth] direct grant indisponível (5xx)');
    return { ok: false, motivo: 'indisponivel' };
  }

  if (!res.ok) {
    let descricao = '';
    try {
      const corpo = (await res.json()) as { error_description?: string };
      descricao = corpo.error_description ?? '';
    } catch {
      /* corpo não-JSON: trata-se como credenciais inválidas */
    }
    const motivo = motivoDaRecusa(descricao);
    // `identificador` entra no log de propósito: é o que permite investigar
    // uma campanha de tentativas. A palavra-passe, nunca.
    logger.info({ identificador, motivo, status: res.status }, '[auth] direct grant recusado');
    return { ok: false, motivo };
  }

  let corpo: { access_token?: string; refresh_token?: string };
  try {
    corpo = (await res.json()) as typeof corpo;
  } catch {
    logger.error({}, '[auth] direct grant devolveu 200 com corpo ilegível');
    return { ok: false, motivo: 'indisponivel' };
  }

  const sub = corpo.access_token ? subDoToken(corpo.access_token) : null;
  if (!sub || !corpo.refresh_token) {
    // 200 sem o que precisamos é avaria nossa, não erro do utilizador.
    logger.error(
      { temAccess: !!corpo.access_token, temRefresh: !!corpo.refresh_token, temSub: !!sub },
      '[auth] direct grant devolveu 200 sem sub ou sem refresh token',
    );
    return { ok: false, motivo: 'indisponivel' };
  }

  return { ok: true, sub, refreshToken: corpo.refresh_token };
}
