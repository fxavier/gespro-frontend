"use client";

import { CheckCircle2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao } from "./primitivos";
import { Revelar } from "./movimento";

/**
 * Multi-empresa: texto à esquerda, «conta do grupo» ilustrativa à direita.
 *
 * As três empresas são inventadas e o cartão é decorativo (`aria-hidden`);
 * ver `painel-produto.tsx` para a razão de os números viverem aqui. NUIT com
 * o formato real (nove dígitos), moeda em MT.
 */
const EMPRESAS = [
  { nuit: "NUIT 400 118 233", nome: "Comercial Zambeze, Lda.", facturacao: "2.840.000 MT", local: "Sede e armazém, Matola" },
  { nuit: "NUIT 400 271 905", nome: "Transportes Lúrio", facturacao: "1.985.000 MT", local: "Centro logístico, Nampula" },
  { nuit: "NUIT 400 336 118", nome: "Loja Beira Centro", facturacao: "1.210.000 MT", local: "Ponto de venda, Beira" },
];

export function Crescimento() {
  const t = useTranslations("home.crescimento");
  const itens = t.raw("itens") as string[];

  return (
    <Seccao className="bg-superficie-forte" ariaLabelledby="titulo-crescimento">
      <Container>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <Revelar className="lg:col-span-5">
            <TituloSeccao
              id="titulo-crescimento"
              alinhamento="esquerda"
              etiqueta={t("etiqueta")}
              titulo={t("titulo")}
              subtitulo={t("subtitulo")}
            />
            <ul className="mt-6 flex list-none flex-col gap-3 p-0">
              {itens.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </Revelar>

          <Revelar className="lg:col-span-7">
            <div
              aria-hidden="true"
              className="flex flex-col gap-4 rounded-3xl border border-transparent bg-card p-6 shadow-sm md:p-10 dark:border-contorno-suave"
            >
              <div className="flex items-center justify-between border-b border-contorno-suave pb-3">
                <span className="text-xs font-semibold tracking-wider text-texto-suave uppercase">
                  Conta do grupo
                </span>
                <span className="rounded-full bg-destaque-suave px-2 py-0.5 text-legenda font-semibold text-primary">
                  3 empresas ligadas
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {EMPRESAS.map((e) => (
                  <div key={e.nuit} className="flex flex-col gap-1 rounded-xl bg-superficie p-4">
                    <span className="text-legenda text-texto-suave">{e.nuit}</span>
                    <span className="text-sm font-semibold text-foreground">{e.nome}</span>
                    <span className="mt-2 text-legenda text-primary">Facturação: {e.facturacao}</span>
                    <span className="text-legenda text-texto-suave">{e.local}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-azul p-4 text-accao-texto">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Users className="size-6" />
                  Utilizadores activos nas três empresas
                </span>
                <span className="text-lg font-bold">42</span>
              </div>
            </div>
          </Revelar>
        </div>
      </Container>
    </Seccao>
  );
}
