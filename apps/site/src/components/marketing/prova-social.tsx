"use client";

import { Quote } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Metrica {
  valor: string;
  rotulo: string;
}
interface Testemunho {
  citacao: string;
  autor: string;
  papel: string;
}

/**
 * Prova social: métricas + testemunhos.
 *
 * Os testemunhos são atribuídos por função e sector, não por pessoa nomeada —
 * é o que se pode afirmar honestamente antes de haver autorizações de citação
 * assinadas. Substituir por nomes reais quando existirem.
 */
export function ProvaSocial() {
  const t = useTranslations("home.provaSocial");
  const metricas = t.raw("metricas") as Metrica[];
  const testemunhos = t.raw("testemunhos") as Testemunho[];

  return (
    <Seccao className="border-y border-contorno-suave bg-superficie">
      <Container>
        <Revelar>
          <TituloSeccao titulo={t("titulo")} subtitulo={t("subtitulo")} />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-14 grid list-none grid-cols-2 gap-6 p-0 lg:grid-cols-4"
        >
          {metricas.map((metrica) => (
            <ItemCascata
              como="li"
              key={metrica.rotulo}
              className="text-center"
            >
              <p className="text-titulo text-primary tabular-nums">
                {metrica.valor}
              </p>
              <p className="mt-1 text-sm text-texto-suave">
                {metrica.rotulo}
              </p>
            </ItemCascata>
          ))}
        </Cascata>

        <Cascata
          como="ul"
          className="mt-14 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3"
        >
          {testemunhos.map((testemunho) => (
            <ItemCascata como="li" key={testemunho.citacao}>
              <figure className="flex h-full flex-col rounded-2xl border border-contorno-suave bg-card p-6">
                <Quote
                  className="size-5 text-destaque"
                  aria-hidden="true"
                />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                  {testemunho.citacao}
                </blockquote>
                <figcaption className="mt-5 border-t border-contorno-suave pt-4 text-sm">
                  <span className="block font-medium text-foreground">
                    {testemunho.autor}
                  </span>
                  <span className="block text-texto-suave">
                    {testemunho.papel}
                  </span>
                </figcaption>
              </figure>
            </ItemCascata>
          ))}
        </Cascata>
      </Container>
    </Seccao>
  );
}
