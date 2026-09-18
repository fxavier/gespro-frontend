import 'server-only';
import { logger } from '@/server/observability/logger';

/**
 * Cliente Keycloak do ERP — ADR-0010/0012/0013.
 *
 * Duas responsabilidades, ambas de servidor:
 *  1. Renovação silenciosa da sessão (grant `refresh_token`) — usada pelo
 *     `callbacks.jwt` de `src/lib/auth.ts` a cada intervalo de re-resolução.
 *  2. Admin API com a conta de serviço do cliente `gespro-erp` (`view-users` +
 *     `manage-users`): provisionar utilizadores (registo público e convites —
 *     ADR-0013 §2 e §5-bis), disparar o `execute-actions-email` e desactivar.
 *
 * O ERP nunca vê palavras-passe: os utilizadores são criados SEM credencial,
 * com as acções obrigatórias `VERIFY_EMAIL` + `UPDATE_PASSWORD` pendentes, e é
 * o e-mail de acções do Keycloak — e só ele — que dá entrada no produto.
 *
 * URLs: o browser fala com o Keycloak pelo issuer PÚBLICO (`KEYCLOAK_ISSUER`);
 * o servidor fala pelo issuer INTERNO (`KEYCLOAK_ISSUER_INTERNO`, na pilha
 * docker `http://keycloak:8080/...`). Os tokens levam `iss` público porque o
 * `KC_HOSTNAME` do contentor está fixado (backchannel dinâmico desligado).
 */

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export interface KeycloakConfig {
  /** Issuer público (o que o browser vê e o que o `iss` dos tokens declara). */
  issuer: string;
  /** Base do issuer para chamadas servidor→Keycloak (backchannel). */
  issuerInterno: string;
  /** Nome do realm, derivado do issuer. */
  realm: string;
  /** Base da Admin API (backchannel): `…/admin/realms/<realm>`. */
  adminBase: string;
  clientId: string;
  clientSecret: string;
}

function obrigatoriaEmProducao(nome: string, valor: string | undefined, devFallback: string): string {
  if (valor) return valor;
  // Durante o `next build` (standalone) os segredos não existem — e o auth.ts
  // avalia esta config no import, em quase todas as páginas. Lançar aqui
  // partiria o build; lança-se no RUNTIME de produção (primeiro pedido), que
  // é onde a ausência é um erro real de configuração.
  const emBuild = process.env.NEXT_PHASE === 'phase-production-build';
  if (process.env.NODE_ENV === 'production' && !emBuild) {
    throw new Error(`[keycloak] Variável de ambiente obrigatória em produção: ${nome}`);
  }
  return devFallback;
}

/** Lê a configuração do ambiente. Função (não constante) para ser testável. */
export function kcConfig(): KeycloakConfig {
  const issuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8081/realms/gespro';
  const issuerInterno = process.env.KEYCLOAK_ISSUER_INTERNO ?? issuer;
  const m = /\/realms\/([^/]+)\/?$/.exec(issuerInterno);
  const realm = m?.[1] ?? 'gespro';
  const adminBase = `${issuerInterno.replace(/\/realms\/[^/]+\/?$/, '')}/admin/realms/${realm}`;
  return {
    issuer,
    issuerInterno,
    realm,
    adminBase,
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'gespro-erp',
    // Placeholder de dev alinhado com o docker-compose.yml; em produção a
    // ausência é erro de arranque, nunca um valor por omissão.
    clientSecret: obrigatoriaEmProducao(
      'KEYCLOAK_CLIENT_SECRET',
      process.env.KEYCLOAK_CLIENT_SECRET,
      'gespro-erp-dev-secret',
    ),
  };
}

/** Intervalo de re-resolução do Auth.js em segundos (ADR-0011: 15 min). */
export function intervaloResolucaoSegundos(): number {
  const v = Number(process.env.AUTH_SESSION_MAX_AGE);
  return Number.isFinite(v) && v > 0 ? v : 900;
}

