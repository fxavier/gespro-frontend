import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing, LOCALE_TAGS, type Locale } from "./routing";

import pt from "../../messages/pt.json";
import en from "../../messages/en.json";

type Mensagens = Record<string, unknown>;

const CATALOGOS: Record<Locale, Mensagens> = { pt, en } as Record<
  Locale,
  Mensagens
>;

/**
 * Funde o catálogo do locale pedido sobre o catálogo PT-PT.
 *
 * PT-PT é a fonte de verdade do conteúdo (Requisito 6.1: só PT-PT é obrigatório
 * nesta entrega). Sem esta fusão, uma chave ainda por traduzir rebentaria a
 * página em `/en`; com ela, degrada para o texto português — visível como
 * pendente de tradução, mas nunca partido.
 */
function fundir(base: Mensagens, sobreposicao: Mensagens): Mensagens {
  const saida: Mensagens = { ...base };
  for (const [chave, valor] of Object.entries(sobreposicao)) {
    const actual = saida[chave];
    if (
      valor &&
      typeof valor === "object" &&
      !Array.isArray(valor) &&
      actual &&
      typeof actual === "object" &&
      !Array.isArray(actual)
    ) {
      saida[chave] = fundir(actual as Mensagens, valor as Mensagens);
    } else if (valor !== null && valor !== "") {
      saida[chave] = valor;
    }
  }
  return saida;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const pedido = await requestLocale;
  const locale = hasLocale(routing.locales, pedido)
    ? pedido
    : routing.defaultLocale;

  return {
    locale,
    messages: locale === "pt" ? pt : fundir(pt, CATALOGOS[locale]),
    timeZone: "Africa/Maputo",
    formats: {
      dateTime: {
        curta: { day: "2-digit", month: "long", year: "numeric" },
      },
    },
    // `now` fixo não: o site é estático, o Next revalida por rota.
    getMessageFallback: ({ key }) => key,
    onError: () => {
      // Chaves em falta em `/en` são esperadas nesta entrega (stub) — silenciar
      // evita ruído no log sem esconder erros reais em PT-PT (esses são
      // apanhados pelo teste de completude do catálogo).
    },
  };
});

export { LOCALE_TAGS };
