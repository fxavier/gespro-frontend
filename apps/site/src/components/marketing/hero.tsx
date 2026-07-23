"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, useVariantesEntrada, Gesto, Paralaxe } from "./movimento";
import { Container, BotaoLink, Etiqueta } from "./primitivos";
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
        className="aurora pointer-events-none absolute inset-x-0 top-0 h-[42rem]"
      />
      <div
        aria-hidden="true"
        className="grelha-suave pointer-events-none absolute inset-x-0 top-0 h-[42rem] opacity-40"
      />

      <Container className="relative">
        <motion.div
          initial="escondido"
          animate="visivel"
          variants={{
            escondido: {},
            visivel: { transition: { staggerChildren: 0.09 } },
          }}
          className="mx-auto flex max-w-3xl flex-col items-center pt-20 pb-14 text-center sm:pt-28"
        >
          <motion.div variants={variantes}>
            <Etiqueta className="bg-background/70">
              <Sparkles className="size-3.5 text-destaque" aria-hidden="true" />
              {t("etiqueta")}
            </Etiqueta>
          </motion.div>

          <motion.h1
            variants={variantes}
            className="mt-6 text-display text-foreground"
          >
            {t("titulo")}{" "}
            <span className="texto-gradiente">{t("tituloDestaque")}</span>
          </motion.h1>

          <motion.p
            variants={variantes}
            className="mt-6 max-w-2xl text-lead text-texto-suave"
          >
            {t("subtitulo")}
          </motion.p>

          <motion.div
            variants={variantes}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Gesto>
              <BotaoLink href="/comecar" tamanho="lg">
                {t("ctaPrimario")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </BotaoLink>
            </Gesto>
            <Gesto>
              <BotaoLink
                href="/funcionalidades"
                variante="secundario"
                tamanho="lg"
              >
                {t("ctaSecundario")}
              </BotaoLink>
            </Gesto>
          </motion.div>

          <motion.p
            variants={variantes}
            className="mt-5 text-sm text-texto-suave"
          >
            {t("notaCta")}
          </motion.p>
        </motion.div>

        <motion.div
          initial="escondido"
          animate="visivel"
          variants={variantes}
          transition={{ delay: 0.35 }}
          className="pb-20 sm:pb-28"
        >
          <Paralaxe amplitude={18} className="mx-auto max-w-5xl">
            <figure className="m-0">
              <PainelProduto />
              <figcaption className="sr-only">
                {t("legendaVisual")}
              </figcaption>
            </figure>
          </Paralaxe>
        </motion.div>
      </Container>
    </section>
  );
}
