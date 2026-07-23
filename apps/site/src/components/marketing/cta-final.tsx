"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, BotaoLink } from "./primitivos";
import { Gesto, Revelar } from "./movimento";

export function CtaFinal() {
  const t = useTranslations("home.ctaFinal");

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <Revelar>
          <div className="gradiente-marca relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12">
            <div
              aria-hidden="true"
              className="grelha-suave pointer-events-none absolute inset-0 opacity-20"
            />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-seccao text-gradiente-texto">
                {t("titulo")}
              </h2>
              <p className="mt-4 text-lead text-gradiente-texto/90">
                {t("subtitulo")}
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Gesto>
                  <BotaoLink
                    href="/comecar"
                    tamanho="lg"
                    className="bg-background text-foreground hover:bg-background/90"
                  >
                    {t("ctaPrimario")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </BotaoLink>
                </Gesto>
                <Gesto>
                  <BotaoLink
                    href="/contacto"
                    tamanho="lg"
                    className="border border-gradiente-texto/50 bg-transparent text-gradiente-texto hover:bg-gradiente-texto/10"
                  >
                    {t("ctaSecundario")}
                  </BotaoLink>
                </Gesto>
              </div>
            </div>
          </div>
        </Revelar>
      </Container>
    </section>
  );
}
