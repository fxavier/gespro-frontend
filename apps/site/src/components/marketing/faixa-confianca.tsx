"use client";

import { Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container } from "./primitivos";

/** Faixa de confiança sob o hero: uma frase e as seis promessas em pastilha. */
export function FaixaConfianca() {
  const t = useTranslations("home.confianca");
  const itens = t.raw("itens") as string[];

  return (
    <section className="bg-superficie-forte py-10">
      <Container className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <p className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <Network className="size-5 text-primary" aria-hidden="true" />
          {t("titulo")}
        </p>
        <ul className="flex list-none flex-wrap items-center justify-center gap-2 p-0">
          {itens.map((item) => (
            <li
              key={item}
              className="rounded-full bg-card px-4 py-1 text-xs font-semibold text-texto-suave shadow-sm"
            >
              {item}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
