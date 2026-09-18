"use client";

import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao, Cartao } from "./primitivos";
import { Cascata, ItemCascata, Revelar } from "./movimento";

interface Item {
  rotulo: string;
  descricao: string;
  esquerda: string;
  direita: string;
}

/**
 * Três indicadores ilustrativos: progressão, margem e rotação de stock.
 * Os valores e os gráficos são decorativos (ver `painel-produto.tsx`); os
 * rótulos e as legendas vêm das mensagens.
 */
const VALORES = ["+24,5%", "38,2%", "6,8× / ano"];

export function Indicadores() {
  const t = useTranslations("home.indicadores");
  const itens = t.raw("itens") as Item[];

  return (
    <Seccao className="bg-superficie-forte" ariaLabelledby="titulo-indicadores">
      <Container>
        <Revelar>
          <TituloSeccao
            id="titulo-indicadores"
            etiqueta={t("etiqueta")}
            titulo={t("titulo")}
            subtitulo={t("subtitulo")}
          />
        </Revelar>

        <Cascata
          como="ul"
          className="mt-10 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3"
        >
          {itens.map((item, indice) => (
            <ItemCascata como="li" key={item.rotulo}>
              <Cartao className="flex h-full flex-col justify-between">
                <div>
                  <span className="text-legenda tracking-wider text-texto-suave uppercase">
                    {item.rotulo}
                  </span>
                  <p className="mt-1 text-3xl font-bold text-foreground tabular-nums">
                    {VALORES[indice]}
                  </p>
                  <p className="mt-1 text-sm text-texto-suave">{item.descricao}</p>
                </div>
                <div aria-hidden="true" className="my-4 h-24 w-full">
                  {indice === 0 ? <Linha /> : indice === 1 ? <Barras /> : <Progresso />}
                </div>
                <div className="flex items-center justify-between text-legenda text-texto-suave">
                  <span>{item.esquerda}</span>
                  <span className="font-semibold text-primary">{item.direita}</span>
                </div>
              </Cartao>
            </ItemCascata>
          ))}
        </Cascata>
      </Container>
    </Seccao>
  );
}

function Linha() {
  return (
    <svg className="size-full text-primary" fill="none" viewBox="0 0 300 80">
      <path
        d="M0,65 L50,60 L100,50 L150,55 L200,30 L250,25 L300,10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <circle cx="300" cy="10" r="4" fill="currentColor" />
    </svg>
  );
}

function Barras() {
  return (
    <div className="flex size-full items-end justify-between gap-2 px-2">
      {[45, 60, 75].map((altura) => (
        <div
          key={altura}
          className="w-1/4 rounded-t bg-destaque-suave"
          style={{ height: `${altura}%` }}
        />
      ))}
      <div className="w-1/4 rounded-t bg-azul" style={{ height: "90%" }} />
    </div>
  );
}

function Progresso() {
  return (
    <div className="flex size-full flex-col justify-center gap-2 rounded-xl bg-superficie p-3">
      <div className="flex justify-between text-legenda">
        <span className="text-foreground">Eficiência de reposição</span>
        <span className="font-semibold text-primary">Óptima</span>
      </div>
      <div className="h-2 w-full rounded-full bg-destaque-suave">
        <div className="h-2 rounded-full bg-azul" style={{ width: "88%" }} />
      </div>
    </div>
  );
}
