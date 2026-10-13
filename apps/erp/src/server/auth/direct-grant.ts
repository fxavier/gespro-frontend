import 'server-only';

import { logger } from '@/server/observability/logger';
import { kcConfig, procurarPorEmail } from './keycloak';

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
  | {
      ok: true;
      sub: string;
      refreshToken: string;
      /**
       * Claim `email_verified` do *access token* (ADR-0031 §6). Viaja daqui
       * para o JWT e para a sessão — sem coluna local e sem uma chamada ao
       * Keycloak por pedido.
       */
      emailVerificado: boolean;
    }
  /**
   * `credenciais` — o Keycloak disse que não. É a única que se pode mostrar
   * ao utilizador como «dados errados».
   *
   * `conta-por-activar` — só a palavra-passe provisória está pendente
   * (`UPDATE_PASSWORD`, ADR-0030): resolve-se no ecrã «Defina a sua
   * palavra-passe».
   *
   * `convite-por-concluir` — o convite por e-mail ainda não foi concluído
   * (`VERIFY_EMAIL` pendente, ADR-0013 §5-bis). Mudar a palavra-passe não o
   * resolve (#185): a saída é a ligação do convite.
   *
   * `conta-desactivada` — desactivada no fornecedor de identidade.
   *
   * `indisponivel` — o Keycloak não respondeu, ou respondeu coisa que não se
   * percebe. Nunca se diz a alguém que errou a palavra-passe por causa de uma
   * falha nossa.
   */
  | {
      ok: false;
      motivo:
        | 'credenciais'
        | 'conta-por-activar'
        | 'convite-por-concluir'
        | 'conta-desactivada'
        | 'indisponivel';
    };

/**
 * Lê a payload do access token, sem verificar assinatura: o token acabou de
 * chegar do endpoint de token por canal de confiança, servidor a servidor.
 * Verificá-lo aqui seria verificar a nossa própria chamada.
 */
function payloadDoToken(accessToken: string): Record<string, unknown> | null {
  const partes = accessToken.split('.');
  if (partes.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function subDoToken(accessToken: string): string | null {
  const sub = payloadDoToken(accessToken)?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/**
 * Lê `email_verified` de um access token do Keycloak (ADR-0031 §6). O claim
 * vem do âmbito `email`, pedido tanto no *direct grant* como na renovação.
 *
 * **Ausente conta como `false`** — fail-closed. Os travões do ADR-0031 §5
 * (emitir documento fiscal, criar utilizadores) recusam sem verificação, e a
 * recusa é reversível por um clique numa ligação; deixar passar por causa de
 * um *mapper* mal configurado não é.
 */
export function emailVerificadoDoToken(accessToken: string): boolean {
  return payloadDoToken(accessToken)?.email_verified === true;
}

/** Mapeia a descrição de erro do Keycloak para um motivo nosso. */
function motivoDaRecusa(descricao: string): 'credenciais' | 'conta-por-activar' | 'conta-desactivada' {
  const d = descricao.toLowerCase();
  if (d.includes('not fully set up')) return 'conta-por-activar';
  if (d.includes('disabled')) return 'conta-desactivada';
  return 'credenciais';
}

/**
 * #185 — o Keycloak diz «not fully set up» tanto ao convite por concluir como
 * à palavra-passe provisória. Desempata-se pelas acções obrigatórias da
 * identidade. Só se chega aqui depois de o Keycloak ter ACEITE a palavra-passe
 * (a frase só sai com ela certa), logo não serve para enumerar contas; e a
 * palavra-passe não entra nesta consulta.
 */
async function desempatarContaPorConfigurar(
  identificador: string,
): Promise<'conta-por-activar' | 'convite-por-concluir' | 'indisponivel'> {
  try {
    const u = await procurarPorEmail(identificador.toLowerCase().trim());
    if (!u) {
      logger.error({ identificador }, '[auth] conta por configurar sem identidade no realm');
      return 'indisponivel';
    }
    return u.requiredActions?.includes('VERIFY_EMAIL') ? 'convite-por-concluir' : 'conta-por-activar';
  } catch (e) {
    logger.error({ err: (e as Error)?.message }, '[auth] acções obrigatórias ilegíveis (Admin API)');
    return 'indisponivel';
  }
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
    let motivo: Extract<ResultadoAutenticacao, { ok: false }>['motivo'] = motivoDaRecusa(descricao);
    if (motivo === 'conta-por-activar') motivo = await desempatarContaPorConfigurar(identificador);
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

  const accessToken = corpo.access_token;
  const sub = accessToken ? subDoToken(accessToken) : null;
  if (!accessToken || !sub || !corpo.refresh_token) {
    // 200 sem o que precisamos é avaria nossa, não erro do utilizador.
    logger.error(
      { temAccess: !!corpo.access_token, temRefresh: !!corpo.refresh_token, temSub: !!sub },
      '[auth] direct grant devolveu 200 sem sub ou sem refresh token',
    );
    return { ok: false, motivo: 'indisponivel' };
  }

  return {
    ok: true,
    sub,
    refreshToken: corpo.refresh_token,
    emailVerificado: emailVerificadoDoToken(accessToken),
  };
}
