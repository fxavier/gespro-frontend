import type { Metadata } from "next";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { obterPlanos } from "@/lib/planos";
import { construirMetadata } from "@/lib/seo";
import { Container, Seccao } from "@/components/marketing/primitivos";
import { FormularioRegisto } from "@/components/marketing/formulario-registo";

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
  const t = await getTranslations({ locale, namespace: "metadata.comecar" });

  return construirMetadata({
    titulo: t("titulo"),
    descricao: t("descricao"),
    caminho: "/comecar",
    locale,
    seccao: t("titulo"),
  });
}

export default async function PaginaComecar({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("comecar");
  const tPrecos = await getTranslations("precos");
  const { planos } = await obterPlanos();

  return (
    <Seccao>
      <Container>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div className="max-w-md">
            <h1 className="text-titulo text-foreground">{t("titulo")}</h1>
            <p className="mt-4 text-lead text-texto-suave">
              {t("subtitulo")}
            </p>
            <ul className="mt-10 space-y-3">
              {(tPrecos.raw("todosOsPlanos.itens") as string[]).map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-texto-suave"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-contorno-suave bg-card p-6 sm:p-9">
            {/* `useSearchParams` (plano pré-seleccionado) exige limite de
                Suspense — sem ele o prerender de produção parte. */}
            <Suspense
              fallback={
                <div className="h-96 animate-pulse rounded-2xl bg-superficie" />
              }
            >
              <FormularioRegisto planos={planos} />
            </Suspense>
          </div>
        </div>
      </Container>
    </Seccao>
  );
}
