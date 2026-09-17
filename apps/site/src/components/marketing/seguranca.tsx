"use client";

import {
  Activity,
  Building2,
  Lock,
  ScrollText,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao, Cartao, ChapaIcone } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Item {
  titulo: string;
  descricao: string;
}

const ICONES: LucideIcon[] = [ShieldCheck, UserCog, ScrollText, Building2, Lock, Activity];

/** Segurança e controlo: seis garantias que o produto cumpre de facto. */
export function Seguranca() {
  const t = useTranslations("home.seguranca");
  const itens = t.raw("itens") as Item[];

  return (
    <Seccao id="seguranca" ariaLabelledby="titulo-seguranca">
      <Container>
        <Revelar>
          <TituloSeccao
            id="titulo-seguranca"
            alinhamento="esquerda"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
        >
          {itens.map((item, indice) => {
            const Icone = ICONES[indice] ?? ShieldCheck;
            return (
              <ItemCascata como="li" key={item.titulo}>
                <Cartao className="flex h-full flex-col gap-3">
                  <ChapaIcone>
                    <Icone className="size-[22px]" aria-hidden="true" />
                  </ChapaIcone>
                  <h3 className="text-lg font-semibold text-foreground">{item.titulo}</h3>
                  <p className="text-sm leading-relaxed text-texto-suave">{item.descricao}</p>
                </Cartao>
              </ItemCascata>
            );
          })}
        </Cascata>
      </Container>
    </Seccao>
  );
}
