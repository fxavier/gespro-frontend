"use client";

import { Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { MODULOS } from "@/lib/modulos";
import { Container, Seccao, TituloSeccao } from "./primitivos";
import { Revelar } from "./movimento";
import { IconeModulo } from "./icone-modulo";

/**
 * «Tudo ligado»: os sete módulos à volta do motor central.
 *
 * ponytail: são 8 nós numa fila de 8 — 3 módulos, o núcleo, 4 módulos. O
 * mockup tinha 6 satélites e ficava simétrico; com sete não há simetria
 * possível numa fila, e uma segunda fila só para um nó ficava pior.
 */
export function Fluxo() {
  const t = useTranslations("home.fluxo");
  const tModulos = useTranslations("modulos");
  const antes = MODULOS.slice(0, 3);
  const depois = MODULOS.slice(3);

  const no = (modulo: (typeof MODULOS)[number]) => (
    <li
      key={modulo}
      className="flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-center shadow-sm transition-transform hover:-translate-y-1"
    >
      <IconeModulo modulo={modulo} />
      <span className="text-sm font-semibold text-foreground">
        {tModulos(`${modulo}.nome`)}
      </span>
    </li>
  );

  return (
    <Seccao ariaLabelledby="titulo-fluxo">
      <Container className="text-center">
        <Revelar>
          <TituloSeccao
            id="titulo-fluxo"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Revelar className="mt-10">
          <div className="relative overflow-hidden rounded-3xl bg-superficie-forte p-6 md:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="size-72 rounded-full bg-azul/10 blur-3xl" />
            </div>
            <ul className="relative z-10 grid list-none grid-cols-2 items-center gap-3 p-0 sm:grid-cols-4 lg:grid-cols-8">
              {antes.map(no)}
              <li className="col-span-2 flex scale-105 flex-col items-center justify-center gap-1 rounded-2xl bg-azul p-6 text-accao-texto shadow-xl sm:col-span-4 lg:col-span-1">
                <Network className="size-8" aria-hidden="true" />
                <span className="text-lg font-bold tracking-tight">GestPro</span>
                <span className="text-legenda tracking-wider uppercase">
                  {t("nucleo")}
                </span>
              </li>
              {depois.map(no)}
            </ul>
            <p className="mx-auto mt-6 max-w-xl text-sm text-texto-suave">{t("nota")}</p>
          </div>
        </Revelar>
      </Container>
    </Seccao>
  );
}
