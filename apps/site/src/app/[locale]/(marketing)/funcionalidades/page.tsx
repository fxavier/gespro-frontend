import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { MODULOS } from "@/lib/modulos";
import { breadcrumbJsonLd, construirMetadata } from "@/lib/seo";
import {
  Container,
  Seccao,
  TituloSeccao,
  BotaoLink,
} from "@/components/marketing/primitivos";
import { IconeModulo } from "@/components/marketing/icone-modulo";
import { JsonLd } from "@/components/marketing/json-ld";
import { Revelar } from "@/components/marketing/movimento";
import { CtaFinal } from "@/components/marketing/cta-final";

interface Fluxo {
  origem: string;
  destino: string;
  descricao: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "metadata.funcionalidades",
  });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/funcionalidades",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaFuncionalidades({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("funcionalidades");
  const tModulos = await getTranslations("modulos");
  const tNav = await getTranslations("nav");
  const fluxos = t.raw("integracao.fluxos") as Fluxo[];

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

          {/* Índice por âncora: cada módulo é navegável por âncora nesta página
              e por página própria (Requisito 5.2). */}
          <nav aria-label={t("indice")} className="mt-12">
            <ul className="flex flex-wrap justify-center gap-2">
              {MODULOS.map((modulo) => (
                <li key={modulo}>
                  <a
                    href={`#${modulo}`}
                    className="inline-flex rounded-full border border-contorno-suave bg-superficie px-4 py-2 text-sm text-texto-suave transition-colors hover:text-foreground"
                  >
                    {tModulos(`${modulo}.nome`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </Seccao>

      {MODULOS.map((modulo, indice) => (
        <section
          key={modulo}
          id={modulo}
          aria-labelledby={`titulo-${modulo}`}
          className={
            indice % 2 === 1
              ? "border-y border-contorno-suave bg-superficie py-16 sm:py-20"
              : "py-16 sm:py-20"
          }
        >
          <Container>
            <Revelar>
              <div className="grid items-start gap-10 lg:grid-cols-2">
                <div>
                  <IconeModulo modulo={modulo} />
                  <h2
                    id={`titulo-${modulo}`}
                    className="mt-5 text-seccao text-foreground"
                  >
                    {tModulos(`${modulo}.nome`)}
                  </h2>
                  <p className="mt-4 text-lead text-texto-suave">
                    {tModulos(`${modulo}.descricao`)}
                  </p>
                  <Link
                    href={`/funcionalidades/${modulo}`}
                    className="sublinhado-animado mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                  >
                    {t("verModulo", { modulo: tModulos(`${modulo}.nome`) })}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>

                <ul
                  aria-label={t("listaFuncionalidades")}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
                >
                  {(tModulos.raw(`${modulo}.funcionalidades`) as string[]).map(
                    (item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 rounded-xl border border-contorno-suave bg-card px-4 py-3 text-sm text-foreground"
                      >
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-success"
                          aria-hidden="true"
                        />
                        {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </Revelar>
          </Container>
        </section>
      ))}

      <Seccao ariaLabelledby="titulo-integracao">
        <Container>
          <Revelar>
            <TituloSeccao
              id="titulo-integracao"
              titulo={t("integracao.titulo")}
              subtitulo={t("integracao.subtitulo")}
            />
          </Revelar>
          <ul className="mt-12 grid list-none gap-4 p-0 md:grid-cols-2">
            {fluxos.map((fluxo) => (
              <li
                key={fluxo.origem}
                className="rounded-2xl border border-contorno-suave bg-card p-6"
              >
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  <span>{fluxo.origem}</span>
                  <ArrowRight
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  <span>{fluxo.destino}</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-texto-suave">
                  {fluxo.descricao}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex justify-center">
            <BotaoLink href="/precos" tamanho="lg" variante="secundario">
              {tNav("precos")}
            </BotaoLink>
          </div>
        </Container>
      </Seccao>

      <CtaFinal />

      <JsonLd
        data={breadcrumbJsonLd([
          { nome: tNav("inicio"), caminho: "/" },
          { nome: t("titulo"), caminho: "/funcionalidades" },
        ])}
      />
    </>
  );
}
