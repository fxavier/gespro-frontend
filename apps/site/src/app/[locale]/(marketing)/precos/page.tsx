import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { obterPlanos } from "@/lib/planos";
import { construirMetadata, faqJsonLd, produtoJsonLd } from "@/lib/seo";
import { Container, Seccao, TituloSeccao } from "@/components/marketing/primitivos";
import { TabelaPrecos } from "@/components/marketing/tabela-precos";
import { Faq, type ItemFaq } from "@/components/marketing/faq";
import { JsonLd } from "@/components/marketing/json-ld";
import { Revelar } from "@/components/marketing/movimento";
import { CtaFinal } from "@/components/marketing/cta-final";

/**
 * ISR: o catálogo de planos é lido do spec 19 e revalidado a cada 5 minutos —
 * uma mudança de preço propaga sem rebuild do site (Requisito 10, design.md).
 */
// Literal por exigência do Next: as configurações de segmento têm de ser
// analisáveis estaticamente (não aceitam constantes importadas).
// Espelha REVALIDACAO_PLANOS de lib/planos.ts — verificado em __tests__/planos.test.ts.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.precos" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/precos",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaPrecos({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("precos");
  const tMeta = await getTranslations("metadata.precos");
  const catalogo = await obterPlanos();
  const perguntas = t.raw("faq.itens") as ItemFaq[];

  return (
    <>
      <Seccao className="pb-10">
        <Container>
          <Revelar>
            <TituloSeccao
              nivel={1}
              etiqueta={t("etiqueta")}
              titulo={t("titulo")}
              subtitulo={t("subtitulo")}
            />
          </Revelar>
          <div className="mt-14">
            <TabelaPrecos catalogo={catalogo} />
          </div>
        </Container>
      </Seccao>

      <Seccao ariaLabelledby="titulo-faq">
        <Container>
          <Revelar>
            <TituloSeccao id="titulo-faq" titulo={t("faq.titulo")} />
          </Revelar>
          <div className="mt-10">
            <Faq itens={perguntas} />
          </div>
        </Container>
      </Seccao>

      <CtaFinal />

      {catalogo.planos.map((plano) => (
        <JsonLd
          key={plano.id}
          data={produtoJsonLd(plano, tMeta("descricao"))}
        />
      ))}
      <JsonLd data={faqJsonLd(perguntas)} />
    </>
  );
}
