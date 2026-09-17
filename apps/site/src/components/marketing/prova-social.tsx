"use client";

import { Quote } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao, Cartao } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Testemunho {
  citacao: string;
  autor: string;
  papel: string;
}

/**
 * Testemunhos.
 *
 * Atribuídos por função e sector, não por pessoa nomeada — é o que se pode
 * afirmar honestamente antes de haver autorizações de citação assinadas.
 * Substituir por nomes reais (e iniciais no círculo) quando existirem.
 */
export function ProvaSocial() {
  const t = useTranslations("home.provaSocial");
  const testemunhos = t.raw("testemunhos") as Testemunho[];

  return (
    <Seccao ariaLabelledby="titulo-testemunhos">
      <Container>
        <Revelar>
          <TituloSeccao
            id="titulo-testemunhos"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-10 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3"
        >
          {testemunhos.map((testemunho) => (
            <ItemCascata como="li" key={testemunho.citacao}>
              <Cartao className="flex h-full flex-col justify-between">
                <blockquote className="text-[15px] leading-relaxed text-foreground">
                  “{testemunho.citacao}”
                </blockquote>
                <figure className="mt-6 flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destaque-suave text-primary">
                    <Quote className="size-4" aria-hidden="true" />
                  </span>
                  <figcaption className="text-sm">
                    <span className="block font-semibold text-foreground">
                      {testemunho.autor}
                    </span>
                    <span className="block text-legenda text-texto-suave">
                      {testemunho.papel}
                    </span>
                  </figcaption>
                </figure>
              </Cartao>
            </ItemCascata>
          ))}
        </Cascata>
      </Container>
    </Seccao>
  );
}
