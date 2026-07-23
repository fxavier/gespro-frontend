"use client";

import { useId, useState } from "react";
import { Check, Info } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  formatarPreco,
  poupancaAnual,
  type Catalogo,
  type Plano,
} from "@/lib/planos";
import { LOCALE_TAGS, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { BotaoLink } from "./primitivos";
import { Cascata, ItemCascata, Gesto } from "./movimento";

/**
 * Tabela de planos.
 *
 * Todos os valores vêm de `catalogo` (origem: `GET /api/publico/planos`, spec 19).
 * Não existe aqui nenhum número — se o catálogo falhar, o componente mostra o
 * que a camada `lib/planos.ts` devolveu e o aviso de demonstração.
 */
export function TabelaPrecos({ catalogo }: { catalogo: Catalogo }) {
  const t = useTranslations("precos");
  const tComum = useTranslations("comum");
  const locale = useLocale() as Locale;
  const tagLocale = LOCALE_TAGS[locale] ?? "pt-MZ";
  const [ciclo, setCiclo] = useState<"mensal" | "anual">("mensal");
  const idGrupo = useId();

  return (
    <div>
      {catalogo.origem === "demonstracao" ? (
        <p
          role="status"
          className="mx-auto mb-8 flex max-w-2xl items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          <Info
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          {t("avisoCatalogoLocal")}
        </p>
      ) : null}

      {/* Selector de ciclo — radiogroup, não um interruptor: são duas opções
          nomeadas e ambas devem ser anunciáveis. */}
      <div className="mb-12 flex justify-center">
        <div
          role="radiogroup"
          aria-label={t("mensal") + " / " + t("anual")}
          className="inline-flex items-center gap-1 rounded-full border border-contorno-suave bg-superficie p-1"
        >
          {(["mensal", "anual"] as const).map((opcao) => (
            <button
              key={opcao}
              id={`${idGrupo}-${opcao}`}
              type="button"
              role="radio"
              aria-checked={ciclo === opcao}
              onClick={() => setCiclo(opcao)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium transition-colors",
                ciclo === opcao
                  ? "bg-background text-foreground shadow-sm"
                  : "text-texto-suave hover:text-foreground",
              )}
            >
              {t(opcao)}
              {opcao === "anual" ? (
                <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                  {t("poupancaAnual")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <Cascata
        como="ul"
        className="grid list-none grid-cols-1 gap-5 p-0 lg:grid-cols-3"
      >
        {catalogo.planos.map((plano) => (
          <ItemCascata como="li" key={plano.id}>
            <CartaoPlano plano={plano} ciclo={ciclo} tagLocale={tagLocale} />
          </ItemCascata>
        ))}
      </Cascata>

      <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-contorno-suave bg-superficie p-6">
        <h3 className="text-base font-semibold text-foreground">
          {t("todosOsPlanos.titulo")}
        </h3>
        <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {(t.raw("todosOsPlanos.itens") as string[]).map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 text-sm text-texto-suave"
            >
              <Check
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-texto-suave">{tComum("iva")}</p>
      </div>
    </div>
  );
}

function CartaoPlano({
  plano,
  ciclo,
  tagLocale,
}: {
  plano: Plano;
  ciclo: "mensal" | "anual";
  tagLocale: string;
}) {
  const t = useTranslations("precos");
  const tComum = useTranslations("comum");
  const preco = ciclo === "mensal" ? plano.precoMensal : plano.precoAnual;
  const poupanca = poupancaAnual(plano);

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-card p-7",
        plano.destaque
          ? "border-primary/50 shadow-md ring-1 ring-primary/20"
          : "border-contorno-suave",
      )}
    >
      {/* A etiqueta de destaque é sólida e não `bg-primary/10 text-primary`:
          no tema escuro essa combinação dá 4.1:1, abaixo do mínimo AA. */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">{plano.nome}</h3>
        {plano.destaque ? (
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-accao-texto">
            {t("maisPopular")}
          </span>
        ) : null}
      </div>

      {plano.descricao ? (
        <p className="mt-2 text-sm leading-relaxed text-texto-suave">
          {plano.descricao}
        </p>
      ) : null}

      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="text-titulo text-foreground tabular-nums">
          {formatarPreco(preco, tagLocale)}
        </span>
        <span className="text-sm text-texto-suave">
          {ciclo === "mensal" ? tComum("porMes") : tComum("porAno")}
        </span>
      </p>
      {ciclo === "anual" && poupanca > 0 ? (
        <p className="mt-1 text-xs text-success">−{poupanca}%</p>
      ) : null}

      <Gesto className="mt-6 w-full">
        <BotaoLink
          href={`/comecar?plano=${plano.id}`}
          variante={plano.destaque ? "primario" : "secundario"}
          className="w-full"
        >
          {t("escolher", { plano: plano.nome })}
        </BotaoLink>
      </Gesto>

      {plano.funcionalidades.length > 0 ? (
        <>
          <h4 className="mt-8 text-xs font-semibold tracking-wide text-texto-suave uppercase">
            {t("incluido")}
          </h4>
          <ul className="mt-3 space-y-2.5">
            {plano.funcionalidades.map((funcionalidade) => (
              <li
                key={funcionalidade}
                className="flex items-start gap-2.5 text-sm text-foreground"
              >
                <Check
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                {funcionalidade}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {Object.keys(plano.limites).length > 0 ? (
        <>
          <h4 className="mt-8 text-xs font-semibold tracking-wide text-texto-suave uppercase">
            {t("limites")}
          </h4>
          <dl className="mt-3 space-y-2 text-sm">
            {Object.entries(plano.limites).map(([chave, valor]) => (
              <div
                key={chave}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="text-texto-suave">{rotularLimite(chave)}</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {valor === null || valor === "" ? "∞" : String(valor)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  );
}

/**
 * Rótulo legível de uma chave de limite. As chaves são definidas pelo spec 19;
 * as conhecidas ganham nome PT-PT, as futuras degradam para a chave separada
 * em palavras — nunca desaparecem da UI.
 */
const ROTULOS_LIMITE: Record<string, string> = {
  utilizadores: "Utilizadores",
  armazens: "Armazéns",
  empresas: "Empresas",
  documentosPorMes: "Documentos por mês",
  armazenamentoGb: "Armazenamento (GB)",
};

function rotularLimite(chave: string): string {
  return (
    ROTULOS_LIMITE[chave] ??
    chave
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
  );
}
