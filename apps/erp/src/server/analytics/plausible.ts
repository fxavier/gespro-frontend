import 'server-only';
import { logger } from '@/server/observability/logger';

/**
 * Eventos servidor→Plausible (spec 21, tarefa 7; ADR-0008).
 *
 * Porque é que isto existe: o ADR-0031 mudou o formulário de registo de
 * `gestpro.co.mz` para `app.gestpro.co.mz`. O funil continua a ser do site, mas
 * a conversão passa a acontecer noutro domínio — e o script do Plausible que
 * mede o site não está aqui, nem vai estar. O ERP é uma aplicação autenticada:
 * meter-lhe um script de analytics no cliente seria trocar um problema de
 * medição por um problema de privacidade.
 *
 * Logo: o evento é emitido **do servidor**, com o domínio do SITE, para a API
 * de eventos do Plausible. Sem script, sem cookies, sem SDK.
 *
 * DESLIGADO POR OMISSÃO — sem `PLAUSIBLE_DOMINIO` não se chama nada. É o mesmo
 * princípio do ADR-0008 no site: activar é configuração de ambiente, nunca um
 * segredo no repositório, e o dev/CI corre sem rede externa.
 *
 * ZERO PII (Requisito 7.2): nunca e-mail, nome, NUIT, nem o IP de quem se
 * regista. Ver `PROIBIDO_EM_PROPS` e a nota sobre o `X-Forwarded-For`.
 */

/** Parâmetros de campanha que sobrevivem ao salto site → ERP. */
export const UTM_CHAVES = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export type ChaveUtm = (typeof UTM_CHAVES)[number];
export type Utm = Partial<Record<ChaveUtm, string>>;

/** Eventos emitidos pelo ERP. Lista fechada — nomes soltos tornam a analítica inútil. */
export const EVENTOS_PLAUSIBLE = {
  registoConcluido: 'registo_concluido',
} as const;

/** Tecto por valor de `utm_*`: campanhas legítimas são curtas; o resto é lixo. */
const MAX_UTM = 120;

/**
 * Chaves de propriedade recusadas por construção.
 *
 * Não é paranóia decorativa: quem acrescentar uma propriedade daqui a um ano
 * vai ter o objecto do registo à mão, e o caminho mais curto é passá-lo
 * inteiro. Isto transforma esse engano num aviso no log em vez de PII num
 * fornecedor externo.
 */
const PROIBIDO_EM_PROPS = new Set([
  'email',
  'e-mail',
  'nome',
  'nuit',
  'bi',
  'ip',
  'senha',
  'telefone',
  'empresa',
  'sub',
  'tenantid',
  'tenantslug',
]);

/** Domínio registado no Plausible — o do SITE, não o do ERP. Ausente = desligado. */
export function dominioPlausible(): string | undefined {
  const v = process.env.PLAUSIBLE_DOMINIO?.trim();
  return v ? v : undefined;
}

/** Host da API de eventos (self-hosted ou região EU). */
export function hostPlausible(): string {
  const v = process.env.PLAUSIBLE_HOST?.trim();
  return (v || 'https://plausible.io').replace(/\/+$/, '');
}

/** Base pública do site de marketing — também a base do canónico de `/registo`. */
export function urlSite(): string {
  const v = process.env.SITE_URL?.trim();
  return (v || 'https://gestpro.co.mz').replace(/\/+$/, '');
}

/**
 * Normaliza `utm_*` vindos da *query string*: só as chaves conhecidas, só
 * strings, aparadas e truncadas. Tudo o resto desaparece aqui — é este o
 * ponto onde um parâmetro inventado por quem construir o link deixa de viajar.
 */
export function normalizarUtm(entrada: Record<string, string | string[] | undefined>): Utm {
  const saida: Utm = {};
  for (const chave of UTM_CHAVES) {
    const bruto = entrada[chave];
    const valor = Array.isArray(bruto) ? bruto[0] : bruto;
    if (typeof valor !== 'string') continue;
    const limpo = valor.trim().slice(0, MAX_UTM);
    if (limpo) saida[chave] = limpo;
  }
  return saida;
}

