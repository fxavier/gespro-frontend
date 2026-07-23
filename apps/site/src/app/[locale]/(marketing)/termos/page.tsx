import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { construirMetadata } from "@/lib/seo";
import { PaginaLegal } from "@/components/marketing/pagina-legal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.termos" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/termos",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaTermos({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PaginaLegal slug="termos" />;
}
