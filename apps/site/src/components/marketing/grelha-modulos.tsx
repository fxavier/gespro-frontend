"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MODULOS } from "@/lib/modulos";
import { cn } from "@/lib/cn";
import { Cascata, ItemCascata } from "./movimento";
import { IconeModulo } from "./icone-modulo";

/**
 * Grelha «bento» dos sete módulos do ERP, com as larguras do mockup:
 * 7+5 / 4+4+4 / 6+6 colunas — sete cartões, três filas, nenhum buraco.
 *
 * Cada cartão é um link inteiro para a página do módulo — alvo grande, um só
 * `tab stop`, sem "ler mais" redundante para quem navega por leitor de ecrã.
 */
const LARGURAS = [
  "md:col-span-7",
  "md:col-span-5",
  "md:col-span-4",
  "md:col-span-4",
  "md:col-span-4",
  "md:col-span-6",
  "md:col-span-6",
];

const LETRAS = ["A", "B", "C", "D", "E", "F", "G"];

export function GrelhaModulos() {
  const t = useTranslations("modulos");
  const tHome = useTranslations("home.modulos");
  const tFunc = useTranslations("funcionalidades");

  return (
    <Cascata
      como="ul"
      className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-12"
    >
      {MODULOS.map((modulo, indice) => (
        <ItemCascata como="li" key={modulo} className={LARGURAS[indice]}>
          <Link
            href={`/funcionalidades/${modulo}`}
            className={cn(
              "subir-hover group flex h-full flex-col justify-between rounded-2xl border border-transparent bg-card p-6 shadow-sm hover:shadow-md dark:border-contorno-suave"
            )}
          >
            <div>
              <div className="flex items-center justify-between">
                <IconeModulo modulo={modulo} />
                <span className="rounded-full bg-superficie-forte px-2 py-0.5 text-legenda font-semibold text-foreground uppercase">
                  {tHome("modulo", { letra: LETRAS[indice] })}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-foreground">
                {t(`${modulo}.nome`)}
              </h3>
              <p className="mt-1 text-[15px] leading-relaxed text-texto-suave">
                {t(`${modulo}.descricao`)}
              </p>
            </div>
            <p className="mt-6 flex items-center gap-1 text-xs font-semibold text-primary">
              <span>{t(`${modulo}.resumo`)}</span>
              <ArrowRight
                className="size-3.5 transition-transform duration-[var(--duracao-rapida)] group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </p>
            <span className="sr-only">
              {tFunc("verModulo", { modulo: t(`${modulo}.nome`) })}
            </span>
          </Link>
        </ItemCascata>
      ))}
    </Cascata>
  );
}
