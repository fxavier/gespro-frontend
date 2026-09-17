"use client";

import { ArrowRight, BadgeCheck, PlayCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, useVariantesEntrada, Gesto } from "./movimento";
import { Container, BotaoLink } from "./primitivos";
import { PainelProduto } from "./painel-produto";

/**
 * Hero da Home — entrada em cascata.
 *
 * O texto do `h1` é o candidato a LCP e é renderizado no servidor: a animação
 * é só de opacidade/translação sobre markup já presente. Com movimento
 * reduzido, `useVariantesEntrada()` devolve `opacity: 1` — o título aparece
 * imediatamente, nunca depende do JS ter corrido.
 */
export function Hero() {
  const t = useTranslations("home.hero");
  const variantes = useVariantesEntrada();

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="aurora pointer-events-none absolute inset-x-0 top-0 h-[40rem] opacity-70"
      />

      <Container className="relative">
        <motion.div
          initial="escondido"
          animate="visivel"
          variants={{
            escondido: {},
            visivel: { transition: { staggerChildren: 0.09 } },
          }}
          className="mx-auto flex max-w-4xl flex-col items-center pt-20 text-center lg:pt-28"
        >
          <motion.div variants={variantes}>
            <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1 text-xs font-semibold tracking-wider text-primary uppercase shadow-sm">
              <span
                aria-hidden="true"
                className="size-2 animate-pulse rounded-full bg-azul"
              />
              {t("etiqueta")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </motion.div>

          <motion.h1
            variants={variantes}
            className="mt-6 text-display text-foreground"
          >
            {t("titulo")}{" "}
            <br className="hidden sm:inline" />
            <span className="texto-gradiente">{t("tituloDestaque")}</span>
          </motion.h1>

          <motion.p
            variants={variantes}
            className="mt-4 max-w-2xl text-lead text-texto-suave"
          >
            {t("subtitulo")}
          </motion.p>

          <motion.div
            variants={variantes}
            className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row"
          >
            <Gesto className="w-full sm:w-auto">
              <BotaoLink href="/comecar" tamanho="lg" className="w-full">
                {t("ctaPrimario")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </BotaoLink>
            </Gesto>
            <Gesto className="w-full sm:w-auto">
              <BotaoLink
                href="#como-funciona"
                variante="secundario"
                tamanho="lg"
                className="w-full"
              >
                <PlayCircle className="size-4 text-primary" aria-hidden="true" />
                {t("ctaSecundario")}
              </BotaoLink>
            </Gesto>
          </motion.div>

          <motion.p
            variants={variantes}
            className="mt-4 flex items-center justify-center gap-1.5 text-sm text-texto-suave"
          >
            <BadgeCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {t("notaCta")}
          </motion.p>
        </motion.div>

        <motion.div
          initial="escondido"
          animate="visivel"
          variants={variantes}
          transition={{ delay: 0.35 }}
          className="pt-14 pb-20 lg:pb-28"
        >
          <figure className="m-0">
            <PainelProduto />
            <figcaption className="sr-only">{t("legendaVisual")}</figcaption>
          </figure>
        </motion.div>
      </Container>
    </section>
  );
}
