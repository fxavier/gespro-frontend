import { APP_URL } from "./env";

/**
 * Funil: o site encaminha, o ERP regista (ADR-0031 §Decisão 4).
 *
 * O formulário de registo passa a ser servido pelo ERP, na origem que emite o
 * cookie de sessão. Ao site resta levar a pessoa lá com o contexto da campanha
 * intacto — e mais nada: a palavra-passe deixa de poder atravessar o servidor
 * do site porque o servidor do site deixa de ter por onde a receber.
 *
 * O destino NÃO é literal: vem de `NEXT_PUBLIC_APP_URL` (ver `env.ts`), que em
 * desenvolvimento cai em `http://localhost:3000`. Um domínio escrito no código
 * é um domínio que ninguém consegue apontar a um ambiente de testes.
 */

/** Caminho do ecrã de registo no ERP (`apps/erp/src/app/registo`). */
export const CAMINHO_REGISTO = "/registo";

/**
 * Prefixo dos parâmetros de campanha. Preservados na íntegra (Requisito 7.2):
 * se não sobrevivem ao salto de domínio, a conversão deixa de ter origem e o
 * investimento em aquisição passa a ser medido a olho.
 */
const PREFIXO_CAMPANHA = "utm_";

/** Tecto por valor — impede que um parâmetro inflado viaje no `Location`. */
const MAX_CARACTERES = 200;

export type ParametrosPesquisa = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  const limpo = bruto?.trim();
  if (!limpo) return undefined;
  return limpo.slice(0, MAX_CARACTERES);
}

/**
 * URL absoluto de `/registo` no ERP, com `plano` e todos os `utm_*` que a
 * pessoa trouxe. Ordem determinística (plano, depois `utm_*` por ordem
 * alfabética) para o destino ser comparável em teste.
 *
 * O `plano` viaja como veio: quem o valida é o ERP, dono do catálogo. O site
 * recusá-lo aqui só serviria para o site e o ERP discordarem sobre que planos
 * existem.
 */
export function construirDestinoRegisto(
  parametros: ParametrosPesquisa = {}
): string {
  const destino = new URL(CAMINHO_REGISTO, `${APP_URL}/`);

  const plano = primeiro(parametros.plano);
  if (plano) destino.searchParams.set("plano", plano);

  const campanha = Object.keys(parametros)
    .filter((chave) => chave.startsWith(PREFIXO_CAMPANHA))
    .sort();

  for (const chave of campanha) {
    const valor = primeiro(parametros[chave]);
    if (valor) destino.searchParams.set(chave, valor);
  }

  return destino.toString();
}
