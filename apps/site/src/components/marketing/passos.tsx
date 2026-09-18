"use client";

import { Activity, SlidersHorizontal, Upload, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao, Cartao } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Passo {
  titulo: string;
  descricao: string;
  nota: string;
}

const ICONES: LucideIcon[] = [SlidersHorizontal, Upload, Activity];

/** «Como funciona»: três passos, do registo ao painel. */
export function Passos() {
  const t = useTranslations("home.passos");
  const passos = t.raw("itens") as Passo[];

  return (
    <Seccao id="como-funciona" ariaLabelledby="titulo-passos">
      <Container>
        <Revelar>
          <TituloSeccao
            id="titulo-passos"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-10 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3"
        >
          {passos.map((passo, indice) => {
            const Icone = ICONES[indice] ?? Activity;
            return (
              <ItemCascata como="li" key={passo.titulo}>
                <Cartao className="flex h-full flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-4xl font-bold text-primary tabular-nums">
                        0{indice + 1}
                      </span>
                      <span className="grid size-10 place-items-center rounded-full bg-destaque-suave text-primary">
                        <Icone className="size-5" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-foreground">{passo.titulo}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-texto-suave">
                      {passo.descricao}
                    </p>
                  </div>
                  <p className="mt-6 text-legenda text-texto-suave">{passo.nota}</p>
                </Cartao>
              </ItemCascata>
            );
          })}
        </Cascata>
      </Container>
    </Seccao>
  );
}