/** Tecto absoluto da sessão (espelha o *SSO Session Max* do realm — 12 h). */
export function tectoSessaoSegundos(): number {
  const v = Number(process.env.KEYCLOAK_SSO_MAX_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : 43_200;
}

// ---------------------------------------------------------------------------
// Renovação silenciosa (grant refresh_token)
// ---------------------------------------------------------------------------

export type ResultadoRenovacao =
  | { ok: true; accessToken: string; refreshToken?: string; expiresIn?: number }
  /**
   * `recusada`: o Keycloak respondeu e disse não — a sessão SSO terminou
   * (idle de 8 h, tecto de 12 h, logout administrativo). A sessão do ERP cai.
   *
   * `indisponivel`: o Keycloak não respondeu (rede/5xx). Recusar aqui seria
   * expulsar toda a gente por causa de uma indisponibilidade transitória —
   * o ADR-0010 garante o contrário («quem já tem sessão continua a
   * trabalhar»). O chamador mantém a sessão, mas re-resolve na mesma contra
   * o Postgres, que é quem impõe a revogação (ADR-0011 §3).
   */
  | { ok: false; motivo: 'recusada' | 'indisponivel' };

/**
 * Revoga um token de renovação (ADR-0029). Com o Direct Access Grant não há
 * cookie de SSO para encerrar: terminar sessão é invalidar este token, para
 * que a re-resolução seguinte não o consiga trocar por outro.
 *
 * Falhar aqui não impede o utilizador de sair — a sessão local já caiu. Fica
 * registado, porque um token que sobrevive a um logout é coisa que se quer
 * ver num painel.
 */
export async function revogarRefreshToken(refreshToken: string): Promise<boolean> {
  const cfg = kcConfig();
  try {
    const res = await fetch(`${cfg.issuerInterno}/protocol/openid-connect/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, '[keycloak] revogação do refresh token falhou');
      return false;
    }
    return true;
  } catch (e) {
    logger.warn({ err: (e as Error)?.message }, '[keycloak] revogação indisponível');
    return false;
  }
}

/** Troca o token de renovação por tokens novos (renovação silenciosa). */
export async function renovarTokens(refreshToken: string): Promise<ResultadoRenovacao> {
  const cfg = kcConfig();
  try {
    const res = await fetch(`${cfg.issuerInterno}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    if (res.status >= 500) {
      logger.error({ status: res.status }, '[keycloak] renovação indisponível (5xx)');
      return { ok: false, motivo: 'indisponivel' };
    }
    if (!res.ok) {
      logger.info({ status: res.status }, '[keycloak] renovação recusada — sessão SSO terminou');
      return { ok: false, motivo: 'recusada' };
    }
    const corpo = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      ok: true,
      accessToken: corpo.access_token,
      refreshToken: corpo.refresh_token,
      expiresIn: corpo.expires_in,
    };
  } catch (e) {
    logger.error({ err: (e as Error)?.message }, '[keycloak] falha de rede na renovação');
    return { ok: false, motivo: 'indisponivel' };
  }
}

// ---------------------------------------------------------------------------
// Admin API (conta de serviço)
// ---------------------------------------------------------------------------

let adminTokenCache: { token: string; expiraEm: number } | null = null;

async function adminToken(): Promise<string> {
  const agora = Date.now();
  if (adminTokenCache && adminTokenCache.expiraEm > agora + 15_000) {
    return adminTokenCache.token;
  }
  const cfg = kcConfig();
  const res = await fetch(`${cfg.issuerInterno}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`[keycloak] conta de serviço recusada (HTTP ${res.status})`);
  }
  const corpo = (await res.json()) as { access_token: string; expires_in?: number };
  adminTokenCache = {
    token: corpo.access_token,
    expiraEm: agora + (corpo.expires_in ?? 60) * 1000,
  };
  return corpo.access_token;
}

/** Só para testes: limpa a cache do token da conta de serviço. */
export function __limparCacheAdminToken(): void {
  adminTokenCache = null;
}

async function adminFetch(caminho: string, init?: RequestInit): Promise<Response> {
  const cfg = kcConfig();
  const token = await adminToken();
  return fetch(`${cfg.adminBase}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Erro da Admin API com o **estado HTTP** preservado.
 *
 * Existe porque há um chamador que precisa de distinguir um estado dos outros:
 * um 404 no `reset-password` de uma identidade que acabámos de usar não é uma
 * indisponibilidade — é a prova de que ela foi apagada debaixo dos pés, e quem
 * já tem o tenant cometido pode recriá-la (ADR-0031 §2-bis). Enfiar o estado
 * na mensagem obrigava a lê-lo com uma expressão regular.
 */
export class ErroKeycloak extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroKeycloak';
  }
}

export interface UtilizadorKeycloak {
  id: string;
  email?: string;
  enabled?: boolean;
}

/**
 * Procura um utilizador do realm por e-mail (correspondência exacta).
 * É a chave de idempotência do provisionamento (ADR-0013 §5-bis): o e-mail é
 * único em todo o sistema, portanto procurar-antes-de-criar reutiliza o `sub`
 * de uma tentativa anterior que tenha ficado a meio.
 */
export async function procurarPorEmail(email: string): Promise<UtilizadorKeycloak | null> {
  const res = await adminFetch(`/users?email=${encodeURIComponent(email)}&exact=true`);
  if (!res.ok) {
    throw new Error(`[keycloak] procura por e-mail falhou (HTTP ${res.status})`);
  }
  const lista = (await res.json()) as UtilizadorKeycloak[];
  return lista[0] ?? null;
}

/** O que `garantirUtilizador` devolve: o `sub` e **quem** o criou. */
export interface IdentidadeGarantida {
  /** `sub` da identidade no realm. */
  sub: string;
  /**
   * `true` **só** quando foi esta chamada a criar a identidade — isto é, quando
   * o Keycloak respondeu 201 ao nosso POST. Uma identidade que já existia, ou
   * que outro pedido criou primeiro (409 na corrida), devolve `false`.
   *
   * Esta é a única resposta fiável à pergunta «fui eu que criei isto?». Quem a
   * responder com um `procurarPorEmail` prévio está a fazer TOCTOU: dois
   * pedidos com o mesmo e-mail lêem ambos `null`, partilham o `sub` que o
   * Keycloak deduplica, e ambos se julgam criadores — com isso, o que perde a
   * corrida apaga ou reescreve a identidade do que a ganhou (ADR-0031 §2-bis).
   */
  criado: boolean;
}

/**
 * Garante o utilizador no Keycloak e devolve o seu `sub` e se foi criado agora.
 *
 * Keycloak PRIMEIRO, Postgres depois (ADR-0013 §2): o lado sem transacção vai
 * à frente. Por omissão é criado sem palavra-passe e com `VERIFY_EMAIL` +
 * `UPDATE_PASSWORD` pendentes — é o caso do convite. O registo público passa
 * `accoes: []` e escreve a credencial a seguir (ADR-0031).
 */
export async function garantirUtilizador(input: {
  email: string;
  nome: string;
  /**
   * Acções obrigatórias da conta nova. **Obrigatório, sem valor por omissão**,
   * e é decisão de quem chama:
   *   - convite por e-mail → `['VERIFY_EMAIL', 'UPDATE_PASSWORD']` (ADR-0013 §5-bis);
   *   - palavra-passe atribuída pelo administrador → `['UPDATE_PASSWORD']` (ADR-0030 §3);
   *   - registo público → `[]` (ADR-0031 §2).
   *
   * Não tem omissão de propósito. Tinha — a do convite — e isso fazia com que
   * qualquer chamador distraído criasse contas com `VERIFY_EMAIL` pendente,
   * que é precisamente o estado em que o *direct grant* recusa a sessão e a
   * pessoa fica trancada do lado de fora. Um valor por omissão que tranca o
   * acesso não é conveniência: é uma armadilha à espera do próximo chamador,
   * e já apanhou dois caminhos deste repositório. Quem acrescentar um chamador
   * é obrigado a escolher, e a escolha fica à vista na chamada.
   */
  accoes: string[];
  /** `true` quando é o administrador a responder pelo endereço (ADR-0030 §3). */
  emailVerificado?: boolean;
}): Promise<IdentidadeGarantida> {
  const existente = await procurarPorEmail(input.email);
  if (existente) return { sub: existente.id, criado: false };

  const [primeiro, ...resto] = input.nome.trim().split(/\s+/);
  const res = await adminFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: input.email,
      email: input.email,
      enabled: true,
      emailVerified: input.emailVerificado ?? false,
      firstName: primeiro ?? input.nome,
      lastName: resto.join(' ') || undefined,
      requiredActions: input.accoes,
    }),
  });
  if (res.status === 409) {
    // Corrida entre dois pedidos com o mesmo e-mail: o outro ganhou — reutiliza
    // o `sub` dele e assume-se como NÃO criador. É este 409 que desempata.
    const corrida = await procurarPorEmail(input.email);
    if (corrida) return { sub: corrida.id, criado: false };
  }
  if (!res.ok && res.status !== 201) {
    throw new Error(`[keycloak] criação de utilizador falhou (HTTP ${res.status})`);
  }
  const criado = await procurarPorEmail(input.email);
  if (!criado) {
    throw new Error('[keycloak] utilizador criado mas não encontrado na releitura');
  }
  return { sub: criado.id, criado: true };
}

