import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { construirMetadata, organizacaoJsonLd } from "@/lib/seo";
import { Container, Seccao, TituloSeccao } from "@/components/marketing/primitivos";
import { Hero } from "@/components/marketing/hero";
import { ProvaSocial } from "@/components/marketing/prova-social";
import { GrelhaModulos } from "@/components/marketing/grelha-modulos";
import { Conformidade } from "@/components/marketing/conformidade";
import { CtaFinal } from "@/components/marketing/cta-final";
import { JsonLd } from "@/components/marketing/json-ld";
import { Revelar } from "@/components/marketing/movimento";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.home" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/",
    locale,
    // O título da Home já é a marca — o template do layout duplicaria-a.
    tituloAbsoluto: true,
  });
}

export default async function PaginaInicial({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home.modulos");
  const tComum = await getTranslations("comum");

  return (
    <>
      <Hero />
      <ProvaSocial />

      <Seccao id="modulos" ariaLabelledby="titulo-modulos">
        <Container>
          <Revelar>
            <TituloSeccao
              id="titulo-modulos"
              etiqueta={t("etiqueta")}
              titulo={t("titulo")}
              subtitulo={t("subtitulo")}
            />
          </Revelar>
          <div className="mt-14">
            <GrelhaModulos />
          </div>
        </Container>
      </Seccao>

      <Conformidade />
      <CtaFinal />

      <JsonLd data={organizacaoJsonLd(tComum("descricaoCurta"))} />
    </>
  );
}
