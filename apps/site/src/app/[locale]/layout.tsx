import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { routing, LOCALE_TAGS, type Locale } from "@/i18n/routing";

/**
 * Layout do segmento de locale.
 *
 * NÃO emite `<html>`/`<body>` — isso é do layout de raiz (ver a nota lá sobre
 * as fronteiras de 404/erro). Aqui trata-se do que depende do idioma:
 * o provedor de mensagens, a metadata traduzida e a correcção de `lang`.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tComum = await getTranslations({ locale, namespace: "comum" });

  // Sem `title` aqui: o layout de raiz já define default + template. Repeti-lo
  // faria o template aplicar-se ao próprio default ("… · GestPro · GestPro").
  return { description: tComum("descricaoCurta") };
}

export default async function LayoutLocale({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Necessário para as páginas deste segmento poderem ser geradas
  // estaticamente (sem isto, qualquer `useTranslations` força render dinâmico).
  setRequestLocale(locale);

  const naoOmisso = locale !== routing.defaultLocale;

  return (
    <NextIntlClientProvider>
      {/* O layout de raiz fixa `lang="pt-MZ"` (único idioma entregue). Nos
          locales adicionais corrige-se aqui, antes da pintura, para o atributo
          nunca contradizer o conteúdo. */}
      {naoOmisso ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.lang=${JSON.stringify(
              LOCALE_TAGS[locale as Locale]
            )}`,
          }}
        />
      ) : null}
      {children}
    </NextIntlClientProvider>
  );
}