/**
 * Dispara o e-mail de acções pendentes (verificar e-mail + definir
 * palavra-passe). Devolve `false` em falha — o chamador decide se é fatal:
 * no registo público NÃO é (o tenant existe; reenvia-se por suporte), e
 * tratá-la como fatal desfaria um provisionamento válido por causa do SMTP.
 */
export async function dispararEmailAccoes(sub: string): Promise<boolean> {
  const cfg = kcConfig();
  const destino = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
    .replace(/\/$/, '');
  try {
    const res = await adminFetch(
      `/users/${encodeURIComponent(sub)}/execute-actions-email` +
        `?client_id=${encodeURIComponent(cfg.clientId)}` +
        // ?onboarding=1: preserva o checklist forçado do dashboard (spec 19) —
        // era o handoff que o punha; agora é o regresso do e-mail de acções.
        `&redirect_uri=${encodeURIComponent(`${destino}/dashboard?onboarding=1`)}`,
      { method: 'PUT', body: JSON.stringify(['VERIFY_EMAIL', 'UPDATE_PASSWORD']) },
    );
    if (!res.ok) {
      logger.error({ status: res.status, sub }, '[keycloak] execute-actions-email falhou');
      return false;
    }
    return true;
  } catch (e) {
    logger.error({ err: (e as Error)?.message, sub }, '[keycloak] execute-actions-email falhou');
    return false;
  }
}

