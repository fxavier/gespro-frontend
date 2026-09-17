"use client";

import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, BotaoLink } from "./primitivos";
import { Gesto, Revelar } from "./movimento";

/**
 * Faixa final azul-marinho, de margem a margem, com um halo azul no topo.
 * `--faixa` é fixo nos dois temas (ver theme.css). O botão primário aqui é o
 * mesmo `bg-azul` do resto do site; o secundário é translúcido sobre a faixa.
 */
export function CtaFinal() {
  const t = useTranslations("home.ctaFinal");
  const garantias = t.raw("garantias") as string[];

  return (
    <section className="relative overflow-hidden bg-faixa py-24 text-faixa-texto">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[350px] w-[600px] -translate-x-1/2 rounded-full bg-azul/20 blur-3xl"
      />
      <Container className="relative max-w-4xl text-center">
        <Revelar>
          <span className="text-legenda font-bold tracking-wider text-faixa-texto/75 uppercase">
            {t("etiqueta")}
          </span>
          <h2 className="mt-2 text-seccao">{t("titulo")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lead text-faixa-texto/75">
            {t("subtitulo")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Gesto>
              <BotaoLink href="/comecar" tamanho="lg">
                {t("ctaPrimario")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </BotaoLink>
            </Gesto>
            <Gesto>
              <BotaoLink
                href="/contacto"
                variante="faixa"
                tamanho="lg"
              >
                {t("ctaSecundario")}
              </BotaoLink>
            </Gesto>
          </div>
          <ul className="mt-10 flex list-none flex-wrap items-center justify-center gap-6 border-t border-faixa-texto/20 p-0 pt-4 text-legenda text-faixa-texto/75">
            {garantias.map((garantia) => (
              <li key={garantia} className="inline-flex items-center gap-1">
                <Check className="size-4" aria-hidden="true" />
                {garantia}
              </li>
            ))}
          </ul>
        </Revelar>
      </Container>
    </section>
  );
}
