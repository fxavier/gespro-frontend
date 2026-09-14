import { getTranslations } from "next-intl/server";

import { LOCALE_TAGS, routing, type Locale } from "@/i18n/routing";
import { construirDestinoRegisto } from "@/lib/funil";

/**
 * `/comecar` — passagem para o registo, que passou a ser do ERP (ADR-0031 §4).
 *
 * Deixou de haver formulário aqui. O registo cria sessão na própria submissão e
 * o cookie de sessão pertence a `app.gestpro.co.mz`: servir o formulário noutro
 * domínio obrigava a `SameSite=None` em todo o ERP, ou a ressuscitar o
 * `TokenHandoff`. Encaminhar elimina o problema em vez de o proteger.
 *
 * ## Porque é um Route Handler e não uma página
 *
 * O Requisito 2.1 pede as duas coisas: **307** e uma **ligação visível** de
 * reserva, sem JavaScript. Uma página não dá as duas — verificado em build de
 * produção: o `redirect()` do Next responde 307 com um corpo que é dele, e
 * basta um `loading.tsx` para a resposta passar a 200 e o encaminhamento
 * depender de JavaScript. O cabeçalho `rsc`, que distinguiria os dois casos, é
 * removido antes de chegar ao componente.
 *
 * Um Route Handler devolve as duas: o `Location` que todos os browsers seguem,
 * e um corpo nosso — que é, à letra, a «short hypertext note with a hyperlink»
 * que a RFC 9110 §15.4 manda pôr numa resposta de encaminhamento. Quem tiver o
 * salto bloqueado vê uma ligação; quem não tiver nunca chega a ver isto.
 *
 * O contexto comercial viaja com a pessoa: `plano` e todos os `utm_*` (ver
 * `lib/funil.ts`). Sem eles, a conversão medida do outro lado da fronteira de
 * domínio deixa de ter origem (Requisito 7.2).
 */

/** Escapa texto para interpolação segura em HTML. */
function escaparHtml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(
  pedido: Request,
  contexto: { params: Promise<{ locale: string }> }
): Promise<Response> {
  const { locale: pedido_locale } = await contexto.params;
  const locale: Locale = (routing.locales as readonly string[]).includes(
    pedido_locale
  )
    ? (pedido_locale as Locale)
    : routing.defaultLocale;

  const parametros = Object.fromEntries(new URL(pedido.url).searchParams);
  const destino = construirDestinoRegisto(parametros);

  const t = await getTranslations({ locale, namespace: "comecar" });
  const href = escaparHtml(destino);

  // Documento mínimo e sem folha de estilo: só aparece a quem ignorar o
  // `Location`, e nesse caso o que importa é a ligação, não a marca.
  // `color-scheme` deixa o browser pintá-lo no tema do sistema sem uma única
  // cor escrita à mão (gate de cores do site).
  const corpo = `<!doctype html>
<html lang="${LOCALE_TAGS[locale]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${escaparHtml(t("titulo"))}</title>
</head>
<body>
<p>${escaparHtml(t("aEncaminhar"))}</p>
<p><a href="${href}">${escaparHtml(t("reserva"))}</a></p>
</body>
</html>
`;

  return new Response(corpo, {
    status: 307,
    headers: {
      Location: destino,
      "Content-Type": "text/html; charset=utf-8",
      // O destino depende da query: uma resposta destas em cache intermédia
      // mandaria toda a gente para a campanha de outra pessoa.
      "Cache-Control": "no-store",
    },
  });
}