/**
 * Desactiva (ou reactiva) o utilizador no Keycloak e, ao desactivar, encerra
 * as sessões SSO. Ambas as ordens Keycloak↔Postgres são seguras na
 * desactivação (ADR-0013): falhe o lado que falhar, o resultado é acesso
 * fechado, nunca aberto.
 */
/**
 * Escreve a palavra-passe de uma identidade (ADR-0030).
 *
 * `temporaria: true` acrescenta `UPDATE_PASSWORD` às acções obrigatórias — a
 * pessoa entra uma vez e é obrigada a mudar. `temporaria: false` **remove**
 * essa acção e devolve a conta ao normal: é assim que a mudança se conclui.
 * Ambos os comportamentos são do Keycloak, verificados contra o 26.7.
 *
 * A palavra-passe nunca é registada: nem aqui, nem em quem chama.
 */
export async function definirPalavraPasse(
  sub: string,
  palavraPasse: string,
  opcoes: { temporaria: boolean },
): Promise<void> {
  const res = await adminFetch(`/users/${encodeURIComponent(sub)}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: palavraPasse, temporary: opcoes.temporaria }),
  });
  if (!res.ok) {
    logger.error(
      { status: res.status, sub, temporaria: opcoes.temporaria },
      '[keycloak] reset-password falhou',
    );
    throw new ErroKeycloak(
      res.status,
      `[keycloak] definição de palavra-passe falhou (HTTP ${res.status})`,
    );
  }
}

export async function definirActivo(sub: string, ativo: boolean): Promise<void> {
  const res = await adminFetch(`/users/${encodeURIComponent(sub)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: ativo }),
  });
  if (!res.ok) {
    throw new Error(`[keycloak] actualização de estado falhou (HTTP ${res.status})`);
  }
  if (!ativo) {
    const logout = await adminFetch(`/users/${encodeURIComponent(sub)}/logout`, { method: 'POST' });
    if (!logout.ok) {
      // Não fatal: sem sessão SSO a renovação morre sozinha; a re-resolução
      // dos 15 minutos fecha o resto (ADR-0011).
      logger.warn({ status: logout.status, sub }, '[keycloak] logout de sessões falhou');
    }
  }
}

