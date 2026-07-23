import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { listarArtigos } from "@/lib/content";
import { construirMetadata } from "@/lib/seo";
import { Container, Seccao, TituloSeccao } from "@/components/marketing/primitivos";
import { Revelar } from "@/components/marketing/movimento";
import { CtaFinal } from "@/components/marketing/cta-final";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.recursos" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/recursos",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaRecursos({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("recursos");
  const formatador = await getFormatter();
  const artigos = listarArtigos();

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
          {artigos.length === 0 ? (
            <p className="text-texto-suave">{t("vazio")}</p>
          ) : (
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {artigos.map((artigo) => (
                <li key={artigo.slug}>
                  <Link
                    href={`/recursos/${artigo.slug}`}
                    className="subir-hover flex h-full flex-col rounded-2xl border border-contorno-suave bg-card p-6 hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex flex-wrap gap-2">
                      {artigo.etiquetas.map((etiqueta) => (
                        <span
                          key={etiqueta}
                          className="rounded-full bg-superficie px-2.5 py-1 text-xs text-texto-suave"
                        >
                          {etiqueta}
                        </span>
                      ))}
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-foreground">
                      {artigo.titulo}
                    </h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-texto-suave">
                      {artigo.resumo}
                    </p>
                    <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-suave">
                      <time dateTime={artigo.data}>
                        {formatador.dateTime(new Date(artigo.data), {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t("tempoLeitura", { minutos: artigo.minutosLeitura })}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Seccao>

      <CtaFinal />
    </>
  );
}
