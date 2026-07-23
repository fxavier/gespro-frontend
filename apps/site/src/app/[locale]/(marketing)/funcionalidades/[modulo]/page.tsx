import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { MODULOS, eModuloValido, type ModuloSlug } from "@/lib/modulos";
import { breadcrumbJsonLd, construirMetadata } from "@/lib/seo";
import {
  Container,
  Seccao,
  BotaoLink,
} from "@/components/marketing/primitivos";
import { IconeModulo } from "@/components/marketing/icone-modulo";
import { JsonLd } from "@/components/marketing/json-ld";
import { Revelar } from "@/components/marketing/movimento";
import { CtaFinal } from "@/components/marketing/cta-final";

/** Uma rota estática por módulo × locale — nada aqui é dinâmico em runtime. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    MODULOS.map((modulo) => ({ locale, modulo }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; modulo: string }>;
}): Promise<Metadata> {
  const { locale, modulo } = await params;
  if (!eModuloValido(modulo)) return {};

  const t = await getTranslations({ locale, namespace: "modulos" });
  const nome = t(`${modulo}.nome`);

  return construirMetadata({
    titulo: nome,
    descricao: t(`${modulo}.descricao`),
    caminho: `/funcionalidades/${modulo}`,
    locale,
    seccao: nome,
  });
}

export default async function PaginaModulo({
  params,
}: {
  params: Promise<{ locale: Locale; modulo: string }>;
}) {
  const { locale, modulo } = await params;
  if (!eModuloValido(modulo)) notFound();
  setRequestLocale(locale);

  const slug: ModuloSlug = modulo;
  const t = await getTranslations("modulos");
  const tFunc = await getTranslations("funcionalidades");
  const tNav = await getTranslations("nav");
  const nome = t(`${slug}.nome`);
  const outros = MODULOS.filter((m) => m !== slug);

  return (
    <>
      <Seccao className="pb-8">
        <Container>
          <Link
            href="/funcionalidades"
            className="sublinhado-animado inline-flex items-center gap-1.5 text-sm text-texto-suave"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {tNav("funcionalidades")}
          </Link>

          <Revelar className="mt-8 max-w-texto">
            {/* `view-transition-name` liga o ícone entre a listagem e esta
                página quando o browser suporta View Transitions; onde não
                suporta, é uma propriedade CSS ignorada (ADR-0007). */}
            <div style={{ viewTransitionName: `modulo-${slug}` }}>
              <IconeModulo modulo={slug} className="size-14" />
            </div>
            <h1 className="mt-6 text-titulo text-foreground">{nome}</h1>
            <p className="mt-4 text-lead text-texto-suave">
              {t(`${slug}.resumo`)}
            </p>
            <p className="mt-4 leading-relaxed text-texto-suave">
              {t(`${slug}.descricao`)}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BotaoLink href="/comecar">{tNav("comecar")}</BotaoLink>
              <BotaoLink href="/precos" variante="secundario">
                {tNav("precos")}
              </BotaoLink>
            </div>
          </Revelar>
        </Container>
      </Seccao>

      <Seccao className="pt-8" ariaLabelledby="titulo-lista">
        <Container>
          <h2 id="titulo-lista" className="text-seccao text-foreground">
            {tFunc("listaFuncionalidades")}
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(t.raw(`${slug}.funcionalidades`) as string[]).map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-xl border border-contorno-suave bg-card px-4 py-3.5 text-sm text-foreground"
              >
                <Check
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </Seccao>

      <Seccao
        className="border-t border-contorno-suave pt-16"
        ariaLabelledby="titulo-outros"
      >
        <Container>
          <h2 id="titulo-outros" className="text-seccao text-foreground">
            {tFunc("outrosModulos")}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outros.map((outro) => (
              <li key={outro}>
                <Link
                  href={`/funcionalidades/${outro}`}
                  className="subir-hover flex h-full flex-col rounded-2xl border border-contorno-suave bg-card p-5 hover:border-primary/40"
                >
                  <IconeModulo modulo={outro} />
                  <span className="mt-4 font-semibold text-foreground">
                    {t(`${outro}.nome`)}
                  </span>
                  <span className="mt-1.5 text-sm text-texto-suave">
                    {t(`${outro}.resumo`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Seccao>

      <CtaFinal />

      <JsonLd
        data={breadcrumbJsonLd([
          { nome: tNav("inicio"), caminho: "/" },
          { nome: tNav("funcionalidades"), caminho: "/funcionalidades" },
          { nome, caminho: `/funcionalidades/${slug}` },
        ])}
      />
    </>
  );
}
