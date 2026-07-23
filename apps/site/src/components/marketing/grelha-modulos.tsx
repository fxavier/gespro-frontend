"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MODULOS } from "@/lib/modulos";
import { Cascata, ItemCascata } from "./movimento";
import { IconeModulo } from "./icone-modulo";

/**
 * Grelha dos sete módulos do ERP. Cada cartão é um link inteiro para a página
 * do módulo — alvo grande, um só `tab stop`, sem "ler mais" redundante para
 * quem navega por leitor de ecrã.
 */
export function GrelhaModulos() {
  const t = useTranslations("modulos");
  const tFunc = useTranslations("funcionalidades");

  return (
    <Cascata
      como="ul"
      className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
    >
      {MODULOS.map((modulo) => (
        <ItemCascata como="li" key={modulo}>
          <Link
            href={`/funcionalidades/${modulo}`}
            className="subir-hover group flex h-full flex-col rounded-2xl border border-contorno-suave bg-card p-6 hover:border-primary/40 hover:shadow-md"
          >
            <IconeModulo modulo={modulo} />
            <h3 className="mt-5 flex items-center gap-1.5 text-lg font-semibold text-foreground">
              {t(`${modulo}.nome`)}
              <ArrowUpRight
                className="size-4 text-texto-suave transition-transform duration-[var(--duracao-rapida)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-texto-suave">
              {t(`${modulo}.resumo`)}
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
