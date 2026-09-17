"use client";

import { CheckCircle2, Clock, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container, Seccao, TituloSeccao } from "./primitivos";
import { Revelar } from "./movimento";

/**
 * Montra do painel: três widgets ilustrativos (tesouraria, expedição, equipa).
 *
 * A montra é decorativa (`aria-hidden`) — o que ela ilustra está no título e
 * no subtítulo. Os números vivem aqui pela razão explicada em
 * `painel-produto.tsx`. Em MT.
 */
const ENVIOS = [
  { guia: "Guia n.º 8902 • Matola", estado: "Em trânsito", Icone: Truck, tom: "primary" },
  { guia: "Guia n.º 8900 • Beira", estado: "Entregue", Icone: CheckCircle2, tom: "success" },
  { guia: "Guia n.º 8903 • Nampula", estado: "A carregar", Icone: Clock, tom: "suave" },
] as const;

export function MontraPainel() {
  const t = useTranslations("home.montra");

  return (
    <Seccao className="bg-superficie-forte" ariaLabelledby="titulo-montra">
      <Container>
        <Revelar>
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <TituloSeccao
              id="titulo-montra"
              alinhamento="esquerda"
              etiqueta={t("etiqueta")}
              titulo={t("titulo")}
            />
            <p className="max-w-md text-[15px] text-texto-suave">{t("subtitulo")}</p>
          </div>
        </Revelar>

        <Revelar>
          <div
            aria-hidden="true"
            className="w-full rounded-3xl border border-transparent bg-card p-4 shadow-xl md:p-10 dark:border-contorno-suave"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Tesouraria */}
              <div className="flex flex-col justify-between rounded-2xl bg-superficie p-4">
                <div>
                  <span className="text-legenda tracking-wider text-texto-suave uppercase">
                    Tesouraria projectada
                  </span>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    Contas a receber vs. a pagar
                  </p>
                  <p className="mt-1 text-legenda text-texto-suave">
                    Próximos 30 dias, com base nas facturas emitidas
                  </p>
                </div>
                <div className="my-4 flex flex-col gap-3">
                  <Barra rotulo="A receber: 3.240.000 MT" pct={78} cor="bg-azul" tomPct="text-primary" />
                  <Barra rotulo="A pagar: 1.415.000 MT" pct={34} cor="bg-texto-suave" tomPct="text-texto-suave" />
                </div>
                <div className="flex items-center justify-between pt-1 text-xs font-semibold">
                  <span className="text-foreground">Saldo líquido previsto:</span>
                  <span className="text-primary">+1.825.000 MT</span>
                </div>
              </div>

              {/* Expedição */}
              <div className="flex flex-col justify-between rounded-2xl bg-superficie p-4">
                <div>
                  <span className="text-legenda tracking-wider text-texto-suave uppercase">
                    Expedição e rotas
                  </span>
                  <p className="mt-1 text-lg font-semibold text-foreground">Envios em tempo real</p>
                  <p className="mt-1 text-legenda text-texto-suave">
                    Actualização contínua das guias de transporte
                  </p>
                </div>
                <div className="my-4 flex flex-col gap-1">
                  {ENVIOS.map(({ guia, estado, Icone, tom }) => (
                    <div
                      key={guia}
                      className="flex items-center justify-between rounded-lg bg-card p-2"
                    >
                      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <Icone
                          className={
                            tom === "primary"
                              ? "size-[18px] text-primary"
                              : tom === "success"
                                ? "size-[18px] text-success"
                                : "size-[18px] text-texto-suave"
                          }
                        />
                        {guia}
                      </span>
                      <span
                        className={
                          tom === "primary"
                            ? "rounded-full bg-destaque-suave px-2 py-0.5 text-legenda text-primary"
                            : "rounded-full bg-superficie-forte px-2 py-0.5 text-legenda text-foreground"
                        }
                      >
                        {estado}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1 text-legenda text-texto-suave">
                  <span>98% das entregas no prazo</span>
                  <span className="font-medium text-primary">Ver mapa →</span>
                </div>
              </div>

              {/* Equipa */}
              <div className="flex flex-col justify-between rounded-2xl bg-superficie p-4">
                <div>
                  <span className="text-legenda tracking-wider text-texto-suave uppercase">
                    Produtividade das equipas
                  </span>
                  <p className="mt-1 text-lg font-semibold text-foreground">Resolução de processos</p>
                  <p className="mt-1 text-legenda text-texto-suave">Tempo médio de resposta interna</p>
                </div>
                <div className="my-4 flex items-center justify-center gap-6">
                  <div className="text-center">
                    <span className="block text-3xl font-bold text-primary">2,4 h</span>
                    <span className="block text-legenda text-texto-suave">Tempo médio de aprovação</span>
                  </div>
                  <div className="h-12 w-px bg-contorno-suave" />
                  <div className="text-center">
                    <span className="block text-3xl font-bold text-foreground">94%</span>
                    <span className="block text-legenda text-texto-suave">SLA cumpridos</span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-card p-2 text-legenda">
                  <span className="text-foreground">Departamento mais ágil:</span>
                  <span className="font-semibold text-primary">Operações e Projectos</span>
                </div>
              </div>
            </div>
          </div>
        </Revelar>
      </Container>
    </Seccao>
  );
}

function Barra({
  rotulo,
  pct,
  cor,
  tomPct,
}: {
  rotulo: string;
  pct: number;
  cor: string;
  tomPct: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-legenda text-foreground">
        <span>{rotulo}</span>
        <span className={`font-semibold ${tomPct}`}>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-destaque-suave">
        <div className={`h-2 rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
