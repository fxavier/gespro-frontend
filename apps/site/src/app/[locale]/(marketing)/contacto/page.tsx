import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { construirMetadata } from "@/lib/seo";
import { Container, Seccao } from "@/components/marketing/primitivos";
import { FormularioContacto } from "@/components/marketing/formulario-contacto";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.contacto" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/contacto",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaContacto({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("contacto");
  const tComum = await getTranslations("comum");

  return (
    <Seccao>
      <Container>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr]">
          <div className="max-w-md">
            <h1 className="text-titulo text-foreground">{t("titulo")}</h1>
            <p className="mt-4 text-lead text-texto-suave">
              {t("subtitulo")}
            </p>

            <h2 className="mt-12 text-sm font-semibold tracking-wide text-texto-suave uppercase">
              {t("outrosCanais.titulo")}
            </h2>
            {/* Cada par vive num `<div>` cujos filhos DIRECTOS são `<dt>` e
                `<dd>` — é o que as regras `definition-list`/`dlitem` exigem.
                O ícone entra dentro do `<dt>`, não como irmão. */}
            <dl className="mt-5 space-y-5 text-sm">
              <div>
                <dt className="flex items-center gap-2 font-medium text-foreground">
                  <Mail className="size-4 text-primary" aria-hidden="true" />
                  {t("outrosCanais.emailRotulo")}
                </dt>
                <dd className="mt-1 ml-6">
                  <a
                    href={`mailto:${tComum("email")}`}
                    className="sublinhado-animado text-texto-suave"
                  >
                    {tComum("email")}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-medium text-foreground">
                  <Phone className="size-4 text-primary" aria-hidden="true" />
                  {t("outrosCanais.telefoneRotulo")}
                </dt>
                <dd className="mt-1 ml-6 text-texto-suave">
                  {tComum("telefone")}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-medium text-foreground">
                  <MapPin className="size-4 text-primary" aria-hidden="true" />
                  {t("outrosCanais.moradaRotulo")}
                </dt>
                <dd className="mt-1 ml-6 text-texto-suave">
                  {t("outrosCanais.morada")}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-medium text-foreground">
                  <Clock className="size-4 text-primary" aria-hidden="true" />
                  {t("outrosCanais.horarioRotulo")}
                </dt>
                <dd className="mt-1 ml-6 text-texto-suave">
                  {t("outrosCanais.horario")}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-contorno-suave bg-card p-6 sm:p-9">
            <FormularioContacto />
          </div>
        </div>
      </Container>
    </Seccao>
  );
}
