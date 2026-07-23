import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { obterArtigo, relacionados, slugsDeArtigos } from "@/lib/content";
import { artigoJsonLd, breadcrumbJsonLd, construirMetadata } from "@/lib/seo";
import { Container, Seccao } from "@/components/marketing/primitivos";
import { ConteudoMdx } from "@/components/marketing/mdx";
import { JsonLd } from "@/components/marketing/json-ld";
import { CtaFinal } from "@/components/marketing/cta-final";

/** Rotas estáticas a partir da colecção MDX (Requisito 4.3). */
export function generateStaticParams() {
  const slugs = slugsDeArtigos();
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const artigo = obterArtigo(slug);
  if (!artigo) return {};

  return construirMetadata({
    titulo: artigo.titulo,
    descricao: artigo.resumo,
    caminho: `/recursos/${slug}`,
    locale,
    seccao: "Recursos",
    imagem: artigo.imagemOg,
    tipo: "article",
    publicadoEm: artigo.data,
    autor: artigo.autor,
  });
}

export default async function PaginaArtigo({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const artigo = obterArtigo(slug);
  if (!artigo) notFound();

  const t = await getTranslations("recursos");
  const tNav = await getTranslations("nav");
  const formatador = await getFormatter();
  const outros = relacionados(artigo);

  return (
    <>
      <Seccao className="pb-8">
        <Container>
          <Link
            href="/recursos"
            className="sublinhado-animado inline-flex items-center gap-1.5 text-sm text-texto-suave"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("voltarLista")}
          </Link>

          <article className="mt-8 max-w-texto">
            <header>
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
              <h1 className="mt-5 text-titulo text-foreground">
                {artigo.titulo}
              </h1>
              <p className="mt-4 text-lead text-texto-suave">
                {artigo.resumo}
              </p>
              <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-contorno-suave pt-5 text-sm text-texto-suave">
                <span>{t("porAutor", { autor: artigo.autor })}</span>
                <span aria-hidden="true">·</span>
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
            </header>

            <div className="mt-4">
              <ConteudoMdx fonte={artigo.corpo} />
            </div>
          </article>
        </Container>
      </Seccao>

      {outros.length > 0 ? (
        <Seccao
          className="border-t border-contorno-suave pt-14"
          ariaLabelledby="titulo-relacionados"
        >
          <Container>
            <h2
              id="titulo-relacionados"
              className="text-seccao text-foreground"
            >
              {t("artigosRelacionados")}
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {outros.map((outro) => (
                <li key={outro.slug}>
                  <Link
                    href={`/recursos/${outro.slug}`}
                    className="subir-hover block h-full rounded-2xl border border-contorno-suave bg-card p-6 hover:border-primary/40"
                  >
                    <span className="font-semibold text-foreground">
                      {outro.titulo}
                    </span>
                    <span className="mt-2 block text-sm text-texto-suave">
                      {outro.resumo}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </Seccao>
      ) : null}

      <CtaFinal />

      <JsonLd
        data={artigoJsonLd({
          titulo: artigo.titulo,
          resumo: artigo.resumo,
          data: artigo.data,
          autor: artigo.autor,
          caminho: `/recursos/${slug}`,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { nome: tNav("inicio"), caminho: "/" },
          { nome: tNav("recursos"), caminho: "/recursos" },
          { nome: artigo.titulo, caminho: `/recursos/${slug}` },
        ])}
      />
    </>
  );
}
