"use client";

import {
  ArrowRight,
  Check,
  Database,
  EyeOff,
  RefreshCwOff,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao, Cartao, ChapaIcone } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Item {
  titulo: string;
  descricao: string;
  nota: string;
}

const ICONES: LucideIcon[] = [Database, RefreshCwOff, EyeOff, TrendingDown];

/** Os quatro problemas que o produto resolve, e a ponte para os módulos. */
export function Problemas() {
  const t = useTranslations("home.problemas");
  const itens = t.raw("itens") as Item[];

  return (
    <Seccao ariaLabelledby="titulo-problemas">
      <Container>
        <Revelar>
          <TituloSeccao
            id="titulo-problemas"
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
          {itens.map((item, indice) => {
            const Icone = ICONES[indice] ?? Database;
            return (
              <ItemCascata como="li" key={item.titulo}>
                <Cartao className="subir-hover flex h-full flex-col justify-between hover:shadow-md">
                  <div>
                    <ChapaIcone className="mb-4">
                      <Icone className="size-6" aria-hidden="true" />
                    </ChapaIcone>
                    <h3 className="text-lg font-semibold text-foreground">
                      {item.titulo}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-texto-suave">
                      {item.descricao}
                    </p>
                  </div>
                  <p className="mt-6 text-legenda text-texto-suave">
                    0{indice + 1} / {item.nota}
                  </p>
                </Cartao>
              </ItemCascata>
            );
          })}
        </Cascata>

        <Revelar className="mt-10">
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-superficie-forte p-4 text-center sm:flex-row sm:text-left">
            <div className="flex items-center gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-azul text-accao-texto">
                <Check className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {t("transicao.titulo")}
                </p>
                <p className="text-sm text-texto-suave">{t("transicao.descricao")}</p>
              </div>
            </div>
            <a
              href="#funcionalidades"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("transicao.ligacao")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </Revelar>
      </Container>
    </Seccao>
  );
}