/**
 * Elimina um utilizador do realm pelo seu `sub` (Keycloak ID).
 * Usado pelo expurgo de registos não verificados (ADR-0016 Camada 4).
 *
 * Não lança em 404 (utilizador já eliminado ou nunca existiu — idempotente).
 * Lança em outros erros HTTP ou de rede (o chamador decide se continua ou para).
 */
export async function eliminarUtilizador(sub: string): Promise<void> {
  const res = await adminFetch(`/users/${encodeURIComponent(sub)}`, {
    method: 'DELETE',
  });
  if (res.status === 404) {
    // Já eliminado — idempotente.
    logger.warn({ sub }, '[keycloak] utilizador já não existe no realm (expurgo idempotente)');
    return;
  }
  if (!res.ok) {
    throw new Error(`[keycloak] eliminação de utilizador falhou (HTTP ${res.status})`);
  }
}

// ---------------------------------------------------------------------------
// Verificação de e-mail — ADR-0031 §5 (inverte o ADR-0013 §4)
// ---------------------------------------------------------------------------

/**
 * Marca o endereço como verificado no Keycloak, que continua a ser a fonte de
 * verdade da identidade (ADR-0013 §2 — intacto). Não há coluna local: o
 * estado viaja no *access token* para a sessão (ADR-0031 §6).
 *
 * Mesmo molde de `definirActivo`: um `PUT /users/{id}` parcial. O Keycloak
 * funde o corpo com o utilizador existente, portanto isto NÃO apaga nome,
 * e-mail nem acções pendentes.
 *
 * Idempotente por natureza — pôr `true` num booleano que já é `true` é um
 * 204 igual ao primeiro. É essa propriedade que dispensa `jti` e consumo
 * atómico na ligação (ver o cabeçalho da rota).
 */
export async function marcarEmailVerificado(sub: string): Promise<void> {
  const res = await adminFetch(`/users/${encodeURIComponent(sub)}`, {
    method: 'PUT',
    body: JSON.stringify({ emailVerified: true }),
  });
  if (!res.ok) {
    logger.error({ status: res.status, sub }, '[keycloak] marcação de e-mail verificado falhou');
    throw new Error(`[keycloak] marcação de e-mail verificado falhou (HTTP ${res.status})`);
  }
}

/**
 * Envia o e-mail com a ligação de confirmação de endereço.
 *
 * Substitui o `execute-actions-email` do ADR-0013 §4 NESTE caminho: quem se
 * regista pelo ADR-0031 já tem palavra-passe e já tem sessão, logo um e-mail
 * de acções obrigatórias trancaria a conta em vez de a abrir.
 *
 * Devolve `false` em falha e **nunca lança**: como no registo público, o
 * tenant existe e a pessoa está lá dentro — tratar o SMTP como fatal desfaria
 * um provisionamento válido. O reenvio está no aviso do painel.
 *
 * O `import()` do transporte é tardio de propósito: `@/server/email` resolve o
 * provider (e carrega o nodemailer) no momento em que é importado, e este
 * módulo é importado por `src/lib/auth.ts`, ou seja por quase todos os Server
 * Components. Um import estático punha o cliente de SMTP no grafo de arranque
 * de toda a aplicação para servir um caminho que corre uma vez por conta.
 */
export async function enviarEmailVerificacao(sub: string, email: string): Promise<boolean> {
  try {
    const { assinarTokenVerificacao, urlVerificacao } = await import('./ligacao-verificacao');
    const { verificacaoEmailTemplate } = await import('@/server/email/templates/verificacao-email');
    const { emailProvider } = await import('@/server/email');

    const url = urlVerificacao(assinarTokenVerificacao(sub, email));
    const { html, texto } = verificacaoEmailTemplate({ email, url });

    await emailProvider.enviar({
      para: email,
      assunto: 'GestPro — confirme o seu endereço de e-mail',
      html,
      texto,
    });

    // Sem PII: o `sub` é opaco e já é a chave de correlação do trilho de
    // autenticação. O endereço, nunca — nem sequer aqui.
    logger.info({ evento: 'verificacao.enviada', sub }, '[verificacao] ligação enviada');
    return true;
  } catch (e) {
    logger.error(
      { evento: 'verificacao.enviada', sub, err: (e as Error)?.message },
      '[verificacao] envio da ligação falhou',
    );
    return false;
  }
}
