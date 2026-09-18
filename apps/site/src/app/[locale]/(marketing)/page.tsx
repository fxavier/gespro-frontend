import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { obterPlanos } from "@/lib/planos";
import { construirMetadata, organizacaoJsonLd } from "@/lib/seo";
import {
  Container,
  Seccao,
  TituloSeccao,
  BotaoLink,
} from "@/components/marketing/primitivos";
import { Hero } from "@/components/marketing/hero";
import { FaixaConfianca } from "@/components/marketing/faixa-confianca";
import { Problemas } from "@/components/marketing/problemas";
import { GrelhaModulos } from "@/components/marketing/grelha-modulos";
import { Conformidade } from "@/components/marketing/conformidade";
import { Fluxo } from "@/components/marketing/fluxo";
import { MontraPainel } from "@/components/marketing/montra-painel";
import { Seguranca } from "@/components/marketing/seguranca";
import { Crescimento } from "@/components/marketing/crescimento";
import { Passos } from "@/components/marketing/passos";
import { Indicadores } from "@/components/marketing/indicadores";
import { ProvaSocial } from "@/components/marketing/prova-social";
import { TabelaPrecos } from "@/components/marketing/tabela-precos";
import { CtaFinal } from "@/components/marketing/cta-final";
import { JsonLd } from "@/components/marketing/json-ld";
import { Revelar } from "@/components/marketing/movimento";

// A Home mostra o catálogo de planos (spec 19) — mesma ISR de 5 minutos que
// /precos. Literal por exigência do Next; espelha REVALIDACAO_PLANOS de
// lib/planos.ts, verificado em __tests__/planos.test.ts.
export const revalidate = 300;

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

  const t = await getTranslations("home");
  const tComum = await getTranslations("comum");
  const catalogo = await obterPlanos();

  return (
    <>
      <Hero />
      <FaixaConfianca />
      <Problemas />

      <Seccao
        id="funcionalidades"
        ariaLabelledby="titulo-modulos"
        className="bg-superficie-forte"
      >
        <Container>
          <Revelar>
            <TituloSeccao
              id="titulo-modulos"
              alinhamento="esquerda"
              etiqueta={t("modulos.etiqueta")}
              titulo={t("modulos.titulo")}
              subtitulo={t("modulos.subtitulo")}
            />
          </Revelar>
          <div className="mt-10">
            <GrelhaModulos />
          </div>
        </Container>
      </Seccao>

      <Conformidade />
      <Fluxo />
      <MontraPainel />
      <Seguranca />
      <Crescimento />
      <Passos />
      <Indicadores />
      <ProvaSocial />

      <Seccao
        id="precos"
        ariaLabelledby="titulo-precos"
        className="bg-superficie-forte"
      >
        <Container>
          <Revelar>
            <TituloSeccao
              id="titulo-precos"
              etiqueta={t("precos.etiqueta")}
              titulo={t("precos.titulo")}
              subtitulo={t("precos.subtitulo")}
            />
          </Revelar>
          <div className="mt-10">
            <TabelaPrecos catalogo={catalogo} />
          </div>
          <div className="mt-10 flex justify-center">
            <BotaoLink href="/precos" variante="secundario">
              {t("precos.verTodos")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </BotaoLink>
          </div>
        </Container>
      </Seccao>

      <CtaFinal />

      <JsonLd data={organizacaoJsonLd(tComum("descricaoCurta"))} />
    </>
  );
}
