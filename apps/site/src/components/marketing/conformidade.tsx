"use client";

import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Item {
  titulo: string;
  descricao: string;
}

/** Conformidade moçambicana: PGC-NIRF, NUIT/BI, metical, INSS/IRPS. */
export function Conformidade() {
  const t = useTranslations("home.conformidade");
  const itens = t.raw("itens") as Item[];

  return (
    <Seccao id="conformidade" ariaLabelledby="titulo-conformidade">
      <Container>
        <Revelar>
          <TituloSeccao
            id="titulo-conformidade"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-14 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2"
        >
          {itens.map((item) => (
            <ItemCascata como="li" key={item.titulo}>
              <div className="flex h-full gap-4 rounded-2xl border border-contorno-suave bg-card p-6">
                <BadgeCheck
                  className="mt-0.5 size-5 shrink-0 text-success"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {item.titulo}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-texto-suave">
                    {item.descricao}
                  </p>
                </div>
              </div>
            </ItemCascata>
          ))}
        </Cascata>
      </Container>
    </Seccao>
  );
}
