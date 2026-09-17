"use client";

import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao, Cartao, ChapaIcone } from "./primitivos";
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
            alinhamento="esquerda"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4"
        >
          {itens.map((item) => (
            <ItemCascata como="li" key={item.titulo}>
              <Cartao className="flex h-full flex-col gap-3">
                <ChapaIcone>
                  <BadgeCheck className="size-[22px]" aria-hidden="true" />
                </ChapaIcone>
                <h3 className="text-lg font-semibold text-foreground">{item.titulo}</h3>
                <p className="text-sm leading-relaxed text-texto-suave">{item.descricao}</p>
              </Cartao>
            </ItemCascata>
          ))}
        </Cascata>
      </Container>
    </Seccao>
  );
}
