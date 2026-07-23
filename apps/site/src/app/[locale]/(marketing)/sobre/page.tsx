import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { construirMetadata, organizacaoJsonLd } from "@/lib/seo";
import { Container, Seccao, TituloSeccao } from "@/components/marketing/primitivos";
import { JsonLd } from "@/components/marketing/json-ld";
import { Revelar } from "@/components/marketing/movimento";
import { CtaFinal } from "@/components/marketing/cta-final";

interface Bloco {
  titulo: string;
  texto: string;
}
interface Valor {
  titulo: string;
  descricao: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.sobre" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/sobre",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaSobre({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("sobre");
  const tComum = await getTranslations("comum");
  const seccoes = t.raw("seccoes") as Bloco[];
  const valores = t.raw("valores.itens") as Valor[];

  return (
    <>
      <Seccao className="pb-10">
        <Container>
          <Revelar>
            <TituloSeccao
              nivel={1}
              alinhamento="esquerda"
              etiqueta={t("etiqueta")}
              titulo={t("titulo")}
              subtitulo={t("subtitulo")}
            />
          </Revelar>
        </Container>
      </Seccao>

      <Seccao className="pt-0">
        <Container>
          <div className="max-w-texto space-y-12">
            {seccoes.map((seccao) => (
              <Revelar key={seccao.titulo}>
                <h2 className="text-xl font-semibold text-foreground">
                  {seccao.titulo}
                </h2>
                <p className="mt-3 leading-relaxed text-texto-suave">
                  {seccao.texto}
                </p>
              </Revelar>
            ))}
          </div>
        </Container>
      </Seccao>

      <Seccao
        className="border-y border-contorno-suave bg-superficie"
        ariaLabelledby="titulo-valores"
      >
        <Container>
          <Revelar>
            <TituloSeccao
              id="titulo-valores"
              alinhamento="esquerda"
              titulo={t("valores.titulo")}
            />
          </Revelar>
          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {valores.map((valor) => (
              <li
                key={valor.titulo}
                className="rounded-2xl border border-contorno-suave bg-card p-6"
              >
                <h3 className="text-base font-semibold text-foreground">
                  {valor.titulo}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-texto-suave">
                  {valor.descricao}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Seccao>

      <CtaFinal />
      <JsonLd data={organizacaoJsonLd(tComum("descricaoCurta"))} />
    </>
  );
}