/**
 * URL do evento: a entrada do funil **no domínio do site**, com os `utm_*` na
 * *query string*.
 *
 * Duas razões para ser `/comecar` e não `/registo`:
 *  1. O evento é atribuído ao domínio do site (`PLAUSIBLE_DOMINIO`). Uma URL
 *     de `app.gestpro.co.mz` criaria uma página fantasma nesse domínio.
 *  2. O Plausible lê `utm_*` da própria URL do evento para calcular fonte e
 *     campanha. Pô-los aqui é o que faz os `utm_*` sobreviverem ao salto sem
 *     um mecanismo nosso a duplicar o do fornecedor (Requisito 7.2).
 *
 * É também a URL para onde aponta o canónico de `/registo` — a mesma decisão,
 * lida dos dois lados.
 */
export function urlEventoRegisto(utm: Utm): string {
  const qs = new URLSearchParams();
  for (const chave of UTM_CHAVES) {
    const valor = utm[chave];
    if (valor) qs.set(chave, valor);
  }
  const cauda = qs.toString();
  return `${urlSite()}/comecar${cauda ? `?${cauda}` : ''}`;
}

function propsSeguras(props: Record<string, string>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(props)) {
    if (PROIBIDO_EM_PROPS.has(chave.toLowerCase())) {
      logger.warn({ chave }, '[plausible] propriedade recusada — nome reservado a PII');
      continue;
    }
    // Um endereço de e-mail não tem forma de chegar aqui por acidente sem o
    // arroba. Recusar por forma, e não só por nome, cobre a chave criativa.
    if (valor.includes('@')) {
      logger.warn({ chave }, '[plausible] propriedade recusada — parece um endereço');
      continue;
    }
    saida[chave] = valor.slice(0, MAX_UTM);
  }
  return saida;
}

export interface OpcoesEvento {
  /** URL do evento no domínio do site. Ver `urlEventoRegisto`. */
  url: string;
  /** Propriedades do evento. Filtradas por `propsSeguras` antes de sair. */
  props?: Record<string, string>;
}

/**
 * Envia um evento para a API do Plausible. Devolve `false` quando não enviou
 * (desligado, ou falha) — nunca lança: medir não pode partir um registo.
 *
 * **O IP de quem se regista NÃO viaja.** O protocolo do Plausible aceita
 * `X-Forwarded-For` para atribuir o visitante, e é assim que o script do
 * browser funciona; aqui não se envia, porque o Requisito 7.2 proíbe o IP no
 * evento e não há forma de o mandar «não em claro». O custo está assumido e
 * documentado no handoff: a métrica de *visitantes únicos* deste evento não é
 * fiável (todas as conversões chegam do mesmo IP, o do servidor). A contagem
 * de conversões — que é o que o Requisito 7.1 manda medir — é exacta.
 */
export async function registarEventoPlausible(
  nome: string,
  opcoes: OpcoesEvento,
): Promise<boolean> {
  const dominio = dominioPlausible();
  if (!dominio) return false;

  const props = opcoes.props ? propsSeguras(opcoes.props) : undefined;

  try {
    const res = await fetch(`${hostPlausible()}/api/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Obrigatório pela API. Identifica-nos como servidor: não é o
        // user-agent de ninguém, e é de propósito.
        'User-Agent': 'GestPro-ERP (+https://gestpro.co.mz)',
      },
      body: JSON.stringify({
        name: nome,
        domain: dominio,
        url: opcoes.url,
        ...(props && Object.keys(props).length > 0 ? { props } : {}),
      }),
      // Medir nunca pode pendurar um registo.
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      logger.warn({ evento: nome, status: res.status }, '[plausible] evento recusado');
      return false;
    }
    return true;
  } catch (e) {
    logger.warn({ evento: nome, err: (e as Error)?.message }, '[plausible] envio falhou');
    return false;
  }
}
