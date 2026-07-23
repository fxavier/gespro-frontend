import { defineRouting } from "next-intl/routing";

/**
 * Routing i18n do site (Requisito 6).
 *
 * `localePrefix: "as-needed"`: PT-PT (o idioma obrigatório da entrega) serve em
 * `/`, `/precos`, … e os idiomas adicionais em `/<locale>/…` (`/en/precos`).
 * Preferido a um prefixo sempre-presente (`/pt/...`) porque:
 *   - evita um redirect 307 na raiz — o primeiro byte da Home é o LCP (Requisito 8.1);
 *   - mantém as rotas canónicas exactamente como o Requisito 5 as nomeia;
 *   - o prefixo por locale continua a existir para todos os idiomas não-omissos,
 *     que é o que a arquitectura multi-idioma exige.
 *
 * `en` está declarado mas **não traduzido**: `messages/en.json` só tem as chaves
 * ainda por traduzir e o fallback (ver `request.ts`) devolve PT-PT. `robots.ts`
 * mantém `/en` fora do índice até a tradução existir.
 */
export const routing = defineRouting({
  locales: ["pt", "en"],
  defaultLocale: "pt",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** Locale → tag BCP-47 usada em `<html lang>` e em `Intl.NumberFormat`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  pt: "pt-MZ",
  en: "en-GB",
};

/** Locales cujo conteúdo está completo e pode ser indexado por motores de busca. */
export const LOCALES_INDEXAVEIS: Locale[] = ["pt"];
